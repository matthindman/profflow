import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthenticatedClient } from '@/lib/google/oauth';
import { CalendarEvent, CreateCalendarEventInput } from '@/types/data';
import { CreateCalendarEventInputSchema } from '@/lib/validation/schemas';

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

// GET /api/calendar/events - Fetch calendar events
export async function GET(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    const oauth2Client = await getAuthenticatedClient();

    if (!oauth2Client) {
      return NextResponse.json(
        { error: 'Calendar not connected', needsAuth: true },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const timeMin = searchParams.get('timeMin') || new Date().toISOString();
    const timeMax = searchParams.get('timeMax') || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    });

    const events: CalendarEvent[] = (response.data.items || []).map((event) => ({
      id: event.id || '',
      summary: event.summary || '(No title)',
      description: event.description || null,
      start: event.start?.dateTime || event.start?.date || '',
      end: event.end?.dateTime || event.end?.date || '',
      isAllDay: !event.start?.dateTime,
      source: 'google' as const,
      calendarId: 'primary',
    }));

    return NextResponse.json({ events });
  } catch (error: any) {
    console.error('Failed to fetch calendar events:', error);

    // Handle specific Google API errors
    if (error.code === 401 || error.code === 403) {
      return NextResponse.json(
        { error: 'Calendar authentication expired', needsAuth: true },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch calendar events' },
      { status: 500 }
    );
  }
}

// POST /api/calendar/events - Create a new calendar event
export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    const oauth2Client = await getAuthenticatedClient();

    if (!oauth2Client) {
      return NextResponse.json(
        { error: 'Calendar not connected', needsAuth: true },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validate input
    const parsed = CreateCalendarEventInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid event data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const input: CreateCalendarEventInput = parsed.data;

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const eventResource: any = {
      summary: input.summary,
      description: input.description || undefined,
    };

    if (input.isAllDay) {
      // All-day events use date (not dateTime)
      eventResource.start = { date: input.start.split('T')[0] };
      eventResource.end = { date: input.end.split('T')[0] };
    } else {
      eventResource.start = { dateTime: input.start };
      eventResource.end = { dateTime: input.end };
    }

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: eventResource,
    });

    const createdEvent: CalendarEvent = {
      id: response.data.id || '',
      summary: response.data.summary || input.summary,
      description: response.data.description || null,
      start: response.data.start?.dateTime || response.data.start?.date || input.start,
      end: response.data.end?.dateTime || response.data.end?.date || input.end,
      isAllDay: input.isAllDay || false,
      source: 'profflow',
      calendarId: 'primary',
    };

    return NextResponse.json({ event: createdEvent });
  } catch (error: any) {
    console.error('Failed to create calendar event:', error);

    if (error.code === 401 || error.code === 403) {
      return NextResponse.json(
        { error: 'Calendar authentication expired', needsAuth: true },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create calendar event' },
      { status: 500 }
    );
  }
}
