import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/google/oauth';

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

// GET /api/auth/google - Initiate OAuth flow
export async function GET(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    // Check if Google OAuth is configured
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.json(
        {
          error: 'Google Calendar integration is not configured',
          details: 'Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables',
        },
        { status: 503 }
      );
    }

    const authUrl = getAuthUrl();

    // Redirect to Google's OAuth consent screen
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Failed to initiate Google OAuth:', error);
    return NextResponse.json(
      { error: 'Failed to initiate Google authentication' },
      { status: 500 }
    );
  }
}
