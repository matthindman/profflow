import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as data from '@/lib/data';
import { requireValidOrigin } from '@/lib/middleware/security';
import { getLocalDateString } from '@/lib/utils/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateTaskRequestSchema = z
  .object({
    title: z.string().min(1),
    notes: z.string().optional(),
    category: z.enum(['research', 'teaching_service', 'family', 'health']).optional(),
    dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dueTime: z.string().regex(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/).optional(),
    location: z.string().optional(),
    recurrenceRule: z.enum(['daily']).optional(),
  })
  .refine((payload) => {
    if (payload.dueTime && !payload.dueOn) return false;
    return true;
  }, 'dueTime requires dueOn to be set');

export async function GET() {
  try {
    const tasks = await data.getTasksWithCompletions(getLocalDateString());
    return NextResponse.json({ tasks });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch tasks', details: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    requireValidOrigin(req);
    const body = await req.json();
    const validated = CreateTaskRequestSchema.parse(body);
    const category = validated.category || (await data.getDefaultCategory());
    const task = await data.createTask({
      title: validated.title,
      notes: validated.notes || null,
      category,
      status: 'active',
      dueOn: validated.dueOn || null,
      dueTime: validated.dueTime || null,
      location: validated.location || null,
      recurrenceRule: validated.recurrenceRule || null,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error: any) {
    if (error.message?.includes('Invalid origin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create task', details: error.message }, { status: 500 });
  }
}
