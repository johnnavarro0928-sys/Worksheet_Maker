import { Question } from "../types";

// Only Multiple Choice gets a default answer; other types are left without one
// so the answer key omits them instead of printing a wrong answer.
export function createBlankQuestion(type: string, id: string): Question {
  if (type === 'Multiple Choice') {
    return {
      id,
      type,
      text: "Enter your question text here...",
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: 0,
    };
  }

  return {
    id,
    type,
    text: "Enter your question text here...",
  };
}
