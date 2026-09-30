import { NextResponse } from 'next/server';
import type { Question } from '../../../types';
import { balanceMultipleChoiceAnswers } from '../../../utils/balanceMcqAnswers';
import { generateQuizQuestions } from './ai';
import { createTosAiAdapter } from './tosAiAdapter';
import { generateQuestionsFromTos } from './tosGeneration';
import { requireExistingSession } from '../_lib/sessionAuth';
import { validateTosPlan } from '../../../utils/tosPlan';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const PROVIDER_SELECTION_REQUEST_FIELDS = new Set([
  'provider',
  'model',
  'baseurl',
  'apikey',
  'authscheme',
  'aiprovider',
  'aimodel',
  'aibaseurl',
  'aiapikey',
  'aiauthscheme',
]);

const INVALID_GENERATION_REQUEST_ERROR = 'Invalid generation request.';
const TOS_MIN_COUNT = 1;
const TOS_MAX_COUNT = 50;

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseTosCount(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= TOS_MIN_COUNT && parsed <= TOS_MAX_COUNT
    ? parsed
    : undefined;
}

function hasProviderSelectionOverride(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;

  return Object.keys(body).some((key) => {
    const normalized = key.replace(/[_-]/g, '').toLowerCase();
    return normalized.startsWith('worksheetmakerai')
      || PROVIDER_SELECTION_REQUEST_FIELDS.has(normalized);
  });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const sessionError = await requireExistingSession(req);
  if (sessionError) return sessionError;

  try {
    const body = await req.json();
    if (hasProviderSelectionOverride(body)) {
      return NextResponse.json({ error: 'Provider selection is not allowed.' }, { status: 400 });
    }
    const {
      topic,
      competency,
      objective,
      grade,
      subject,
      type,
      difficulty,
      count,
      language,
      outputLanguage,
      avoidQuestions,
      totalCount,
      batchStart,
      generationMode,
      tosPlan,
    } = body;
    const directCount = parseInt(count) || 5;
    const hasTosPlan = body && typeof body === 'object' && !Array.isArray(body)
      && Object.prototype.hasOwnProperty.call(body, 'tosPlan');

    if (generationMode !== undefined && generationMode !== 'direct' && generationMode !== 'tos') {
      return NextResponse.json({ error: INVALID_GENERATION_REQUEST_ERROR }, { status: 400 });
    }

    if ((generationMode === undefined || generationMode === 'direct') && hasTosPlan) {
      return NextResponse.json({ error: INVALID_GENERATION_REQUEST_ERROR }, { status: 400 });
    }

    let questions: Question[];

    if (generationMode === 'tos') {
      const tosCount = parseTosCount(count);
      if (!hasTosPlan || type !== 'Multiple Choice' || tosCount === undefined) {
        return NextResponse.json({ error: INVALID_GENERATION_REQUEST_ERROR }, { status: 400 });
      }

      const validation = validateTosPlan(tosPlan, tosCount);
      if (!validation.valid) {
        return NextResponse.json({ error: INVALID_GENERATION_REQUEST_ERROR }, { status: 400 });
      }

      if (
        typeof topic !== 'string' || topic.trim() === ''
        || typeof grade !== 'string' || grade.trim() === ''
        || typeof subject !== 'string' || subject.trim() === ''
      ) {
        return NextResponse.json({ error: INVALID_GENERATION_REQUEST_ERROR }, { status: 400 });
      }

      const tosQuestions = await generateQuestionsFromTos(tosPlan, {
        topic,
        grade,
        subject,
        language: language || outputLanguage || 'English',
        expectedTotal: tosCount,
        avoidQuestions: Array.isArray(avoidQuestions) ? avoidQuestions : undefined,
      }, createTosAiAdapter(startedAt));

      questions = balanceMultipleChoiceAnswers(tosQuestions, 'Multiple Choice');
    } else {
      questions = await generateQuizQuestions({
        topic,
        competency,
        objective,
        grade,
        subject,
        type,
        difficulty,
        count: directCount,
        language: language || outputLanguage || 'English',
        avoidQuestions: Array.isArray(avoidQuestions) ? avoidQuestions : undefined,
        totalCount: parseOptionalNumber(totalCount),
        batchStart: parseOptionalNumber(batchStart),
      }, { startedAt });
    }

    // Map output to the frontend expected format
    const formattedQuestions = questions.map(q => {
      let answer: string | undefined;
      if (q.options && typeof q.correctAnswer === 'number') {
        // Multiple Choice
        answer = q.options[q.correctAnswer];
      } else if (type === 'True or False' && typeof q.correctAnswer === 'number') {
        // True or False
        answer = q.correctAnswer === 0 ? 'True' : 'False';
      } else if (type === 'Identification' && typeof q.answer === 'string') {
        // Identification — pass the AI-generated short answer through
        answer = q.answer;
      }
      // Problem Solving / Essay: answer stays undefined

      return {
        id: q.id,
        type: type || 'Multiple Choice',
        text: q.text,
        options: q.options,
        correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : undefined,
        answer,
        ...(generationMode === 'tos'
          && q.tosRowId !== undefined
          && q.tosCognitiveLevel !== undefined
          ? { tosRowId: q.tosRowId, tosCognitiveLevel: q.tosCognitiveLevel }
          : {}),
      };
    });

    return NextResponse.json({ questions: formattedQuestions });

  } catch {
    console.error('[worksheet-ai]', { failureKind: 'generation_failed' });
    return NextResponse.json({ error: 'Failed to generate quiz' }, { status: 500 });
  }
}
