/**
 * Balanced answer-key pattern for Multiple Choice questions.
 * Repeats every 8 items, distributing A/B/C/D evenly (2 each per cycle).
 */
const BALANCED_MULTIPLE_CHOICE_ANSWER_PATTERN = [0, 2, 1, 3, 1, 0, 3, 2];

export interface McqBalanceable {
  options?: string[];
  correctAnswer?: number;
  answer?: string;
}

/**
 * Re-orders the correct-answer position for each MCQ question so the answer
 * letters (A-D) follow a balanced distribution across the full array.
 *
 * The option text that was the correct answer is swapped into the target slot
 * so question content stays intact -- only the letter changes. If the item
 * carries an `answer` string field, it is kept in sync with the new position.
 *
 * Non-MCQ types (determined by the `type` parameter) pass through unchanged.
 */
export function balanceMultipleChoiceAnswers<T extends McqBalanceable>(
  questions: T[],
  type: string,
): T[] {
  if (type !== 'Multiple Choice') return questions;

  return questions.map((question, index) => {
    if (!question.options || question.options.length !== 4 || typeof question.correctAnswer !== 'number') {
      return question;
    }

    const currentAnswerIndex = question.correctAnswer;
    if (currentAnswerIndex < 0 || currentAnswerIndex > 3) return question;

    const targetAnswerIndex = BALANCED_MULTIPLE_CHOICE_ANSWER_PATTERN[index % BALANCED_MULTIPLE_CHOICE_ANSWER_PATTERN.length];
    if (currentAnswerIndex === targetAnswerIndex) return question;

    const options = [...question.options];
    options[targetAnswerIndex] = question.options[currentAnswerIndex];
    options[currentAnswerIndex] = question.options[targetAnswerIndex];

    return {
      ...question,
      options,
      correctAnswer: targetAnswerIndex,
      // Keep the answer text field in sync -- it should always be the correct option text
      ...(question.answer !== undefined ? { answer: options[targetAnswerIndex] } : {}),
    };
  });
}
