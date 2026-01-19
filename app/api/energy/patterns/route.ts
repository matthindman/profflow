import { NextRequest, NextResponse } from 'next/server';
import * as data from '@/lib/data';
import { getLocalDateString } from '@/lib/utils/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  d.setDate(diff);
  return getLocalDateString(d);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'daily';
    const date = searchParams.get('date') || getLocalDateString();

    if (type === 'weekly') {
      // Get the Monday of the week containing the date
      const weekStart = searchParams.get('weekStart') || getMondayOfWeek(new Date(date));
      const pattern = await data.getWeeklyEnergyPattern(weekStart);
      return NextResponse.json({ pattern });
    }

    // Daily pattern
    const pattern = await data.getDailyEnergyPattern(date);
    return NextResponse.json({ pattern });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch energy pattern', details: error.message },
      { status: 500 }
    );
  }
}
