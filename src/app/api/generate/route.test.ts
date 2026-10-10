import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { generateQuizQuestions } from './ai';

// Pass-through spy: the real implementation still runs (MOCK_TEST tests are
// unchanged), but tests can inspect what the route passed in.
vi.mock('./ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ai')>();
  return { ...actual, generateQuizQuestions: vi.fn(actual.generateQuizQuestions) };
});

const originalEnv = { ...process.env };

const validBody = {
  topic: 'MOCK_TEST',
  grade: 'Grade 7',
  subject: 'Science',
  type: 'Multiple Choice',
  difficulty: 'Average',
  count: 1,
};

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Route-level test proving the /api/generate response includes correctAnswer
 * for Multiple Choice questions. Uses the MOCK_TEST topic to avoid external
 * AI calls. Uses a localhost URL so auth is bypassed (matching the existing
 * isAuthEnabled logic).
 */
describe('/api/generate route', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.mocked(generateQuizQuestions).mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns correctAnswer in JSON response for Multiple Choice questions', async () => {
    const response = await POST(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'MOCK_TEST',
          competency: 'Test competency',
          grade: 'Grade 7',
          subject: 'Science',
          type: 'Multiple Choice',
          difficulty: 'Average',
          count: 3,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.questions).toHaveLength(3);

    const q = data.questions[0];
    expect(q).toHaveProperty('options');
    expect(q).toHaveProperty('answer');
    expect(q).toHaveProperty('correctAnswer');
    expect(typeof q.correctAnswer).toBe('number');
    expect(q.answer).toBe(q.options[q.correctAnswer]);

    // Verify all questions maintain the invariant
    for (const question of data.questions) {
      expect(typeof question.correctAnswer).toBe('number');
      expect(question.answer).toBe(question.options[question.correctAnswer]);
    }
  });

  it('True or False: correctAnswer is a number in JSON response (regression — was stripped to undefined)', async () => {
    // Root cause: correctAnswer was gated on `q.options &&`, but T/F questions
    // have no options array, so the guard short-circuited and correctAnswer was
    // always emitted as undefined even though ai.ts set it correctly to 0 or 1.
    const response = await POST(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'MOCK_TEST',
          grade: 'Grade 6',
          subject: 'Science',
          type: 'True or False',
          difficulty: 'Average',
          count: 3,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.questions).toHaveLength(3);

    for (const q of data.questions) {
      // This assertion fails before the fix
      expect(typeof q.correctAnswer).toBe('number');
      // answer must also be the canonical string, not undefined
      expect(['True', 'False']).toContain(q.answer);
      // T/F questions have no options
      expect(q.options).toBeUndefined();
    }
  });

  it('Identification: answer is a non-empty string, not the bogus "False"', async () => {
    // Regression: before the fix, Identification fell through to the T/F branch
    // and correctAnswer=0 → answer='True', correctAnswer!=0 → answer='False'.
    const response = await POST(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'MOCK_TEST',
          grade: 'Grade 5',
          subject: 'Science',
          type: 'Identification',
          difficulty: 'Average',
          count: 2,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.questions).toHaveLength(2);

    for (const q of data.questions) {
      // answer must be a non-empty string coming from the AI answer field
      expect(typeof q.answer).toBe('string');
      expect((q.answer as string).trim().length).toBeGreaterThan(0);
      // Must not be the bogus T/F fallback
      expect(q.answer).not.toBe('False');
      expect(q.answer).not.toBe('True');
      // correctAnswer index should not be present for Identification
      expect(q.correctAnswer).toBeUndefined();
    }
  });

  it('Essay: answer is undefined (regression — was bogus "False" before fix)', async () => {
    const response = await POST(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'MOCK_TEST',
          grade: 'Grade 10',
          subject: 'English',
          type: 'Essay',
          difficulty: 'Average',
          count: 2,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.questions).toHaveLength(2);

    for (const q of data.questions) {
      // Before the fix this was 'False' because correctAnswer=0 was always emitted
      // by MOCK_TEST and there were no options — falling into the T/F branch.
      expect(q.answer).toBeUndefined();
    }
  });

  it('Problem Solving: answer is undefined (regression — was bogus "False" before fix)', async () => {
    const response = await POST(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'MOCK_TEST',
          grade: 'Grade 9',
          subject: 'Math',
          type: 'Problem Solving',
          difficulty: 'Average',
          count: 2,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.questions).toHaveLength(2);

    for (const q of data.questions) {
      expect(q.answer).toBeUndefined();
    }
  });

  it('rejects request-body provider selection without rejecting unrelated worksheet fields', async () => {
    const rejected = await POST(request({
      topic: 'MOCK_TEST',
      grade: 'Grade 7',
      subject: 'Science',
      type: 'Multiple Choice',
      difficulty: 'Average',
      count: 1,
      model: 'attacker-selected-model',
    }));
    const accepted = await POST(request({
      topic: 'MOCK_TEST',
      grade: 'Grade 7',
      subject: 'Science',
      type: 'Multiple Choice',
      difficulty: 'Average',
      count: 1,
      worksheetLayout: 'teacher-preview',
    }));

    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ error: 'Provider selection is not allowed.' });
    expect(accepted.status).toBe(200);
  });

  it('returns and logs only a stable error when a dual provider fails', async () => {
    process.env.WORKSHEET_MAKER_AI_MODE = 'dual';
    process.env.WORKSHEET_MAKER_AI_TOTAL_TIMEOUT_MS = '52000';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_BASE_URL = 'https://primary.example.test/v1';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_API_KEY = 'primary-route-secret';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_MODEL = 'primary-model';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_AUTH_SCHEME = 'bearer';
    process.env.WORKSHEET_MAKER_AI_PRIMARY_TIMEOUT_MS = '15000';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_BASE_URL = 'https://secondary.example.test/v1';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_API_KEY = 'secondary-route-secret';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_MODEL = 'secondary-model';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_AUTH_SCHEME = 'api-key';
    process.env.WORKSHEET_MAKER_AI_SECONDARY_TIMEOUT_MS = '30000';

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response('private provider response body', { status: 401 }),
    ));

    const response = await POST(request({
      topic: 'Photosynthesis',
      grade: 'Grade 7',
      subject: 'Science',
      type: 'Multiple Choice',
      difficulty: 'Average',
      count: 1,
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to generate quiz' });
    const logs = JSON.stringify([...error.mock.calls, ...info.mock.calls]);
    expect(logs).not.toContain('primary-route-secret');
    expect(logs).not.toContain('secondary-route-secret');
    expect(logs).not.toContain('private provider response body');
  });

  it.each([
    [10000, 10],
    ['abc', 5],
    [0, 5],
    [-3, 5],
    [7, 7],
  ])('passes count %j to generation as %i', async (count, expected) => {
    const response = await POST(request({ ...validBody, count }));

    expect(response.status).toBe(200);
    expect(vi.mocked(generateQuizQuestions).mock.calls[0][0].count).toBe(expected);
  });

  it.each([
    ['oversize topic', { topic: 'x'.repeat(201) }],
    ['non-string topic', { topic: 123 }],
    ['oversize language', { language: 'x'.repeat(201) }],
    ['oversize outputLanguage', { outputLanguage: 'x'.repeat(201) }],
    ['oversize competency', { competency: 'x'.repeat(2001) }],
    ['non-string objective', { objective: ['a'] }],
  ])('rejects %s without calling generation', async (_label, override) => {
    const response = await POST(request({ ...validBody, ...override }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid request.' });
    expect(generateQuizQuestions).not.toHaveBeenCalled();
  });

  it('accepts text fields at their maximum length', async () => {
    const response = await POST(request({
      ...validBody,
      subject: 'x'.repeat(200),
      competency: 'x'.repeat(2000),
      objective: 'x'.repeat(2000),
    }));

    expect(response.status).toBe(200);
    expect(generateQuizQuestions).toHaveBeenCalledTimes(1);
  });

  it('keeps provider selection rejection ahead of field validation', async () => {
    const response = await POST(request({ ...validBody, topic: 'x'.repeat(201), model: 'attacker-model' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Provider selection is not allowed.' });
  });

  it('drops non-string avoidQuestions and caps them at 40 items', async () => {
    const strings = Array.from({ length: 45 }, (_, i) => `Question ${i + 1}?`);
    const avoidQuestions = [42, ...strings.slice(0, 10), null, { text: 'x' }, ...strings.slice(10)];

    const response = await POST(request({ ...validBody, avoidQuestions }));

    expect(response.status).toBe(200);
    expect(vi.mocked(generateQuizQuestions).mock.calls[0][0].avoidQuestions).toEqual(strings.slice(0, 40));
  });
});
