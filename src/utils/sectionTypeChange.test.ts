import { describe, expect, it } from 'vitest';
import { getSectionTypeChangeConfirmMessage } from './sectionTypeChange';

describe('getSectionTypeChangeConfirmMessage', () => {
  it('returns null when the section has no questions', () => {
    expect(getSectionTypeChangeConfirmMessage(0)).toBeNull();
  });

  it('returns a confirmation message with the question count when questions exist', () => {
    expect(getSectionTypeChangeConfirmMessage(1)).toBe(
      'Changing the question type will remove the 1 existing question(s) in this section. Continue?',
    );
    expect(getSectionTypeChangeConfirmMessage(2)).toBe(
      'Changing the question type will remove the 2 existing question(s) in this section. Continue?',
    );
  });
});
