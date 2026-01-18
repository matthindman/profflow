import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as data from '@/lib/data';
import { requireValidOrigin } from '@/lib/middleware/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TriggerIntentionRequestSchema = z.object({
  success: z.boolean(),
  context: z.string().optional(), // Optional note about what happened
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    requireValidOrigin(req);
    const body = await req.json();
    const validated = TriggerIntentionRequestSchema.parse(body);

    // Check if intention exists
    const existing = await data.getIntentionById(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Intention not found' }, { status: 404 });
    }

    const updated = await data.recordIntentionTrigger(params.id, validated.success);
    if (!updated) {
      return NextResponse.json({ error: 'Failed to record trigger' }, { status: 500 });
    }

    // Calculate success rate for feedback
    const totalTriggers = updated.successCount + updated.missCount;
    const successRate = totalTriggers > 0 ? updated.successCount / totalTriggers : 0;

    // Generate compassionate feedback
    let feedback: string;
    if (validated.success) {
      feedback = "Great job! You followed through on your intention.";
      if (totalTriggers >= 5 && successRate >= 0.8) {
        feedback += " This intention is becoming automatic!";
      }
    } else {
      feedback = "That's okay. What got in the way?";
      if (totalTriggers >= 3 && successRate < 0.5) {
        feedback = "This intention has been challenging. Consider adjusting the cue to be more specific, or making the action smaller.";
      }
    }

    return NextResponse.json({
      intention: updated,
      feedback,
      stats: {
        totalTriggers,
        successRate: Math.round(successRate * 100),
        successCount: updated.successCount,
        missCount: updated.missCount,
      },
    });
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
      { error: 'Failed to record trigger', details: error.message },
      { status: 500 }
    );
  }
}
