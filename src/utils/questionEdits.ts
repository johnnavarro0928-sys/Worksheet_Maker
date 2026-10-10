import { Question } from "../types";

// Teacher edits from the worksheet preview. Each helper returns a new Question
// (or the same one for invalid input) and keeps `answer` in sync. Answer
// re-balancing is intentionally not applied here; it only runs at generation.

function isOptionIndex(question: Question, index: number): boolean {
  return !!question.options && Number.isInteger(index) && index >= 0 && index < question.options.length;
}

function syncMultipleChoiceAnswer(question: Question): Question {
  if (typeof question.correctAnswer !== 'number' || !isOptionIndex(question, question.correctAnswer)) return question;
  return { ...question, answer: question.options![question.correctAnswer] };
}

export function setOptionText(question: Question, index: number, text: string): Question {
  if (!isOptionIndex(question, index)) return question;
  const options = [...question.options!];
  options[index] = text;
  return syncMultipleChoiceAnswer({ ...question, options });
}

export function setCorrectOption(question: Question, index: number): Question {
  if (!isOptionIndex(question, index)) return question;
  return syncMultipleChoiceAnswer({ ...question, correctAnswer: index });
}

export function setTrueFalseAnswer(question: Question, value: number): Question {
  if (value !== 0 && value !== 1) return question;
  return { ...question, correctAnswer: value, answer: value === 0 ? 'True' : 'False' };
}

export function setIdentificationAnswer(question: Question, text: string): Question {
  return { ...question, answer: text };
}
