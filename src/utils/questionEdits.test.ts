import { describe, expect, it } from 'vitest';
import { Question } from '../types';
import { setCorrectOption, setIdentificationAnswer, setOptionText, setTrueFalseAnswer } from './questionEdits';

function mcq(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    type: 'Multiple Choice',
    text: 'Which organelle makes energy?',
    options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Vacuole'],
    correctAnswer: 1,
    answer: 'Mitochondria',
    ...overrides,
  };
}

describe('setOptionText', () => {
  it('updates answer when the correct option text is edited', () => {
    const result = setOptionText(mcq(), 1, 'The mitochondria');
    expect(result.options).toEqual(['Nucleus', 'The mitochondria', 'Ribosome', 'Vacuole']);
    expect(result.answer).toBe('The mitochondria');
    expect(result.correctAnswer).toBe(1);
  });

  it('keeps answer equal to the correct option when a distractor is edited', () => {
    const result = setOptionText(mcq(), 3, 'Golgi body');
    expect(result.options).toEqual(['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi body']);
    expect(result.answer).toBe('Mitochondria');
  });

  it('fills in answer for a manual question that has none', () => {
    const manual = mcq({ options: ['Option A', 'Option B', 'Option C', 'Option D'], correctAnswer: 0, answer: undefined });
    expect(setOptionText(manual, 0, 'Nucleus').answer).toBe('Nucleus');
  });

  it.each([-1, 4])('returns the question unchanged for out-of-range index %i', (index) => {
    const question = mcq();
    expect(setOptionText(question, index, 'x')).toBe(question);
  });

  it('returns the question unchanged when it has no options', () => {
    const question: Question = { id: 'q2', text: 'Statement', correctAnswer: 0 };
    expect(setOptionText(question, 0, 'x')).toBe(question);
  });

  it('does not mutate the input question', () => {
    const question = mcq();
    const snapshot = structuredClone(question);
    setOptionText(question, 1, 'Changed');
    expect(question).toEqual(snapshot);
  });
});

describe('setCorrectOption', () => {
  it('moves the correct answer and syncs answer text', () => {
    const result = setCorrectOption(mcq(), 2);
    expect(result.correctAnswer).toBe(2);
    expect(result.answer).toBe('Ribosome');
    expect(result.options).toEqual(['Nucleus', 'Mitochondria', 'Ribosome', 'Vacuole']);
  });

  it.each([-1, 4, 1.5])('returns the question unchanged for invalid index %s', (index) => {
    const question = mcq();
    expect(setCorrectOption(question, index)).toBe(question);
  });

  it('does not mutate the input question', () => {
    const question = mcq();
    const snapshot = structuredClone(question);
    setCorrectOption(question, 3);
    expect(question).toEqual(snapshot);
  });
});

describe('setTrueFalseAnswer', () => {
  const tf: Question = { id: 'q3', type: 'True or False', text: 'Cells have walls.', correctAnswer: 0, answer: 'True' };

  it('switches to False', () => {
    expect(setTrueFalseAnswer(tf, 1)).toEqual({ ...tf, correctAnswer: 1, answer: 'False' });
  });

  it('sets an answer on a manual question that has none', () => {
    const manual: Question = { id: 'q4', type: 'True or False', text: 'Enter your question text here...' };
    expect(setTrueFalseAnswer(manual, 0)).toEqual({ ...manual, correctAnswer: 0, answer: 'True' });
  });

  it.each([2, -1])('returns the question unchanged for invalid value %i', (value) => {
    expect(setTrueFalseAnswer(tf, value)).toBe(tf);
  });

  it('does not mutate the input question', () => {
    const question = { ...tf };
    setTrueFalseAnswer(question, 1);
    expect(question).toEqual(tf);
  });
});

describe('setIdentificationAnswer', () => {
  const identification: Question = { id: 'q5', type: 'Identification', text: 'Powerhouse of the cell', answer: 'Nucleus' };

  it('replaces the answer text', () => {
    expect(setIdentificationAnswer(identification, 'Mitochondria')).toEqual({ ...identification, answer: 'Mitochondria' });
  });

  it('does not mutate the input question', () => {
    const question = { ...identification };
    setIdentificationAnswer(question, 'Mitochondria');
    expect(question).toEqual(identification);
  });
});
