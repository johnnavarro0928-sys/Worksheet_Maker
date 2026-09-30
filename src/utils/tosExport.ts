import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { saveAs } from 'file-saver';
import type { Section } from '../types';
import {
  TOS_COGNITIVE_LEVELS,
  type TosCognitiveLevel,
} from './tosPlan';
import {
  buildTosReviewModel,
  type TosReviewModel,
} from './tosReviewState';

export interface TosReportInput {
  worksheetTitle: string;
  section: Section | undefined;
  generatedAt?: Date;
}

export interface TosReportLevel {
  cognitiveLevel: TosCognitiveLevel;
  allocatedCount: number;
  generatedCount: number;
}

export interface TosReportRow {
  id: string;
  competency: string;
  objective?: string;
  levels: TosReportLevel[];
  allocatedTotal: number;
  generatedTotal: number;
}

export interface TosReportModel {
  worksheetTitle: string;
  sectionTitle: string;
  generationDate: string;
  rows: TosReportRow[];
  allocatedTotal: number;
  generatedTotal: number;
  filename: string;
}

export interface TosReportStatus {
  eligible: boolean;
  message: string | null;
  review: TosReviewModel;
  model: TosReportModel | null;
}

export const TOS_REPORT_UNAVAILABLE_MESSAGE = 'TOS report export requires a valid, warning-free persisted TOS plan for the active section.';

export class TosReportUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TosReportUnavailableError';
  }
}

function sanitizeFilenamePart(value: string, fallback: string): string {
  const safeValue = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 80)
    .replace(/[. ]+$/g, '');

  return safeValue || fallback;
}

export function buildTosReportFilename(worksheetTitle: string, sectionTitle: string): string {
  const worksheetPart = sanitizeFilenamePart(worksheetTitle, 'Worksheet');
  const sectionPart = sanitizeFilenamePart(sectionTitle, 'Section');
  return `${worksheetPart} - ${sectionPart} - TOS Report.docx`;
}

function formatGenerationDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function unavailableStatus(review: TosReviewModel, message?: string): TosReportStatus {
  return {
    eligible: false,
    message: message ?? (review.warnings[0]
      ? `TOS report export is unavailable: ${review.warnings[0].message}`
      : TOS_REPORT_UNAVAILABLE_MESSAGE),
    review,
    model: null,
  };
}

function createReportModel(input: TosReportInput, review: TosReviewModel): TosReportModel {
  const section = input.section;
  if (!section) throw new TosReportUnavailableError('No active worksheet section is available for TOS report export.');

  const rows = review.rows.map((row) => {
    const reportRow: TosReportRow = {
      id: row.id,
      competency: row.competency,
      levels: TOS_COGNITIVE_LEVELS.map((cognitiveLevel) => ({
        cognitiveLevel,
        allocatedCount: row.allocations[cognitiveLevel] ?? 0,
        generatedCount: row.generatedCounts[cognitiveLevel] ?? 0,
      })),
      allocatedTotal: row.allocatedTotal,
      generatedTotal: row.generatedTotal,
    };

    if (row.objective !== undefined) reportRow.objective = row.objective;
    return reportRow;
  });

  return {
    worksheetTitle: input.worksheetTitle,
    sectionTitle: section.title,
    generationDate: formatGenerationDate(input.generatedAt ?? new Date()),
    rows,
    allocatedTotal: review.allocatedTotal,
    generatedTotal: review.generatedTotal,
    filename: buildTosReportFilename(input.worksheetTitle, section.title),
  };
}

function evaluateTosReport(input: TosReportInput): TosReportStatus {
  const review = buildTosReviewModel(input.section);

  if (!input.section) {
    return unavailableStatus(review, 'No active worksheet section is available for TOS report export.');
  }
  if (!review.visible) return unavailableStatus(review);
  if (input.section.type !== 'Multiple Choice') {
    return unavailableStatus(review, 'TOS report export is supported only for Multiple Choice sections.');
  }
  if (!review.planValid || review.warnings.length > 0) return unavailableStatus(review);

  const model = createReportModel(input, review);
  return {
    eligible: true,
    message: null,
    review,
    model,
  };
}

export function getTosReportStatus(input: TosReportInput): TosReportStatus {
  return evaluateTosReport(input);
}

export function buildTosReportModel(input: TosReportInput): TosReportModel | null {
  return evaluateTosReport(input).model;
}

function reportCell(text: string, bold = false): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold })],
      }),
    ],
  });
}

function createTosReportDocument(model: TosReportModel): Document {
  const noBorder = {
    top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  };
  const tableRows: TableRow[] = [
    new TableRow({
      children: [
        reportCell('Competency', true),
        reportCell('Objective', true),
        reportCell('Cognitive level', true),
        reportCell('Allocated', true),
        reportCell('Generated', true),
      ],
    }),
  ];

  for (const row of model.rows) {
    for (const level of row.levels) {
      tableRows.push(new TableRow({
        children: [
          reportCell(row.competency),
          reportCell(row.objective ?? ''),
          reportCell(level.cognitiveLevel),
          reportCell(String(level.allocatedCount)),
          reportCell(String(level.generatedCount)),
        ],
      }));
    }

    tableRows.push(new TableRow({
      children: [
        reportCell(`${row.competency} total`, true),
        reportCell(''),
        reportCell(''),
        reportCell(String(row.allocatedTotal), true),
        reportCell(String(row.generatedTotal), true),
      ],
    }));
  }

  tableRows.push(new TableRow({
    children: [
      reportCell('Grand total', true),
      reportCell(''),
      reportCell(''),
      reportCell(String(model.allocatedTotal), true),
      reportCell(String(model.generatedTotal), true),
    ],
  }));

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 720,
            right: 720,
            bottom: 720,
            left: 720,
          },
        },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'TABLE OF SPECIFICATIONS REPORT', bold: true, size: 28, color: '1E3A8A' })],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Worksheet: ', bold: true }),
            new TextRun({ text: model.worksheetTitle }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Active section: ', bold: true }),
            new TextRun({ text: model.sectionTitle }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Generation date: ', bold: true }),
            new TextRun({ text: model.generationDate }),
          ],
        }),
        new Paragraph({ text: '' }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: noBorder,
          rows: tableRows,
        }),
      ],
    }],
  });
}

function requireTosReportModel(input: TosReportInput): TosReportModel {
  const status = evaluateTosReport(input);
  if (!status.model) {
    throw new TosReportUnavailableError(status.message ?? TOS_REPORT_UNAVAILABLE_MESSAGE);
  }
  return status.model;
}

export async function createTosReportDocx(input: TosReportInput): Promise<Blob> {
  const model = requireTosReportModel(input);
  return Packer.toBlob(createTosReportDocument(model));
}

export async function exportTosReport(input: TosReportInput): Promise<string> {
  const model = requireTosReportModel(input);
  const blob = await Packer.toBlob(createTosReportDocument(model));
  saveAs(blob, model.filename);
  return model.filename;
}
