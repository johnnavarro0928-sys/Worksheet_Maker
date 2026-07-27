import { describe, it, expect } from 'vitest';
import { balanceMultipleChoiceAnswers, McqBalanceable } from './balanceMcqAnswers';

/**
 * Simulates what the route returns for a single 5-question API batch.
 *
 * The API's own balancer runs per-batch starting at index 0, producing the
 * pattern [A, C, B, D, B] for a batch where the AI originally returned all
 * correct answers at index 1 (B). Then the route maps each question to
 * { options, correctAnswer, answer }.
 *
 * Every batch is identical because each starts at index 0.
 */
function makeRouteResponseBatch(batchIndex: number): McqBalanceable[] {
  const batchOffset = batchIndex * 5;
  // Start with all-B answers (index 1), then run through balancer per-batch
  const raw: McqBalanceable[] = Array.from({ length: 5 }, (_, i) => ({
    options: [
      `Distractor A q${batchOffset + i}`,
      `Correct q${batchOffset + i}`,
      `Distractor C q${batchOffset + i}`,
      `Distractor D q${batchOffset + i}`,
    ],
    correctAnswer: 1,
  }));
  // Apply the same balancer the API runs per-batch (starting at index 0)
  const balanced = balanceMultipleChoiceAnswers(raw, 'Multiple Choice');

  // Then simulate what the route does: add the `answer` text field
  return balanced.map(q => ({
    ...q,
    answer: q.options![q.correctAnswer!],
  }));
}

function countAnswerLetters(questions: McqBalanceable[]): number[] {
  const counts = [0, 0, 0, 0];
  for (const q of questions) {
    if (typeof q.correctAnswer === 'number') counts[q.correctAnswer]++;
  }
  return counts;
}

describe('balanceMultipleChoiceAnswers', () => {
  it('rebalances 15 questions from 3 identical API batches (real route shape)', () => {
    // Simulate the exact frontend bug: 3 batches each independently balanced
    const batch0 = makeRouteResponseBatch(0); // correctAnswer pattern: [0,2,1,3,1]
    const batch1 = makeRouteResponseBatch(1); // same pattern repeated
    const batch2 = makeRouteResponseBatch(2); // same pattern repeated

    const combined = [...batch0, ...batch1, ...batch2];
    expect(combined).toHaveLength(15);

    // Verify every item has the route response shape
    for (const q of combined) {
      expect(q).toHaveProperty('options');
      expect(q).toHaveProperty('correctAnswer');
      expect(q).toHaveProperty('answer');
    }

    // Before fix: the combined distribution is imbalanced
    const preCounts = countAnswerLetters(combined);
    // Pattern [0,2,1,3,1] x 3 -> A:3, B:6, C:3, D:3
    expect(preCounts).toEqual([3, 6, 3, 3]);

    // Apply the shared rebalancer on the full 15-question set
    const rebalanced = balanceMultipleChoiceAnswers(combined, 'Multiple Choice');
    expect(rebalanced).toHaveLength(15);

    // After fix: no letter should differ by more than 1
    const postCounts = countAnswerLetters(rebalanced);
    expect(Math.max(...postCounts) - Math.min(...postCounts)).toBeLessThanOrEqual(1);
    // 15 / 4 = 3 remainder 3, so distribution is [4,4,4,3] in some order
    expect(postCounts.reduce((a, b) => a + b, 0)).toBe(15);
  });

  it('preserves correct option text and answer field after rebalancing', () => {
    const batch0 = makeRouteResponseBatch(0);
    const batch1 = makeRouteResponseBatch(1);
    const batch2 = makeRouteResponseBatch(2);
    const combined = [...batch0, ...batch1, ...batch2];

    const rebalanced = balanceMultipleChoiceAnswers(combined, 'Multiple Choice');

    rebalanced.forEach((q, i) => {
      const correctIdx = q.correctAnswer!;
      const correctText = q.options![correctIdx];
      // Correct option text must reference its original question number
      expect(correctText).toBe(`Correct q${i}`);
      // answer field must stay in sync with options[correctAnswer]
      expect(q.answer).toBe(`Correct q${i}`);
    });
  });

  it('rebalances 15 uniform all-B answers with answer field', () => {
    const questions: McqBalanceable[] = Array.from({ length: 15 }, (_, i) => ({
      options: [`Wrong A ${i}`, `Right ${i}`, `Wrong C ${i}`, `Wrong D ${i}`],
      correctAnswer: 1,
      answer: `Right ${i}`,
    }));

    const rebalanced = balanceMultipleChoiceAnswers(questions, 'Multiple Choice');
    const counts = countAnswerLetters(rebalanced);

    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    rebalanced.forEach((q, i) => {
      expect(q.options![q.correctAnswer!]).toBe(`Right ${i}`);
      expect(q.answer).toBe(`Right ${i}`);
    });
  });

  it('passes through non-MCQ types unchanged', () => {
    const questions: McqBalanceable[] = [
      { options: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
    ];
    const result = balanceMultipleChoiceAnswers(questions, 'True or False');
    expect(result).toBe(questions); // same reference, untouched
  });

  it('skips questions with missing or malformed options', () => {
    const questions: McqBalanceable[] = [
      { correctAnswer: 1 },                                     // no options
      { options: ['A', 'B'], correctAnswer: 0 },                // only 2 options
      { options: ['A', 'B', 'C', 'D'] },                        // no correctAnswer
      { options: ['A', 'B', 'C', 'D'], correctAnswer: 5 },      // out of range
    ];
    const result = balanceMultipleChoiceAnswers(questions, 'Multiple Choice');
    expect(result).toEqual(questions);
  });
});
