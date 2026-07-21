import { z } from 'zod';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
}

export interface QuizParams {
  topic: string; 
  grade: string; 
  subject: string; 
  difficulty: string; 
  type: string; 
  count: number;
}

const quizSchema = z.object({
  questions: z.array(z.object({
    text: z.string().describe("The question text"),
    options: z.array(z.string()).length(4).describe("Four possible answers"),
    correctAnswer: z.number().min(0).max(3).describe("The index of the correct answer (0-3)")
  }))
});

export async function generateQuizQuestions(params: QuizParams, modelName: string, apiKey: string): Promise<Question[]> {
  if (!apiKey) throw new Error('OpenRouter API key required');

  if (params.topic === 'MOCK_TEST') {
    return Array.from({ length: params.count }).map((_, i) => ({
      id: `mock-${i}`,
      text: `Mock Question ${i + 1} for ${params.subject}?`,
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: 0
    }));
  }

  const openrouter = createOpenRouter({
    apiKey,
  });

  const prompt = `Generate a ${params.type} quiz about ${params.topic} for grade ${params.grade} students.
  Subject: ${params.subject}
  Difficulty: ${params.difficulty}
  Number of questions: ${params.count}`;

  const { object } = await generateObject({
    model: openrouter(modelName),
    schema: quizSchema,
    prompt: prompt,
  });

  return object.questions.map((q, i) => ({
    id: `q-${Date.now()}-${i}`,
    text: q.text,
    options: q.options,
    correctAnswer: q.correctAnswer
  }));
}
