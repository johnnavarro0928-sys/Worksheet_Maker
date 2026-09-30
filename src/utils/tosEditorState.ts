import {
  validateTosPlan,
  type TosPlan,
  type TosValidationIssue,
} from './tosPlan';
import type { Question, Section } from '../types';

export const TOS_QUESTION_TYPE = 'Multiple Choice' as const;
export const TOS_DEFAULT_ENABLED = false;
export const TOS_PERSISTENCE_LIMITATION = 'This section already has a persisted TOS plan. Start another TOS generation in a new section.';

export interface TosGenerationConfigSnapshot {
  topic: string;
  competency: string;
  objective: string;
  grade: string;
  subject: string;
  language: string;
  type: string;
  count: number;
}

export interface TosEditorDraft {
  plan: TosPlan;
  config: TosGenerationConfigSnapshot;
}

export type TosApprovalSnapshot = TosEditorDraft;

export interface TosGenerationContext {
  revision: number;
}

type TosEditorContextIssueCode =
  | 'missing-topic'
  | 'missing-grade'
  | 'missing-subject'
  | 'invalid-question-type';

export type TosEditorIssue = TosValidationIssue | {
  code: TosEditorContextIssueCode;
  path: string;
  message: string;
};

export interface TosEditorValidation {
  valid: boolean;
  totalItems: number;
  issues: TosEditorIssue[];
}

export type TosApprovalStatus = 'draft' | 'invalid' | 'approved' | 'stale';

export type TosGenerationCommitResult =
  | { success: true; section: Section }
  | { success: false; error: string };

export function isTosGenerationContextCurrent(
  started: TosGenerationContext,
  current: TosGenerationContext,
): boolean {
  return started.revision === current.revision;
}

function clonePlan(plan: TosPlan): TosPlan {
  return {
    version: plan.version,
    rows: plan.rows.map((row) => {
      const clonedRow: TosPlan['rows'][number] = {
        id: row.id,
        competency: row.competency,
        allocations: { ...row.allocations },
      };

      if (row.objective !== undefined) clonedRow.objective = row.objective;
      return clonedRow;
    }),
  };
}

function areAllocationsEqual(
  left: TosPlan['rows'][number]['allocations'],
  right: TosPlan['rows'][number]['allocations'],
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && left[key as keyof typeof left] === right[key as keyof typeof right]);
}

function arePlansEqual(left: TosPlan, right: TosPlan): boolean {
  if (left.version !== right.version || left.rows.length !== right.rows.length) return false;

  return left.rows.every((leftRow, index) => {
    const rightRow = right.rows[index];
    return leftRow.id === rightRow.id
      && leftRow.competency === rightRow.competency
      && leftRow.objective === rightRow.objective
      && areAllocationsEqual(leftRow.allocations, rightRow.allocations);
  });
}

function areConfigsEqual(
  left: TosGenerationConfigSnapshot,
  right: TosGenerationConfigSnapshot,
): boolean {
  return left.topic === right.topic
    && left.competency === right.competency
    && left.objective === right.objective
    && left.grade === right.grade
    && left.subject === right.subject
    && left.language === right.language
    && left.type === right.type
    && left.count === right.count;
}

function addContextIssue(
  issues: TosEditorIssue[],
  code: TosEditorContextIssueCode,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

export function isTosAvailable(questionType: string): boolean {
  return questionType === TOS_QUESTION_TYPE;
}

export function createEmptyTosPlan(): TosPlan {
  return {
    version: 1,
    rows: [{ id: 'tos-row-1', competency: '', allocations: {} }],
  };
}

export function getTosGenerationPersistenceIssue(section: Section | undefined): string | null {
  return section?.tosPlan !== undefined ? TOS_PERSISTENCE_LIMITATION : null;
}

export function commitTosGeneration(
  section: Section | undefined,
  plan: TosPlan,
  questions: Question[],
  expectedTotal: number,
): TosGenerationCommitResult {
  if (!section) {
    return { success: false, error: 'The active worksheet section is unavailable.' };
  }

  const persistenceIssue = getTosGenerationPersistenceIssue(section);
  if (persistenceIssue) return { success: false, error: persistenceIssue };

  if (section.type !== TOS_QUESTION_TYPE) {
    return { success: false, error: 'TOS generation is available only for Multiple Choice sections.' };
  }

  if (!Number.isInteger(expectedTotal) || expectedTotal < 1 || questions.length !== expectedTotal) {
    return {
      success: false,
      error: `TOS generation must return exactly ${expectedTotal} questions.`,
    };
  }

  return {
    success: true,
    section: {
      ...section,
      questions: [...section.questions, ...questions],
      tosPlan: clonePlan(plan),
    },
  };
}

export function validateTosEditorDraft(draft: TosEditorDraft): TosEditorValidation {
  const planValidation = validateTosPlan(draft.plan, draft.config.count);
  const issues: TosEditorIssue[] = [];

  if (!draft.config.topic.trim()) {
    addContextIssue(issues, 'missing-topic', 'topic', 'Topic is required for TOS generation.');
  }
  if (!draft.config.grade.trim()) {
    addContextIssue(issues, 'missing-grade', 'grade', 'Grade is required for TOS generation.');
  }
  if (!draft.config.subject.trim()) {
    addContextIssue(issues, 'missing-subject', 'subject', 'Subject is required for TOS generation.');
  }
  if (!isTosAvailable(draft.config.type)) {
    addContextIssue(issues, 'invalid-question-type', 'type', 'TOS generation is available only for Multiple Choice.');
  }

  return {
    valid: issues.length === 0 && planValidation.valid,
    totalItems: planValidation.totalItems,
    issues: [...issues, ...planValidation.issues],
  };
}

export function createTosApproval(draft: TosEditorDraft): TosApprovalSnapshot | null {
  if (!validateTosEditorDraft(draft).valid) return null;

  return {
    config: { ...draft.config },
    plan: clonePlan(draft.plan),
  };
}

export function getTosApprovalStatus(
  draft: TosEditorDraft,
  approval: TosApprovalSnapshot | null,
): TosApprovalStatus {
  const validation = validateTosEditorDraft(draft);

  if (approval && (!areConfigsEqual(draft.config, approval.config) || !arePlansEqual(draft.plan, approval.plan))) {
    return 'stale';
  }
  if (!validation.valid) return 'invalid';
  return approval ? 'approved' : 'draft';
}

export function canSubmitTosGeneration(
  draft: TosEditorDraft,
  approval: TosApprovalSnapshot | null,
  enabled: boolean,
): boolean {
  return enabled
    && isTosAvailable(draft.config.type)
    && getTosApprovalStatus(draft, approval) === 'approved';
}
