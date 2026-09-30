import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as ai from './ai';
import { POST } from './route';

vi.mock('./ai', async () => {
  const actual = await vi.importActual<typeof import('./ai')>('./ai');
  return {
    ...actual,
    generateQuizQuestions: vi.fn(actual.generateQuizQuestions),
  };
});

const originalEnv = { ...process.env };
const generateQuizQuestionsMock = vi.mocked(ai.generateQuizQuestions);

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function validTosPlan() {
  return {
    version: 1,
    rows: [
      {
        id: 'tos-row-1',
        competency: 'Classify matter by observable properties',
        objective: 'Connect observations to a classification',
        allocations: {
          Remembering: 1,
          Applying: 1,
        },
      },
    ],
  };
}

function stubProviderCalls() {
  const fetchMock = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
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
    vi.clearAllMocks();
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
    expect(generateQuizQuestionsMock).toHaveBeenCalledTimes(1);
    const data = await response.json();

    expect(data.questions).toHaveLength(3);

    const q = data.questions[0];
    expect(q).toHaveProperty('options');
    expect(q).toHaveProperty('answer');
    expect(q).toHaveProperty('correctAnswer');
    expect(typeof q.correctAnswer).toBe('number');
    expect(q.answer).toBe(q.options[q.correctAnswer]);
    expect(q.tosRowId).toBeUndefined();
    expect(q.tosCognitiveLevel).toBeUndefined();

    // Verify all questions maintain the invariant
    for (const question of data.questions) {
      expect(typeof question.correctAnswer).toBe('number');
      expect(question.answer).toBe(question.options[question.correctAnswer]);
    }
  });

  it('does not expose TOS metadata in direct-generation responses', async () => {
    generateQuizQuestionsMock.mockResolvedValueOnce([{
      id: 'direct-q-with-tos-metadata',
      type: 'Multiple Choice',
      text: 'Which item is direct?',
      options: ['Correct', 'Wrong B', 'Wrong C', 'Wrong D'],
      correctAnswer: 0,
      tosRowId: 'secret-row',
      tosCognitiveLevel: 'Remembering',
    }]);

    const response = await POST(request({
      topic: 'Direct topic',
      type: 'Multiple Choice',
      count: 1,
      generationMode: 'direct',
    }));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.questions[0].tosRowId).toBeUndefined();
    expect(data.questions[0].tosCognitiveLevel).toBeUndefined();
  });

  it('rejects an invalid generation mode with a stable generic error', async () => {
    const fetchMock = stubProviderCalls();
    const response = await POST(request({
      topic: 'MOCK_TEST',
      type: 'Multiple Choice',
      count: 2,
      generationMode: 'unsupported',
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid generation request.' });
    expect(generateQuizQuestionsMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects direct mode requests that contain a TOS plan', async () => {
    const fetchMock = stubProviderCalls();
    const response = await POST(request({
      topic: 'MOCK_TEST',
      type: 'Multiple Choice',
      count: 2,
      generationMode: 'direct',
      tosPlan: validTosPlan(),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid generation request.' });
    expect(generateQuizQuestionsMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects TOS mode when the plan is missing', async () => {
    const fetchMock = stubProviderCalls();
    const response = await POST(request({
      topic: 'MOCK_TEST',
      type: 'Multiple Choice',
      count: 2,
      generationMode: 'tos',
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid generation request.' });
    expect(generateQuizQuestionsMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects TOS mode for non-Multiple Choice requests', async () => {
    const fetchMock = stubProviderCalls();
    const response = await POST(request({
      topic: 'MOCK_TEST',
      type: 'Essay',
      count: 2,
      generationMode: 'tos',
      tosPlan: validTosPlan(),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid generation request.' });
    expect(generateQuizQuestionsMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed TOS plans without exposing plan content or calling generation', async () => {
    const fetchMock = stubProviderCalls();
    const response = await POST(request({
      topic: 'MOCK_TEST',
      type: 'Multiple Choice',
      count: 1,
      generationMode: 'tos',
      tosPlan: {
        version: 1,
        rows: [{
          id: 'secret-row-id',
          competency: 'SECRET COMPETENCY',
          objective: 'SECRET OBJECTIVE',
          allocations: { Remembering: 1.5 },
        }],
      },
    }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: 'Invalid generation request.' });
    expect(JSON.stringify(body)).not.toContain('SECRET COMPETENCY');
    expect(JSON.stringify(body)).not.toContain('SECRET OBJECTIVE');
    expect(generateQuizQuestionsMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects TOS plans whose total does not match the parsed generation count', async () => {
    const fetchMock = stubProviderCalls();
    const response = await POST(request({
      topic: 'MOCK_TEST',
      type: 'Multiple Choice',
      count: 3,
      generationMode: 'tos',
      tosPlan: validTosPlan(),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid generation request.' });
    expect(generateQuizQuestionsMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['missing topic', 'topic', undefined],
    ['blank topic', 'topic', '   '],
    ['missing grade', 'grade', undefined],
    ['blank grade', 'grade', '   '],
    ['missing subject', 'subject', undefined],
    ['blank subject', 'subject', '   '],
  ])('rejects TOS requests with %s before generation', async (_label, field, value) => {
    const fetchMock = stubProviderCalls();
    const body: Record<string, unknown> = {
      topic: 'Photosynthesis',
      grade: 'Grade 7',
      subject: 'Science',
      type: 'Multiple Choice',
      count: 1,
      generationMode: 'tos',
      tosPlan: {
        version: 1,
        rows: [{
          id: 'tos-row-1',
          competency: 'Explain photosynthesis',
          allocations: { Remembering: 1 },
        }],
      },
    };
    if (value === undefined) delete body[field];
    else body[field] = value;

    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid generation request.' });
    expect(generateQuizQuestionsMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('generates a valid TOS request with complete-set balancing and metadata', async () => {
    const fetchMock = stubProviderCalls();
    generateQuizQuestionsMock
      .mockImplementationOnce(async () => [{
        id: 'tos-q-remembering',
        type: 'Multiple Choice',
        text: 'What is a producer?',
        options: ['Correct producer', 'Wrong B', 'Wrong C', 'Wrong D'],
        correctAnswer: 0,
      }])
      .mockImplementationOnce(async () => [{
        id: 'tos-q-applying',
        type: 'Multiple Choice',
        text: 'Which organism is a producer in this food web?',
        options: ['Correct producer', 'Wrong B', 'Wrong C', 'Wrong D'],
        correctAnswer: 0,
      }]);
    const response = await POST(request({
      topic: 'Photosynthesis',
      grade: 'Grade 7',
      subject: 'Science',
      type: 'Multiple Choice',
      count: 2,
      generationMode: 'tos',
      tosPlan: validTosPlan(),
    }));

    expect(response.status).toBe(200);
    expect(generateQuizQuestionsMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
    const data = await response.json();
    expect(data.questions).toHaveLength(2);
    expect(data.questions.map((question: { tosRowId: string; tosCognitiveLevel: string }) => [
      question.tosRowId,
      question.tosCognitiveLevel,
    ])).toEqual([
      ['tos-row-1', 'Remembering'],
      ['tos-row-1', 'Applying'],
    ]);
    expect(data.questions.map((question: { correctAnswer: number }) => question.correctAnswer)).toEqual([0, 2]);
    for (const question of data.questions) {
      expect(question.answer).toBe(question.options[question.correctAnswer]);
    }
  });

  it.each([undefined, 0, 1.5, -1, 'not-a-number', 51])('rejects malformed TOS count %s before generation', async (count) => {
    const fetchMock = stubProviderCalls();
    const response = await POST(request({
      topic: 'Photosynthesis',
      type: 'Multiple Choice',
      count,
      generationMode: 'tos',
      tosPlan: validTosPlan(),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid generation request.' });
    expect(generateQuizQuestionsMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a generic failure without partial TOS questions when generation fails', async () => {
    const fetchMock = stubProviderCalls();
    generateQuizQuestionsMock
      .mockImplementationOnce(async () => [{
        id: 'tos-q-remembering',
        type: 'Multiple Choice',
        text: 'What is a producer?',
        options: ['Correct producer', 'Wrong B', 'Wrong C', 'Wrong D'],
        correctAnswer: 0,
      }])
      .mockRejectedValueOnce(new Error('private provider failure sentinel'));

    const response = await POST(request({
      topic: 'Photosynthesis',
      grade: 'Grade 7',
      subject: 'Science',
      type: 'Multiple Choice',
      count: 2,
      generationMode: 'tos',
      tosPlan: validTosPlan(),
    }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Failed to generate quiz' });
    expect(JSON.stringify(body)).not.toContain('private provider failure sentinel');
    expect(body.questions).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
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
});
