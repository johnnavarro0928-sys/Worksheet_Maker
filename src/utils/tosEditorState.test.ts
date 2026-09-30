import { describe, expect, it } from 'vitest';
import type { Question, Section } from '../types';
import type { TosPlan } from './tosPlan';
import {
  TOS_DEFAULT_ENABLED,
  TOS_PERSISTENCE_LIMITATION,
  canSubmitTosGeneration,
  commitTosGeneration,
  createEmptyTosPlan,
  createTosApproval,
  getTosApprovalStatus,
  getTosGenerationPersistenceIssue,
  isTosGenerationContextCurrent,
  isTosAvailable,
  validateTosEditorDraft,
  type TosEditorDraft,
  type TosGenerationContext,
  type TosGenerationConfigSnapshot,
} from './tosEditorState';

function validPlan(): TosPlan {
  return {
    version: 1,
    rows: [{
      id: 'row-1',
      competency: 'Explain the water cycle',
      objective: 'Describe the stages in sequence',
      allocations: { Remembering: 1, Applying: 1 },
    }],
  };
}

function config(overrides: Partial<TosGenerationConfigSnapshot> = {}): TosGenerationConfigSnapshot {
  return {
    topic: 'The water cycle',
    competency: 'Explain the water cycle',
    objective: 'Describe the stages in sequence',
    grade: 'Grade 6',
    subject: 'Science',
    language: 'English',
    type: 'Multiple Choice',
    count: 2,
    ...overrides,
  };
}

function draft(overrides: Partial<TosEditorDraft> = {}): TosEditorDraft {
  return {
    plan: validPlan(),
    config: config(),
    ...overrides,
  };
}

function sourceSection(): Section {
  return {
    id: 'section-1',
    title: 'PART I. MULTIPLE CHOICE',
    type: 'Multiple Choice',
    instructions: 'Choose the best answer.',
    questions: [{ id: 'existing-question', text: 'Existing question' }],
  };
}

function generatedQuestions(): Question[] {
  return [
    {
      id: 'generated-question-1',
      type: 'Multiple Choice',
      text: 'What is photosynthesis?',
      options: ['A', 'B', 'C', 'D'],
      correctAnswer: 0,
      answer: 'A',
      tosRowId: 'row-1',
      tosCognitiveLevel: 'Remembering',
    },
    {
      id: 'generated-question-2',
      type: 'Multiple Choice',
      text: 'Which process uses light energy?',
      options: ['Photosynthesis', 'Respiration', 'Digestion', 'Diffusion'],
      correctAnswer: 0,
      answer: 'Photosynthesis',
      tosRowId: 'row-1',
      tosCognitiveLevel: 'Remembering',
    },
  ];
}

function generationContext(): TosGenerationContext {
  return {
    revision: 0,
  };
}

describe('TOS editor state', () => {
  it('is off by default and available only for Multiple Choice', () => {
    expect(TOS_DEFAULT_ENABLED).toBe(false);
    expect(isTosAvailable('Multiple Choice')).toBe(true);
    expect(isTosAvailable('Essay')).toBe(false);
    expect(isTosAvailable('multiple choice')).toBe(false);
    expect(canSubmitTosGeneration(draft(), null, TOS_DEFAULT_ENABLED)).toBe(false);
  });

  it('creates a fresh empty plan for an unsaved TOS reset', () => {
    const first = createEmptyTosPlan();
    const second = createEmptyTosPlan();

    expect(first).toEqual({
      version: 1,
      rows: [{ id: 'tos-row-1', competency: '', allocations: {} }],
    });
    expect(first).not.toBe(second);
    expect(first.rows).not.toBe(second.rows);
    expect(first.rows[0].allocations).not.toBe(second.rows[0].allocations);
  });

  it('atomically commits exact TOS results with the approved plan and metadata', () => {
    const section = sourceSection();
    const plan = validPlan();
    const questions = generatedQuestions();

    const result = commitTosGeneration(section, plan, questions, 2);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.section).toEqual({
      ...section,
      questions: [...section.questions, ...questions],
      tosPlan: plan,
    });
    expect(result.section).not.toBe(section);
    expect(result.section.questions).not.toBe(section.questions);
    expect(result.section.tosPlan).not.toBe(plan);
    expect(result.section.questions[1]).toMatchObject({
      tosRowId: 'row-1',
      tosCognitiveLevel: 'Remembering',
    });
    expect(section).toEqual(sourceSection());
  });

  it('rejects empty or partial TOS results without changing the section', () => {
    for (const questions of [[], generatedQuestions().slice(0, 1)]) {
      const section = sourceSection();

      const result = commitTosGeneration(section, validPlan(), questions, 2);

      expect(result.success).toBe(false);
      expect(section).toEqual(sourceSection());
      expect(result).toMatchObject({ success: false });
    }
  });

  it('rejects another TOS generation when the section already has a persisted plan', () => {
    const persistedSection = { ...sourceSection(), tosPlan: validPlan() } as Section;

    expect(getTosGenerationPersistenceIssue(persistedSection)).toBe(TOS_PERSISTENCE_LIMITATION);
    expect(commitTosGeneration(persistedSection, validPlan(), generatedQuestions(), 2)).toEqual({
      success: false,
      error: TOS_PERSISTENCE_LIMITATION,
    });
  });

  it('rejects a TOS result after the generation context changes', () => {
    const started = generationContext();

    expect(isTosGenerationContextCurrent(started, started)).toBe(true);
    expect(isTosGenerationContextCurrent(started, {
      ...started,
      revision: started.revision + 1,
    })).toBe(false);
  });

  it('reports incomplete plans before approval', () => {
    const result = validateTosEditorDraft(draft({
      plan: {
        version: 1,
        rows: [{ id: 'row-1', competency: '', allocations: {} }],
      },
    }));

    expect(result.valid).toBe(false);
    expect(result.totalItems).toBe(0);
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'invalid-competency',
      'empty-plan',
    ]));
  });

  it('creates an approval snapshot and reports it as approved', () => {
    const current = draft();
    const approval = createTosApproval(current);

    expect(approval).not.toBeNull();
    expect(getTosApprovalStatus(current, approval)).toBe('approved');
    expect(approval).not.toBe(current);
    expect(approval?.plan).not.toBe(current.plan);
  });

  it.each([
    ['topic', { topic: 'A different topic' }],
    ['competency source', { competency: 'A different competency' }],
    ['objective source', { objective: 'A different objective' }],
    ['grade', { grade: 'Grade 7' }],
    ['subject', { subject: 'Mathematics' }],
    ['language', { language: 'Filipino' }],
    ['count', { count: 3 }],
  ])('invalidates approval after a %s configuration change', (_label, change) => {
    const current = draft();
    const approval = createTosApproval(current);

    expect(getTosApprovalStatus({ ...current, config: { ...current.config, ...change } }, approval)).toBe('stale');
  });

  it('invalidates approval after a plan edit', () => {
    const current = draft();
    const approval = createTosApproval(current);
    const editedPlan: TosPlan = {
      ...current.plan,
      rows: current.plan.rows.map(row => ({ ...row, competency: 'Edited competency' })),
    };

    expect(getTosApprovalStatus({ ...current, plan: editedPlan }, approval)).toBe('stale');
  });

  it('does not allow an approved TOS request after changing question type', () => {
    const current = draft();
    const approval = createTosApproval(current);
    const essayDraft = { ...current, config: { ...current.config, type: 'Essay' } };

    expect(isTosAvailable(essayDraft.config.type)).toBe(false);
    expect(getTosApprovalStatus(essayDraft, approval)).toBe('stale');
    expect(canSubmitTosGeneration(essayDraft, approval, true)).toBe(false);
  });
});
