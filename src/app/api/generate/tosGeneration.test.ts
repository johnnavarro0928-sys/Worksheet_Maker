import { describe, expect, it } from 'vitest';
import type { Question } from '../../../types';
import type { TosCognitiveLevel, TosPlan } from '../../../utils/tosPlan';
import {
  generateQuestionsFromTos,
  TosGenerationError,
  TosPlanValidationError,
  type GenerateTosQuestionBatch,
  type TosGenerationConfig,
  type TosQuestionBatchRequest,
} from './tosGeneration';

function makeQuestion(id: string, text: string): Question {
  return {
    id,
    type: 'Multiple Choice',
    text,
    options: ['A', 'B', 'C', 'D'],
    correctAnswer: 0,
  };
}

function makeConfig(expectedTotal: number, avoidQuestions = ['Previously accepted question']): TosGenerationConfig {
  return {
    topic: 'Ecosystems',
    grade: 'Grade 7',
    subject: 'Science',
    language: 'English',
    expectedTotal,
    avoidQuestions,
  };
}

describe('generateQuestionsFromTos', () => {
  it('generates batches in deterministic plan order and attaches row metadata', async () => {
    const plan: TosPlan = {
      version: 1,
      rows: [
        {
          id: 'row-remember',
          competency: 'Identify ecosystem components',
          allocations: { Remembering: 1, Applying: 1 },
        },
        {
          id: 'row-understand',
          competency: 'Explain ecosystem relationships',
          allocations: { Understanding: 1 },
        },
      ],
    };
    const questionsByLevel: Record<TosCognitiveLevel, Question[]> = {
      Remembering: [makeQuestion('q-1', 'What is a producer?')],
      Applying: [makeQuestion('q-2', 'Which organism is a producer in this food web?')],
      Understanding: [makeQuestion('q-3', 'Why are decomposers important?')],
      Analyzing: [],
      Evaluating: [],
      Creating: [],
    };
    const requests: TosQuestionBatchRequest[] = [];
    const generateBatch: GenerateTosQuestionBatch = async (request) => {
      requests.push(request);
      return [...questionsByLevel[request.cognitiveLevel]];
    };

    const result = await generateQuestionsFromTos(plan, makeConfig(3), generateBatch);

    expect(requests.map(request => [request.competency, request.cognitiveLevel])).toEqual([
      ['Identify ecosystem components', 'Remembering'],
      ['Identify ecosystem components', 'Applying'],
      ['Explain ecosystem relationships', 'Understanding'],
    ]);
    expect(result).toEqual([
      { ...questionsByLevel.Remembering[0], tosRowId: 'row-remember', tosCognitiveLevel: 'Remembering' },
      { ...questionsByLevel.Applying[0], tosRowId: 'row-remember', tosCognitiveLevel: 'Applying' },
      { ...questionsByLevel.Understanding[0], tosRowId: 'row-understand', tosCognitiveLevel: 'Understanding' },
    ]);
  });

  it('constructs requests with plan context and accumulated avoidance without inventing objectives', async () => {
    const plan: TosPlan = {
      version: 1,
      rows: [
        {
          id: 'row-first',
          competency: 'Identify producers',
          objective: 'Classify producers in a food web',
          allocations: { Remembering: 2 },
        },
        {
          id: 'row-second',
          competency: 'Apply food-web concepts',
          allocations: { Applying: 1 },
        },
      ],
    };
    const requests: TosQuestionBatchRequest[] = [];
    const batches = [
      [makeQuestion('q-1', 'First generated question?'), makeQuestion('q-2', 'Second generated question?')],
      [makeQuestion('q-3', 'Third generated question?')],
    ];
    const generateBatch: GenerateTosQuestionBatch = async (request) => {
      requests.push(request);
      return batches[requests.length - 1] ?? [];
    };
    const config = makeConfig(3);
    const originalAvoidQuestions = [...config.avoidQuestions!];

    await generateQuestionsFromTos(plan, config, generateBatch);

    expect(requests).toEqual([
      {
        topic: 'Ecosystems',
        competency: 'Identify producers',
        objective: 'Classify producers in a food web',
        grade: 'Grade 7',
        subject: 'Science',
        language: 'English',
        cognitiveLevel: 'Remembering',
        count: 2,
        totalCount: 3,
        batchStart: 1,
        avoidQuestions: ['Previously accepted question'],
      },
      {
        topic: 'Ecosystems',
        competency: 'Apply food-web concepts',
        grade: 'Grade 7',
        subject: 'Science',
        language: 'English',
        cognitiveLevel: 'Applying',
        count: 1,
        totalCount: 3,
        batchStart: 3,
        avoidQuestions: [
          'Previously accepted question',
          'First generated question?',
          'Second generated question?',
        ],
      },
    ]);
    expect(config.avoidQuestions).toEqual(originalAvoidQuestions);
  });

  it.each([
    {
      name: 'invalid version',
      plan: {
        version: 2,
        rows: [{ id: 'row-1', competency: 'Recall facts', allocations: { Remembering: 1 } }],
      } as unknown as TosPlan,
      expectedTotal: 1,
      issueCodes: ['invalid-version'],
    },
    {
      name: 'invalid expected total',
      plan: {
        version: 1,
        rows: [{ id: 'row-1', competency: 'Recall facts', allocations: { Remembering: 1 } }],
      } as TosPlan,
      expectedTotal: 0,
      issueCodes: ['invalid-expected-total'],
    },
    {
      name: 'empty plan',
      plan: { version: 1, rows: [] } as TosPlan,
      expectedTotal: 1,
      issueCodes: ['invalid-row-count', 'empty-plan'],
    },
  ])('rejects $name before making any generator calls', async ({ plan, expectedTotal, issueCodes }) => {
    let callCount = 0;
    const generateBatch: GenerateTosQuestionBatch = async () => {
      callCount += 1;
      return [];
    };

    let caught: unknown;
    try {
      await generateQuestionsFromTos(plan, makeConfig(expectedTotal), generateBatch);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(TosPlanValidationError);
    if (caught instanceof TosPlanValidationError) {
      expect(caught.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(issueCodes));
    }
    expect(callCount).toBe(0);
  });

  it('splits an allocation larger than five into bounded requests', async () => {
    const plan: TosPlan = {
      version: 1,
      rows: [{ id: 'row-seven', competency: 'Recall seven facts', allocations: { Remembering: 7 } }],
    };
    const requests: TosQuestionBatchRequest[] = [];
    let nextQuestion = 1;
    const generateBatch: GenerateTosQuestionBatch = async (request) => {
      requests.push(request);
      return Array.from({ length: request.count }, () => {
        const question = makeQuestion(`q-${nextQuestion}`, `Question ${nextQuestion}`);
        nextQuestion += 1;
        return question;
      });
    };

    const result = await generateQuestionsFromTos(plan, makeConfig(7), generateBatch);

    expect(requests.map(request => ({ count: request.count, batchStart: request.batchStart }))).toEqual([
      { count: 5, batchStart: 1 },
      { count: 2, batchStart: 6 },
    ]);
    expect(result).toHaveLength(7);
  });

  it('skips duplicate and unusable responses, then requests only the remaining count', async () => {
    const plan: TosPlan = {
      version: 1,
      rows: [{ id: 'row-retry', competency: 'Apply food-web concepts', allocations: { Applying: 3 } }],
    };
    const requests: TosQuestionBatchRequest[] = [];
    const batches = [
      [
        makeQuestion('q-existing', '1. Previously accepted question?'),
        makeQuestion('q-1', 'What is a producer?'),
        makeQuestion('q-duplicate', '1. What is a producer?'),
        makeQuestion('q-blank', '   '),
      ],
      [makeQuestion('q-2', 'What is a consumer?'), makeQuestion('q-3', 'What is a decomposer?')],
    ];
    const generateBatch: GenerateTosQuestionBatch = async (request) => {
      requests.push(request);
      return batches[requests.length - 1] ?? [];
    };

    const result = await generateQuestionsFromTos(plan, makeConfig(3), generateBatch);

    expect(requests.map(request => ({ count: request.count, batchStart: request.batchStart }))).toEqual([
      { count: 3, batchStart: 1 },
      { count: 2, batchStart: 2 },
    ]);
    expect(result.map(question => question.id)).toEqual(['q-1', 'q-2', 'q-3']);
  });

  it('skips duplicates across different TOS work items without redistributing their allocations', async () => {
    const plan: TosPlan = {
      version: 1,
      rows: [
        { id: 'row-first', competency: 'Recall producers', allocations: { Remembering: 1 } },
        { id: 'row-second', competency: 'Apply food-web concepts', allocations: { Applying: 1 } },
      ],
    };
    const requests: TosQuestionBatchRequest[] = [];
    const batches = [
      [makeQuestion('q-1', 'What is a producer?')],
      [makeQuestion('q-duplicate', '1. What is a producer?')],
      [makeQuestion('q-2', 'What is a consumer?')],
    ];
    const generateBatch: GenerateTosQuestionBatch = async (request) => {
      requests.push(request);
      return batches[requests.length - 1] ?? [];
    };

    const result = await generateQuestionsFromTos(plan, makeConfig(2), generateBatch);

    expect(requests.map(request => ({ competency: request.competency, count: request.count, batchStart: request.batchStart }))).toEqual([
      { competency: 'Recall producers', count: 1, batchStart: 1 },
      { competency: 'Apply food-web concepts', count: 1, batchStart: 2 },
      { competency: 'Apply food-web concepts', count: 1, batchStart: 2 },
    ]);
    expect(result.map(question => [question.id, question.tosRowId, question.tosCognitiveLevel])).toEqual([
      ['q-1', 'row-first', 'Remembering'],
      ['q-2', 'row-second', 'Applying'],
    ]);
  });

  it('bounds initial and accumulated avoidance history to the most recent forty texts', async () => {
    const initialAvoidQuestions = Array.from({ length: 45 }, (_, index) => `Initial question ${index + 1}`);
    const plan: TosPlan = {
      version: 1,
      rows: [{ id: 'row-history', competency: 'Recall facts', allocations: { Remembering: 7 } }],
    };
    const requests: TosQuestionBatchRequest[] = [];
    let nextQuestion = 1;
    const generateBatch: GenerateTosQuestionBatch = async (request) => {
      requests.push({ ...request, avoidQuestions: [...request.avoidQuestions] });
      return Array.from({ length: request.count }, () => {
        const question = makeQuestion(`q-${nextQuestion}`, `Generated question ${nextQuestion}`);
        nextQuestion += 1;
        return question;
      });
    };
    const config = makeConfig(7, initialAvoidQuestions);
    const originalAvoidQuestions = [...config.avoidQuestions!];

    await generateQuestionsFromTos(plan, config, generateBatch);

    expect(requests[0].avoidQuestions).toEqual(initialAvoidQuestions.slice(-40));
    expect(requests.every(request => request.avoidQuestions.length <= 40)).toBe(true);
    expect(requests[1].avoidQuestions.slice(-5)).toEqual([
      'Generated question 1',
      'Generated question 2',
      'Generated question 3',
      'Generated question 4',
      'Generated question 5',
    ]);
    expect(config.avoidQuestions).toEqual(originalAvoidQuestions);
  });

  it('does not mutate the input plan or config while generating', async () => {
    const plan: TosPlan = {
      version: 1,
      rows: [{
        id: 'row-immutable',
        competency: 'Recall facts',
        objective: 'Name facts accurately',
        allocations: { Remembering: 2 },
      }],
    };
    const config = makeConfig(2, ['Existing question']);
    const planBefore = JSON.parse(JSON.stringify(plan)) as TosPlan;
    const configAvoidBefore = [...config.avoidQuestions!];
    const generateBatch: GenerateTosQuestionBatch = async () => [
      makeQuestion('q-1', 'First question'),
      makeQuestion('q-2', 'Second question'),
    ];

    await generateQuestionsFromTos(plan, config, generateBatch);

    expect(plan).toEqual(planBefore);
    expect(config.avoidQuestions).toEqual(configAvoidBefore);
  });

  it('reports the number of accepted unique questions after retry exhaustion', async () => {
    const plan: TosPlan = {
      version: 1,
      rows: [{ id: 'row-exhausted', competency: 'Recall two facts', allocations: { Remembering: 2 } }],
    };
    const requests: TosQuestionBatchRequest[] = [];
    const generateBatch: GenerateTosQuestionBatch = async (request) => {
      requests.push(request);
      return [makeQuestion('q-1', 'A repeated question')];
    };

    let caught: unknown;
    try {
      await generateQuestionsFromTos(plan, makeConfig(2), generateBatch);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(TosGenerationError);
    if (caught instanceof TosGenerationError) {
      expect(caught.failure).toEqual({
        rowId: 'row-exhausted',
        cognitiveLevel: 'Remembering',
        requestedCount: 2,
        generatedCount: 1,
      });
    }
    expect(requests).toHaveLength(6);
    expect(requests.slice(1).every(request => request.count === 1 && request.batchStart === 2)).toBe(true);
  });
});
