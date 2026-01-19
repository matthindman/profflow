import { NextRequest, NextResponse } from 'next/server';
import * as data from '@/lib/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET current weekly review or check if one is in progress
export async function GET() {
  try {
    const review = await data.getCurrentWeeklyReview();
    const dueCheck = await data.isWeeklyReviewDue();

    return NextResponse.json({
      review,
      isDue: dueCheck.isDue,
      dueWeekStart: dueCheck.weekStart,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to get review', details: error.message },
      { status: 500 }
    );
  }
}

// POST start a new weekly review
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { weekStart } = body;

    const review = await data.startWeeklyReview(weekStart);

    return NextResponse.json({ review });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to start review', details: error.message },
      { status: 500 }
    );
  }
}
