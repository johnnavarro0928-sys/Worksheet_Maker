export const TOS_COGNITIVE_LEVELS = [
  'Remembering',
  'Understanding',
  'Applying',
  'Analyzing',
  'Evaluating',
  'Creating',
] as const;

export type TosCognitiveLevel = (typeof TOS_COGNITIVE_LEVELS)[number];

export interface TosRow {
  id: string;
  competency: string;
  objective?: string;
  allocations: Partial<Record<TosCognitiveLevel, number>>;
}

export interface TosPlan {
  version: 1;
  rows: TosRow[];
}

export interface TosWorkItem {
  rowId: string;
  competency: string;
  objective?: string;
  cognitiveLevel: TosCognitiveLevel;
  count: number;
}

export type TosValidationIssueCode =
  | 'invalid-plan'
  | 'invalid-version'
  | 'invalid-rows'
  | 'invalid-row-count'
  | 'invalid-row'
  | 'invalid-row-id'
  | 'duplicate-row-id'
  | 'invalid-competency'
  | 'invalid-objective'
  | 'invalid-allocations'
  | 'unknown-cognitive-level'
  | 'invalid-allocation-count'
  | 'invalid-expected-total'
  | 'empty-plan'
  | 'total-mismatch';

export interface TosValidationIssue {
  code: TosValidationIssueCode;
  path: string;
  message: string;
}

export interface TosValidationResult {
  valid: boolean;
  totalItems: number;
  issues: TosValidationIssue[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isCognitiveLevel = (value: string): value is TosCognitiveLevel => (
  TOS_COGNITIVE_LEVELS.includes(value as TosCognitiveLevel)
);

const isValidAllocationCount = (value: unknown): value is number => (
  typeof value === 'number' &&
  Number.isFinite(value) &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 50
);

const isValidExpectedTotal = (value: number): boolean => (
  Number.isInteger(value) && value >= 1 && value <= 50
);

function addIssue(
  issues: TosValidationIssue[],
  code: TosValidationIssueCode,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function deriveTotal(input: unknown): number {
  if (!isRecord(input) || !Array.isArray(input.rows)) return 0;

  return input.rows.reduce((total, rawRow) => {
    if (!isRecord(rawRow)) return total;
    const allocations = rawRow.allocations;
    if (!isRecord(allocations)) return total;

    return total + TOS_COGNITIVE_LEVELS.reduce((rowTotal, level) => {
      const count = allocations[level];
      return rowTotal + (isValidAllocationCount(count) ? count : 0);
    }, 0);
  }, 0);
}

export function getTosTotal(plan: TosPlan): number {
  return plan.rows.reduce(
    (total, row) => total + TOS_COGNITIVE_LEVELS.reduce(
      (rowTotal, level) => rowTotal + (row.allocations[level] ?? 0),
      0,
    ),
    0,
  );
}

export function flattenTosPlan(plan: TosPlan): TosWorkItem[] {
  const workItems: TosWorkItem[] = [];

  for (const row of plan.rows) {
    for (const cognitiveLevel of TOS_COGNITIVE_LEVELS) {
      const count = row.allocations[cognitiveLevel];
      if (!count) continue;

      const workItem: TosWorkItem = {
        rowId: row.id,
        competency: row.competency,
        cognitiveLevel,
        count,
      };

      if (row.objective !== undefined) workItem.objective = row.objective;
      workItems.push(workItem);
    }
  }

  return workItems;
}

export function validateTosPlan(input: unknown, expectedTotal: number): TosValidationResult {
  const issues: TosValidationIssue[] = [];
  const totalItems = deriveTotal(input);

  if (!isRecord(input)) {
    addIssue(issues, 'invalid-plan', '$', 'TOS plan must be an object.');
    return { valid: false, totalItems, issues };
  }

  if (input.version !== 1) {
    addIssue(issues, 'invalid-version', 'version', 'TOS plan version must be 1.');
  }

  if (!Array.isArray(input.rows)) {
    addIssue(issues, 'invalid-rows', 'rows', 'TOS plan rows must be an array.');
  } else {
    if (input.rows.length < 1 || input.rows.length > 20) {
      addIssue(issues, 'invalid-row-count', 'rows', 'TOS plan must contain between 1 and 20 rows.');
    }

    const rowIds = new Set<string>();

    input.rows.forEach((rawRow, rowIndex) => {
      const rowPath = `rows[${rowIndex}]`;

      if (!isRecord(rawRow)) {
        addIssue(issues, 'invalid-row', rowPath, 'Each TOS row must be an object.');
        return;
      }

      const id = rawRow.id;
      if (typeof id !== 'string' || id.trim().length === 0) {
        addIssue(issues, 'invalid-row-id', `${rowPath}.id`, 'Each TOS row must have a non-empty string id.');
      } else if (rowIds.has(id)) {
        addIssue(issues, 'duplicate-row-id', `${rowPath}.id`, 'TOS row ids must be unique.');
      } else {
        rowIds.add(id);
      }

      const competency = rawRow.competency;
      if (typeof competency !== 'string' || competency.trim().length === 0) {
        addIssue(
          issues,
          'invalid-competency',
          `${rowPath}.competency`,
          'Each TOS row must have a non-empty string competency.',
        );
      }

      if (rawRow.objective !== undefined && typeof rawRow.objective !== 'string') {
        addIssue(issues, 'invalid-objective', `${rowPath}.objective`, 'TOS row objective must be a string when provided.');
      }

      const allocations = rawRow.allocations;
      if (!isRecord(allocations)) {
        addIssue(issues, 'invalid-allocations', `${rowPath}.allocations`, 'Each TOS row must have an allocations object.');
        return;
      }

      Object.keys(allocations).forEach((key) => {
        const allocationPath = `${rowPath}.allocations.${key}`;

        if (!isCognitiveLevel(key)) {
          addIssue(issues, 'unknown-cognitive-level', allocationPath, 'Unknown cognitive-level allocation key.');
        } else if (!isValidAllocationCount(allocations[key])) {
          addIssue(
            issues,
            'invalid-allocation-count',
            allocationPath,
            'Allocation counts must be finite integers from 0 through 50.',
          );
        }
      });
    });

    if (totalItems === 0) {
      addIssue(issues, 'empty-plan', '$', 'TOS plan must allocate at least one item.');
    }
  }

  if (!isValidExpectedTotal(expectedTotal)) {
    addIssue(issues, 'invalid-expected-total', 'expectedTotal', 'expectedTotal must be an integer from 1 through 50.');
  } else if (totalItems !== expectedTotal) {
    addIssue(issues, 'total-mismatch', 'expectedTotal', 'TOS allocation total must equal expectedTotal.');
  }

  return { valid: issues.length === 0, totalItems, issues };
}
