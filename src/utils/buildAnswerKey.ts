import { WorksheetData } from "../types";

export interface AnswerKeySectionEntry {
  sectionTitle: string;
  lines: string[]; // e.g. "1. C", "2. True"
}

export function buildAnswerKey(quizData: WorksheetData): AnswerKeySectionEntry[] {
  const result: AnswerKeySectionEntry[] = [];

  (quizData.sections || []).forEach((sec) => {
    const lines: string[] = [];

    (sec.questions || []).forEach((q, i) => {
      if (
        sec.type === 'Multiple Choice' &&
        q.options &&
        typeof q.correctAnswer === 'number' &&
        q.correctAnswer >= 0 &&
        q.correctAnswer < q.options.length
      ) {
        lines.push(`${i + 1}. ${String.fromCharCode(65 + q.correctAnswer)}`);
      } else if (sec.type === 'True or False' && typeof q.correctAnswer === 'number') {
        lines.push(`${i + 1}. ${q.correctAnswer === 0 ? 'True' : 'False'}`);
      } else if (sec.type === 'Identification' && typeof q.answer === 'string' && q.answer.trim().length > 0) {
        lines.push(`${i + 1}. ${q.answer.trim()}`);
      }
      // Problem Solving / Essay intentionally omitted — no fixed answer generated yet.
    });

    if (lines.length > 0) {
      result.push({ sectionTitle: sec.title, lines });
    }
  });

  return result;
}
