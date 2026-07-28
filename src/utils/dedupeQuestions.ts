export interface DeduplicatableQuestion {
  text?: string;
}

function normalizeQuestionText(text?: string): string {
  let normalized = (text || '').trim();
  while (/^\s*(Q?\d+[\.\)\:]|\d+)\s*/i.test(normalized)) {
    normalized = normalized.replace(/^\s*(Q?\d+[\.\)\:]|\d+)\s*/i, '').trim();
  }

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
