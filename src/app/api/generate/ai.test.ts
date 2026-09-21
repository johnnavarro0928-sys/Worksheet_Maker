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
  createOpenAI: vi.fn(() => Object.assign((modelName: string) => aiMocks.createModel(modelName), { chat: aiMocks.createModel })),
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
    vi.unstubAllGlobals();
  });

  it('throws an error if no API key is provided', async () => {
    await expect(generateQuizQuestions({
      topic: 'test', grade: '10', subject: 'Math', difficulty: 'Average', type: 'Multiple Choice', count: 5
    })).rejects.toThrow('AI generation failed.');
  });

  it('returns mock questions if topic is "MOCK_TEST"', async () => {
    const questions = await generateQuizQuestions({
      topic: 'MOCK_TEST', grade: '10', subject: 'Math', difficulty: 'Average', type: 'Multiple Choice', count: 2
    });
    expect(questions).toHaveLength(2);
    expect(questions[0].id).toContain('mock-');
  });

  it('balances multiple-choice answer letters across generated questions', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ACTIVE_AI_PROVIDER = 'openai';
    process.env.ACTIVE_AI_MODEL = 'gpt-4o';
    aiMocks.generateObject.mockResolvedValue({
      object: {
        questions: Array.from({ length: 15 }, (_, i) => ({
          text: `Question ${i + 1}?`,
          options: [`Distractor A ${i}`, `Correct ${i}`, `Distractor C ${i}`, `Distractor D ${i}`],
          correctAnswer: 1,
        })),
      },
    });

    const questions = await generateQuizQuestions({
      topic: 'Ecosystems',
      grade: '6',
      subject: 'Science',
      difficulty: 'Average',
      type: 'Multiple Choice',
      count: 15,
    });

    const answerCounts = [0, 0, 0, 0];
    questions.forEach((question, i) => {
      expect(question.options?.[question.correctAnswer ?? -1]).toBe(`Correct ${i}`);
      answerCounts[question.correctAnswer ?? -1] += 1;
    });

    expect(Math.max(...answerCounts) - Math.min(...answerCounts)).toBeLessThanOrEqual(1);
    expect(answerCounts[1]).toBeLessThan(15);
  });

  it('includes batch range and accepted questions in the generation prompt', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ACTIVE_AI_PROVIDER = 'openai';
    process.env.ACTIVE_AI_MODEL = 'gpt-4o';
    aiMocks.generateObject.mockResolvedValue({
      object: {
        questions: [
          {
            text: 'What gas do plants release during photosynthesis?',
            options: ['Oxygen', 'Nitrogen', 'Helium', 'Argon'],
            correctAnswer: 0,
          },
        ],
      },
    });

    await generateQuizQuestions({
      topic: 'Photosynthesis',
      grade: 'Grade 6',
      subject: 'Science',
      difficulty: 'Average',
      type: 'Multiple Choice',
      count: 1,
      totalCount: 25,
      batchStart: 6,
      avoidQuestions: [
        'What is photosynthesis?',
        'Which pigment helps plants absorb light?',
      ],
    });

    const calledPrompt = aiMocks.generateObject.mock.calls[0][0].prompt;
    expect(calledPrompt).toContain('items 6-6 of a 25-item worksheet');
    expect(calledPrompt).toContain('Do NOT duplicate or rephrase these already accepted questions');
    expect(calledPrompt).toContain('What is photosynthesis?');
    expect(calledPrompt).toContain('Which pigment helps plants absorb light?');
  });

  it('strips answer labels from generated multiple-choice options', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ACTIVE_AI_PROVIDER = 'openai';
    process.env.ACTIVE_AI_MODEL = 'gpt-4o';
    aiMocks.generateObject.mockResolvedValue({
      object: {
        questions: [
          {
            text: 'Which factor best explains the observation?',
            options: [
              'A. Surface area and decreasing concentration of reactants',
              'B. Temperature and concentration of reactants',
              'C. Surface area and catalyst presence',
              'D. Pressure and nature of the reactants',
            ],
            correctAnswer: 0,
          },
        ],
      },
    });

    const questions = await generateQuizQuestions({
      topic: 'Reaction rates',
      grade: 'Grade 10',
      subject: 'Science',
      difficulty: 'Average',
      type: 'Multiple Choice',
      count: 1,
    });

    expect(questions[0].options).toEqual([
      'Surface area and decreasing concentration of reactants',
      'Temperature and concentration of reactants',
      'Surface area and catalyst presence',
      'Pressure and nature of the reactants',
    ]);
  });

  it('defaults to Alibaba Qwen provider when DASHSCOPE_API_KEY is set', async () => {
    process.env.DASHSCOPE_API_KEY = 'test-dashscope-key';
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    delete process.env.ACTIVE_AI_PROVIDER;
    delete process.env.ACTIVE_AI_PROVIDERS;
    delete process.env.ACTIVE_AI_MODEL;
    delete process.env.ACTIVE_AI_MODELS;

    aiMocks.generateObject.mockResolvedValue({
      object: {
        questions: [{ text: 'Default Alibaba question?', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 }],
      },
    });

    const questions = await generateQuizQuestions({
      topic: 'Geology', grade: '10', subject: 'Science', difficulty: 'Average', type: 'Multiple Choice', count: 1
    });

    expect(questions).toHaveLength(1);
    expect(aiMocks.createModel).toHaveBeenCalledWith('qwen-plus');
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
        }, 3000);
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

    await vi.advanceTimersByTimeAsync(2000);
    expect(capturedSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(2000);
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
    expect(aiMocks.createModel).toHaveBeenCalledWith('openai/gpt-oss-20b:free');
  });

  it('falls back to paid DeepSeek provider when all OpenRouter models fail or are busy', async () => {
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    process.env.ACTIVE_AI_PROVIDER = 'openrouter';
    process.env.ACTIVE_AI_MODEL = 'openrouter/model-1';

    // Mock all OpenRouter model attempts failing (1 attempt per model * 3 openrouter models = 3 failures)
    for (let i = 0; i < 3; i++) {
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
    expect(aiMocks.createModel).toHaveBeenCalledWith('deepseek-v4-flash');
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

  it('supports Alibaba DashScope Qwen fallback prior to DeepSeek', async () => {
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.DASHSCOPE_API_KEY = 'test-dashscope-key';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    process.env.ACTIVE_AI_PROVIDER = 'openrouter';
    process.env.ACTIVE_AI_MODEL = 'openrouter/model-1';

    // 3 OpenRouter models * 1 attempt = 3 failures
    for (let i = 0; i < 3; i++) {
      aiMocks.generateObject.mockRejectedValueOnce(new Error('OpenRouter model busy'));
    }
    // Then Alibaba Qwen succeeds
    aiMocks.generateObject.mockResolvedValueOnce({
      object: { questions: [{ text: 'Alibaba Qwen Question?', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 }] },
    });

    const questions = await generateQuizQuestions({
      topic: 'Algebra', grade: '8', subject: 'Math', difficulty: 'Average', type: 'Multiple Choice', count: 1
    });

    expect(questions).toHaveLength(1);
    expect(aiMocks.createModel).toHaveBeenCalledWith('qwen3.7-plus');
  });

  it('uses the dual transport while preserving the worksheet prompt and post-processing', async () => {
    process.env.WORKSHEET_MAKER_AI_MODE = 'dual';
    process.env.WORKSHEET_MAKER_AI_TOTAL_TIMEOUT_MS = '52000';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_BASE_URL = 'https://primary.example.test/v1';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_API_KEY = 'primary-test-secret';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_MODEL = 'primary-model';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_AUTH_SCHEME = 'bearer';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_TIMEOUT_MS = '15000';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_BASE_URL = 'https://secondary.example.test/v1';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_API_KEY = 'secondary-test-secret';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_MODEL = 'secondary-model';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_AUTH_SCHEME = 'api-key';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_TIMEOUT_MS = '30000';

    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            questions: [{
              text: 'Q1: What is H₂O?',
              options: ['A. Water', 'B. Salt', 'C. Oxygen', 'D. Carbon dioxide'],
              correctAnswer: 0,
            }],
          }),
        },
      }],
    })));
    vi.stubGlobal('fetch', fetch);

    const questions = await generateQuizQuestions({
      topic: 'Water',
      grade: 'Grade 5',
      subject: 'Science',
      difficulty: 'Average',
      type: 'Multiple Choice',
      count: 1,
      language: 'Filipino',
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String((fetch.mock.calls[0][1] as RequestInit).body));
    expect(request.model).toBe('primary-model');
    expect(request.response_format).toEqual({ type: 'json_object' });
    expect(request.messages[0].content).toContain('- Output Language: Filipino');
    expect(request.messages[0].content).toContain('OUTPUT LANGUAGE INSTRUCTIONS (FILIPINO)');
    expect(request.messages[0].content).toContain('Return valid JSON only. Do not include Markdown, code fences, commentary, or prose.');
    expect(request.messages[0].content).toContain('The top-level value must be an object in this form: {"questions":[...]}.');
    expect(request.messages[0].content).toContain('The "questions" value must be an array.');
    expect(request.messages[0].content).toContain('Each item in "questions" must contain "text", "options" (exactly four strings), and "correctAnswer" (an index from 0 to 3).');
    expect(questions[0].text).toBe('What is H₂O?');
    expect(questions[0].options).toEqual(['Water', 'Salt', 'Oxygen', 'Carbon dioxide']);
  });

  it('sends the Identification JSON contract only in dual mode', async () => {
    process.env.WORKSHEET_MAKER_AI_MODE = 'dual';
    process.env.WORKSHEET_MAKER_AI_TOTAL_TIMEOUT_MS = '52000';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_BASE_URL = 'https://primary.example.test/v1';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_API_KEY = 'primary-test-secret';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_MODEL = 'primary-model';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_AUTH_SCHEME = 'bearer';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_TIMEOUT_MS = '15000';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_BASE_URL = 'https://secondary.example.test/v1';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_API_KEY = 'secondary-test-secret';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_MODEL = 'secondary-model';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_AUTH_SCHEME = 'api-key';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_TIMEOUT_MS = '30000';

    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ questions: [{ text: 'What is H₂O?', answer: 'Water' }] }) } }],
    })));
    vi.stubGlobal('fetch', fetch);

    const dualQuestions = await generateQuizQuestions({
      topic: 'Water',
      grade: 'Grade 5',
      subject: 'Science',
      difficulty: 'Average',
      type: 'Identification',
      count: 1,
    });

    const dualRequest = JSON.parse(String((fetch.mock.calls[0][1] as RequestInit).body));
    const dualPrompt = dualRequest.messages[0].content;
    expect(dualPrompt).toContain('Return valid JSON only. Do not include Markdown, code fences, commentary, or prose.');
    expect(dualPrompt).toContain('The top-level value must be an object in this form: {"questions":[...]}.');
    expect(dualPrompt).toContain('The "questions" value must be an array.');
    expect(dualPrompt).toContain('Each item in "questions" must contain "text" and "answer" as strings.');
    expect(dualQuestions[0].answer).toBe('Water');

    process.env.WORKSHEET_MAKER_AI_MODE = 'legacy';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ACTIVE_AI_PROVIDER = 'openai';
    process.env.ACTIVE_AI_MODEL = 'gpt-4o';
    aiMocks.generateObject.mockResolvedValue({
      object: { questions: [{ text: 'What is H₂O?', answer: 'Water' }] },
    });

    await generateQuizQuestions({
      topic: 'Water',
      grade: 'Grade 5',
      subject: 'Science',
      difficulty: 'Average',
      type: 'Identification',
      count: 1,
    });

    const legacyPrompt = aiMocks.generateObject.mock.calls[0][0].prompt;
    expect(legacyPrompt).not.toContain('DUAL-PROVIDER RESPONSE FORMAT');
    expect(legacyPrompt).not.toContain('Return valid JSON only.');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('treats a dual provider response that fails the worksheet schema as terminal', async () => {
    process.env.WORKSHEET_MAKER_AI_MODE = 'dual';
    process.env.WORKSHEET_MAKER_AI_TOTAL_TIMEOUT_MS = '52000';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_BASE_URL = 'https://primary.example.test/v1';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_API_KEY = 'primary-test-secret';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_MODEL = 'primary-model';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_AUTH_SCHEME = 'bearer';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_TIMEOUT_MS = '15000';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_BASE_URL = 'https://secondary.example.test/v1';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_API_KEY = 'secondary-test-secret';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_MODEL = 'secondary-model';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_AUTH_SCHEME = 'api-key';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_TIMEOUT_MS = '30000';

    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ questions: [{ text: 'Missing options and answer index' }] }) } }],
    })));
    vi.stubGlobal('fetch', fetch);

    await expect(generateQuizQuestions({
      topic: 'Water',
      grade: 'Grade 5',
      subject: 'Science',
      difficulty: 'Average',
      type: 'Multiple Choice',
      count: 1,
    })).rejects.toThrow('Worksheet AI response did not match the expected worksheet format.');

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps legacy failure messages and logs free of raw provider errors', async () => {
    process.env.WORKSHEET_MAKER_AI_MODE = 'legacy';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ACTIVE_AI_PROVIDER = 'openai';
    process.env.ACTIVE_AI_MODEL = 'gpt-4o';
    aiMocks.generateObject.mockRejectedValue(new Error('private upstream exception sentinel'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(generateQuizQuestions({
      topic: 'Water',
      grade: 'Grade 5',
      subject: 'Science',
      difficulty: 'Average',
      type: 'Multiple Choice',
      count: 1,
    })).rejects.toThrow('AI generation failed.');

    expect(JSON.stringify(warn.mock.calls)).not.toContain('private upstream exception sentinel');
  });

  // ── Identification answer field ────────────────────────────────────────────

  it('Identification MOCK_TEST returns a non-empty answer string on each question', async () => {
    const questions = await generateQuizQuestions({
      topic: 'MOCK_TEST', grade: '7', subject: 'Science', difficulty: 'Average',
      type: 'Identification', count: 3,
    });

    expect(questions).toHaveLength(3);
    for (const q of questions) {
      expect(typeof q.answer).toBe('string');
      expect((q.answer as string).trim().length).toBeGreaterThan(0);
    }
  });

  it('Problem Solving MOCK_TEST does NOT include an answer field', async () => {
    const questions = await generateQuizQuestions({
      topic: 'MOCK_TEST', grade: '9', subject: 'Math', difficulty: 'Average',
      type: 'Problem Solving', count: 2,
    });

    expect(questions).toHaveLength(2);
    for (const q of questions) {
      expect(q.answer).toBeUndefined();
    }
  });

  it('Essay MOCK_TEST does NOT include an answer field', async () => {
    const questions = await generateQuizQuestions({
      topic: 'MOCK_TEST', grade: '10', subject: 'English', difficulty: 'Average',
      type: 'Essay', count: 2,
    });

    expect(questions).toHaveLength(2);
    for (const q of questions) {
      expect(q.answer).toBeUndefined();
    }
  });
});
