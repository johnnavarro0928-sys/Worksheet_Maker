import { NextResponse } from 'next/server';
import { generateQuizQuestions } from './ai';
import { requireExistingSession } from '../_lib/sessionAuth';

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

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
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
    } = body;

    const questions = await generateQuizQuestions({
      topic,
      competency,
      objective,
      grade,
      subject,
      type,
      difficulty,
      count: parseInt(count) || 5,
      language: language || outputLanguage || 'English',
      avoidQuestions: Array.isArray(avoidQuestions) ? avoidQuestions : undefined,
      totalCount: parseOptionalNumber(totalCount),
      batchStart: parseOptionalNumber(batchStart),
    }, { startedAt });

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
      };
    });

    return NextResponse.json({ questions: formattedQuestions });

  } catch {
    console.error('[worksheet-ai]', { failureKind: 'generation_failed' });
    return NextResponse.json({ error: 'Failed to generate quiz' }, { status: 500 });
  }
}
