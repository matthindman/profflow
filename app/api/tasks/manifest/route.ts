import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as data from '@/lib/data';
import { requireValidOrigin } from '@/lib/middleware/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ManifestUpdateSchema = z
  .object({
    orderByCategory: z
      .object({
        research: z.array(z.string()),
        teaching_service: z.array(z.string()),
        family: z.array(z.string()),
        health: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export async function PATCH(req: NextRequest) {
  try {
    requireValidOrigin(req);
    const body = await req.json();
    const validated = ManifestUpdateSchema.parse(body);

    const orderByCategory = validated.orderByCategory;
    const orderedIds = [
      ...orderByCategory.research,
      ...orderByCategory.teaching_service,
      ...orderByCategory.family,
      ...orderByCategory.health,
    ];

    const uniqueIds = new Set(orderedIds);
    if (uniqueIds.size !== orderedIds.length) {
      return NextResponse.json({ error: 'Duplicate task IDs in manifest order' }, { status: 400 });
    }

    const tasks = await data.getTasks();
    const taskById = new Map(tasks.map((task) => [task.id, task]));

    const unknownIds = orderedIds.filter((id) => !taskById.has(id));
    if (unknownIds.length > 0) {
      return NextResponse.json(
        { error: 'Unknown task IDs in manifest order', details: unknownIds },
        { status: 400 }
      );
    }

    const nonActiveIds = orderedIds.filter((id) => taskById.get(id)?.status !== 'active');
    if (nonActiveIds.length > 0) {
      return NextResponse.json(
        { error: 'Manifest can only order active tasks', details: nonActiveIds },
        { status: 400 }
      );
    }

    const tasksAfter = await data.updateTaskManifest(orderByCategory);
    return NextResponse.json({ success: true, tasks: tasksAfter });
  } catch (error: any) {
    if (error.message?.includes('Invalid origin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to update manifest', details: error.message },
      { status: 500 }
    );
  }
}

