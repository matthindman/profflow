import { NextRequest, NextResponse } from 'next/server';
import * as data from '@/lib/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST navigate to next or previous step
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, direction } = body;

    if (!id || !direction) {
      return NextResponse.json(
        { error: 'Missing required fields: id, direction' },
        { status: 400 }
      );
    }

    if (direction !== 'next' && direction !== 'back') {
      return NextResponse.json(
        { error: 'Invalid direction. Must be "next" or "back"' },
        { status: 400 }
      );
    }

    const review = direction === 'next'
      ? await data.advanceWeeklyReviewStep(id)
      : await data.goBackWeeklyReviewStep(id);

    if (!review) {
      return NextResponse.json(
        { error: 'Review not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ review });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to navigate review step', details: error.message },
      { status: 500 }
    );
  }
}
