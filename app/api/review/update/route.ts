import { NextRequest, NextResponse } from 'next/server';
import * as data from '@/lib/data';
import { ReviewStepType } from '@/types/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH update a weekly review step
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, step, ...stepData } = body;

    if (!id || !step) {
      return NextResponse.json(
        { error: 'Missing required fields: id, step' },
        { status: 400 }
      );
    }

    const validSteps: ReviewStepType[] = ['celebrate', 'challenges', 'learnings', 'values', 'big_three', 'schedule'];
    if (!validSteps.includes(step)) {
      return NextResponse.json(
        { error: 'Invalid step', validSteps },
        { status: 400 }
      );
    }

    const review = await data.updateWeeklyReviewStep(id, step as ReviewStepType, stepData);

    if (!review) {
      return NextResponse.json(
        { error: 'Review not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ review });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to update review step', details: error.message },
      { status: 500 }
    );
  }
}
