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
});
