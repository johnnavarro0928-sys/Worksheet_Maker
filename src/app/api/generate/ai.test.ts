import { describe, it, expect } from 'vitest';
import { generateQuizQuestions } from './ai';

describe('generateQuizQuestions', () => {
  it('throws an error if no API key is provided', async () => {
    await expect(generateQuizQuestions({
      topic: 'test', grade: '10', subject: 'Math', difficulty: 'Average', type: 'Multiple Choice', count: 5
    }, 'openai/gpt-4o', '')).rejects.toThrow('OPENROUTER_API_KEY required for OpenRouter provider');
  });

  it('returns mock questions if topic is "MOCK_TEST"', async () => {
    const questions = await generateQuizQuestions({
      topic: 'MOCK_TEST', grade: '10', subject: 'Math', difficulty: 'Average', type: 'Multiple Choice', count: 2
    }, 'model', 'fake-key');
    expect(questions).toHaveLength(2);
    expect(questions[0].id).toContain('mock-');
  });
});
