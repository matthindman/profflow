import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as data from '@/lib/data';
import { requireValidOrigin } from '@/lib/middleware/security';
import { TimeStringSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateIntentionRequestSchema = z.object({
  taskId: z.string().uuid().optional().nullable(),
  cue: z.object({
    type: z.enum(['time', 'location', 'activity', 'event']),
    description: z.string().min(1, 'Cue description is required'),
    timeAnchor: TimeStringSchema.optional().nullable(),
  }),
  action: z.string().min(1, 'Action is required'),
  duration: z.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional(),
  isCopingPlan: z.boolean().optional(),
});

export async function GET() {
  try {
    const intentions = await data.getIntentions();
    return NextResponse.json({ intentions });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch intentions', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    requireValidOrigin(req);
    const body = await req.json();
    const validated = CreateIntentionRequestSchema.parse(body);

    // Check active intention limit (recommend max 3)
    const activeIntentions = await data.getActiveIntentions();
    const willBeActive = validated.isActive !== false;

    if (willBeActive && activeIntentions.length >= 3) {
      return NextResponse.json(
        {
          error: 'Active intention limit reached',
          details: 'Research recommends a maximum of 3 active intentions. Please deactivate one first or create this intention as inactive.',
          activeCount: activeIntentions.length,
        },
        { status: 400 }
      );
    }

    // Validate taskId exists if provided
    if (validated.taskId) {
      const tasks = await data.getTasks();
      const taskExists = tasks.some((t) => t.id === validated.taskId);
      if (!taskExists) {
        return NextResponse.json(
          { error: 'Task not found', details: `No task with ID ${validated.taskId}` },
          { status: 400 }
        );
      }
    }

    const intention = await data.createIntention({
      taskId: validated.taskId ?? null,
      cue: {
        type: validated.cue.type,
        description: validated.cue.description,
        timeAnchor: validated.cue.timeAnchor ?? null,
      },
      action: validated.action,
      duration: validated.duration ?? null,
      isActive: validated.isActive ?? true,
      isCopingPlan: validated.isCopingPlan ?? false,
    });

    return NextResponse.json(intention, { status: 201 });
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
      { error: 'Failed to create intention', details: error.message },
      { status: 500 }
    );
  }
}
