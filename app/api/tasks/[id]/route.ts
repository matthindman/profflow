import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as data from '@/lib/data';
import { requireValidOrigin } from '@/lib/middleware/security';
import { getLocalDateString } from '@/lib/utils/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchTaskRequestSchema = z
  .object({
    status: z.enum(['active', 'done', 'archived']).optional(),
    category: z.enum(['research', 'teaching_service', 'family', 'health']).optional(),
  })
  .strict();

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireValidOrigin(req);
    const body = await req.json();
    const validated = PatchTaskRequestSchema.parse(body);

    if (!validated.status && !validated.category) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const taskId = params.id;
    const tasks = await data.getTasks();
    const existing = tasks.find((task) => task.id === taskId);
    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (validated.status === 'done' && existing.recurrenceRule) {
      return NextResponse.json(
        { error: 'Cannot mark recurring task as done. Use complete-today.' },
        { status: 400 }
      );
    }

    const updated = await data.updateTask(taskId, validated);
    if (!updated) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const today = getLocalDateString();
    if (validated.status === 'done') {
      const alreadyCompleted = await data.hasCompletionForDate(taskId, today);
      if (!alreadyCompleted) {
        await data.recordCompletion(taskId, today);
      }
    }

    if (validated.status === 'active') {
      await data.removeCompletionForDate(taskId, today);
    }

    return NextResponse.json({ task: updated });
  } catch (error: any) {
    if (error.message?.includes('Invalid origin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update task', details: error.message }, { status: 500 });
  }
}

