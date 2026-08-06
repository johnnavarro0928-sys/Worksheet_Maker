import { z } from 'zod';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import { generateObject, LanguageModel } from 'ai';
import { Question } from '../../../types';
import { formatFormula } from '../../../utils/formatFormula';
import { balanceMultipleChoiceAnswers } from '../../../utils/balanceMcqAnswers';
import { stripAnswerLabelPrefixes } from '../../../utils/answerOptionLabels';

const DEFAULT_MODEL_TIMEOUT_MS = 20000;
const MIN_MODEL_TIMEOUT_MS = 5000;
const MAX_MODEL_TIMEOUT_MS = 35000;
const DEFAULT_OPENROUTER_MODELS = [
  'openai/gpt-oss-20b:free',
  'nvidia/nemotron-nano-9b-v2:free',
];

const DEFAULT_ALIBABA_MODELS = [
  'qwen-plus',
  'qwen3.5-plus-2026-02-15',
  'qwen3.7-plus',
];

type GeneratedQuestion = {
  text?: string;
  options?: string[];
  correctAnswer?: number;
  answer?: string;
};

type GeneratedQuestionsObject = {
  questions?: GeneratedQuestion[];
};

type ModelAttemptConfig = {
  providerName: string;
  modelName: string;
};

export interface QuizParams {
  topic: string; 
  competency?: string;
  objective?: string;
  grade: string; 
  subject: string; 
  difficulty: string; 
  type: string; 
  count: number;
  language?: string;
  totalCount?: number;
  batchStart?: number;
  avoidQuestions?: string[];
}

function getPromptListItem(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

function getBatchUniquenessRules(params: QuizParams): string {
  const rules: string[] = [];

  if (params.totalCount && params.batchStart) {
    const batchEnd = params.batchStart + params.count - 1;
    rules.push(`BATCH UNIQUENESS CONTEXT:
- This request is for items ${params.batchStart}-${batchEnd} of a ${params.totalCount}-item worksheet.
- Generate only new questions for this assigned range. Do not restart from the most obvious introductory items for the topic.
- Use varied concepts, examples, data, contexts, and wording across the full worksheet.`);
  }

  const avoidQuestions = (params.avoidQuestions || [])
    .map(getPromptListItem)
    .filter(Boolean)
    .slice(0, 40);

  if (avoidQuestions.length > 0) {
    rules.push(`ALREADY ACCEPTED QUESTIONS TO AVOID:
Do NOT duplicate or rephrase these already accepted questions:
${avoidQuestions.map((question, index) => `${index + 1}. ${question}`).join('\n')}`);
  }

  return rules.join('\n\n');
}

function getModelTimeoutMs(count: number = 5): number {
  if (process.env.AI_MODEL_TIMEOUT_MS) {
    const parsed = Number.parseInt(process.env.AI_MODEL_TIMEOUT_MS, 10);
    if (Number.isFinite(parsed)) return Math.max(MIN_MODEL_TIMEOUT_MS, Math.min(MAX_MODEL_TIMEOUT_MS, parsed));
  }
  const calculated = Math.round(12000 + count * 1800);
  return Math.max(MIN_MODEL_TIMEOUT_MS, Math.min(MAX_MODEL_TIMEOUT_MS, calculated));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted')) {
      return 'The AI request timed out before completing. Please try generating fewer items or retry.';
    }
    return error.message;
  }
  if (typeof error === 'string') return error;
  return String(error || 'unknown_error');
}

function isReasoningModel(modelName: string): boolean {
  const normalizedName = modelName.trim().toLowerCase().split('/').pop() || '';
  return /^(?:gpt-5(?:[-.]|$)|o\d+(?:[-.]|$))/.test(normalizedName);
}

function appendProviderFallbacks(modelConfigs: ModelAttemptConfig[]): ModelAttemptConfig[] {
  const configs = [...modelConfigs];
  const seen = new Set(configs.map(config => `${config.providerName}:${config.modelName}`));

  // 1. Alibaba Qwen models (if key present)
  if (process.env.DASHSCOPE_API_KEY || process.env.ALIBABA_API_KEY) {
    const configuredModel = process.env.ALIBABA_MODEL;
    const alibabaModels = configuredModel ? [configuredModel, ...DEFAULT_ALIBABA_MODELS] : DEFAULT_ALIBABA_MODELS;

    for (const modelName of alibabaModels) {
      const key = `alibaba:${modelName}`;
      if (seen.has(key)) continue;

      configs.push({ providerName: 'alibaba', modelName });
      seen.add(key);
    }
  }

  // 2. OpenRouter free models (if key present)
  if (process.env.OPENROUTER_API_KEY) {
    for (const modelName of DEFAULT_OPENROUTER_MODELS) {
      const key = `openrouter:${modelName}`;
      if (seen.has(key)) continue;

      configs.push({ providerName: 'openrouter', modelName });
      seen.add(key);
    }
  }

  // 3. Paid DeepSeek API (if key present)
  if (process.env.DEEPSEEK_API_KEY) {
    const deepseekModel = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
    const key = `deepseek:${deepseekModel}`;
    if (!seen.has(key)) {
      configs.push({ providerName: 'deepseek', modelName: deepseekModel });
      seen.add(key);
    }
  }

  return configs;
}

function getModelAttemptConfigs(): ModelAttemptConfig[] {
  const hasAlibabaConfig = Boolean(process.env.DASHSCOPE_API_KEY || process.env.ALIBABA_API_KEY);
  const defaultProvider = hasAlibabaConfig ? 'alibaba' : 'openrouter';
  const defaultModels = hasAlibabaConfig
    ? (process.env.ALIBABA_MODEL || DEFAULT_ALIBABA_MODELS.join(','))
    : (process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODELS.join(','));

  const providersStr = process.env.ACTIVE_AI_PROVIDERS || process.env.ACTIVE_AI_PROVIDER || defaultProvider;
  const modelsStr = process.env.ACTIVE_AI_MODELS || process.env.ACTIVE_AI_MODEL || defaultModels;

  const providerNames = providersStr.split(',').map(s => s.trim()).filter(Boolean);
  const modelNames = modelsStr.split(',').map(s => s.trim()).filter(Boolean);

  return appendProviderFallbacks(modelNames.map((modelName, index) => ({
    providerName: providerNames[index] || providerNames[0] || defaultProvider,
    modelName,
  })));
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

      // Azure AI Foundry / OpenAI-compatible endpoint with explicit api-key header
      const openaiAzure = createOpenAI({
        baseURL: baseURL,
        apiKey: apiKey,
        headers: {
          'api-key': apiKey,
        },
      });
      return openaiAzure.chat(modelName);
    }
    case 'openai': {
      if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required for OpenAI provider');
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return openai.chat(modelName);
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
    case 'alibaba':
    case 'dashscope': {
      const apiKey = process.env.DASHSCOPE_API_KEY || process.env.ALIBABA_API_KEY;
      if (!apiKey) throw new Error('DASHSCOPE_API_KEY or ALIBABA_API_KEY required for Alibaba provider');
      const baseURL = process.env.ALIBABA_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
      const alibaba = createOpenAI({
        baseURL: baseURL,
        apiKey: apiKey,
      });
      return alibaba.chat(modelName);
    }
    case 'deepseek': {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) throw new Error('DEEPSEEK_API_KEY required for DeepSeek provider');
      const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
      const deepseek = createOpenAI({
        baseURL: baseURL,
        apiKey: apiKey,
      });
      return deepseek.chat(modelName);
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
      return z.object({
        questions: z.array(z.object({
          text: z.string().describe("The question or problem prompt"),
          answer: z.string().describe("The single correct short answer or term for this identification item")
        }))
      });
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
    const hasCorrectAnswer = params.type === 'Multiple Choice' || params.type === 'True or False';
    return Array.from({ length: params.count }).map((_, i) => ({
      id: `mock-${i}`,
      type: params.type,
      text: formatFormula(`Mock Question ${i + 1} for ${params.subject}?`),
      options: params.type === 'Multiple Choice' ? ['Option A', 'Option B', 'Option C', 'Option D'] : undefined,
      correctAnswer: hasCorrectAnswer ? 0 : undefined,
      answer: params.type === 'Identification' ? 'Mock Answer' : undefined,
    }));
  }

  const modelConfigs = getModelAttemptConfigs();

  const schema = getSchemaForType(params.type);

  const outputLang = params.language || 'English';
  let languageRules = '';
  if (outputLang === 'Filipino') {
    languageRules = `OUTPUT LANGUAGE INSTRUCTIONS (FILIPINO):
- Write ALL generated questions, distractor options, and instructions in natural, grammatically correct classroom Filipino (Tagalog/Wikang Pambansa).
- Do NOT confuse the subject field (${params.subject}) with the output language. Even if subject is Science, Math, or Araling Panlipunan, the wording of questions and options MUST be in Filipino.
- Retain standard, universally recognized technical or scientific terms in English only when conventional in Philippine classroom settings (e.g. 'photosynthesis', 'cell membrane', 'x-axis'), but frame sentence structures in proper Filipino.`;
  } else if (outputLang === 'Bilingual (English-Filipino)' || outputLang === 'English-Filipino bilingual') {
    languageRules = `OUTPUT LANGUAGE INSTRUCTIONS (BILINGUAL ENGLISH-FILIPINO):
- Write generated questions and distractor options in a clear, natural English-Filipino bilingual format suitable for Philippine classrooms.
- Present the primary concept in English with appropriate Filipino translation or clarification context where helpful.`;
  } else {
    languageRules = `OUTPUT LANGUAGE INSTRUCTIONS (ENGLISH):
- Write ALL generated questions and distractor options in clear, standard classroom English.`;
  }

  const batchUniquenessRules = getBatchUniquenessRules(params);

  const prompt = `You are a master curriculum specialist and item writer. Generate a ${params.type} test with ${params.count} questions.

TARGET AUDIENCE & CONTEXT:
- Subject: ${params.subject}
- Grade Level: ${params.grade}
- Topic: ${params.topic}
- Learning Competency: ${params.competency || "Standard curriculum alignment for " + params.topic}
- Specific Objective: ${params.objective || "Standard learning objective for " + params.topic}
- Target Difficulty Level: ${params.difficulty}
- Output Language: ${outputLang}

${languageRules}

${batchUniquenessRules}

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
4. For Multiple Choice, distribute correct answer letters A-D as evenly as possible across the full test. When the item count is not divisible by 4, no answer letter should appear more than one item above another answer letter. Avoid long runs or visible clustering of the same correct answer letter.
5. For mathematical exponents, powers, or chemical formulas, ALWAYS use standard Unicode superscripts and subscripts (e.g. x², y³, 10⁵, H₂O, CO₂, H₂SO₄, a² + b² = c²).
6. Do NOT use LaTeX ($ or $$) or HTML tags (<sup>/<sub>). Use clean Unicode text only so formulas render natively in Word and browser previews.
7. Do NOT include leading question numbers, letters, or prefixes (such as '1.', 'Q1:', or '1)'). Return ONLY the clean question text.
8. For Multiple Choice options, do NOT include option letters or labels inside the option text (such as 'A.', 'B)', 'Option C:', or 'D -'). Return ONLY the clean answer choice text.`;

  let object: GeneratedQuestionsObject | undefined;
  let lastError: unknown;
  const modelTimeoutMs = getModelTimeoutMs(params.count);
  const startTime = Date.now();
  const GLOBAL_MAX_TIME_MS = 52000;

  for (let i = 0; i < modelConfigs.length; i++) {
    const elapsed = Date.now() - startTime;
    if (elapsed > GLOBAL_MAX_TIME_MS) {
      console.warn(`[AI Generator] Reached global generation time budget (${GLOBAL_MAX_TIME_MS}ms). Exiting fallback loop.`);
      break;
    }

    const remainingMs = GLOBAL_MAX_TIME_MS - elapsed;
    const attemptTimeoutMs = Math.min(modelTimeoutMs, remainingMs);
    if (attemptTimeoutMs < 2000) break;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), attemptTimeoutMs);

    try {
      const model = getProviderModel(modelConfigs[i].providerName, modelConfigs[i].modelName);
      const response = await generateObject({
        model: model,
        schema: schema,
        prompt: prompt,
        ...(isReasoningModel(modelConfigs[i].modelName) ? {} : { temperature: 0.2 }),
        abortSignal: controller.signal,
      });
      clearTimeout(timeoutId);
      object = response.object as GeneratedQuestionsObject;
      console.info(`[AI Generator] Successfully generated ${object.questions?.length || 0} questions using model ${modelConfigs[i].providerName}:${modelConfigs[i].modelName}`);
      break;
    } catch (error) {
      clearTimeout(timeoutId);
      const modelConfig = modelConfigs[i];
      console.warn(`AI model ${modelConfig.providerName}:${modelConfig.modelName} failed: ${getErrorMessage(error)}`);
      lastError = error;
    }
    if (object?.questions) break;
  }

  if (!object || !object.questions) {
    throw new Error(`All ${modelConfigs.length} configured AI models failed to generate questions. Error: ${getErrorMessage(lastError)}`);
  }

  const generatedQuestions = object.questions.map((question) => ({
    ...question,
    options: question.options ? stripAnswerLabelPrefixes(question.options) : undefined,
  }));
  const questions = balanceMultipleChoiceAnswers(generatedQuestions, params.type);

  return questions.map((q: GeneratedQuestion, i: number) => {
    let cleanText = (q.text || "").trim();
    while (/^\s*(Q?\d+[\.\)\:]|\d+)\s*/i.test(cleanText)) {
      cleanText = cleanText.replace(/^\s*(Q?\d+[\.\)\:]|\d+)\s*/i, '').trim();
    }
    return {
      id: `q-${Date.now()}-${i}`,
      type: params.type,
      text: formatFormula(cleanText),
      options: q.options ? q.options.map((opt: string) => formatFormula(opt)) : undefined,
      correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : undefined,
      answer: typeof q.answer === 'string' ? formatFormula(q.answer.trim()) : undefined,
    };
  });
}
