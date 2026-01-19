import { NextRequest, NextResponse } from 'next/server';
import * as data from '@/lib/data';
import { TaskCategory } from '@/types/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST add a Big Three item
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { reviewId, title, category, linkedTaskId } = body;

    if (!reviewId || !title || !category) {
      return NextResponse.json(
        { error: 'Missing required fields: reviewId, title, category' },
        { status: 400 }
      );
    }

    const validCategories: TaskCategory[] = ['research', 'teaching_service', 'family', 'health'];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: 'Invalid category', validCategories },
        { status: 400 }
      );
    }

    const review = await data.addBigThreeItem(reviewId, {
      title,
      category,
      linkedTaskId: linkedTaskId ?? null,
    });

    if (!review) {
      return NextResponse.json(
        { error: 'Review not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ review });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to add Big Three item', details: error.message },
      { status: 500 }
    );
  }
}

// PATCH toggle a Big Three item completion status
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { reviewId, itemId, completed } = body;

    if (!reviewId || !itemId || completed === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: reviewId, itemId, completed' },
        { status: 400 }
      );
    }

    const review = await data.toggleBigThreeItem(reviewId, itemId, completed);

    if (!review) {
      return NextResponse.json(
        { error: 'Review not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ review });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to toggle Big Three item', details: error.message },
      { status: 500 }
    );
  }
}
