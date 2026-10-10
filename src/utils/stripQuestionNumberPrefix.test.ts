import { describe, expect, it } from 'vitest';
import { stripQuestionNumberPrefix } from './stripQuestionNumberPrefix';

describe('stripQuestionNumberPrefix', () => {
  it.each([
    ['1. What is photosynthesis?', 'What is photosynthesis?'],
    ['1) What is photosynthesis?', 'What is photosynthesis?'],
    ['1: What is photosynthesis?', 'What is photosynthesis?'],
    ['12. What is photosynthesis?', 'What is photosynthesis?'],
    ['Q1. What is photosynthesis?', 'What is photosynthesis?'],
    ['Q1) What is photosynthesis?', 'What is photosynthesis?'],
    ['Q1: What is photosynthesis?', 'What is photosynthesis?'],
    ['q1: What is photosynthesis?', 'What is photosynthesis?'],
    ['Q 1: What is photosynthesis?', 'What is photosynthesis?'],
  ])('strips numbering prefix from %j', (input, expected) => {
    expect(stripQuestionNumberPrefix(input)).toBe(expected);
  });

  it('strips repeated numbering prefixes', () => {
    expect(stripQuestionNumberPrefix('1. Q2: What is photosynthesis?')).toBe('What is photosynthesis?');
  });

  it.each([
    '25 students took the test. How many passed?',
    '1945 marked the end of which war?',
    '3.14 is the value of what constant?',
  ])('keeps a leading number that is not numbering: %j', (input) => {
    expect(stripQuestionNumberPrefix(input)).toBe(input);
  });

  it.each([
    '1945: Which war ended in this year?',
    '2025. What event happened?',
    '1000) is the number of what?',
  ])('keeps a 4+ digit number followed by a delimiter: %j', (input) => {
    expect(stripQuestionNumberPrefix(input)).toBe(input);
  });

  it.each([
    ['1. What is photosynthesis?', 'What is photosynthesis?'],
    ['12) What is photosynthesis?', 'What is photosynthesis?'],
    ['Q7: What is photosynthesis?', 'What is photosynthesis?'],
    ['Q 15: What is photosynthesis?', 'What is photosynthesis?'],
    ['100. What is photosynthesis?', 'What is photosynthesis?'],
    ['1. Q2: What is photosynthesis?', 'What is photosynthesis?'],
  ])('strips 1-3 digit numbering prefix from %j', (input, expected) => {
    expect(stripQuestionNumberPrefix(input)).toBe(expected);
  });

  it('keeps decimals and times where the delimiter is directly followed by a digit', () => {
    expect(stripQuestionNumberPrefix('2.5 kg of water is heated. What happens?')).toBe('2.5 kg of water is heated. What happens?');
    expect(stripQuestionNumberPrefix('10:30 is what time in 24-hour format?')).toBe('10:30 is what time in 24-hour format?');
  });

  it('strips numbering but keeps a following decimal', () => {
    expect(stripQuestionNumberPrefix('1. 3.14 is the value of what constant?')).toBe('3.14 is the value of what constant?');
  });

  it('trims surrounding whitespace', () => {
    expect(stripQuestionNumberPrefix('   2.   What is photosynthesis?  ')).toBe('What is photosynthesis?');
  });

  it('returns an empty string for empty or whitespace-only input', () => {
    expect(stripQuestionNumberPrefix('')).toBe('');
    expect(stripQuestionNumberPrefix('   ')).toBe('');
  });
});
