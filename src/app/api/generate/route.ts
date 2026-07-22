import { NextResponse } from 'next/server';
import { generateQuizQuestions } from './ai';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { topic, grade, subject, type, difficulty, count } = body;

    const questions = await generateQuizQuestions({
      topic,
      grade,
      subject,
      type,
      difficulty,
      count: parseInt(count) || 5
    });

    // Map output to the frontend expected format
    const formattedQuestions = questions.map(q => ({
      id: q.id,
      type: type || 'Multiple Choice',
      text: q.text,
      options: q.options,
      answer: q.options && typeof q.correctAnswer === 'number' 
        ? q.options[q.correctAnswer] 
        : (q.correctAnswer === 0 ? 'True' : 'False')
    }));

    return NextResponse.json({ questions: formattedQuestions });

  } catch (error: any) {
    console.error('Error generating quiz:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate quiz' }, { status: 500 });
  }
}
