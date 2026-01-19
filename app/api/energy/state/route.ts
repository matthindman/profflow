import { NextRequest, NextResponse } from 'next/server';
import * as data from '@/lib/data';
import { getLocalDateString } from '@/lib/utils/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || getLocalDateString();

    const state = await data.getCurrentEnergyState(date);
    return NextResponse.json(state);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch energy state', details: error.message },
      { status: 500 }
    );
  }
}
