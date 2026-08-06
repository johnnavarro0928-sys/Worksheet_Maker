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

  it('Identification with no answer field is excluded (same behaviour as Phase 1 when q.answer absent)', () => {
    // Identification is only answerable when q.answer is a non-empty string.
    // When it has no answer, it should not appear in the result.
    const ws = makeWorksheet([
      {
        title: 'Identification Section',
        type: 'Identification',
        instructions: '',
        questions: [
          { id: 'q1', text: 'Q1' }, // no answer field
          { id: 'q2', text: 'Q2' }, // no answer field
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

// ── Identification ────────────────────────────────────────────────────────────

describe('buildAnswerKey – Identification', () => {
  it('produces numbered answer lines from q.answer for each valid question', () => {
    const ws = makeWorksheet([
      {
        title: 'Part III – Identification',
        type: 'Identification',
        instructions: '',
        questions: [
          { id: 'i1', text: 'What is the powerhouse of the cell?', answer: 'Mitochondria' },
          { id: 'i2', text: 'What planet is closest to the Sun?', answer: 'Mercury' },
          { id: 'i3', text: 'Who wrote Noli Me Tangere?', answer: 'José Rizal' },
        ],
      },
    ]);

    const result = buildAnswerKey(ws);
    expect(result).toHaveLength(1);
    expect(result[0].sectionTitle).toBe('Part III – Identification');
    expect(result[0].lines).toEqual(['1. Mitochondria', '2. Mercury', '3. José Rizal']);
  });

  it('trims whitespace from answer text', () => {
    const ws = makeWorksheet([
      {
        title: 'Identification',
        type: 'Identification',
        instructions: '',
        questions: [
          { id: 'i1', text: 'Q1?', answer: '  Osmosis  ' },
        ],
      },
    ]);

    const result = buildAnswerKey(ws);
    expect(result[0].lines).toEqual(['1. Osmosis']);
  });

  it('excludes a question whose answer is an empty string', () => {
    const ws = makeWorksheet([
      {
        title: 'Identification',
        type: 'Identification',
        instructions: '',
        questions: [
          { id: 'i1', text: 'Q1?', answer: 'Valid Answer' },
          { id: 'i2', text: 'Q2?', answer: '' },          // empty — excluded
          { id: 'i3', text: 'Q3?', answer: '   ' },       // whitespace-only — excluded
        ],
      },
    ]);

    const result = buildAnswerKey(ws);
    expect(result).toHaveLength(1);
    // Only Q1 appears; positions are still 1-indexed by array index
    expect(result[0].lines).toEqual(['1. Valid Answer']);
  });

  it('excludes a question with no answer field at all', () => {
    const ws = makeWorksheet([
      {
        title: 'Identification',
        type: 'Identification',
        instructions: '',
        questions: [
          { id: 'i1', text: 'Q1?' }, // no answer field
        ],
      },
    ]);

    const result = buildAnswerKey(ws);
    expect(result).toHaveLength(0);
  });

  it('Identification appears in mixed worksheet alongside MC and T/F', () => {
    const ws = makeWorksheet([
      makeMcqSection([{ correctAnswer: 0 }]),
      {
        title: 'Identification Section',
        type: 'Identification',
        instructions: '',
        questions: [
          { id: 'i1', text: 'Q1?', answer: 'Nucleus' },
          { id: 'i2', text: 'Q2?', answer: 'Cytoplasm' },
        ],
      },
      makeTofSection([{ correctAnswer: 1 }]),
    ]);

    const result = buildAnswerKey(ws);
    expect(result).toHaveLength(3);
    expect(result[0].lines).toEqual(['1. A']);
    expect(result[1].sectionTitle).toBe('Identification Section');
    expect(result[1].lines).toEqual(['1. Nucleus', '2. Cytoplasm']);
    expect(result[2].lines).toEqual(['1. False']);
  });

  // Regression: Problem Solving and Essay still fully excluded even after adding Identification
  it.each([
    ['Problem Solving'],
    ['Essay'],
  ])('%s sections remain fully excluded (regression)', (type) => {
    const ws = makeWorksheet([
      {
        title: `${type} Section`,
        type,
        instructions: '',
        questions: [
          { id: 'q1', text: 'Q1', answer: 'some answer' },
        ],
      },
    ]);

    expect(buildAnswerKey(ws)).toHaveLength(0);
  });
});
