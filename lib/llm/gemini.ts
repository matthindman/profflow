import { Plan, TaskWithCompletion } from '@/types/data';
import { parseLLMResponse, LLMResponse } from '@/lib/llm/parse';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  systemPrompt: string;
  messages: ChatMessage[];
  state: {
    tasks: TaskWithCompletion[];
    todaysPlan: Plan | null;
  };
  learnings: string[];
  localDate: string;
  localTime: string;
  weekday: string;
}

interface ContentPart {
  text: string;
}

interface GeminiContent {
  role: string;
  parts: ContentPart[];
}

export class GeminiProvider {
  constructor(private readonly apiKey: string | undefined) {}

  async chat(request: ChatRequest): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const prompt = fillPromptTemplate(request.systemPrompt, {
      localDate: request.localDate,
      localTime: request.localTime,
      weekday: request.weekday,
    });

    const contextBlock = JSON.stringify(
      {
        tasks: request.state.tasks,
        todaysPlan: request.state.todaysPlan,
        learnings: request.learnings,
        localDate: request.localDate,
        localTime: request.localTime,
        weekday: request.weekday,
      },
      null,
      2
    );

    const contents: GeminiContent[] = [
      buildContent('user', `${prompt}\n\n[Structured context]\n${contextBlock}`),
      ...request.messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contents }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${body}`);
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part: ContentPart) => part.text)
      .join('\n');

    if (!text) {
      return { reasoning: 'No response from Gemini', proposedOperations: [] };
    }

    return parseLLMResponse(text);
  }
}

function fillPromptTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((acc, [key, value]) => {
    return acc.replaceAll(`{{${key}}}`, value);
  }, template);
}

function buildContent(role: string, text: string): GeminiContent {
  return {
    role,
    parts: [{ text }],
  };
}
