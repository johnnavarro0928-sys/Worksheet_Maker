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

  it('defaults to OpenRouter provider with DeepSeek fallbacks when no provider is explicitly set', async () => {
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    delete process.env.ACTIVE_AI_PROVIDER;
    delete process.env.ACTIVE_AI_PROVIDERS;
    delete process.env.ACTIVE_AI_MODEL;
    delete process.env.ACTIVE_AI_MODELS;

    aiMocks.generateObject.mockResolvedValue({
      object: {
        questions: [{ text: 'Default OpenRouter question?', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 }],
      },
    });

    const questions = await generateQuizQuestions({
      topic: 'Physics', grade: '10', subject: 'Science', difficulty: 'Average', type: 'Multiple Choice', count: 1
    });

    expect(questions).toHaveLength(1);
    expect(aiMocks.createModel).toHaveBeenCalledWith('google/gemini-2.5-flash:free');
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

  it('allows slow valid generations to finish before the route timeout by default', async () => {
    vi.useFakeTimers();
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.ACTIVE_AI_PROVIDER = 'openrouter';
    process.env.ACTIVE_AI_MODEL = 'openrouter/test-model';
    delete process.env.AI_MODEL_TIMEOUT_MS;

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
                  text: 'What causes day and night?',
                  options: ['A', 'B', 'C', 'D'],
                  correctAnswer: 0,
                },
              ],
            },
          });
        }, 45000);
      });
    });

    const generation = generateQuizQuestions({
      topic: 'Earth rotation',
      grade: '5',
      subject: 'Science',
      difficulty: 'Average',
      type: 'Multiple Choice',
      count: 1,
    });
    void generation.catch(() => undefined);

    await vi.advanceTimersByTimeAsync(30001);
    expect(capturedSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(15000);
    await expect(generation).resolves.toHaveLength(1);
  });

  it('omits temperature for reasoning models', async () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ACTIVE_AI_PROVIDER = 'openai';
    process.env.ACTIVE_AI_MODEL = 'gpt-5-mini-2';
    aiMocks.generateObject.mockResolvedValue({
      object: {
        questions: [
          {
            text: 'What is a dependent variable?',
            options: ['A', 'B', 'C', 'D'],
            correctAnswer: 0,
          },
        ],
      },
    });

    await generateQuizQuestions({
      topic: 'Variables',
      grade: '8',
      subject: 'Science',
      difficulty: 'Average',
      type: 'Multiple Choice',
      count: 1,
    });

    expect(aiMocks.generateObject.mock.calls[0][0]).not.toHaveProperty('temperature');
  });

  it('uses default OpenRouter fallbacks when a single configured OpenRouter model fails', async () => {
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.ACTIVE_AI_PROVIDER = 'openrouter';
    process.env.ACTIVE_AI_MODEL = 'openrouter/slow-model';

    aiMocks.generateObject
      .mockRejectedValueOnce(new Error('This operation was aborted'))
      .mockResolvedValueOnce({
        object: {
          questions: [
            {
              text: 'What is evaporation?',
              options: ['A', 'B', 'C', 'D'],
              correctAnswer: 0,
            },
          ],
        },
      });

    const questions = await generateQuizQuestions({
      topic: 'Water cycle',
      grade: '4',
      subject: 'Science',
      difficulty: 'Average',
      type: 'Multiple Choice',
      count: 1,
    });

    expect(questions).toHaveLength(1);
    expect(aiMocks.generateObject).toHaveBeenCalledTimes(2);
    expect(aiMocks.createModel).toHaveBeenCalledWith('openrouter/slow-model');
    expect(aiMocks.createModel).toHaveBeenCalledWith('google/gemini-2.5-flash:free');
  });

  it('falls back to paid DeepSeek provider when all OpenRouter models fail or are busy', async () => {
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    process.env.ACTIVE_AI_PROVIDER = 'openrouter';
    process.env.ACTIVE_AI_MODEL = 'openrouter/model-1';

    // Mock all OpenRouter model attempts failing (2 attempts per model * 7 openrouter models = 14 failures)
    for (let i = 0; i < 14; i++) {
      aiMocks.generateObject.mockRejectedValueOnce(new Error('OpenRouter model busy or rate limited'));
    }
    // Then direct DeepSeek provider succeeds
    aiMocks.generateObject.mockResolvedValueOnce({
      object: {
        questions: [{ text: 'Resilient DeepSeek question?', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 }],
      },
    });

    const questions = await generateQuizQuestions({
      topic: 'Biology', grade: '9', subject: 'Science', difficulty: 'Average', type: 'Multiple Choice', count: 1
    });

    expect(questions).toHaveLength(1);
    expect(aiMocks.createModel).toHaveBeenCalledWith('deepseek-chat');
  });

  it('defaults output language to English in prompt when language is omitted', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ACTIVE_AI_PROVIDER = 'openai';
    process.env.ACTIVE_AI_MODEL = 'gpt-4o';
    aiMocks.generateObject.mockResolvedValue({
      object: { questions: [{ text: 'Default English Question?', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 }] },
    });

    await generateQuizQuestions({
      topic: 'Ecosystems',
      grade: '6',
      subject: 'Science',
      difficulty: 'Average',
      type: 'Multiple Choice',
      count: 1,
    });

    const calledPrompt = aiMocks.generateObject.mock.calls[0][0].prompt;
    expect(calledPrompt).toContain('- Output Language: English');
    expect(calledPrompt).toContain('OUTPUT LANGUAGE INSTRUCTIONS (ENGLISH)');
  });

  it('includes explicit Filipino output language instructions when language is Filipino', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ACTIVE_AI_PROVIDER = 'openai';
    process.env.ACTIVE_AI_MODEL = 'gpt-4o';
    aiMocks.generateObject.mockResolvedValue({
      object: { questions: [{ text: 'Ano ang sanhi ng lindol?', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 }] },
    });

    await generateQuizQuestions({
      topic: 'Mga Lindol',
      grade: '6',
      subject: 'Araling Panlipunan',
      difficulty: 'Average',
      type: 'Multiple Choice',
      count: 1,
      language: 'Filipino',
    });

    const calledPrompt = aiMocks.generateObject.mock.calls[0][0].prompt;
    expect(calledPrompt).toContain('- Output Language: Filipino');
    expect(calledPrompt).toContain('OUTPUT LANGUAGE INSTRUCTIONS (FILIPINO)');
    expect(calledPrompt).toContain('Wikang Pambansa');
  });

  it('includes explicit Bilingual output language instructions when language is English-Filipino bilingual', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ACTIVE_AI_PROVIDER = 'openai';
    process.env.ACTIVE_AI_MODEL = 'gpt-4o';
    aiMocks.generateObject.mockResolvedValue({
      object: { questions: [{ text: 'What is photosynthesis? (Ano ang fotosintesis?)', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 }] },
    });

    await generateQuizQuestions({
      topic: 'Photosynthesis',
      grade: '7',
      subject: 'Science',
      difficulty: 'Average',
      type: 'Multiple Choice',
      count: 1,
      language: 'English-Filipino bilingual',
    });

    const calledPrompt = aiMocks.generateObject.mock.calls[0][0].prompt;
    expect(calledPrompt).toContain('- Output Language: English-Filipino bilingual');
    expect(calledPrompt).toContain('OUTPUT LANGUAGE INSTRUCTIONS (BILINGUAL ENGLISH-FILIPINO)');
  });

  it('supports direct DeepSeek provider when configured', async () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    process.env.ACTIVE_AI_PROVIDER = 'deepseek';
    process.env.ACTIVE_AI_MODEL = 'deepseek-chat';

    aiMocks.generateObject.mockResolvedValue({
      object: { questions: [{ text: 'DeepSeek Question?', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 }] },
    });

    const questions = await generateQuizQuestions({
      topic: 'Chemistry', grade: '9', subject: 'Science', difficulty: 'Average', type: 'Multiple Choice', count: 1
    });

    expect(questions).toHaveLength(1);
  });
});
