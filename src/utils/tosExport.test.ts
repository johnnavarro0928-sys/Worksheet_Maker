import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveAs } from 'file-saver';
import type { Question, Section } from '../types';
import { TOS_COGNITIVE_LEVELS, type TosPlan } from './tosPlan';
import {
  buildTosReportFilename,
  buildTosReportModel,
  createTosReportDocx,
  exportTosReport,
  getTosReportStatus,
  type TosReportInput,
} from './tosExport';

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

const saveAsMock = vi.mocked(saveAs);

function allLevelPlan(): TosPlan {
  return {
    version: 1,
    rows: [{
      id: 'row-1',
      competency: 'Classify matter by observable properties',
      objective: 'Connect observations to a classification',
      allocations: {
        Remembering: 1,
        Understanding: 1,
        Applying: 1,
        Analyzing: 1,
        Evaluating: 1,
        Creating: 1,
      },
    }],
  };
}

function question(id: string, metadata?: Partial<Pick<Question, 'tosRowId' | 'tosCognitiveLevel'>>): Question {
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

function validInput(overrides: Partial<TosReportInput> = {}): TosReportInput {
  return {
    worksheetTitle: 'Matter Assessment',
    section: section({
      tosPlan: allLevelPlan(),
      questions: TOS_COGNITIVE_LEVELS.map((level) => question(level, {
        tosRowId: 'row-1',
        tosCognitiveLevel: level,
      })),
    }),
    generatedAt: new Date('2026-09-30T12:34:56.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TOS report model', () => {
  it('builds a warning-free MCQ report model from the review model', () => {
    const model = buildTosReportModel(validInput());

    expect(model).not.toBeNull();
    expect(model).toMatchObject({
      worksheetTitle: 'Matter Assessment',
      sectionTitle: 'PART I. MULTIPLE CHOICE',
      generationDate: '2026-09-30',
      allocatedTotal: 6,
      generatedTotal: 6,
    });
    expect(model?.rows[0]).toMatchObject({
      id: 'row-1',
      competency: 'Classify matter by observable properties',
      objective: 'Connect observations to a classification',
      allocatedTotal: 6,
      generatedTotal: 6,
    });
  });

  it('preserves all six cognitive levels in deterministic order', () => {
    const model = buildTosReportModel(validInput());

    expect(model?.rows[0].levels).toEqual(TOS_COGNITIVE_LEVELS.map((cognitiveLevel) => ({
      cognitiveLevel,
      allocatedCount: 1,
      generatedCount: 1,
    })));
  });

  it('excludes direct questions because counts come from the review model', () => {
    const input = validInput({
      section: section({
        tosPlan: {
          version: 1,
          rows: [{
            id: 'row-1',
            competency: 'Classify matter',
            allocations: { Remembering: 1 },
          }],
        },
        questions: [
          question('direct-question'),
          question('tos-question', { tosRowId: 'row-1', tosCognitiveLevel: 'Remembering' }),
        ],
      }),
    });

    const model = buildTosReportModel(input);

    expect(model).not.toBeNull();
    expect(model?.generatedTotal).toBe(1);
    expect(model?.rows[0].generatedTotal).toBe(1);
  });

  it('keeps question text, options, and answers out of the report model', () => {
    const input = validInput({
      section: section({
        tosPlan: {
          version: 1,
          rows: [{ id: 'row-1', competency: 'Classify matter', allocations: { Remembering: 1 } }],
        },
        questions: [
          {
            ...question('private-question', { tosRowId: 'row-1', tosCognitiveLevel: 'Remembering' }),
            text: 'PRIVATE QUESTION TEXT',
            options: ['PRIVATE OPTION A', 'PRIVATE OPTION B'],
            answer: 'PRIVATE ANSWER',
          },
        ],
      }),
    });

    const model = buildTosReportModel(input);

    expect(model).not.toBeNull();
    const serializedModel = JSON.stringify(model);
    expect(serializedModel).not.toContain('PRIVATE QUESTION TEXT');
    expect(serializedModel).not.toContain('PRIVATE OPTION A');
    expect(serializedModel).not.toContain('PRIVATE ANSWER');
  });

  it('rejects malformed and warning-bearing review data before export', () => {
    const malformed = getTosReportStatus(validInput({
      section: section({
        tosPlan: { version: 2, rows: [] } as unknown as TosPlan,
      }),
    }));
    const warningBearing = getTosReportStatus(validInput({
      section: section({
        tosPlan: {
          version: 1,
          rows: [{ id: 'row-1', competency: 'Classify matter', allocations: { Remembering: 2 } }],
        },
        questions: [question('one-question', { tosRowId: 'row-1', tosCognitiveLevel: 'Remembering' })],
      }),
    }));

    expect(malformed.eligible).toBe(false);
    expect(malformed.model).toBeNull();
    expect(malformed.message).toMatch(/malformed/i);
    expect(warningBearing.eligible).toBe(false);
    expect(warningBearing.model).toBeNull();
    expect(warningBearing.message).toMatch(/warning|allocation|count/i);
  });

  it('rejects a non-MCQ section even when it carries a persisted plan', () => {
    const status = getTosReportStatus(validInput({
      section: section({ type: 'Essay', tosPlan: allLevelPlan() }),
    }));

    expect(status.eligible).toBe(false);
    expect(status.model).toBeNull();
    expect(status.message).toMatch(/Multiple Choice/);
  });

  it('uses deterministic totals and safe filename fallbacks', () => {
    const input = validInput();
    if (!input.section) throw new Error('Test fixture requires a section.');
    const model = buildTosReportModel({
      ...input,
      worksheetTitle: '  Matter: / Assessment?  ',
      section: { ...input.section, title: 'PART I: <MCQ>' },
    });

    expect(model?.filename).toBe('Matter Assessment - PART I MCQ - TOS Report.docx');
    expect(model?.allocatedTotal).toBe(6);
    expect(model?.generatedTotal).toBe(6);
    expect(buildTosReportFilename('...///???', '***')).toBe('Worksheet - Section - TOS Report.docx');
  });
});

describe('TOS report DOCX boundary', () => {
  it('calls saveAs with a non-empty Blob and deterministic sanitized filename', async () => {
    const filename = await exportTosReport(validInput({
      worksheetTitle: '  Matter: / Assessment?  ',
    }));

    expect(filename).toBe('Matter Assessment - PART I. MULTIPLE CHOICE - TOS Report.docx');
    expect(saveAsMock).toHaveBeenCalledTimes(1);
    const [blob, savedFilename] = saveAsMock.mock.calls[0] ?? [];
    expect(blob).toBeInstanceOf(Blob);
    if (blob instanceof Blob) {
      expect(blob.size).toBeGreaterThan(0);
    }
    expect(savedFilename).toBe(filename);
  });

  it('never calls saveAs for ineligible sections', async () => {
    const inputs: TosReportInput[] = [
      validInput({ section: section({ type: 'Essay', tosPlan: allLevelPlan() }) }),
      validInput({ section: section({
        questions: [question('missing-plan', { tosRowId: 'row-1', tosCognitiveLevel: 'Remembering' })],
      }) }),
      validInput({ section: section({
        tosPlan: { version: 2, rows: [] } as unknown as TosPlan,
      }) }),
      validInput({ section: section({
        tosPlan: {
          version: 1,
          rows: [{ id: 'row-1', competency: 'Classify matter', allocations: { Remembering: 2 } }],
        },
        questions: [question('mismatched-count', { tosRowId: 'row-1', tosCognitiveLevel: 'Remembering' })],
      }) }),
    ];

    for (const input of inputs) {
      await expect(exportTosReport(input)).rejects.toThrow();
    }

    expect(saveAsMock).not.toHaveBeenCalled();
  });

  it('creates a non-empty DOCX blob only for an eligible report', async () => {
    const blob = await createTosReportDocx(validInput());

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('rejects DOCX creation before creating a file for an ineligible report', async () => {
    await expect(createTosReportDocx(validInput({
      section: section({ type: 'Essay', tosPlan: allLevelPlan() }),
    }))).rejects.toThrow(/Multiple Choice/);
  });
});
