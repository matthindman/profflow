import { NextRequest, NextResponse } from 'next/server';
import * as data from '@/lib/data';
import { revokeToken } from '@/lib/google/oauth';

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

// POST /api/auth/google/disconnect - Disconnect Google Calendar
export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    // Get current tokens to revoke
    const tokens = await data.getCalendarTokens();

    // Try to revoke the token with Google (best effort)
    if (tokens?.accessToken) {
      try {
        await revokeToken(tokens.accessToken);
      } catch (error) {
        // Log but don't fail - token might already be invalid
        console.warn('Failed to revoke Google token:', error);
      }
    }

    // Clear stored tokens
    await data.disconnectCalendar();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to disconnect calendar:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect calendar' },
      { status: 500 }
    );
  }
}
