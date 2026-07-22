import { z } from 'zod';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
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
    case 'azure': {
      const apiKey = process.env.AZURE_OPENAI_API_KEY || process.env.AZURE_API_KEY || process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('AZURE_OPENAI_API_KEY, AZURE_API_KEY, or OPENAI_API_KEY required for Azure provider');

      const baseURL = process.env.AZURE_OPENAI_ENDPOINT || process.env.AZURE_BASE_URL || 'https://sayuna-ai.services.ai.azure.com/openai/v1';

      if (process.env.AZURE_RESOURCE_NAME && !process.env.AZURE_OPENAI_ENDPOINT && !process.env.AZURE_BASE_URL) {
        const azure = createAzure({
          resourceName: process.env.AZURE_RESOURCE_NAME,
          apiKey: apiKey,
        });
        return azure(modelName);
      }

      // Azure AI Foundry / OpenAI-compatible endpoint
      const openaiAzure = createOpenAI({
        baseURL: baseURL,
        apiKey: apiKey,
      });
      return openaiAzure(modelName);
    }
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
  const hasAzureConfig = Boolean(
    process.env.AZURE_OPENAI_API_KEY ||
    process.env.AZURE_API_KEY ||
    process.env.AZURE_OPENAI_ENDPOINT ||
    process.env.AZURE_BASE_URL ||
    process.env.AZURE_RESOURCE_NAME
  );
  const defaultProvider = hasAzureConfig ? 'azure' : 'openrouter';
  const defaultModels = hasAzureConfig 
    ? (process.env.AZURE_MODEL || 'gpt-5-mini-2') 
    : 'google/gemini-2.5-flash:free,meta-llama/llama-3-8b-instruct:free,microsoft/phi-3-mini-128k-instruct:free';

  const providersStr = process.env.ACTIVE_AI_PROVIDERS || process.env.ACTIVE_AI_PROVIDER || defaultProvider;
  const modelsStr = process.env.ACTIVE_AI_MODELS || process.env.ACTIVE_AI_MODEL || defaultModels;

  const providerNames = providersStr.split(',').map(s => s.trim());
  const modelNames = modelsStr.split(',').map(s => s.trim());

  const languageModels: LanguageModel[] = modelNames.map((modelName, index) => {
    const providerName = providerNames[index] || providerNames[0]; 
    return getProviderModel(providerName, modelName);
  });

  const schema = getSchemaForType(params.type);

  const prompt = `You are a master curriculum specialist and item writer. Generate a ${params.type} test with ${params.count} questions.

TARGET AUDIENCE & CONTEXT:
- Subject: ${params.subject}
- Grade Level: ${params.grade}
- Topic: ${params.topic}
- Learning Competency: ${params.competency || "Standard curriculum alignment for " + params.topic}
- Specific Objective: ${params.objective || "Standard learning objective for " + params.topic}
- Target Difficulty Level: ${params.difficulty}

GRADE-LEVEL COGNITIVE & VOCABULARY ADAPTATION:
- Kindergarten - Grade 2: Use simple, short, age-appropriate sentences, concrete familiar terms, and direct foundational concepts.
- Grade 3 - Grade 6: Use clear elementary vocabulary, basic conceptual understanding, and simple multi-step application.
- Grade 7 - Grade 10: Use standard secondary academic terminology, structured problem solving, and analytical reasoning.
- Grade 11 - Grade 12: Use advanced senior-high subject terminology, rigorous analytical depth, and complex domain synthesis.

DIFFICULTY LEVEL ALIGNMENT (BLOOM'S TAXONOMY):
- EASY (Remembering & Understanding): Focus on direct factual recall, basic definitions, and simple identification. Options and prompts must be clear and straightforward without tricky phrasing.
- AVERAGE (Applying & Analyzing): Focus on concept application, 2-step problem solving, comparing scenarios, and logical deduction suitable for ${params.grade}.
- DIFFICULT (Evaluating & Creating / HOTS): Focus on Higher-Order Thinking Skills (HOTS)—multi-step analytical evaluation, complex scenario analysis, synthesis of principles, and plausible distractors that require deep mastery.

STRICT ALIGNMENT & FORMATTING RULES:
1. If multiple Learning Competencies or Specific Objectives are specified (e.g. separated by commas, semicolons, numbers, or bullet points), evenly distribute the ${params.count} generated test questions across ALL of the listed competencies and objectives.
2. Every question MUST strictly evaluate the specified Learning Competencies and Specific Objectives at the exact ${params.difficulty} cognitive depth for ${params.grade}.
3. Distractor choices for Multiple Choice MUST be plausible and educationally meaningful, avoiding obvious filler options.
4. For mathematical exponents, powers, or chemical formulas, ALWAYS use standard Unicode superscripts and subscripts (e.g. x², y³, 10⁵, H₂O, CO₂, H₂SO₄, a² + b² = c²).
5. Do NOT use LaTeX ($ or $$) or HTML tags (<sup>/<sub>). Use clean Unicode text only so formulas render natively in Word and browser previews.
6. Do NOT include leading question numbers, letters, or prefixes (such as '1.', 'Q1:', or '1)'). Return ONLY the clean question text.`;

  let object: any;
  let lastError: any;

  for (let i = 0; i < languageModels.length; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout per model attempt

    try {
      const response = await generateObject({
        model: languageModels[i],
        schema: schema,
        prompt: prompt,
        temperature: 0.3,
        abortSignal: controller.signal,
      });
      clearTimeout(timeoutId);
      object = response.object;
      break;
    } catch (error) {
      clearTimeout(timeoutId);
      console.warn(`AI Model at index ${i} failed or timed out after 10s. Trying fallback...`, error);
      lastError = error;
    }
  }

  if (!object || !object.questions) {
    throw new Error(`All ${languageModels.length} configured AI models failed to generate questions. Error: ${lastError?.message || lastError}`);
  }

  return object.questions.map((q: any, i: number) => {
    let cleanText = (q.text || "").trim();
    while (/^\s*(Q?\d+[\.\)\:]|\d+)\s*/i.test(cleanText)) {
      cleanText = cleanText.replace(/^\s*(Q?\d+[\.\)\:]|\d+)\s*/i, '').trim();
    }
    return {
      id: `q-${Date.now()}-${i}`,
      type: params.type,
      text: formatFormula(cleanText),
      options: q.options ? q.options.map((opt: string) => formatFormula(opt)) : undefined,
      correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : undefined
    };
  });
}
