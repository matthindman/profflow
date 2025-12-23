import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as data from '@/lib/data';
import { requireValidOrigin } from '@/lib/middleware/security';
import { getLocalDateString } from '@/lib/utils/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CompletionRequestSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    notes: z.string().optional(),
  })
  .strict();

function resolveCompletionDate(req: NextRequest, fallback?: string): string {
  return req.nextUrl.searchParams.get('date') ?? fallback ?? getLocalDateString();
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireValidOrigin(req);
    const body = await req.json().catch(() => ({}));
    const validated = CompletionRequestSchema.parse(body);
    const completedOnDate = resolveCompletionDate(req, validated.date);

    const tasks = await data.getTasks();
    const exists = tasks.some((task) => task.id === params.id);
    if (!exists) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const alreadyCompleted = await data.hasCompletionForDate(params.id, completedOnDate);
    if (alreadyCompleted) {
      return NextResponse.json({ success: true, alreadyCompleted: true });
    }

    const completion = await data.recordCompletion(params.id, completedOnDate, validated.notes ?? null);
    return NextResponse.json({ success: true, completion });
  } catch (error: any) {
    if (error.message?.includes('Invalid origin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to record completion', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireValidOrigin(req);
    const body = await req.json().catch(() => ({}));
    const validated = CompletionRequestSchema.parse(body);
    const completedOnDate = resolveCompletionDate(req, validated.date);

    const tasks = await data.getTasks();
    const exists = tasks.some((task) => task.id === params.id);
    if (!exists) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const removed = await data.removeCompletionForDate(params.id, completedOnDate);
    return NextResponse.json({ success: true, removed });
  } catch (error: any) {
    if (error.message?.includes('Invalid origin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to remove completion', details: error.message },
      { status: 500 }
    );
  }
}

