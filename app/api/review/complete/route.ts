import { NextRequest, NextResponse } from 'next/server';
import * as data from '@/lib/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST complete a weekly review
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    const review = await data.completeWeeklyReview(id);

    if (!review) {
      return NextResponse.json(
        { error: 'Review not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ review });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to complete review', details: error.message },
      { status: 500 }
    );
  }
}
