import { NextRequest, NextResponse } from 'next/server';
import * as data from '@/lib/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET weekly review history
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const reviews = await data.getWeeklyReviews(limit);

    return NextResponse.json({ reviews });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to get review history', details: error.message },
      { status: 500 }
    );
  }
}
