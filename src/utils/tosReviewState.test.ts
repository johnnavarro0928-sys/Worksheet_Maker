import { describe, expect, it } from 'vitest';
import type { Question, Section } from '../types';
import type { TosCognitiveLevel, TosPlan } from './tosPlan';
import { buildTosReviewModel } from './tosReviewState';

function plan(overrides: Partial<TosPlan['rows'][number]> = {}): TosPlan {
  return {
    version: 1,
    rows: [{
      id: 'row-1',
      competency: 'Classify matter by observable properties',
      objective: 'Connect observations to a classification',
      allocations: { Remembering: 1, Applying: 1 },
      ...overrides,
    }],
  };
}

function question(id: string, metadata: Partial<Pick<Question, 'tosRowId' | 'tosCognitiveLevel'>> = {}): Question {
  return {
    id,
    type: 'Multiple Choice',
    text: `Question ${id}`,
    options: ['A', 'B', 'C', 'D'],
    correctAnswer: 0,
    ...metadata,
  };
}

function section(overrides: Partial<Section> = {}): Section {
  return {
    id: 'section-1',
    title: 'PART I. MULTIPLE CHOICE',
    type: 'Multiple Choice',
    instructions: 'Choose the best answer.',
    questions: [],
    ...overrides,
  };
}

function warningCodes(model: ReturnType<typeof buildTosReviewModel>): string[] {
  return model.warnings.map((warning) => warning.code);
}

describe('buildTosReviewModel', () => {
  it('hides the review when the section has no TOS plan or metadata', () => {
    const model = buildTosReviewModel(section({
      questions: [question('direct-question')],
    }));

    expect(model.visible).toBe(false);
    expect(model.warnings).toEqual([]);
  });

  it('shows only an unsupported-type warning for a non-MCQ section with a persisted plan', () => {
    const model = buildTosReviewModel(section({
      type: 'Essay',
      tosPlan: plan(),
    }));

    expect(model).toMatchObject({
      visible: true,
      planValid: false,
      rows: [],
      allocatedTotal: 0,
      generatedTotal: 0,
    });
    expect(warningCodes(model)).toEqual(['unsupported-question-type']);
    expect(model.warnings[0].message).toMatch(/Multiple Choice/);
  });

  it('shows only an unsupported-type warning for a non-MCQ section with TOS metadata', () => {
    const model = buildTosReviewModel(section({
      type: 'Essay',
      questions: [question('tos-question', {
        tosRowId: 'row-1',
        tosCognitiveLevel: 'Remembering',
      })],
    }));

    expect(model).toMatchObject({
      visible: true,
      planValid: false,
      rows: [],
      allocatedTotal: 0,
      generatedTotal: 0,
    });
    expect(warningCodes(model)).toEqual(['unsupported-question-type']);
    expect(model.warnings[0].message).toMatch(/Multiple Choice/);
  });

  it('keeps an ordinary non-MCQ section without TOS data hidden', () => {
    const model = buildTosReviewModel(section({
      type: 'Essay',
      questions: [question('direct-question')],
    }));

    expect(model.visible).toBe(false);
    expect(model.warnings).toEqual([]);
  });

  it('summarizes a valid plan and matching generated metadata in deterministic order', () => {
    const savedPlan: TosPlan = {
      version: 1,
      rows: [
        {
          id: 'row-1',
          competency: 'Classify matter by observable properties',
          objective: 'Connect observations to a classification',
          allocations: { Remembering: 1, Applying: 2 },
        },
        {
          id: 'row-2',
          competency: 'Interpret evidence',
          allocations: { Evaluating: 1 },
        },
      ],
    };
    const model = buildTosReviewModel(section({
      tosPlan: savedPlan,
      questions: [
        question('direct-question'),
        question('remembering', { tosRowId: 'row-1', tosCognitiveLevel: 'Remembering' }),
        question('applying-1', { tosRowId: 'row-1', tosCognitiveLevel: 'Applying' }),
        question('applying-2', { tosRowId: 'row-1', tosCognitiveLevel: 'Applying' }),
        question('evaluating', { tosRowId: 'row-2', tosCognitiveLevel: 'Evaluating' }),
      ],
    }));

    expect(model.visible).toBe(true);
    expect(model.planValid).toBe(true);
    expect(model.allocatedTotal).toBe(4);
    expect(model.generatedTotal).toBe(4);
    expect(model.warnings).toEqual([]);
    expect(model.rows.map((row) => row.id)).toEqual(['row-1', 'row-2']);
    expect(model.rows[0]).toMatchObject({
      competency: 'Classify matter by observable properties',
      objective: 'Connect observations to a classification',
      allocatedTotal: 3,
      generatedTotal: 3,
      generatedCounts: { Remembering: 1, Applying: 2 },
    });
    expect(model.rows[1]).toMatchObject({
      competency: 'Interpret evidence',
      allocatedTotal: 1,
      generatedTotal: 1,
      generatedCounts: { Evaluating: 1 },
    });
  });

  it('excludes direct questions from TOS generated counts', () => {
    const model = buildTosReviewModel(section({
      tosPlan: plan(),
      questions: [
        question('direct-question'),
        question('tos-question', { tosRowId: 'row-1', tosCognitiveLevel: 'Remembering' }),
      ],
    }));

    expect(model.generatedTotal).toBe(1);
    expect(model.rows[0].generatedTotal).toBe(1);
    expect(model.rows[0].generatedCounts).toEqual({ Remembering: 1 });
  });

  it('warns when TOS metadata exists without a persisted plan', () => {
    const model = buildTosReviewModel(section({
      questions: [question('orphaned-question', {
        tosRowId: 'row-1',
        tosCognitiveLevel: 'Remembering',
      })],
    }));

    expect(model.visible).toBe(true);
    expect(model.planValid).toBe(false);
    expect(warningCodes(model)).toContain('metadata-without-plan');
  });

  it('shows incomplete metadata warnings even when no plan was persisted', () => {
    const model = buildTosReviewModel(section({
      questions: [question('incomplete-question', { tosRowId: 'row-1' })],
    }));

    expect(model.visible).toBe(true);
    expect(warningCodes(model)).toEqual(expect.arrayContaining([
      'incomplete-metadata',
      'metadata-without-plan',
    ]));
  });

  it('warns when a question references an unknown TOS row', () => {
    const model = buildTosReviewModel(section({
      tosPlan: plan(),
      questions: [question('unknown-row', {
        tosRowId: 'row-not-in-plan',
        tosCognitiveLevel: 'Remembering',
      })],
    }));

    expect(warningCodes(model)).toContain('unknown-row');
    expect(model.generatedTotal).toBe(1);
    expect(model.rows[0].generatedTotal).toBe(0);
  });

  it('warns when a question uses a cognitive level not allocated to its row', () => {
    const model = buildTosReviewModel(section({
      tosPlan: plan({ allocations: { Remembering: 1 } }),
      questions: [question('unallocated-level', {
        tosRowId: 'row-1',
        tosCognitiveLevel: 'Applying',
      })],
    }));

    expect(warningCodes(model)).toContain('unallocated-level');
    expect(model.rows[0].generatedCounts).toEqual({ Applying: 1 });
  });

  it('warns when generated counts do not match persisted allocations', () => {
    const model = buildTosReviewModel(section({
      tosPlan: plan({ allocations: { Remembering: 2 } }),
      questions: [question('one-of-two', {
        tosRowId: 'row-1',
        tosCognitiveLevel: 'Remembering',
      })],
    }));

    expect(warningCodes(model)).toContain('allocation-mismatch');
    expect(model.rows[0]).toMatchObject({ allocatedTotal: 2, generatedTotal: 1 });
  });

  it('does not safely review a malformed persisted plan', () => {
    const malformedPlan = {
      version: 2,
      rows: [{ id: 'row-1', competency: 'Unsafe saved row', allocations: { Remembering: 'one' } }],
    } as unknown as TosPlan;
    const model = buildTosReviewModel(section({
      tosPlan: malformedPlan,
      questions: [question('metadata', {
        tosRowId: 'row-1',
        tosCognitiveLevel: 'Remembering',
      })],
    }));

    expect(model.visible).toBe(true);
    expect(model.planValid).toBe(false);
    expect(model.rows).toEqual([]);
    expect(model.allocatedTotal).toBe(0);
    expect(warningCodes(model)).toContain('malformed-plan');
  });

  it('does not invent counts for incomplete metadata', () => {
    const level = 'Remembering' satisfies TosCognitiveLevel;
    const model = buildTosReviewModel(section({
      tosPlan: plan(),
      questions: [
        question('missing-level', { tosRowId: 'row-1' }),
        question('missing-row', { tosCognitiveLevel: level }),
      ],
    }));

    expect(warningCodes(model)).toEqual(expect.arrayContaining(['incomplete-metadata']));
    expect(model.generatedTotal).toBe(0);
  });

  it('does not mutate the saved section while building the review model', () => {
    const source = section({
      tosPlan: plan(),
      questions: [question('tos-question', {
        tosRowId: 'row-1',
        tosCognitiveLevel: 'Remembering',
      })],
    });
    const before = JSON.parse(JSON.stringify(source));

    buildTosReviewModel(source);

    expect(source).toEqual(before);
  });
});
