import { describe, expect, it, vi } from 'vitest';
import { Question } from '../types';
import { generateUniqueQuestionBatches } from './generateUniqueQuestionBatches';

function mcq(id: string, text: string): Question {
  return {
    id,
    type: 'Multiple Choice',
    text,
    options: [`Wrong A ${id}`, `Correct ${id}`, `Wrong C ${id}`, `Wrong D ${id}`],
    correctAnswer: 1,
  };
}

describe('generateUniqueQuestionBatches', () => {
  it('refills duplicate-heavy MCQ batches until the requested unique count is reached', async () => {
    const fetchQuestionBatch = vi.fn()
      .mockResolvedValueOnce([
        mcq('q1', 'What is photosynthesis?'),
        mcq('q2', 'What is photosynthesis'),
        mcq('q3', 'Which pigment helps plants absorb light?'),
      ])
      .mockResolvedValueOnce([
        mcq('q4', 'What is photosynthesis?'),
        mcq('q5', 'What gas do plants release during photosynthesis?'),
        mcq('q6', 'What part of the plant absorbs most water?'),
      ])
      .mockResolvedValueOnce([mcq('q7', 'Which plant part controls gas exchange?')]);

    const result = await generateUniqueQuestionBatches(
      {
        topic: 'Photosynthesis',
        competency: 'Explain how plants make food.',
        grade: 'Grade 6',
        subject: 'Science',
        language: 'English',
        type: 'Multiple Choice',
        difficulty: 'Average',
        count: 5,
      },
      fetchQuestionBatch,
    );

    expect(result).toHaveLength(5);
    expect(new Set(result.map(q => q.text))).toHaveProperty('size', 5);
    expect(fetchQuestionBatch).toHaveBeenCalledTimes(3);

    expect(fetchQuestionBatch.mock.calls[1][0]).toMatchObject({
      count: 3,
      totalCount: 5,
      batchStart: 3,
      avoidQuestions: [
        'What is photosynthesis?',
        'Which pigment helps plants absorb light?',
      ],
    });

    for (const question of result) {
      expect(question.options?.[question.correctAnswer ?? -1]).toContain('Correct');
      expect(question.answer).toBe(question.options?.[question.correctAnswer ?? -1]);
    }
  });

  it('does not append MCQs that duplicate existing section questions', async () => {
    const fetchQuestionBatch = vi.fn()
      .mockResolvedValueOnce([
        mcq('q1', 'What is photosynthesis?'),
        mcq('q2', 'Which pigment helps plants absorb light?'),
      ])
      .mockResolvedValueOnce([mcq('q3', 'What gas do plants release during photosynthesis?')]);

    const result = await generateUniqueQuestionBatches(
      {
        topic: 'Photosynthesis',
        competency: 'Explain how plants make food.',
        grade: 'Grade 6',
        subject: 'Science',
        language: 'English',
        type: 'Multiple Choice',
        difficulty: 'Average',
        count: 2,
      },
      fetchQuestionBatch,
      [mcq('existing-1', '1. What is photosynthesis?')],
    );

    expect(result.map(q => q.text)).toEqual([
      'Which pigment helps plants absorb light?',
      'What gas do plants release during photosynthesis?',
    ]);
    expect(fetchQuestionBatch.mock.calls[0][0].avoidQuestions).toEqual(['1. What is photosynthesis?']);
  });
});
