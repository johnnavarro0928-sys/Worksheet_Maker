import type { Question } from '../../../types';
import { getQuestionDeduplicationKey } from '../../../utils/dedupeQuestions';
import { flattenTosPlan, validateTosPlan } from '../../../utils/tosPlan';
import type { TosCognitiveLevel, TosPlan, TosValidationIssue } from '../../../utils/tosPlan';

const MAX_BATCH_SIZE = 5;
const MAX_EXTRA_BATCHES = 5;
const MAX_AVOID_QUESTIONS = 40;
const MULTIPLE_CHOICE_TYPE = 'Multiple Choice';

export interface TosGenerationConfig {
  topic: string;
  grade: string;
  subject: string;
  language: string;
  expectedTotal: number;
  avoidQuestions?: string[];
}

export interface TosQuestionBatchRequest {
  topic: string;
  competency: string;
  objective?: string;
  grade: string;
  subject: string;
  language: string;
  cognitiveLevel: TosCognitiveLevel;
  count: number;
  totalCount: number;
  batchStart: number;
  avoidQuestions: string[];
}

export type GenerateTosQuestionBatch = (
  request: TosQuestionBatchRequest,
) => Promise<Question[]>;

export interface TosGeneratedQuestion extends Question {
  tosRowId: string;
  tosCognitiveLevel: TosCognitiveLevel;
}

export interface TosGenerationFailure {
  rowId: string;
  cognitiveLevel: TosCognitiveLevel;
  requestedCount: number;
  generatedCount: number;
}

export class TosPlanValidationError extends Error {
  readonly issues: TosValidationIssue[];

  constructor(issues: TosValidationIssue[]) {
    super('TOS plan validation failed.');
    this.name = 'TosPlanValidationError';
    this.issues = issues.map(issue => ({ ...issue }));
  }
}

export class TosGenerationError extends Error {
  readonly failure: TosGenerationFailure;

  constructor(failure: TosGenerationFailure) {
    super('TOS generation batch returned an unexpected number of questions.');
    this.name = 'TosGenerationError';
    this.failure = failure;
  }
}

export async function generateQuestionsFromTos(
  plan: TosPlan,
  config: TosGenerationConfig,
  generateBatch: GenerateTosQuestionBatch,
): Promise<TosGeneratedQuestion[]> {
  const validation = validateTosPlan(plan, config.expectedTotal);
  if (!validation.valid) throw new TosPlanValidationError(validation.issues);

  const generatedQuestions: TosGeneratedQuestion[] = [];
  const avoidQuestions = [...(config.avoidQuestions ?? [])].slice(-MAX_AVOID_QUESTIONS);
  const seenKeys = new Set<string>();

  for (const avoidQuestion of config.avoidQuestions ?? []) {
    const key = getQuestionDeduplicationKey({ text: avoidQuestion }, MULTIPLE_CHOICE_TYPE);
    if (key) seenKeys.add(key);
  }

  for (const workItem of flattenTosPlan(plan)) {
    let acceptedForWorkItem = 0;
    const maxAttempts = Math.ceil(workItem.count / MAX_BATCH_SIZE) + MAX_EXTRA_BATCHES;

    for (let attempt = 0; attempt < maxAttempts && acceptedForWorkItem < workItem.count; attempt += 1) {
      const request: TosQuestionBatchRequest = {
        topic: config.topic,
        competency: workItem.competency,
        grade: config.grade,
        subject: config.subject,
        language: config.language,
        cognitiveLevel: workItem.cognitiveLevel,
        count: Math.min(MAX_BATCH_SIZE, workItem.count - acceptedForWorkItem),
        totalCount: config.expectedTotal,
        batchStart: generatedQuestions.length + 1,
        avoidQuestions: [...avoidQuestions],
      };

      if (workItem.objective !== undefined) request.objective = workItem.objective;

      const batch = await generateBatch(request);
      for (const question of batch) {
        if (acceptedForWorkItem >= workItem.count) break;

        const key = getQuestionDeduplicationKey(question, MULTIPLE_CHOICE_TYPE);
        if (!key || seenKeys.has(key)) continue;

        seenKeys.add(key);
        generatedQuestions.push({
          ...question,
          tosRowId: workItem.rowId,
          tosCognitiveLevel: workItem.cognitiveLevel,
        });
        acceptedForWorkItem += 1;
        avoidQuestions.push(question.text);
        if (avoidQuestions.length > MAX_AVOID_QUESTIONS) {
          avoidQuestions.splice(0, avoidQuestions.length - MAX_AVOID_QUESTIONS);
        }
      }
    }

    if (acceptedForWorkItem !== workItem.count) {
      throw new TosGenerationError({
        rowId: workItem.rowId,
        cognitiveLevel: workItem.cognitiveLevel,
        requestedCount: workItem.count,
        generatedCount: acceptedForWorkItem,
      });
    }
  }

  return generatedQuestions;
}
