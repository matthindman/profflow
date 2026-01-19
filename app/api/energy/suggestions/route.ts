import { NextRequest, NextResponse } from 'next/server';
import * as data from '@/lib/data';
import { getLocalDateString, getLocalTimeString } from '@/lib/utils/date';
import { EnergySuggestion, MoodType, BreakActivityType } from '@/types/data';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Generate AI-like suggestions based on energy data patterns
function generateSuggestions(
  energyState: Awaited<ReturnType<typeof data.getCurrentEnergyState>>,
  dailyPattern: Awaited<ReturnType<typeof data.getDailyEnergyPattern>>,
  weeklyPattern: Awaited<ReturnType<typeof data.getWeeklyEnergyPattern>> | null
): EnergySuggestion[] {
  const suggestions: EnergySuggestion[] = [];
  const now = new Date();
  const currentHour = now.getHours();
  const currentTime = getLocalTimeString(now);

  // Check-in reminder
  if (!energyState.checkIn) {
    suggestions.push({
      id: crypto.randomUUID(),
      type: 'energy_tip',
      priority: 'high',
      title: 'Morning Energy Check-in',
      description: 'Start your day with a quick energy assessment to track your patterns and optimize your schedule.',
      actionable: true,
      createdAt: now.toISOString(),
    });
  }

  // Work block suggestions
  if (energyState.activeWorkBlock) {
    const [startH, startM] = energyState.activeWorkBlock.startTime.split(':').map(Number);
    const elapsedMinutes = (currentHour * 60 + now.getMinutes()) - (startH * 60 + startM);
    const plannedDuration = energyState.activeWorkBlock.plannedDurationMinutes;

    // Ultradian rhythm reminder - suggest break after 90+ minutes
    if (elapsedMinutes >= plannedDuration) {
      suggestions.push({
        id: crypto.randomUUID(),
        type: 'break_reminder',
        priority: 'high',
        title: 'Time for a Break',
        description: `You've been focused for ${elapsedMinutes} minutes. Take a 15-20 minute break to maintain peak performance during your next work block.`,
        actionable: true,
        createdAt: now.toISOString(),
      });
    } else if (elapsedMinutes >= plannedDuration - 15 && elapsedMinutes < plannedDuration) {
      suggestions.push({
        id: crypto.randomUUID(),
        type: 'break_reminder',
        priority: 'medium',
        title: 'Break Coming Up',
        description: `You have ${plannedDuration - elapsedMinutes} minutes left in this work block. Start wrapping up your current task.`,
        actionable: false,
        createdAt: now.toISOString(),
      });
    }
  } else if (energyState.activeBreak) {
    const [startH, startM] = energyState.activeBreak.startTime.split(':').map(Number);
    const elapsedMinutes = (currentHour * 60 + now.getMinutes()) - (startH * 60 + startM);

    // Encourage returning to work after sufficient break
    if (elapsedMinutes >= 20) {
      suggestions.push({
        id: crypto.randomUUID(),
        type: 'break_reminder',
        priority: 'medium',
        title: 'Ready to Refocus?',
        description: `You've had a ${elapsedMinutes}-minute break. If you feel restored, consider starting your next focus block.`,
        actionable: true,
        createdAt: now.toISOString(),
      });
    }
  } else {
    // No active work block or break
    const todayCompletedBlocks = energyState.todayWorkBlocks.filter(b => b.endTime !== null);
    const totalFocusToday = todayCompletedBlocks.reduce((sum, b) => sum + (b.actualDurationMinutes ?? 0), 0);

    if (totalFocusToday < 240 && currentHour >= 9 && currentHour < 18) {
      suggestions.push({
        id: crypto.randomUUID(),
        type: 'energy_tip',
        priority: 'low',
        title: 'Start a Focus Block',
        description: `You've logged ${Math.round(totalFocusToday / 60)} hours of focus time today. Start a work block to track your productivity.`,
        actionable: true,
        createdAt: now.toISOString(),
      });
    }
  }

  // Pattern-based suggestions
  if (weeklyPattern) {
    // Optimal work time suggestion
    if (weeklyPattern.optimalWorkTime && !energyState.activeWorkBlock) {
      const [optimalH] = weeklyPattern.optimalWorkTime.split(':').map(Number);
      if (currentHour >= optimalH && currentHour < optimalH + 2) {
        suggestions.push({
          id: crypto.randomUUID(),
          type: 'pattern_insight',
          priority: 'medium',
          title: 'Peak Performance Window',
          description: `Based on your patterns, you tend to be most focused around ${weeklyPattern.optimalWorkTime}. This is a great time for deep work!`,
          actionable: true,
          createdAt: now.toISOString(),
        });
      }
    }

    // Best restorative activities suggestion
    if (weeklyPattern.bestRestorativeActivities.length > 0 && energyState.activeBreak) {
      const activities = weeklyPattern.bestRestorativeActivities.slice(0, 2);
      const activityLabels = activities.map(formatActivityLabel).join(' or ');

      suggestions.push({
        id: crypto.randomUUID(),
        type: 'pattern_insight',
        priority: 'low',
        title: 'Restorative Activities',
        description: `Your data shows ${activityLabels} help you feel most refreshed. Consider trying one during this break.`,
        actionable: false,
        createdAt: now.toISOString(),
      });
    }

    // Energy trend insight
    if (weeklyPattern.averageEnergy !== null) {
      const todayEnergy = energyState.checkIn?.energyLevel;
      if (todayEnergy && todayEnergy < weeklyPattern.averageEnergy - 1) {
        suggestions.push({
          id: crypto.randomUUID(),
          type: 'schedule_adjustment',
          priority: 'medium',
          title: 'Lower Energy Day',
          description: `Your energy today is below your weekly average (${todayEnergy} vs ${weeklyPattern.averageEnergy.toFixed(1)}). Consider lighter tasks or an extra break.`,
          actionable: true,
          createdAt: now.toISOString(),
        });
      } else if (todayEnergy && todayEnergy > weeklyPattern.averageEnergy + 1) {
        suggestions.push({
          id: crypto.randomUUID(),
          type: 'pattern_insight',
          priority: 'low',
          title: 'High Energy Day',
          description: `Your energy is above average today! Great time to tackle challenging deep work.`,
          actionable: false,
          createdAt: now.toISOString(),
        });
      }
    }
  }

  // Mood-based suggestions
  if (energyState.checkIn) {
    const mood = energyState.checkIn.mood;
    if (mood === 'stressed' || mood === 'tired') {
      suggestions.push({
        id: crypto.randomUUID(),
        type: 'energy_tip',
        priority: 'medium',
        title: mood === 'stressed' ? 'Managing Stress' : 'Combating Fatigue',
        description: mood === 'stressed'
          ? 'Consider shorter work blocks (60-75 min) with meditation or walking breaks today.'
          : 'Try a brief walk or stretch to boost alertness. Keep caffeine moderate.',
        actionable: true,
        createdAt: now.toISOString(),
      });
    }
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions.slice(0, 5); // Return top 5 suggestions
}

function formatActivityLabel(activity: BreakActivityType): string {
  const labels: Record<BreakActivityType, string> = {
    walk: 'walking',
    stretch: 'stretching',
    meditation: 'meditation',
    snack: 'healthy snacks',
    social: 'social breaks',
    phone: 'phone breaks',
    nap: 'power naps',
    fresh_air: 'fresh air',
    other: 'various activities',
  };
  return labels[activity];
}

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return getLocalDateString(d);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || getLocalDateString();

    const [energyState, dailyPattern] = await Promise.all([
      data.getCurrentEnergyState(date),
      data.getDailyEnergyPattern(date),
    ]);

    // Get weekly pattern for more context
    let weeklyPattern = null;
    try {
      const weekStart = getMondayOfWeek(new Date(date));
      weeklyPattern = await data.getWeeklyEnergyPattern(weekStart);
    } catch {
      // Ignore errors fetching weekly pattern
    }

    const suggestions = generateSuggestions(energyState, dailyPattern, weeklyPattern);

    return NextResponse.json({ suggestions });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to generate suggestions', details: error.message },
      { status: 500 }
    );
  }
}
