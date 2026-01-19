import { google } from 'googleapis';
import * as data from '@/lib/data';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback';

  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(): string {
  const oauth2Client = getOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent to always get refresh token
  });
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
}> {
  const oauth2Client = getOAuth2Client();

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to get tokens from Google');
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date || Date.now() + 3600 * 1000,
  };
}

export async function getUserEmail(accessToken: string): Promise<string> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data: userInfo } = await oauth2.userinfo.get();

  if (!userInfo.email) {
    throw new Error('Failed to get user email from Google');
  }

  return userInfo.email;
}

export async function getAuthenticatedClient(): Promise<ReturnType<typeof getOAuth2Client> | null> {
  const tokens = await data.getCalendarTokens();

  if (!tokens || !tokens.accessToken) {
    return null;
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });

  // Check if token is expired and refresh if needed
  if (tokens.tokenExpiry && new Date(tokens.tokenExpiry) < new Date()) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();

      if (credentials.access_token && credentials.expiry_date) {
        await data.updateCalendarAccessToken({
          accessToken: credentials.access_token,
          expiryDate: credentials.expiry_date,
        });

        oauth2Client.setCredentials(credentials);
      }
    } catch (error) {
      console.error('Failed to refresh access token:', error);
      // Token refresh failed - user needs to re-authenticate
      return null;
    }
  }

  return oauth2Client;
}

export async function revokeToken(accessToken: string): Promise<void> {
  const oauth2Client = getOAuth2Client();
  await oauth2Client.revokeToken(accessToken);
}
