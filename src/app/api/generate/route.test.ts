import { describe, it, expect } from 'vitest';
import { POST } from './route';

/**
 * Route-level test proving the /api/generate response includes correctAnswer
 * for Multiple Choice questions. Uses the MOCK_TEST topic to avoid external
 * AI calls. Uses a localhost URL so auth is bypassed (matching the existing
 * isAuthEnabled logic).
 */
describe('/api/generate route', () => {

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
});
