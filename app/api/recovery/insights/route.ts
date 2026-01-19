import { NextRequest, NextResponse } from 'next/server';
import * as data from '@/lib/data';

// Security: Only allow same-origin requests
function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}

// GET /api/recovery/insights - Get weekly recovery insights
export async function GET(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    const insights = await data.getWeeklyRecoveryInsights();
    return NextResponse.json(insights);
  } catch (error) {
    console.error('Failed to get recovery insights:', error);
    return NextResponse.json(
      { error: 'Failed to get recovery insights' },
      { status: 500 }
    );
  }
}
