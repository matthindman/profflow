import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getUserEmail } from '@/lib/google/oauth';
import * as data from '@/lib/data';

// GET /api/auth/google/callback - Handle OAuth callback
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    // Handle errors from Google
    if (error) {
      console.error('Google OAuth error:', error);
      return NextResponse.redirect(
        new URL('/?calendar_error=' + encodeURIComponent(error), request.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/?calendar_error=no_code', request.url)
      );
    }

    // Exchange authorization code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Get user email to display in UI
    const email = await getUserEmail(tokens.accessToken);

    // Store tokens securely
    await data.storeCalendarTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiryDate: tokens.expiryDate,
      email,
    });

    // Redirect back to the app with success indicator
    return NextResponse.redirect(new URL('/?calendar_connected=true', request.url));
  } catch (error) {
    console.error('Failed to handle Google OAuth callback:', error);
    return NextResponse.redirect(
      new URL('/?calendar_error=callback_failed', request.url)
    );
  }
}
