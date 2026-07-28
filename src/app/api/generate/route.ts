import { NextResponse } from 'next/server';
import { generateQuizQuestions } from './ai';
import { requireExistingSession } from '../_lib/sessionAuth';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function POST(req: Request) {
  const sessionError = await requireExistingSession(req);
  if (sessionError) return sessionError;

  try {
    const body = await req.json();
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
    });

    // Map output to the frontend expected format
    const formattedQuestions = questions.map(q => ({
      id: q.id,
      type: type || 'Multiple Choice',
      text: q.text,
      options: q.options,
      correctAnswer: q.options && typeof q.correctAnswer === 'number' ? q.correctAnswer : undefined,
      answer: q.options && typeof q.correctAnswer === 'number' 
        ? q.options[q.correctAnswer] 
        : (q.correctAnswer === 0 ? 'True' : 'False')
    }));

    return NextResponse.json({ questions: formattedQuestions });

  } catch (error: unknown) {
    console.error('Error generating quiz:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate quiz';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
