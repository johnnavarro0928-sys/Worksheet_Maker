import { stripQuestionNumberPrefix } from './stripQuestionNumberPrefix';

export interface DeduplicatableQuestion {
  text?: string;
}

function normalizeQuestionText(text?: string): string {
  const normalized = stripQuestionNumberPrefix(text || '');

  return normalized
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getQuestionDeduplicationKey(question: DeduplicatableQuestion, type: string): string | undefined {
  const normalizedText = normalizeQuestionText(question.text);
  if (!normalizedText) return undefined;

  return `${type}:${normalizedText}`;
}
