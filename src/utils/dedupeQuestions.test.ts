import { describe, expect, it } from 'vitest';
import { getQuestionDeduplicationKey } from './dedupeQuestions';

describe('getQuestionDeduplicationKey', () => {
  it('normalizes repeated stems that differ only by numbering and punctuation', () => {
    const firstKey = getQuestionDeduplicationKey(
      { text: '1. What process allows plants to make food?' },
      'Multiple Choice',
    );
    const repeatedKey = getQuestionDeduplicationKey(
      { text: 'What process allows plants to make food' },
      'Multiple Choice',
    );
    const distinctKey = getQuestionDeduplicationKey(
      { text: 'Which pigment helps plants absorb light?' },
      'Multiple Choice',
    );

    expect(repeatedKey).toBe(firstKey);
    expect(distinctKey).not.toBe(firstKey);
  });
});
