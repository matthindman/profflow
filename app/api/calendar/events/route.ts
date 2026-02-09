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

type CalendarListEntry = {
  id: string;
  summary: string | null;
};

async function listVisibleCalendars(
  calendar: ReturnType<typeof google.calendar>
): Promise<CalendarListEntry[]> {
  try {
    const response = await calendar.calendarList.list({
      minAccessRole: 'reader',
      showHidden: false,
    });

    const items = response.data.items ?? [];
    const visible = items.filter((item) =>
      item.id &&
      !item.hidden &&
      !item.deleted &&
      ((item.selected ?? false) || item.primary)
    );

    if (visible.length === 0) {
      return [{ id: 'primary', summary: 'Primary' }];
    }

    return visible.map((item) => ({
      id: item.id as string,
      summary: item.summary ?? null,
    }));
  } catch (error) {
    console.warn('Failed to list calendars, falling back to primary:', error);
    return [{ id: 'primary', summary: 'Primary' }];
  }
}

function getEventSortKey(event: CalendarEvent): number {
  if (!event.start) return 0;
  const normalized = event.start.includes('T') ? event.start : `${event.start}T00:00:00`;
  return new Date(normalized).getTime();
}

function getGoogleErrorInfo(error: any): { status: number | null; reason: string | null; message: string | null } {
  const rawStatus = error?.code ?? error?.response?.status;
  const status = typeof rawStatus === 'number' ? rawStatus : Number(rawStatus);
  const errorData = error?.response?.data?.error;
  const reason = errorData?.errors?.[0]?.reason ?? error?.errors?.[0]?.reason ?? null;
  const message = errorData?.message ?? error?.message ?? null;

  return {
    status: Number.isFinite(status) ? status : null,
    reason,
    message,
  };
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
    const calendars = await listVisibleCalendars(calendar);

    const calendarEvents = await Promise.all(
      calendars.map(async (calendarEntry) => {
        try {
          const response = await calendar.events.list({
            calendarId: calendarEntry.id,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 100,
          });

          const events = (response.data.items || []).map((event) => {
            const rawId = event.id
              || event.iCalUID
              || `${event.start?.dateTime || event.start?.date || 'unknown'}-${event.summary || 'event'}`;

            return {
              id: `${calendarEntry.id}:${rawId}`,
              summary: event.summary || '(No title)',
              description: event.description || null,
              start: event.start?.dateTime || event.start?.date || '',
              end: event.end?.dateTime || event.end?.date || '',
              isAllDay: !event.start?.dateTime,
              source: 'google' as const,
              calendarId: calendarEntry.id,
            };
          });

          return {
            events,
            meta: {
              calendarId: calendarEntry.id,
              summary: calendarEntry.summary ?? null,
              count: events.length,
              error: null,
            },
          };
        } catch (error) {
          console.warn(`Failed to fetch events for calendar ${calendarEntry.id}:`, error);
          return {
            events: [],
            meta: {
              calendarId: calendarEntry.id,
              summary: calendarEntry.summary ?? null,
              count: 0,
              error: String(error instanceof Error ? error.message : error),
            },
          };
        }
      })
    );

    const events: CalendarEvent[] = calendarEvents.flatMap((result) => result.events).sort((a, b) => (
      getEventSortKey(a) - getEventSortKey(b)
    ));

    return NextResponse.json({ events });
  } catch (error: any) {
    console.error('Failed to fetch calendar events:', error);

    const { status, reason, message } = getGoogleErrorInfo(error);

    if (status === 401) {
      return NextResponse.json(
        { error: 'Calendar authentication expired', needsAuth: true },
        { status: 401 }
      );
    }

    if (status === 403) {
      return NextResponse.json(
        { error: message || 'Calendar access forbidden', needsAuth: false, reason },
        { status: 403 }
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

    const { status, reason, message } = getGoogleErrorInfo(error);

    if (status === 401) {
      return NextResponse.json(
        { error: 'Calendar authentication expired', needsAuth: true },
        { status: 401 }
      );
    }

    if (status === 403) {
      return NextResponse.json(
        { error: message || 'Calendar access forbidden', needsAuth: false, reason },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create calendar event' },
      { status: 500 }
    );
  }
}
