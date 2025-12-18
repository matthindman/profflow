import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as data from '@/lib/data';
import { requireValidOrigin } from '@/lib/middleware/security';
import { executeOperations } from '@/lib/executor';
import { getLocalDateString } from '@/lib/utils/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ConfirmRequestSchema = z.object({
  messageId: z.string().uuid(),
  acceptedOperationIndexes: z.array(z.number().int().nonnegative()).optional(),
});

export async function POST(req: NextRequest) {
  let messageId: string | null = null;
  let claimed = false;
  try {
    requireValidOrigin(req);
    const body = await req.json();
    const parsed = ConfirmRequestSchema.parse(body);
    messageId = parsed.messageId;
    const { acceptedOperationIndexes } = parsed;

    const validation = await data.validateMessageForExecution(messageId);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.reason }, { status: 400 });
    }

    const validatedMessage = validation.message!;
    const claim = await data.claimMessageExecution(messageId);
    if (!claim.canExecute) {
      if (claim.message?.executionStatus === 'executed') {
        return NextResponse.json({
          success: claim.message.executionSucceeded,
          results: claim.message.executionResults,
          message: 'Already executed (cached)',
        });
      }
      if (claim.message?.executionStatus === 'executing') {
        return NextResponse.json({ error: 'Execution in progress by another request' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Cannot execute this message' }, { status: 400 });
    }

    claimed = true;
    const storedOps = claim.storedOperations || [];
    let opsToExecute;
    if (acceptedOperationIndexes) {
      const seen = new Set<number>();
      const uniqueIndexes = acceptedOperationIndexes.filter((index) => {
        if (seen.has(index)) return false;
        seen.add(index);
        return index >= 0 && index < storedOps.length;
      });
      opsToExecute = uniqueIndexes.map((index) => storedOps[index]);
    } else {
      opsToExecute = storedOps;
    }

    if (opsToExecute.length === 0) {
      await data.markMessageExecuted(messageId, [], false);
      return NextResponse.json({ success: false, results: [], message: 'No operations executed (all rejected)' });
    }

    const messageRecord = claim.message || validatedMessage;
    const targetDate = messageRecord?.targetDate || getLocalDateString();
    const { results, allSucceeded } = await executeOperations(opsToExecute, targetDate);
    await data.markMessageExecuted(messageId, results, allSucceeded);

    return NextResponse.json({
      success: allSucceeded,
      results,
      message: allSucceeded ? 'All operations completed' : 'Some operations failed',
    });
  } catch (error: any) {
    console.error('Confirm error:', error);
    if (claimed && messageId) {
      try {
        await data.resetMessageExecution(messageId, error.message);
      } catch (resetError) {
        console.error('Failed to reset message execution:', resetError);
      }
    }
    if (error.message?.includes('Invalid origin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to execute operations', details: error.message }, { status: 500 });
  }
}
