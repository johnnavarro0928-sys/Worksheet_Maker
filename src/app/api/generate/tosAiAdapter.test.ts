import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as ai from './ai';
import type { TosCognitiveLevel } from '../../../utils/tosPlan';
import type { TosQuestionBatchRequest } from './tosGeneration';
import { createTosAiAdapter } from './tosAiAdapter';

vi.mock('./ai', () => ({
  generateQuizQuestions: vi.fn(),
}));

const generateQuizQuestionsMock = vi.mocked(ai.generateQuizQuestions);

const baseRequest: TosQuestionBatchRequest = {
  topic: 'Photosynthesis',
  competency: 'Explain how plants make food',
  objective: 'Describe the role of chlorophyll',
  grade: 'Grade 6',
  subject: 'Science',
  language: 'Filipino',
  cognitiveLevel: 'Remembering',
  count: 2,
  totalCount: 7,
  batchStart: 4,
  avoidQuestions: ['What is photosynthesis?'],
};

describe('createTosAiAdapter', () => {
  beforeEach(() => {
    generateQuizQuestionsMock.mockReset();
    generateQuizQuestionsMock.mockResolvedValue([]);
  });

  it.each([
    ['Remembering', 'Easy'],
    ['Understanding', 'Easy'],
    ['Applying', 'Average'],
    ['Analyzing', 'Average'],
    ['Evaluating', 'Difficult'],
    ['Creating', 'Difficult'],
  ] as [TosCognitiveLevel, string][])('maps %s to %s and forwards the complete MCQ batch request', async (cognitiveLevel, difficulty) => {
    const adapter = createTosAiAdapter(123456);

    await adapter({ ...baseRequest, cognitiveLevel });

    expect(generateQuizQuestionsMock).toHaveBeenCalledWith({
      topic: 'Photosynthesis',
      competency: 'Explain how plants make food',
      objective: 'Describe the role of chlorophyll',
      grade: 'Grade 6',
      subject: 'Science',
      language: 'Filipino',
      cognitiveLevel,
      type: 'Multiple Choice',
      difficulty,
      count: 2,
      totalCount: 7,
      batchStart: 4,
      avoidQuestions: ['What is photosynthesis?'],
    }, { startedAt: 123456 });
  });
});
