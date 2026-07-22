import { z } from 'zod';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject, LanguageModel } from 'ai';
import { Question } from '../../../types';
import { formatFormula } from '../../../utils/formatFormula';

export interface QuizParams {
  topic: string; 
  competency?: string;
  objective?: string;
  grade: string; 
  subject: string; 
  difficulty: string; 
  type: string; 
  count: number;
}

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

function getSchemaForType(type: string) {
  switch (type) {
    case 'True or False':
      return z.object({
        questions: z.array(z.object({
          text: z.string().describe("The true/false statement"),
          correctAnswer: z.number().min(0).max(1).describe("0 for True, 1 for False")
        }))
      });
    case 'Identification':
    case 'Problem Solving':
    case 'Essay':
      return z.object({
        questions: z.array(z.object({
          text: z.string().describe("The question or problem prompt")
        }))
      });
    case 'Multiple Choice':
    default:
      return z.object({
        questions: z.array(z.object({
          text: z.string().describe("The question text"),
          options: z.array(z.string()).length(4).describe("Four possible answers"),
          correctAnswer: z.number().min(0).max(3).describe("The index of the correct answer (0-3)")
        }))
      });
  }
}

export async function generateQuizQuestions(params: QuizParams): Promise<Question[]> {
  if (params.topic === 'MOCK_TEST') {
    return Array.from({ length: params.count }).map((_, i) => ({
      id: `mock-${i}`,
      type: params.type,
      text: formatFormula(`Mock Question ${i + 1} for ${params.subject}?`),
      options: params.type === 'Multiple Choice' ? ['Option A', 'Option B', 'Option C', 'Option D'] : undefined,
      correctAnswer: 0
    }));
  }

  // Parse comma-separated lists of providers and models
  const providersStr = process.env.ACTIVE_AI_PROVIDERS || process.env.ACTIVE_AI_PROVIDER || 'openrouter';
  const modelsStr = process.env.ACTIVE_AI_MODELS || process.env.ACTIVE_AI_MODEL || 'google/gemini-2.5-flash:free,meta-llama/llama-3-8b-instruct:free,microsoft/phi-3-mini-128k-instruct:free';

  const providerNames = providersStr.split(',').map(s => s.trim());
  const modelNames = modelsStr.split(',').map(s => s.trim());

  const languageModels: LanguageModel[] = modelNames.map((modelName, index) => {
    const providerName = providerNames[index] || providerNames[0]; 
    return getProviderModel(providerName, modelName);
  });

  const schema = getSchemaForType(params.type);

  const prompt = `You are an expert educator. Generate a ${params.type} test with ${params.count} questions.

Target Context:
- Subject: ${params.subject} (${params.grade})
- Topic: ${params.topic}
- Learning Competency: ${params.competency || "Standard curriculum alignment for " + params.topic}
- Specific Objective: ${params.objective || "Standard learning objective for " + params.topic}
- Difficulty Level: ${params.difficulty}

STRICT ALIGNMENT & FORMATTING RULES:
1. Questions MUST directly evaluate the specified Learning Competency and Specific Objective at the appropriate cognitive depth.
2. For all mathematical exponents, powers, or chemical formulas, ALWAYS use standard Unicode superscripts and subscripts (e.g. x², y³, 10⁵, H₂O, CO₂, H₂SO₄, a² + b² = c²).
3. Do NOT use LaTeX ($ or $$) or HTML tags (<sup>/<sub>). Use clean Unicode text only so formulas render natively in Word and browser previews.`;

  let object: any;
  let lastError: any;

  for (let i = 0; i < languageModels.length; i++) {
    try {
      const response = await generateObject({
        model: languageModels[i],
        schema: schema,
        prompt: prompt,
      });
      object = response.object;
      break;
    } catch (error) {
      console.warn(`AI Model at index ${i} failed. Trying fallback...`, error);
      lastError = error;
    }
  }

  if (!object || !object.questions) {
    throw new Error(`All ${languageModels.length} configured AI models failed to generate questions. Error: ${lastError?.message || lastError}`);
  }

  return object.questions.map((q: any, i: number) => ({
    id: `q-${Date.now()}-${i}`,
    type: params.type,
    text: formatFormula(q.text),
    options: q.options ? q.options.map((opt: string) => formatFormula(opt)) : undefined,
    correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : undefined
  }));
}
