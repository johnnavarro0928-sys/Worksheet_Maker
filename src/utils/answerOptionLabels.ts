const ANSWER_LABEL_PREFIX = /^\s*(?:option\s*)?[A-D]\s*[\.\):\-]\s+/i;

function stripAnswerLabelPrefix(optionText: string): string {
  return optionText.replace(ANSWER_LABEL_PREFIX, '').trim();
}

export function stripAnswerLabelPrefixes(options: string[]): string[] {
  const labeledOptionCount = options.filter(option => ANSWER_LABEL_PREFIX.test(option)).length;
  if (labeledOptionCount < 2) return options;

  return options.map(stripAnswerLabelPrefix);
}
