import { NextResponse } from 'next/server';
import * as data from '@/lib/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const audit = await data.getIntentionsAudit();

    // Calculate summary statistics
    const activeIntentions = audit.filter((a) => a.intention.isActive);
    const needsReviewCount = audit.filter((a) => a.needsReview).length;
    const totalTriggers = audit.reduce((sum, a) => sum + a.totalTriggers, 0);
    const totalSuccesses = audit.reduce((sum, a) => sum + a.intention.successCount, 0);
    const overallSuccessRate = totalTriggers > 0 ? totalSuccesses / totalTriggers : 0;

    // Generate weekly insights
    const insights: string[] = [];

    if (activeIntentions.length === 0) {
      insights.push("You don't have any active intentions. Consider creating 1-3 if-then plans for your most important tasks.");
    } else if (activeIntentions.length > 3) {
      insights.push(`You have ${activeIntentions.length} active intentions. Research suggests limiting to 2-3 for maximum effectiveness.`);
    }

    if (needsReviewCount > 0) {
      insights.push(`${needsReviewCount} intention(s) have low success rates and may need adjustment.`);
    }

    if (totalTriggers >= 7 && overallSuccessRate >= 0.7) {
      insights.push("Your intentions are working well! Keep it up.");
    }

    const copingPlans = audit.filter((a) => a.intention.isCopingPlan);
    if (copingPlans.length === 0 && totalTriggers > 0) {
      insights.push("Consider adding coping plans (if-then plans for obstacles) to handle common blockers.");
    }

    return NextResponse.json({
      audit,
      summary: {
        totalIntentions: audit.length,
        activeIntentions: activeIntentions.length,
        needsReviewCount,
        totalTriggers,
        overallSuccessRate: Math.round(overallSuccessRate * 100),
      },
      insights,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to generate audit', details: error.message },
      { status: 500 }
    );
  }
}
