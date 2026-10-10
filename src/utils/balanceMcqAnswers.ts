/**
 * Order-aware answer-key balancing for Multiple Choice questions.
 *
 * Each item with four options and a numeric correctAnswer is classified:
 * - "ordered": all four options are numbers (units, signs, decimals, thousands
 *   separators and fractions allowed) in strictly ascending order, or all four
 *   are single words in alphabetical order (case-insensitive). These keep the
 *   model's option order and correct letter, so the order is never scrambled.
 * - "free": everything else. The correct option is swapped into a target letter
 *   chosen to even out A-D across the whole section: letters already used by
 *   existing section questions and by ordered items count first, then each free
 *   item goes to the least-used letter. Ties follow the balanced pattern below,
 *   avoiding three identical letters in a row where that costs no balance.
 * - "fixed": any option is "All/None of the above" (or a close variant) or
 *   refers to other options by letter ("Both A and B", "Option C"). These are
 *   kept in place and counted like ordered items, so moving options never
 *   breaks a last-slot or by-letter reference.
 *
 * Without existing questions or ordered items this reproduces the fixed pattern.
 * Non-MCQ types and malformed items pass through unchanged.
 */
const BALANCED_MULTIPLE_CHOICE_ANSWER_PATTERN = [0, 2, 1, 3, 1, 0, 3, 2];

export interface McqBalanceable {
  options?: string[];
  correctAnswer?: number;
  answer?: string;
}

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5,
  '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
};
const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join('');
// [sign][currency] number [unit of at most two tokens without digits]
const NUMERIC_OPTION = new RegExp(
  `^([+\\-−]?)\\s*[$₱€£¥]?\\s*(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+\\s+\\d+\\/\\d+|\\d*\\s*[${FRACTION_CHARS}]|\\d+\\/\\d+|\\d*\\.\\d+|\\d+)\\s*(?:[^\\d\\s]+(?:\\s+[^\\d\\s]+)?)?$`,
);

function parseNumericOption(option: string): number | null {
  const match = NUMERIC_OPTION.exec(option.trim());
  if (!match) return null;
  const negative = match[1] === '-' || match[1] === '−';
  const body = match[2].replace(/,/g, '');

  let value: number;
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(body);
  const fraction = /^(\d+)\/(\d+)$/.exec(body);
  const unicode = new RegExp(`^(\\d*)\\s*([${FRACTION_CHARS}])$`).exec(body);
  if (mixed) value = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  else if (fraction) value = Number(fraction[1]) / Number(fraction[2]);
  else if (unicode) value = Number(unicode[1] || 0) + UNICODE_FRACTIONS[unicode[2]];
  else value = Number(body);

  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

// "All of the above", "None of these", "Both of the above", "All the choices"...
const ALL_OR_NONE_OPTION = /^(?:all|none|both|neither)\s+(?:of\s+)?(?:the\s+)?(?:above|these|those|choices|options|answers)\b/i;
// A-D only as standalone tokens, so "Alpha and Beta" or "Data" never match.
const LETTER = '(?<![\\p{L}\\p{N}])[a-d](?![\\p{L}\\p{N}])';
const LETTER_LIST = new RegExp(`${LETTER}(?:\\s*,\\s*${LETTER})*\\s*,?\\s*(?:and|or|nor|&)\\s+${LETTER}`, 'iu');
const LETTER_KEYWORD = new RegExp(`\\b(?:options?|choices?|letters?)\\s+${LETTER}`, 'iu');

function isPositionalOption(option: string): boolean {
  const text = option.trim();
  return ALL_OR_NONE_OPTION.test(text) || LETTER_LIST.test(text) || LETTER_KEYWORD.test(text);
}

function isStrictlyAscending<T>(values: T[], lessThan: (a: T, b: T) => boolean): boolean {
  return values.every((value, i) => i === 0 || lessThan(values[i - 1], value));
}

export function classifyMcqOptions(options: string[]): 'ordered' | 'fixed' | 'free' {
  if (options.some(isPositionalOption)) return 'fixed';

  const numbers = options.map(parseNumericOption);
  if (numbers.every((value): value is number => value !== null)) {
    return isStrictlyAscending(numbers, (a, b) => a < b) ? 'ordered' : 'free';
  }

  const words = options.map(option => option.trim());
  const singleWords = words.every(word => word.length > 0 && !/\s/.test(word) && /\p{L}/u.test(word));
  if (singleWords && isStrictlyAscending(words.map(word => word.toLowerCase()), (a, b) => a < b)) {
    return 'ordered';
  }
  return 'free';
}

function getCorrectLetter(question: McqBalanceable): number | null {
  if (!question.options || question.options.length !== 4 || typeof question.correctAnswer !== 'number') return null;
  return Number.isInteger(question.correctAnswer) && question.correctAnswer >= 0 && question.correctAnswer <= 3
    ? question.correctAnswer
    : null;
}

function createsRun(letters: Array<number | null>, position: number, letter: number): boolean {
  const at = (index: number) => (index === position ? letter : letters[index] ?? null);
  return [position - 2, position - 1, position].some(start =>
    start >= 0 && at(start) === letter && at(start + 1) === letter && at(start + 2) === letter,
  );
}

function pickTargetLetter(counts: number[], letters: Array<number | null>, position: number): number {
  const fewest = Math.min(...counts);
  const leastUsed = [0, 1, 2, 3].filter(letter => counts[letter] === fewest);
  const withoutRun = leastUsed.filter(letter => !createsRun(letters, position, letter));
  const candidates = withoutRun.length > 0 ? withoutRun : leastUsed;

  for (let offset = 0; offset < BALANCED_MULTIPLE_CHOICE_ANSWER_PATTERN.length; offset += 1) {
    const preferred = BALANCED_MULTIPLE_CHOICE_ANSWER_PATTERN[(position + offset) % BALANCED_MULTIPLE_CHOICE_ANSWER_PATTERN.length];
    if (candidates.includes(preferred)) return preferred;
  }
  return candidates[0];
}

function moveCorrectOption<T extends McqBalanceable>(question: T, currentIndex: number, targetIndex: number): T {
  if (currentIndex === targetIndex) return question;

  const options = [...question.options!];
  options[targetIndex] = question.options![currentIndex];
  options[currentIndex] = question.options![targetIndex];

  return {
    ...question,
    options,
    correctAnswer: targetIndex,
    // Keep the answer text field in sync -- it should always be the correct option text
    ...(question.answer !== undefined ? { answer: options[targetIndex] } : {}),
  };
}

export function balanceMultipleChoiceAnswers<T extends McqBalanceable>(
  questions: T[],
  type: string,
  existingQuestions: McqBalanceable[] = [],
): T[] {
  if (type !== 'Multiple Choice') return questions;

  const offset = existingQuestions.length;
  const kinds = questions.map(question => {
    if (getCorrectLetter(question) === null) return 'skip';
    return classifyMcqOptions(question.options!);
  });

  // Letters in section order; unassigned free items stay null until placed.
  const letters: Array<number | null> = [
    ...existingQuestions.map(getCorrectLetter),
    ...questions.map((question, i) => (kinds[i] === 'ordered' || kinds[i] === 'fixed' ? getCorrectLetter(question) : null)),
  ];
  const counts = [0, 0, 0, 0];
  for (const letter of letters) if (letter !== null) counts[letter] += 1;

  return questions.map((question, i) => {
    if (kinds[i] !== 'free') return question;
    const position = offset + i;
    const target = pickTargetLetter(counts, letters, position);
    counts[target] += 1;
    letters[position] = target;
    return moveCorrectOption(question, question.correctAnswer!, target);
  });
}
