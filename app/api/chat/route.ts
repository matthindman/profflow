import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { GeminiProvider } from '@/lib/llm/gemini';
import * as data from '@/lib/data';
import { getSystemPrompt } from '@/lib/prompts';
import { getLocalDateString, getLocalTimeString, getWeekdayName } from '@/lib/utils/date';
import { getLLMConfig } from '@/lib/config';
import { requireValidOrigin } from '@/lib/middleware/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ChatRequestSchema = z.object({
  message: z.string().min(1),
  calendarText: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    requireValidOrigin(req);
    const body = await req.json();
    const validated = ChatRequestSchema.parse(body);
    const { message, calendarText } = validated;

    const now = new Date();
    const dateStr = getLocalDateString(now);
    const timeStr = getLocalTimeString(now);
    const weekday = getWeekdayName(now);

    const [tasks, todaysPlan, settings] = await Promise.all([
      data.getTasksWithCompletions(dateStr),
      data.getPlanForDate(dateStr),
      data.getSettings(),
    ]);

    const recentMessages = await data.getRecentMessages(5, settings.contextCutoffMessageId);
    const learnings = await data.getLearnings();

    let fullUserContent = message;
    if (calendarText) {
      fullUserContent += `\n\n[Calendar Events for Context]:\n${calendarText}`;
    }

    const config = getLLMConfig();
    const llm = new GeminiProvider(config.apiKey);
    const systemPrompt = await getSystemPrompt(settings);

    const response = await llm.chat({
      systemPrompt,
      messages: [
        ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: fullUserContent },
      ],
      state: { tasks, todaysPlan },
      learnings,
      localDate: dateStr,
      localTime: timeStr,
      weekday,
    });

    await data.addMessage(
      {
        role: 'user',
        content: fullUserContent,
        proposedOperations: null,
        executionSucceeded: true,
      },
      null
    );

    const assistantMessage = await data.addMessage(
      {
        role: 'assistant',
        content: response.reasoning,
        proposedOperations: response.proposedOperations,
        executionSucceeded: false,
      },
      dateStr
    );

    return NextResponse.json({
      messageId: assistantMessage.id,
      reasoning: response.reasoning,
      proposedOperations: response.proposedOperations,
      questions: response.questions,
    });
  } catch (error: any) {
    console.error('Chat API error:', error);
    if (error.message?.includes('Invalid origin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to process message', details: error.message }, { status: 500 });
  }
}
