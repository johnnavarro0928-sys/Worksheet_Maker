import { describe, expect, it } from 'vitest';
import { createBlankQuestion } from './createBlankQuestion';

describe('createBlankQuestion', () => {
  it('creates a Multiple Choice question with default options and first option correct', () => {
    expect(createBlankQuestion('Multiple Choice', 'q-1')).toEqual({
      id: 'q-1',
      type: 'Multiple Choice',
      text: 'Enter your question text here...',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: 0,
    });
  });

  it.each(['True or False', 'Identification', 'Problem Solving', 'Essay'])(
    'creates a %s question with no options and no answer',
    (type) => {
      expect(createBlankQuestion(type, 'q-2')).toEqual({
        id: 'q-2',
        type,
        text: 'Enter your question text here...',
      });
    },
  );
});
