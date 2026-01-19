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

// GET /api/auth/google/status - Get calendar connection status
export async function GET(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    // Check if Google OAuth is configured
    const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

    const status = await data.getCalendarAuthStatus();

    return NextResponse.json({
      configured,
      ...status,
    });
  } catch (error) {
    console.error('Failed to get calendar auth status:', error);
    return NextResponse.json(
      { error: 'Failed to get calendar connection status' },
      { status: 500 }
    );
  }
}
