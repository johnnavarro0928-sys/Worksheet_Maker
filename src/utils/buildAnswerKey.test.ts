import { describe, it, expect } from 'vitest';
import { buildAnswerKey } from './buildAnswerKey';
import { balanceMultipleChoiceAnswers } from './balanceMcqAnswers';
import { WorksheetData, Section } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeWorksheet(sections: Omit<Section, 'id'>[]): WorksheetData {
  return {
    title: 'Test Worksheet',
    teacher: 'Teacher',
    school: 'School',
    instructions: '',
    sections: sections.map((s, i) => ({ ...s, id: `sec-${i}` })),
  };
}

function makeMcqSection(questions: { correctAnswer: number }[]): Omit<Section, 'id'> {
  return {
    title: 'Part I – Multiple Choice',
    type: 'Multiple Choice',
    instructions: '',
    questions: questions.map((q, i) => ({
      id: `q-mc-${i}`,
      text: `MCQ question ${i + 1}`,
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: q.correctAnswer,
    })),
  };
}

function makeTofSection(questions: { correctAnswer: number }[]): Omit<Section, 'id'> {
  return {
    title: 'Part II – True or False',
    type: 'True or False',
    instructions: '',
    questions: questions.map((q, i) => ({
      id: `q-tof-${i}`,
      text: `T/F question ${i + 1}`,
      correctAnswer: q.correctAnswer,
    })),
  };
}

// ── Multiple Choice ──────────────────────────────────────────────────────────

describe('buildAnswerKey – Multiple Choice', () => {
  it('maps correctAnswer index 0→A, 1→B, 2→C, 3→D', () => {
    const ws = makeWorksheet([
      makeMcqSection([
        { correctAnswer: 0 },
        { correctAnswer: 1 },
        { correctAnswer: 2 },
        { correctAnswer: 3 },
      ]),
    ]);

    const result = buildAnswerKey(ws);
    expect(result).toHaveLength(1);
    expect(result[0].lines).toEqual(['1. A', '2. B', '3. C', '4. D']);
  });

  it('reflects correct letter after balanceMultipleChoiceAnswers reordering', () => {
    // Start with 8 questions all correct at index 1 (B)
    const rawQuestions = Array.from({ length: 8 }, (_, i) => ({
      id: `q-${i}`,
      text: `Question ${i + 1}`,
      options: ['Wrong 1', 'Correct', 'Wrong 2', 'Wrong 3'],
      correctAnswer: 1 as number,
      answer: 'Correct',
    }));

    const balanced = balanceMultipleChoiceAnswers(rawQuestions, 'Multiple Choice');
    // BALANCED_MULTIPLE_CHOICE_ANSWER_PATTERN = [0, 2, 1, 3, 1, 0, 3, 2]
    // so correctAnswer sequence should be [0,2,1,3,1,0,3,2] → A,C,B,D,B,A,D,C

    const ws = makeWorksheet([
      {
        title: 'MCQ Section',
        type: 'Multiple Choice',
        instructions: '',
        questions: balanced,
      },
    ]);

    const result = buildAnswerKey(ws);
    expect(result).toHaveLength(1);
    expect(result[0].lines).toEqual([
      '1. A', '2. C', '3. B', '4. D', '5. B', '6. A', '7. D', '8. C',
    ]);
  });

  it('excludes a question whose correctAnswer is out of bounds', () => {
    const ws = makeWorksheet([
      {
        title: 'MCQ Section',
        type: 'Multiple Choice',
        instructions: '',
        questions: [
          { id: 'q1', text: 'Q1', options: ['A', 'B', 'C', 'D'], correctAnswer: 1 },
          { id: 'q2', text: 'Q2', options: ['A', 'B', 'C', 'D'], correctAnswer: 99 },
          { id: 'q3', text: 'Q3', options: ['A', 'B', 'C', 'D'], correctAnswer: 3 },
        ],
      },
    ]);

    const result = buildAnswerKey(ws);
    // q2 is out of bounds — only q1 and q3 should appear, but positions are 1-indexed per array index
    expect(result[0].lines).toEqual(['1. B', '3. D']);
  });

  it('excludes a question with no options array', () => {
    const ws = makeWorksheet([
      {
        title: 'MCQ Section',
        type: 'Multiple Choice',
        instructions: '',
        questions: [
          { id: 'q1', text: 'Q1', correctAnswer: 0 },
        ],
      },
    ]);

    const result = buildAnswerKey(ws);
    expect(result).toHaveLength(0);
  });
});

// ── True or False ────────────────────────────────────────────────────────────

describe('buildAnswerKey – True or False', () => {
  it('maps correctAnswer 0 → "True" and 1 → "False"', () => {
    const ws = makeWorksheet([
      makeTofSection([
        { correctAnswer: 0 },
        { correctAnswer: 1 },
        { correctAnswer: 0 },
      ]),
    ]);

    const result = buildAnswerKey(ws);
    expect(result).toHaveLength(1);
    expect(result[0].lines).toEqual(['1. True', '2. False', '3. True']);
  });

  it('uses sectionTitle from the section', () => {
    const ws = makeWorksheet([
      makeTofSection([{ correctAnswer: 1 }]),
    ]);

    const result = buildAnswerKey(ws);
    expect(result[0].sectionTitle).toBe('Part II – True or False');
  });
});

// ── Excluded section types ────────────────────────────────────────────────────

describe('buildAnswerKey – excluded section types', () => {
  it.each([
    ['Identification'],
    ['Problem Solving'],
    ['Essay'],
  ])('%s sections are fully excluded from the result', (type) => {
    const ws = makeWorksheet([
      {
        title: `${type} Section`,
        type,
        instructions: '',
        questions: [
          { id: 'q1', text: 'Q1', answer: 'some answer' },
          { id: 'q2', text: 'Q2' },
        ],
      },
    ]);

    const result = buildAnswerKey(ws);
    expect(result).toHaveLength(0);
  });

  it('mixed worksheet: only answerable sections appear in result', () => {
    const ws = makeWorksheet([
      makeMcqSection([{ correctAnswer: 2 }]),
      {
        title: 'Essay Section',
        type: 'Essay',
        instructions: '',
        questions: [{ id: 'e1', text: 'Write an essay.' }],
      },
      makeTofSection([{ correctAnswer: 0 }]),
      {
        title: 'Identification Section',
        type: 'Identification',
        instructions: '',
        questions: [{ id: 'i1', text: 'Identify this.' }],
      },
    ]);

    const result = buildAnswerKey(ws);
    expect(result).toHaveLength(2);
    expect(result[0].sectionTitle).toBe('Part I – Multiple Choice');
    expect(result[0].lines).toEqual(['1. C']);
    expect(result[1].sectionTitle).toBe('Part II – True or False');
    expect(result[1].lines).toEqual(['1. True']);
  });
});

// ── Sections with zero answerable questions ──────────────────────────────────

describe('buildAnswerKey – zero answerable questions', () => {
  it('excludes a Multiple Choice section where no question passes validation', () => {
    const ws = makeWorksheet([
      {
        title: 'MCQ Section',
        type: 'Multiple Choice',
        instructions: '',
        questions: [
          // no options, no correctAnswer — nothing answerable
          { id: 'q1', text: 'Q1' },
          { id: 'q2', text: 'Q2' },
        ],
      },
    ]);

    const result = buildAnswerKey(ws);
    expect(result).toHaveLength(0);
  });

  it('excludes a True or False section with no correctAnswer fields', () => {
    const ws = makeWorksheet([
      {
        title: 'ToF Section',
        type: 'True or False',
        instructions: '',
        questions: [
          { id: 'q1', text: 'Q1' },
        ],
      },
    ]);

    const result = buildAnswerKey(ws);
    expect(result).toHaveLength(0);
  });
});

// ── Empty sections array ─────────────────────────────────────────────────────

describe('buildAnswerKey – edge cases', () => {
  it('returns [] for an empty sections array', () => {
    const ws = makeWorksheet([]);
    expect(buildAnswerKey(ws)).toEqual([]);
  });

  it('returns [] when sections is undefined (coerced)', () => {
    // Cast to satisfy TS so we can test the runtime guard
    const ws = { ...makeWorksheet([]), sections: undefined } as unknown as WorksheetData;
    expect(buildAnswerKey(ws)).toEqual([]);
  });
});
