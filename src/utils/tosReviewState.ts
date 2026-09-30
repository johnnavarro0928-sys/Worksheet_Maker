import type { Question, Section } from '../types';
import {
  TOS_COGNITIVE_LEVELS,
  validateTosPlan,
  type TosCognitiveLevel,
  type TosPlan,
} from './tosPlan';

export type TosReviewWarningCode =
  | 'unsupported-question-type'
  | 'metadata-without-plan'
  | 'malformed-plan'
  | 'incomplete-metadata'
  | 'unknown-row'
  | 'invalid-cognitive-level'
  | 'unallocated-level'
  | 'allocation-mismatch';

export interface TosReviewWarning {
  code: TosReviewWarningCode;
  path: string;
  message: string;
}

export interface TosReviewRow {
  id: string;
  competency: string;
  objective?: string;
  allocations: Partial<Record<TosCognitiveLevel, number>>;
  generatedCounts: Partial<Record<TosCognitiveLevel, number>>;
  allocatedTotal: number;
  generatedTotal: number;
}

export interface TosReviewModel {
  visible: boolean;
  planValid: boolean;
  rows: TosReviewRow[];
  allocatedTotal: number;
  generatedTotal: number;
  warnings: TosReviewWarning[];
}

interface TosQuestionMetadata {
  questionIndex: number;
  rowId: string;
  cognitiveLevel: string;
}

const TOS_REVIEW_QUESTION_TYPE = 'Multiple Choice';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidCognitiveLevel(value: string): value is TosCognitiveLevel {
  return TOS_COGNITIVE_LEVELS.includes(value as TosCognitiveLevel);
}

function isValidAllocationCount(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= 0
    && value <= 50;
}

function derivePlanTotal(input: unknown): number {
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

function addWarning(
  warnings: TosReviewWarning[],
  code: TosReviewWarningCode,
  path: string,
  message: string,
): void {
  warnings.push({ code, path, message });
}

function emptyReviewModel(): TosReviewModel {
  return {
    visible: false,
    planValid: false,
    rows: [],
    allocatedTotal: 0,
    generatedTotal: 0,
    warnings: [],
  };
}

function readQuestionMetadata(
  questions: Question[],
  warnings: TosReviewWarning[],
): TosQuestionMetadata[] {
  const metadata: TosQuestionMetadata[] = [];

  questions.forEach((question, questionIndex) => {
    const hasRowId = question.tosRowId !== undefined;
    const hasCognitiveLevel = question.tosCognitiveLevel !== undefined;
    if (!hasRowId && !hasCognitiveLevel) return;

    if (
      typeof question.tosRowId !== 'string'
      || question.tosRowId.trim().length === 0
      || typeof question.tosCognitiveLevel !== 'string'
      || question.tosCognitiveLevel.trim().length === 0
    ) {
      addWarning(
        warnings,
        'incomplete-metadata',
        `questions[${questionIndex}]`,
        'A question has incomplete TOS metadata and is excluded from TOS counts.',
      );
      return;
    }

    metadata.push({
      questionIndex,
      rowId: question.tosRowId,
      cognitiveLevel: question.tosCognitiveLevel,
    });
  });

  return metadata;
}

function hasTosMetadata(questions: Question[]): boolean {
  return questions.some((question) => (
    question.tosRowId !== undefined || question.tosCognitiveLevel !== undefined
  ));
}

function createReviewRows(plan: TosPlan): TosReviewRow[] {
  return plan.rows.map((row) => {
    const reviewRow: TosReviewRow = {
      id: row.id,
      competency: row.competency,
      allocations: { ...row.allocations },
      generatedCounts: {},
      allocatedTotal: TOS_COGNITIVE_LEVELS.reduce(
        (total, level) => total + (row.allocations[level] ?? 0),
        0,
      ),
      generatedTotal: 0,
    };

    if (row.objective !== undefined) reviewRow.objective = row.objective;
    return reviewRow;
  });
}

function incrementGeneratedCount(row: TosReviewRow, level: TosCognitiveLevel): void {
  row.generatedCounts[level] = (row.generatedCounts[level] ?? 0) + 1;
  row.generatedTotal += 1;
}

export function buildTosReviewModel(section: Section | undefined): TosReviewModel {
  if (!section) return emptyReviewModel();

  const hasPersistedPlan = section.tosPlan !== undefined;
  const hasQuestionMetadata = hasTosMetadata(section.questions);
  if (!hasPersistedPlan && !hasQuestionMetadata) return emptyReviewModel();

  if (section.type !== TOS_REVIEW_QUESTION_TYPE) {
    return {
      visible: true,
      planValid: false,
      rows: [],
      allocatedTotal: 0,
      generatedTotal: 0,
      warnings: [{
        code: 'unsupported-question-type',
        path: 'type',
        message: 'TOS review is supported only for Multiple Choice sections.',
      }],
    };
  }

  const warnings: TosReviewWarning[] = [];
  const metadata = readQuestionMetadata(section.questions, warnings);
  const hasParsedQuestionMetadata = metadata.length > 0 || warnings.some(
    (warning) => warning.code === 'incomplete-metadata',
  );

  const generatedTotal = metadata.length;

  if (!hasPersistedPlan && hasParsedQuestionMetadata) {
    addWarning(
      warnings,
      'metadata-without-plan',
      'tosPlan',
      'TOS question metadata exists, but this section has no persisted TOS plan.',
    );

    return {
      visible: true,
      planValid: false,
      rows: [],
      allocatedTotal: 0,
      generatedTotal,
      warnings,
    };
  }

  const savedPlan = section.tosPlan as unknown;
  const validation = validateTosPlan(savedPlan, derivePlanTotal(savedPlan));
  if (!validation.valid) {
    addWarning(
      warnings,
      'malformed-plan',
      'tosPlan',
      'The saved TOS plan is malformed and cannot be safely reviewed.',
    );

    return {
      visible: true,
      planValid: false,
      rows: [],
      allocatedTotal: 0,
      generatedTotal,
      warnings,
    };
  }

  const plan = savedPlan as TosPlan;
  const rows = createReviewRows(plan);
  const rowIndexes = new Map(rows.map((row, index) => [row.id, index]));
  let hasAllocationMismatch = false;

  for (const entry of metadata) {
    if (!isValidCognitiveLevel(entry.cognitiveLevel)) {
      addWarning(
        warnings,
        'invalid-cognitive-level',
        `questions[${entry.questionIndex}].tosCognitiveLevel`,
        'A generated TOS question has an unknown cognitive level and cannot be assigned.',
      );
      continue;
    }

    const rowIndex = rowIndexes.get(entry.rowId);
    if (rowIndex === undefined) {
      addWarning(
        warnings,
        'unknown-row',
        `questions[${entry.questionIndex}].tosRowId`,
        'A generated TOS question references a row that is not in the saved plan.',
      );
      continue;
    }

    const row = rows[rowIndex];
    incrementGeneratedCount(row, entry.cognitiveLevel);

    if ((row.allocations[entry.cognitiveLevel] ?? 0) === 0) {
      addWarning(
        warnings,
        'unallocated-level',
        `questions[${entry.questionIndex}].tosCognitiveLevel`,
        'A generated TOS question uses a cognitive level that is not allocated to its saved row.',
      );
    }
  }

  for (const [rowIndex, row] of rows.entries()) {
    for (const level of TOS_COGNITIVE_LEVELS) {
      const allocated = row.allocations[level] ?? 0;
      const generated = row.generatedCounts[level] ?? 0;
      if (allocated === generated) continue;

      hasAllocationMismatch = true;
      addWarning(
        warnings,
        'allocation-mismatch',
        `rows[${rowIndex}].allocations.${level}`,
        `Generated TOS count for "${row.competency}" at ${level} is ${generated}; the saved allocation is ${allocated}.`,
      );
    }
  }

  const allocatedTotal = rows.reduce((total, row) => total + row.allocatedTotal, 0);
  if (generatedTotal !== allocatedTotal && !hasAllocationMismatch) {
    addWarning(
      warnings,
      'allocation-mismatch',
      'questions',
      `Generated TOS question count is ${generatedTotal}; the saved allocation total is ${allocatedTotal}.`,
    );
  }

  return {
    visible: true,
    planValid: true,
    rows,
    allocatedTotal,
    generatedTotal,
    warnings,
  };
}
