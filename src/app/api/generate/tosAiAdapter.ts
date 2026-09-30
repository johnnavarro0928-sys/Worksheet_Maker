import { generateQuizQuestions } from './ai';
import type { Question } from '../../../types';
import type { TosCognitiveLevel } from '../../../utils/tosPlan';
import type { GenerateTosQuestionBatch, TosQuestionBatchRequest } from './tosGeneration';

const DIFFICULTY_BY_COGNITIVE_LEVEL: Record<TosCognitiveLevel, string> = {
  Remembering: 'Easy',
  Understanding: 'Easy',
  Applying: 'Average',
  Analyzing: 'Average',
  Evaluating: 'Difficult',
  Creating: 'Difficult',
};

export function createTosAiAdapter(startedAt?: number): GenerateTosQuestionBatch {
  return async (request: TosQuestionBatchRequest): Promise<Question[]> => {
    const params = {
      topic: request.topic,
      competency: request.competency,
      grade: request.grade,
      subject: request.subject,
      difficulty: DIFFICULTY_BY_COGNITIVE_LEVEL[request.cognitiveLevel],
      type: 'Multiple Choice',
      count: request.count,
      language: request.language,
      totalCount: request.totalCount,
      batchStart: request.batchStart,
      avoidQuestions: request.avoidQuestions,
      cognitiveLevel: request.cognitiveLevel,
      ...(request.objective !== undefined ? { objective: request.objective } : {}),
    };

    return generateQuizQuestions(params, { startedAt });
  };
}
