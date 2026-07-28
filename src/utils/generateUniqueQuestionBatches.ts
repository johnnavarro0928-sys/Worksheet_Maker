import { Question } from '../types';
import { balanceMultipleChoiceAnswers } from './balanceMcqAnswers';
import { getQuestionDeduplicationKey } from './dedupeQuestions';

const MAX_BATCH_SIZE = 5;
const MAX_EXTRA_BATCHES = 5;
const MAX_AVOID_QUESTIONS = 40;

export interface QuestionGenerationConfig {
  topic: string;
  competency: string;
  objective?: string;
  grade: string;
  subject: string;
  language: string;
  type: string;
  difficulty: string;
  count: number;
}

export interface QuestionBatchRequest extends QuestionGenerationConfig {
  totalCount: number;
  batchStart: number;
  avoidQuestions: string[];
}

export type FetchQuestionBatch = (body: QuestionBatchRequest) => Promise<Question[]>;

function syncMultipleChoiceAnswer(question: Question): Question {
  if (!question.options || typeof question.correctAnswer !== 'number') return question;
  return {
    ...question,
    answer: question.options[question.correctAnswer],
  };
}

function getAvoidQuestions(existingQuestions: Question[], acceptedQuestions: Question[]): string[] {
  return [...existingQuestions, ...acceptedQuestions]
    .map(question => question.text?.trim())
    .filter((text): text is string => Boolean(text))
    .slice(-MAX_AVOID_QUESTIONS);
}

export async function generateUniqueQuestionBatches(
  config: QuestionGenerationConfig,
  fetchQuestionBatch: FetchQuestionBatch,
  existingQuestions: Question[] = [],
): Promise<Question[]> {
  const requestedCount = Math.max(1, Math.floor(config.count || MAX_BATCH_SIZE));
  const maxAttempts = Math.ceil(requestedCount / MAX_BATCH_SIZE) + MAX_EXTRA_BATCHES;
  const knownKeys = new Set<string>();
  const acceptedQuestions: Question[] = [];

  for (const question of existingQuestions) {
    const key = getQuestionDeduplicationKey(question, config.type);
    if (key) knownKeys.add(key);
  }

  for (let attempt = 0; acceptedQuestions.length < requestedCount && attempt < maxAttempts; attempt++) {
    const remainingCount = requestedCount - acceptedQuestions.length;
    const batchCount = Math.min(MAX_BATCH_SIZE, remainingCount);
    const batchQuestions = await fetchQuestionBatch({
      ...config,
      count: batchCount,
      totalCount: requestedCount,
      batchStart: acceptedQuestions.length + 1,
      avoidQuestions: getAvoidQuestions(existingQuestions, acceptedQuestions),
    });

    for (const question of batchQuestions) {
      const key = getQuestionDeduplicationKey(question, config.type);
      if (!key || knownKeys.has(key)) continue;

      knownKeys.add(key);
      acceptedQuestions.push(question);
      if (acceptedQuestions.length >= requestedCount) break;
    }
  }

  return balanceMultipleChoiceAnswers(acceptedQuestions, config.type).map(syncMultipleChoiceAnswer);
}
