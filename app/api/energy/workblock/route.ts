import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as data from '@/lib/data';
import { requireValidOrigin } from '@/lib/middleware/security';
import { getLocalDateString, getLocalTimeString } from '@/lib/utils/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const StartWorkBlockSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/).optional(),
  plannedDurationMinutes: z.number().int().min(1).max(240).optional().default(90),
  taskId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const EndWorkBlockSchema = z.object({
  id: z.string().uuid(),
  endTime: z.string().regex(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/).optional(),
  focusRating: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().nullable().optional(),
});

const UpdateWorkBlockSchema = z.object({
  id: z.string().uuid(),
  focusRating: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().nullable().optional(),
  taskId: z.string().uuid().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || getLocalDateString();
    const activeOnly = searchParams.get('active') === 'true';

    if (activeOnly) {
      const activeBlock = await data.getActiveWorkBlock();
      return NextResponse.json({ workBlock: activeBlock });
    }

    const workBlocks = await data.getWorkBlocksForDate(date);
    return NextResponse.json({ workBlocks });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch work blocks', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    requireValidOrigin(req);
    const body = await req.json();
    const validated = StartWorkBlockSchema.parse(body);

    const workBlock = await data.startWorkBlock({
      date: validated.date || getLocalDateString(),
      startTime: validated.startTime || getLocalTimeString(),
      plannedDurationMinutes: validated.plannedDurationMinutes,
      taskId: validated.taskId ?? null,
      notes: validated.notes ?? null,
    });

    return NextResponse.json(workBlock, { status: 201 });
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
      { error: 'Failed to start work block', details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    requireValidOrigin(req);
    const body = await req.json();

    // Check if this is an "end" operation or an "update" operation
    if (body.endTime !== undefined || (body.id && !body.taskId && body.focusRating !== undefined)) {
      const validated = EndWorkBlockSchema.parse(body);
      const workBlock = await data.endWorkBlock(validated.id, {
        endTime: validated.endTime || getLocalTimeString(),
        focusRating: validated.focusRating,
        notes: validated.notes,
      });

      if (!workBlock) {
        return NextResponse.json({ error: 'Work block not found' }, { status: 404 });
      }

      return NextResponse.json(workBlock);
    }

    // Regular update
    const validated = UpdateWorkBlockSchema.parse(body);
    const workBlock = await data.updateWorkBlock(validated.id, {
      focusRating: validated.focusRating,
      notes: validated.notes,
      taskId: validated.taskId,
    });

    if (!workBlock) {
      return NextResponse.json({ error: 'Work block not found' }, { status: 404 });
    }

    return NextResponse.json(workBlock);
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
      { error: 'Failed to update work block', details: error.message },
      { status: 500 }
    );
  }
}
