import { describe, expect, it } from 'vitest';
import {
  flattenTosPlan,
  getTosTotal,
  TOS_COGNITIVE_LEVELS,
  type TosPlan,
  validateTosPlan,
} from './tosPlan';

function validPlan(): TosPlan {
  return {
    version: 1,
    rows: [
      {
        id: 'row-1',
        competency: 'Explain the water cycle',
        objective: 'Describe the stages in sequence',
        allocations: {
          Applying: 1,
          Remembering: 2,
          Creating: 0,
        },
      },
      {
        id: 'row-2',
        competency: 'Interpret weather data',
        allocations: {
          Evaluating: 1,
          Understanding: 1,
        },
      },
    ],
  };
}

function expectIssue(result: ReturnType<typeof validateTosPlan>, code: string, path: string): void {
  const issue = result.issues.find((candidate) => candidate.code === code && candidate.path === path);

  expect(issue).toBeDefined();
  expect(issue?.message).toMatch(/\S/);
}

describe('TOS cognitive levels', () => {
  it('publishes the required deterministic level order', () => {
    expect(TOS_COGNITIVE_LEVELS).toEqual([
      'Remembering',
      'Understanding',
      'Applying',
      'Analyzing',
      'Evaluating',
      'Creating',
    ]);
  });
});

describe('getTosTotal', () => {
  it('sums allocated counts and treats omitted levels as zero', () => {
    expect(getTosTotal(validPlan())).toBe(5);
  });
});

describe('flattenTosPlan', () => {
  it('preserves row order, cognitive-level order, and optional objectives', () => {
    expect(flattenTosPlan(validPlan())).toEqual([
      {
        rowId: 'row-1',
        competency: 'Explain the water cycle',
        objective: 'Describe the stages in sequence',
        cognitiveLevel: 'Remembering',
        count: 2,
      },
      {
        rowId: 'row-1',
        competency: 'Explain the water cycle',
        objective: 'Describe the stages in sequence',
        cognitiveLevel: 'Applying',
        count: 1,
      },
      {
        rowId: 'row-2',
        competency: 'Interpret weather data',
        cognitiveLevel: 'Understanding',
        count: 1,
      },
      {
        rowId: 'row-2',
        competency: 'Interpret weather data',
        cognitiveLevel: 'Evaluating',
        count: 1,
      },
    ]);
  });

  it('omits zero-count allocations without inventing work items', () => {
    const plan: TosPlan = {
      version: 1,
      rows: [
        {
          id: 'row-1',
          competency: 'Use evidence',
          allocations: { Remembering: 0, Analyzing: 0 },
        },
      ],
    };

    expect(flattenTosPlan(plan)).toEqual([]);
  });
});

describe('validateTosPlan', () => {
  it('accepts a valid version 1 plan and reports its derived total', () => {
    expect(validateTosPlan(validPlan(), 5)).toEqual({
      valid: true,
      totalItems: 5,
      issues: [],
    });
  });

  it('rejects malformed plan roots', () => {
    const result = validateTosPlan(null, 1);

    expect(result.valid).toBe(false);
    expect(result.totalItems).toBe(0);
    expectIssue(result, 'invalid-plan', '$');
  });

  it('accepts only version 1', () => {
    const result = validateTosPlan({ ...validPlan(), version: 2 }, 5);

    expect(result.valid).toBe(false);
    expectIssue(result, 'invalid-version', 'version');
  });

  it('requires rows to be an array with between 1 and 20 entries', () => {
    const notAnArray = validateTosPlan({ version: 1, rows: null }, 1);
    expectIssue(notAnArray, 'invalid-rows', 'rows');

    const empty = validateTosPlan({ version: 1, rows: [] }, 1);
    expectIssue(empty, 'invalid-row-count', 'rows');

    const tooMany = validateTosPlan(
      {
        version: 1,
        rows: Array.from({ length: 21 }, (_, index) => ({
          id: `row-${index}`,
          competency: `Competency ${index}`,
          allocations: { Remembering: index === 0 ? 1 : 0 },
        })),
      },
      1,
    );
    expectIssue(tooMany, 'invalid-row-count', 'rows');
  });

  it('accepts the maximum of 20 valid rows', () => {
    const plan: TosPlan = {
      version: 1,
      rows: Array.from({ length: 20 }, (_, index) => ({
        id: `row-${index}`,
        competency: `Competency ${index}`,
        allocations: { Remembering: index === 0 ? 1 : 0 },
      })),
    };

    expect(validateTosPlan(plan, 1)).toEqual({
      valid: true,
      totalItems: 1,
      issues: [],
    });
  });

  it('requires every row to be an object', () => {
    const result = validateTosPlan(
      { version: 1, rows: [null] },
      1,
    );

    expectIssue(result, 'invalid-row', 'rows[0]');
  });

  it('requires unique, non-empty string row IDs', () => {
    for (const id of ['', '   ', 42]) {
      const result = validateTosPlan(
        {
          version: 1,
          rows: [{ id, competency: 'Competency', allocations: { Remembering: 1 } }],
        },
        1,
      );

      expectIssue(result, 'invalid-row-id', 'rows[0].id');
    }

    const duplicate = validateTosPlan(
      {
        version: 1,
        rows: [
          { id: 'same', competency: 'First', allocations: { Remembering: 1 } },
          { id: 'same', competency: 'Second', allocations: {} },
        ],
      },
      1,
    );

    expectIssue(duplicate, 'duplicate-row-id', 'rows[1].id');
  });

  it('requires a non-empty competency in every row', () => {
    for (const competency of ['', '   ', 42]) {
      const result = validateTosPlan(
        {
          version: 1,
          rows: [{ id: 'row-1', competency, allocations: { Remembering: 1 } }],
        },
        1,
      );

      expectIssue(result, 'invalid-competency', 'rows[0].competency');
    }
  });

  it('allows an optional string objective but rejects malformed objectives', () => {
    const withoutObjective = validateTosPlan(
      {
        version: 1,
        rows: [{ id: 'row-1', competency: 'Competency', allocations: { Remembering: 1 } }],
      },
      1,
    );
    expect(withoutObjective.valid).toBe(true);

    const malformed = validateTosPlan(
      {
        version: 1,
        rows: [{ id: 'row-1', competency: 'Competency', objective: 42, allocations: { Remembering: 1 } }],
      },
      1,
    );
    expectIssue(malformed, 'invalid-objective', 'rows[0].objective');
  });

  it('rejects non-object allocations', () => {
    const result = validateTosPlan(
      {
        version: 1,
        rows: [{ id: 'row-1', competency: 'Competency', allocations: null }],
      },
      1,
    );

    expectIssue(result, 'invalid-allocations', 'rows[0].allocations');
  });

  it('rejects unknown cognitive-level allocation keys', () => {
    const result = validateTosPlan(
      {
        version: 1,
        rows: [{
          id: 'row-1',
          competency: 'Competency',
          allocations: { Remembering: 1, Recall: 2 },
        }],
      },
      1,
    );

    expectIssue(result, 'unknown-cognitive-level', 'rows[0].allocations.Recall');
  });

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
    ['too large', 51],
    ['not finite', Number.POSITIVE_INFINITY],
    ['not a number', Number.NaN],
  ])('requires allocation counts to be finite integers from 0 through 50 (%s)', (_label, count) => {
    const result = validateTosPlan(
      {
        version: 1,
        rows: [{ id: 'row-1', competency: 'Competency', allocations: { Remembering: count } }],
      },
      1,
    );

    expectIssue(result, 'invalid-allocation-count', 'rows[0].allocations.Remembering');
  });

  it('accepts the maximum allocation and expected total of 50', () => {
    const plan: TosPlan = {
      version: 1,
      rows: [{ id: 'row-1', competency: 'Competency', allocations: { Creating: 50 } }],
    };

    expect(validateTosPlan(plan, 50)).toEqual({
      valid: true,
      totalItems: 50,
      issues: [],
    });
  });

  it.each([
    ['zero', 0],
    ['fractional', 1.5],
    ['too large', 51],
    ['not a number', Number.NaN],
  ])('requires expectedTotal to be an integer from 1 through 50 (%s)', (_label, expectedTotal) => {
    const result = validateTosPlan(validPlan(), expectedTotal);

    expectIssue(result, 'invalid-expected-total', 'expectedTotal');
  });

  it('rejects a derived-total mismatch', () => {
    const result = validateTosPlan(validPlan(), 4);

    expect(result.valid).toBe(false);
    expect(result.totalItems).toBe(5);
    expectIssue(result, 'total-mismatch', 'expectedTotal');
  });

  it('rejects a plan with zero allocated items', () => {
    const result = validateTosPlan(
      {
        version: 1,
        rows: [{ id: 'row-1', competency: 'Competency', allocations: { Remembering: 0 } }],
      },
      1,
    );

    expect(result.totalItems).toBe(0);
    expectIssue(result, 'empty-plan', '$');
  });

  it('does not mutate input while validating, totaling, or flattening', () => {
    const input = validPlan();
    const before = JSON.parse(JSON.stringify(input));

    validateTosPlan(input, 5);
    getTosTotal(input);
    flattenTosPlan(input);

    expect(input).toEqual(before);
  });
});
