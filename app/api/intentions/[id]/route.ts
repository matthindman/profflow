import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as data from '@/lib/data';
import { requireValidOrigin } from '@/lib/middleware/security';
import { TimeStringSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UpdateIntentionRequestSchema = z.object({
  taskId: z.string().uuid().optional().nullable(),
  cue: z
    .object({
      type: z.enum(['time', 'location', 'activity', 'event']),
      description: z.string().min(1),
      timeAnchor: TimeStringSchema.optional().nullable(),
    })
    .optional(),
  action: z.string().min(1).optional(),
  duration: z.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional(),
  isCopingPlan: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const intention = await data.getIntentionById(params.id);
    if (!intention) {
      return NextResponse.json({ error: 'Intention not found' }, { status: 404 });
    }
    return NextResponse.json({ intention });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch intention', details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    requireValidOrigin(req);
    const body = await req.json();
    const validated = UpdateIntentionRequestSchema.parse(body);

    // Check if intention exists
    const existing = await data.getIntentionById(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Intention not found' }, { status: 404 });
    }

    // Check active intention limit if activating
    if (validated.isActive === true && !existing.isActive) {
      const activeIntentions = await data.getActiveIntentions();
      if (activeIntentions.length >= 3) {
        return NextResponse.json(
          {
            error: 'Active intention limit reached',
            details: 'Research recommends a maximum of 3 active intentions. Please deactivate one first.',
            activeCount: activeIntentions.length,
          },
          { status: 400 }
        );
      }
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

    const updates: data.UpdateIntentionInput = {};
    if (validated.taskId !== undefined) updates.taskId = validated.taskId;
    if (validated.cue !== undefined) {
      updates.cue = {
        type: validated.cue.type,
        description: validated.cue.description,
        timeAnchor: validated.cue.timeAnchor ?? null,
      };
    }
    if (validated.action !== undefined) updates.action = validated.action;
    if (validated.duration !== undefined) updates.duration = validated.duration;
    if (validated.isActive !== undefined) updates.isActive = validated.isActive;
    if (validated.isCopingPlan !== undefined) updates.isCopingPlan = validated.isCopingPlan;

    const updated = await data.updateIntention(params.id, updates);
    if (!updated) {
      return NextResponse.json({ error: 'Intention not found' }, { status: 404 });
    }

    return NextResponse.json({ intention: updated });
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
      { error: 'Failed to update intention', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    requireValidOrigin(req);

    const deleted = await data.deleteIntention(params.id);
    if (!deleted) {
      return NextResponse.json({ error: 'Intention not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message?.includes('Invalid origin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Failed to delete intention', details: error.message },
      { status: 500 }
    );
  }
}
