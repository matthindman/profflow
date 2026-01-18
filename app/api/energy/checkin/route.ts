import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as data from '@/lib/data';
import { requireValidOrigin } from '@/lib/middleware/security';
import { getLocalDateString } from '@/lib/utils/date';
import { MoodTypeSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateCheckInSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  energyLevel: z.number().int().min(1).max(10),
  mood: MoodTypeSchema,
  notes: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || getLocalDateString();
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (startDate && endDate) {
      const checkIns = await data.getEnergyCheckIns(startDate, endDate);
      return NextResponse.json({ checkIns });
    }

    const checkIn = await data.getEnergyCheckIn(date);
    return NextResponse.json({ checkIn });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch check-in', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    requireValidOrigin(req);
    const body = await req.json();
    const validated = CreateCheckInSchema.parse(body);

    const checkIn = await data.createEnergyCheckIn({
      date: validated.date || getLocalDateString(),
      energyLevel: validated.energyLevel,
      mood: validated.mood,
      notes: validated.notes ?? null,
    });

    return NextResponse.json(checkIn, { status: 201 });
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
      { error: 'Failed to create check-in', details: error.message },
      { status: 500 }
    );
  }
}
