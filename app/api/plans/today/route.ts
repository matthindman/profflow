import { NextRequest, NextResponse } from 'next/server';
import * as data from '@/lib/data';
import { getLocalDateString } from '@/lib/utils/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetDate = searchParams.get('date') || getLocalDateString();
    const plan = await data.getPlanForDate(targetDate);
    return NextResponse.json({ plan, date: targetDate });
  } catch (error: any) {
    console.error('Get plan error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch plan', details: error.message },
      { status: 500 }
    );
  }
}
