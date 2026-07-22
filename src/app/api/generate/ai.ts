import { z } from 'zod';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject, LanguageModel } from 'ai';

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

function getProviderModel(providerName: string, modelName: string): LanguageModel {
  switch (providerName) {
    case 'openai': {
      if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required for OpenAI provider');
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return openai(modelName);
    }
    case 'google': {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY required for Google provider');
      const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
      return google(modelName);
    }
    case 'anthropic': {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY required for Anthropic provider');
      const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      return anthropic(modelName);
    }
    case 'openrouter':
    default: {
      if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY required for OpenRouter provider');
      const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
      return openrouter(modelName);
    }
  }
}

export async function generateQuizQuestions(params: QuizParams): Promise<Question[]> {
  if (params.topic === 'MOCK_TEST') {
    return Array.from({ length: params.count }).map((_, i) => ({
      id: `mock-${i}`,
      text: `Mock Question ${i + 1} for ${params.subject}?`,
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: 0
    }));
  }

  // Parse comma-separated lists of providers and models
  const providersStr = process.env.ACTIVE_AI_PROVIDERS || process.env.ACTIVE_AI_PROVIDER || 'openrouter';
  const modelsStr = process.env.ACTIVE_AI_MODELS || process.env.ACTIVE_AI_MODEL || 'google/gemini-2.5-flash:free,meta-llama/llama-3-8b-instruct:free,microsoft/phi-3-mini-128k-instruct:free';

  const providerNames = providersStr.split(',').map(s => s.trim());
  const modelNames = modelsStr.split(',').map(s => s.trim());

  // Instantiate an array of LanguageModels based on the parsed strings
  const languageModels: LanguageModel[] = modelNames.map((modelName, index) => {
    // If only one provider is given but multiple models, reuse the first provider
    const providerName = providerNames[index] || providerNames[0]; 
    return getProviderModel(providerName, modelName);
  });

  const prompt = `Generate a ${params.type} quiz about ${params.topic} for grade ${params.grade} students.
  Subject: ${params.subject}
  Difficulty: ${params.difficulty}
  Number of questions: ${params.count}`;

  let object;
  let lastError;

  for (let i = 0; i < languageModels.length; i++) {
    try {
      const response = await generateObject({
        model: languageModels[i],
        schema: quizSchema,
        prompt: prompt,
      });
      object = response.object;
      break; // Success! Break out of the fallback loop
    } catch (error) {
      console.warn(`Model at index ${i} failed. Trying next...`, error);
      lastError = error;
    }
  }

  if (!object) {
    throw new Error(`All ${languageModels.length} configured AI models failed. Last error: ${lastError}`);
  }

  return object.questions.map((q, i) => ({
    id: `q-${Date.now()}-${i}`,
    text: q.text,
    options: q.options,
    correctAnswer: q.correctAnswer
  }));
}
