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

// GET /api/recovery/intentions - Get "Never Miss Twice" status for all intentions
export async function GET(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    const states = await data.getIntentionRecoveryStates();
    return NextResponse.json(states);
  } catch (error) {
    console.error('Failed to get intention recovery states:', error);
    return NextResponse.json(
      { error: 'Failed to get intention recovery states' },
      { status: 500 }
    );
  }
}
