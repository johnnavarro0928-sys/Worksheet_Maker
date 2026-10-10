import { describe, it, expect } from 'vitest';
import { balanceMultipleChoiceAnswers, classifyMcqOptions, McqBalanceable } from './balanceMcqAnswers';

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

  describe('existing section questions (replaces startIndex)', () => {
    function allB(count: number): McqBalanceable[] {
      return Array.from({ length: count }, (_, i) => ({
        options: [`Wrong A ${i}`, `Right ${i}`, `Wrong C ${i}`, `Wrong D ${i}`],
        correctAnswer: 1,
      }));
    }

    function existingWithLetters(letters: number[]): McqBalanceable[] {
      return letters.map((correctAnswer, i) => ({
        options: [`Existing A ${i}`, `Existing B ${i}`, `Existing C ${i}`, `Existing D ${i}`],
        correctAnswer,
      }));
    }

    it('matches the default output when there are no existing questions', () => {
      const questions = allB(10);
      expect(balanceMultipleChoiceAnswers(questions, 'Multiple Choice', []))
        .toEqual(balanceMultipleChoiceAnswers(questions, 'Multiple Choice'));
    });

    it('continues like the old pattern after 5 existing pattern-balanced questions', () => {
      // Was startIndex 5: pattern [0, 2, 1, 3, 1, 0, 3, 2] at positions 5..7 is [0, 3, 2].
      const result = balanceMultipleChoiceAnswers(allB(3), 'Multiple Choice', existingWithLetters([0, 2, 1, 3, 1]));
      expect(result.map(q => q.correctAnswer)).toEqual([0, 3, 2]);
      result.forEach((q, i) => expect(q.options![q.correctAnswer!]).toBe(`Right ${i}`));
    });

    it('continues like the old pattern after 13 existing pattern-balanced questions', () => {
      // Was startIndex 13 (13 % 8 = 5): same result as above.
      const thirteen = [0, 2, 1, 3, 1, 0, 3, 2, 0, 2, 1, 3, 1];
      const result = balanceMultipleChoiceAnswers(allB(3), 'Multiple Choice', existingWithLetters(thirteen));
      expect(result.map(q => q.correctAnswer)).toEqual([0, 3, 2]);
    });

    it('pushes new free items away from a letter the section already overuses', () => {
      const result = balanceMultipleChoiceAnswers(allB(3), 'Multiple Choice', existingWithLetters([0, 0, 0, 0, 0]));
      expect(result.map(q => q.correctAnswer)).not.toContain(0);
      expect(new Set(result.map(q => q.correctAnswer)).size).toBe(3);
    });

    it('avoids a third identical letter in a row when another least-used letter exists', () => {
      // Counts are 3 each, the section ends B, B, and position 12 would prefer B.
      const existing = existingWithLetters([0, 2, 3, 0, 2, 3, 0, 2, 1, 3, 1, 1]);
      const [result] = balanceMultipleChoiceAnswers(allB(1), 'Multiple Choice', existing);
      expect(result.correctAnswer).not.toBe(1);
    });

    it('never modifies existing questions', () => {
      const existing = existingWithLetters([0, 0, 1]);
      const snapshot = structuredClone(existing);
      balanceMultipleChoiceAnswers(allB(4), 'Multiple Choice', existing);
      expect(existing).toEqual(snapshot);
    });
  });
});

describe('classifyMcqOptions', () => {
  it.each([
    ['ascending angles', ['20°', '70°', '90°', '110°']],
    ['ascending lengths with units', ['12 cm', '18 cm', '20 cm', '40 cm']],
    ['decimals', ['0.25', '0.5', '1.75', '2']],
    ['negatives', ['-3', '−1', '0', '4']],
    ['thousands separators', ['1,200', '1,500', '12,000', '120,000']],
    ['fractions', ['1/4', '½', '¾', '1 1/2']],
    ['currency and compound units', ['$5', '$7.50', '$10', '$12']],
    ['speeds', ['5 m/s', '10 m/s', '15 m/s', '20 m/s']],
    ['one-word alphabetical', ['Carbon', 'Hydrogen', 'Nitrogen', 'Oxygen']],
    ['one-word alphabetical ignoring case', ['apple', 'Banana', 'cherry', 'Date']],
  ])('treats %s as ordered', (_label, options) => {
    expect(classifyMcqOptions(options)).toBe('ordered');
  });

  it.each([
    ['unsorted angles', ['110°', '70°', '20°', '90°']],
    ['unsorted lengths', ['12 cm', '40 cm', '20 cm', '18 cm']],
    ['descending numbers', ['40 cm', '20 cm', '18 cm', '12 cm']],
    ['repeated numbers', ['2', '2', '3', '4']],
    ['one-word unsorted', ['Oxygen', 'Carbon', 'Nitrogen', 'Hydrogen']],
    ['one-word unsorted ignoring case', ['Banana', 'apple', 'cherry', 'date']],
    ['mixed numeric and text', ['5', 'ten', '7', 'eight']],
    ['mixed numeric and text in word order', ['5', '7', 'eight', 'ten']],
    ['sentences', ['It increases.', 'It decreases.', 'It stays the same.', 'It doubles.']],
    ['phrases that start with numbers', ['5 apples are red', '6 apples are green', '7 apples are ripe', '8 apples are sour']],
  ])('treats %s as free', (_label, options) => {
    expect(classifyMcqOptions(options)).toBe('free');
  });
});

describe('order-aware balancing', () => {
  function ordered(correctAnswer: number, i = 0): McqBalanceable {
    return { options: [`${10 + i}°`, `${20 + i}°`, `${30 + i}°`, `${40 + i}°`], correctAnswer, answer: `${10 + i + correctAnswer * 10}°` };
  }

  function free(i: number): McqBalanceable {
    return { options: [`Wrong A ${i}`, `Right ${i}`, `Wrong C ${i}`, `Wrong D ${i}`], correctAnswer: 1, answer: `Right ${i}` };
  }

  function letterCounts(questions: McqBalanceable[]): number[] {
    const counts = [0, 0, 0, 0];
    for (const q of questions) counts[q.correctAnswer!]++;
    return counts;
  }

  it('keeps ordered items exactly as the model returned them', () => {
    const item = ordered(3);
    const [result] = balanceMultipleChoiceAnswers([item], 'Multiple Choice');
    expect(result).toEqual(item);
    expect(result.options).toEqual(['10°', '20°', '30°', '40°']);
    expect(result.correctAnswer).toBe(3);
  });

  it('balances a 25-item mixed set (40% ordered) to within 1 across A-D', () => {
    const orderedLetters = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1];
    const questions: McqBalanceable[] = [];
    for (let i = 0; i < 25; i++) {
      questions.push(i % 5 < 2 ? ordered(orderedLetters[Math.floor(i / 5) * 2 + (i % 5)], i) : free(i));
    }

    const result = balanceMultipleChoiceAnswers(questions, 'Multiple Choice');

    const counts = letterCounts(result);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    result.forEach((q, i) => {
      if (i % 5 < 2) expect(q).toEqual(questions[i]);
      else expect(q.options![q.correctAnswer!]).toBe(`Right ${i}`);
    });
  });

  it('gets as close as possible when ordered items crowd one letter', () => {
    const questions = [
      ...Array.from({ length: 10 }, (_, i) => ordered(3, i)),
      ...Array.from({ length: 15 }, (_, i) => free(i)),
    ];

    const counts = letterCounts(balanceMultipleChoiceAnswers(questions, 'Multiple Choice'));

    expect(counts).toEqual([5, 5, 5, 10]);
  });

  it('avoids three identical letters in a row next to ordered items', () => {
    const questions = [ordered(1, 0), ordered(1, 1), free(2), free(3), free(4), free(5)];

    const letters = balanceMultipleChoiceAnswers(questions, 'Multiple Choice').map(q => q.correctAnswer);

    for (let i = 2; i < letters.length; i++) {
      expect(letters[i] === letters[i - 1] && letters[i] === letters[i - 2]).toBe(false);
    }
  });

  it('keeps the answer string in sync for swapped free items', () => {
    const result = balanceMultipleChoiceAnswers(Array.from({ length: 8 }, (_, i) => free(i)), 'Multiple Choice');
    result.forEach((q, i) => {
      expect(q.answer).toBe(q.options![q.correctAnswer!]);
      expect(q.answer).toBe(`Right ${i}`);
    });
  });

  it('does not mutate its inputs', () => {
    const questions = [ordered(2), free(1), free(2)];
    const snapshot = structuredClone(questions);
    balanceMultipleChoiceAnswers(questions, 'Multiple Choice');
    expect(questions).toEqual(snapshot);
  });
});

describe('positional options (fixed)', () => {
  const withOption = (last: string) => ['Glucose is made', 'Oxygen is released', 'Water is absorbed', last];

  it.each([
    'All of the above',
    'None of the above',
    'all of the above.',
    'All of these',
    'None of these',
    'All of the choices',
    'Both of the above',
    'Neither of the above',
    'All the above',
  ])('treats %j as fixed', (option) => {
    expect(classifyMcqOptions(withOption(option))).toBe('fixed');
  });

  it.each([
    'Both A and B',
    'A and C only',
    'Options B and D',
    'Choices A, B, and C',
    'Either A or B',
    'a and d',
    'Option C',
    // Documented choice: a letter list inside a longer sentence still refers to options.
    'Statement A and B are both true',
  ])('treats letter reference %j as fixed', (option) => {
    expect(classifyMcqOptions(withOption(option))).toBe('fixed');
  });

  it.each([
    'Alpha and Beta',
    'Data and Beta',
    'Kite and Trapezoid',
    'A square and a rhombus',
    'Above sea level',
    'All plants make food',
  ])('does not treat %j as positional', (option) => {
    expect(classifyMcqOptions(withOption(option))).toBe('free');
  });

  it('keeps fixed items in place and balances free items around them', () => {
    const fixed = (correctAnswer: number): McqBalanceable => ({
      options: ['Glucose is made', 'Oxygen is released', 'Water is absorbed', 'All of the above'],
      correctAnswer,
      answer: ['Glucose is made', 'Oxygen is released', 'Water is absorbed', 'All of the above'][correctAnswer],
    });
    const letterRef = (): McqBalanceable => ({
      options: ['Sides are equal', 'Diagonals bisect', 'Both A and B', 'Neither A nor B'],
      correctAnswer: 2,
      answer: 'Both A and B',
    });
    const free = (i: number): McqBalanceable => ({
      options: [`Wrong A ${i}`, `Right ${i}`, `Wrong C ${i}`, `Wrong D ${i}`],
      correctAnswer: 1,
      answer: `Right ${i}`,
    });
    const questions = [fixed(3), free(1), letterRef(), free(3), fixed(3), free(5), free(6), free(7)];

    const result = balanceMultipleChoiceAnswers(questions, 'Multiple Choice');

    for (const i of [0, 2, 4]) expect(result[i]).toEqual(questions[i]);
    const counts = [0, 0, 0, 0];
    result.forEach(q => counts[q.correctAnswer!]++);
    // Fixed D, C, D are counted first; the five free items fill in B, A, A, C, B.
    expect(counts).toEqual([2, 2, 2, 2]);
    for (const i of [1, 3, 5, 6, 7]) {
      expect(result[i].options![result[i].correctAnswer!]).toBe(`Right ${i}`);
      expect(result[i].answer).toBe(`Right ${i}`);
      expect(result[i].correctAnswer).not.toBe(3);
    }
  });
});

