import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as data from '@/lib/data';
import { requireValidOrigin } from '@/lib/middleware/security';
import { getLocalDateString, getLocalTimeString } from '@/lib/utils/date';
import { BreakActivityTypeSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const StartBreakSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/).optional(),
  activities: z.array(BreakActivityTypeSchema).optional(),
  notes: z.string().nullable().optional(),
});

const EndBreakSchema = z.object({
  id: z.string().uuid(),
  endTime: z.string().regex(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/).optional(),
  activities: z.array(BreakActivityTypeSchema).optional(),
  restorativeScore: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().nullable().optional(),
});

const LogBreakSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/),
  endTime: z.string().regex(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/),
  activities: z.array(BreakActivityTypeSchema),
  restorativeScore: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || getLocalDateString();
    const activeOnly = searchParams.get('active') === 'true';

    if (activeOnly) {
      const activeBreak = await data.getActiveBreak();
      return NextResponse.json({ break: activeBreak });
    }

    const breaks = await data.getBreakLogsForDate(date);
    return NextResponse.json({ breaks });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch breaks', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    requireValidOrigin(req);
    const body = await req.json();

    // Check if this is a "log" operation (has both startTime and endTime)
    if (body.startTime && body.endTime) {
      const validated = LogBreakSchema.parse(body);
      const breakLog = await data.logBreak({
        date: validated.date || getLocalDateString(),
        startTime: validated.startTime,
        endTime: validated.endTime,
        activities: validated.activities,
        restorativeScore: validated.restorativeScore,
        notes: validated.notes,
      });

      return NextResponse.json(breakLog, { status: 201 });
    }

    // Start a new break
    const validated = StartBreakSchema.parse(body);
    const breakLog = await data.startBreak({
      date: validated.date || getLocalDateString(),
      startTime: validated.startTime || getLocalTimeString(),
      activities: validated.activities,
      notes: validated.notes,
    });

    return NextResponse.json(breakLog, { status: 201 });
  } catch (error: any) {
    if (error.message?.includes('Invalid origin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create break', details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    requireValidOrigin(req);
    const body = await req.json();
    const validated = EndBreakSchema.parse(body);

    const breakLog = await data.endBreak(validated.id, {
      endTime: validated.endTime || getLocalTimeString(),
      activities: validated.activities,
      restorativeScore: validated.restorativeScore,
      notes: validated.notes,
    });

    if (!breakLog) {
      return NextResponse.json({ error: 'Break not found' }, { status: 404 });
    }

    return NextResponse.json(breakLog);
  } catch (error: any) {
    if (error.message?.includes('Invalid origin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to end break', details: error.message },
      { status: 500 }
    );
  }
}
