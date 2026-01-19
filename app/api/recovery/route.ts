import { NextRequest, NextResponse } from 'next/server';
import * as data from '@/lib/data';

// Security: Only allow same-origin requests
function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin) return true; // Same-origin requests don't send Origin header
  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}

// GET /api/recovery - Get recovery state
export async function GET(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    const state = await data.getRecoveryState();

    // Update last active date on any app access
    await data.updateLastActiveDate();

    // Get compassion message if needed
    let compassionMessage = null;
    if (state.needsCompassionPrompt && state.promptType) {
      compassionMessage = data.getCompassionMessage(state.promptType, 'gentle');
    }

    return NextResponse.json({
      ...state,
      compassionMessage,
    });
  } catch (error) {
    console.error('Failed to get recovery state:', error);
    return NextResponse.json(
      { error: 'Failed to get recovery state' },
      { status: 500 }
    );
  }
}

// POST /api/recovery - Record a recovery event
export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { type, relatedId, context, copingPlanCreated, nextActionTaken, dismissed } = body;

    if (!type) {
      return NextResponse.json(
        { error: 'Missing required field: type' },
        { status: 400 }
      );
    }

    const event = await data.recordRecoveryEvent(type, {
      relatedId,
      context,
      copingPlanCreated,
      nextActionTaken,
      dismissed,
    });

    return NextResponse.json(event);
  } catch (error) {
    console.error('Failed to record recovery event:', error);
    return NextResponse.json(
      { error: 'Failed to record recovery event' },
      { status: 500 }
    );
  }
}
