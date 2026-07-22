import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { generateQuizQuestions } from './ai';

const originalEnv = { ...process.env };

const aiMocks = vi.hoisted(() => {
  const createModel = vi.fn((modelName: string) => ({ modelName }));
  return {
    createModel,
    generateObject: vi.fn(),
  };
});

vi.mock('ai', () => ({
  generateObject: aiMocks.generateObject,
}));

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: vi.fn(() => aiMocks.createModel),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => aiMocks.createModel),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => aiMocks.createModel),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => aiMocks.createModel),
}));

vi.mock('@ai-sdk/azure', () => ({
  createAzure: vi.fn(() => aiMocks.createModel),
}));

describe('generateQuizQuestions', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.useRealTimers();
    aiMocks.generateObject.mockReset();
    aiMocks.createModel.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.useRealTimers();
  });

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

  it('honors the configured AI model timeout instead of aborting at 10 seconds', async () => {
    vi.useFakeTimers();
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.ACTIVE_AI_PROVIDER = 'openrouter';
    process.env.ACTIVE_AI_MODEL = 'openrouter/test-model';
    process.env.AI_MODEL_TIMEOUT_MS = '25000';

    let capturedSignal: AbortSignal | undefined;
    aiMocks.generateObject.mockImplementation(({ abortSignal }: { abortSignal?: AbortSignal }) => {
      capturedSignal = abortSignal;

      return new Promise((resolve, reject) => {
        abortSignal?.addEventListener('abort', () => reject(new Error('This operation was aborted')));
        setTimeout(() => {
          resolve({
            object: {
              questions: [
                {
                  text: 'What is photosynthesis?',
                  options: ['A', 'B', 'C', 'D'],
                  correctAnswer: 0,
                },
              ],
            },
          });
        }, 15000);
      });
    });

    const generation = generateQuizQuestions({
      topic: 'Photosynthesis',
      grade: '7',
      subject: 'Science',
      difficulty: 'Average',
      type: 'Multiple Choice',
      count: 1,
    });
    void generation.catch(() => undefined);

    await vi.advanceTimersByTimeAsync(10001);
    expect(capturedSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(5000);
    await expect(generation).resolves.toHaveLength(1);
  });
});
