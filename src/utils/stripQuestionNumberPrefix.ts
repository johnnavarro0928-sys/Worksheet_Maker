// Matches one 1-3 digit numbering prefix such as "1.", "2)", "3:", "Q4.", "Q 5:".
// The delimiter must not be followed by a digit, so decimals ("3.14") and
// times ("10:30") are kept, as are bare leading numbers ("25 students")
// and years ("1945: ...").
const QUESTION_NUMBER_PREFIX = /^(?:Q\s*)?\d{1,3}[.):](?!\d)\s*/i;

export function stripQuestionNumberPrefix(text: string): string {
  let cleanText = text.trim();
  while (QUESTION_NUMBER_PREFIX.test(cleanText)) {
    cleanText = cleanText.replace(QUESTION_NUMBER_PREFIX, '').trim();
  }
  return cleanText;
}
