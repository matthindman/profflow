import { z } from 'zod';
import type { TaskCategory } from '@/types/data';

const TASK_CATEGORIES: TaskCategory[] = ['research', 'teaching_service', 'family', 'health'];

type ScheduleBlockType = 'deep_work' | 'shallow_work' | 'meeting' | 'break' | 'life';

const SCHEDULE_BLOCK_TYPES: ScheduleBlockType[] = [
  'deep_work',
  'shallow_work',
  'meeting',
  'break',
  'life',
];

const sanitizeCategory = (value?: string | null): TaskCategory => {
  if (!value) return 'research';
  const normalized = value.trim().toLowerCase();
  const alias: Record<string, TaskCategory> = {
    admin: 'teaching_service',
    administrative: 'teaching_service',
    personal: 'family',
  };
  const mapped = alias[normalized];
  if (mapped) return mapped;
  return TASK_CATEGORIES.includes(normalized as TaskCategory)
    ? (normalized as TaskCategory)
    : 'research';
};

const TaskCategorySchema = z
  .string()
  .transform((value): TaskCategory => sanitizeCategory(value));

const sanitizeScheduleBlockType = (value?: string | null): ScheduleBlockType => {
  if (!value) return 'life';
  const normalized = value.trim().toLowerCase();
  if (SCHEDULE_BLOCK_TYPES.includes(normalized as ScheduleBlockType)) {
    return normalized as ScheduleBlockType;
  }
  const alias: Record<string, ScheduleBlockType> = {
    admin: 'shallow_work',
    administrative: 'shallow_work',
    personal: 'life',
    planning: 'shallow_work',
  };
  return alias[normalized] ?? 'life';
};

const ScheduleBlockTypeSchema = z
  .string()
  .transform((value): ScheduleBlockType => sanitizeScheduleBlockType(value));

const CreateTaskDataSchema = z
  .object({
    tempId: z.string().optional(),
    title: z.string().min(1),
    category: TaskCategorySchema,
    notes: z.string().optional().nullable(),
    dueOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    dueTime: z
      .string()
      .regex(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/)
      .optional()
      .nullable(),
    location: z.string().optional().nullable(),
    recurrenceRule: z.enum(['daily']).optional().nullable(),
  })
  .refine((data) => !(data.dueTime && !data.dueOn), {
    message: 'dueTime requires dueOn',
  });

const TaskIdOrTempIdSchema = z.string().min(1);

const UpdateTaskDataSchema = z.object({
  id: TaskIdOrTempIdSchema,
  title: z.string().min(1).optional(),
  category: TaskCategorySchema.optional(),
  notes: z.string().nullable().optional(),
  dueOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  dueTime: z
    .string()
    .regex(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/)
    .nullable()
    .optional(),
  location: z.string().nullable().optional(),
  status: z.enum(['active', 'done', 'archived']).optional(),
  recurrenceRule: z.enum(['daily']).nullable().optional(),
});

const CompleteTaskDataSchema = z.object({
  id: TaskIdOrTempIdSchema,
  notes: z.string().optional(),
});

const CompleteHabitDataSchema = z.object({
  id: TaskIdOrTempIdSchema,
  notes: z.string().optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const DeleteTaskDataSchema = z.object({
  id: TaskIdOrTempIdSchema,
});

const PlanDataSchema = z.object({
  rankedTaskIds: z.array(TaskIdOrTempIdSchema).optional(),
  nextActions: z
    .array(
      z.object({
        action: z.string(),
        taskId: TaskIdOrTempIdSchema.nullable(),
      })
    )
    .optional(),
  scheduleBlocks: z
    .array(
      z.object({
        start: z.string().regex(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/),
        end: z.string().regex(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/),
        label: z.string(),
        taskId: TaskIdOrTempIdSchema.nullable(),
        type: ScheduleBlockTypeSchema,
      })
    )
    .optional(),
  assumptions: z.array(z.string()).optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const ProposedOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('create_task'),
    description: z.string().min(1),
    data: CreateTaskDataSchema,
  }),
  z.object({
    op: z.literal('update_task'),
    description: z.string().min(1),
    data: UpdateTaskDataSchema,
  }),
  z.object({
    op: z.literal('complete_task'),
    description: z.string().min(1),
    data: CompleteTaskDataSchema,
  }),
  z.object({
    op: z.literal('complete_habit'),
    description: z.string().min(1),
    data: CompleteHabitDataSchema,
  }),
  z.object({
    op: z.literal('delete_task'),
    description: z.string().min(1),
    data: DeleteTaskDataSchema,
  }),
  z.object({
    op: z.literal('create_plan'),
    description: z.string().min(1),
    data: PlanDataSchema,
  }),
  z.object({
    op: z.literal('update_plan'),
    description: z.string().min(1),
    data: PlanDataSchema,
  }),
]);

export const LLMResponseSchema = z.object({
  reasoning: z.string(),
  proposedOperations: z.array(ProposedOperationSchema).default([]),
  questions: z.array(z.string()).optional(),
});

export type LLMResponse = z.infer<typeof LLMResponseSchema>;

export function parseLLMResponse(text: string): LLMResponse {
  const rawResponse = text;
  const jsonMatch = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/i);
  let jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
  if (!jsonMatch) {
    const extracted = extractFirstJsonObject(text);
    if (extracted) {
      jsonStr = extracted;
    }
  }
  jsonStr = cleanJsonString(jsonStr);

  const parseAttempt = (() => {
    try {
      return { ok: true as const, value: JSON.parse(jsonStr) };
    } catch (error) {
      const repaired = escapeNewlinesInJsonStrings(jsonStr);
      if (repaired !== jsonStr) {
        try {
          return { ok: true as const, value: JSON.parse(repaired) };
        } catch (repairedError) {
          return { ok: false as const, error: repairedError };
        }
      }
      return { ok: false as const, error };
    }
  })();

  try {
    if (!parseAttempt.ok) {
      throw parseAttempt.error;
    }
    const parsed = parseAttempt.value as any;
    const validated = LLMResponseSchema.safeParse(parsed);
    if (validated.success) {
      return validated.data;
    }
    console.warn('LLM response validation failed:', validated.error);
    console.warn('Raw response:', rawResponse);
    const reasoning =
      typeof parsed?.reasoning === 'string' && parsed.reasoning.trim()
        ? parsed.reasoning
        : text;

    const proposedOperationsRaw = Array.isArray(parsed?.proposedOperations)
      ? parsed.proposedOperations
      : [];
    const proposedOperations = proposedOperationsRaw
      .map((operation: unknown, index: number) => {
        const opResult = ProposedOperationSchema.safeParse(operation);
        if (!opResult.success) {
          console.warn(`Dropping invalid proposedOperations[${index}]`, opResult.error);
          return null;
        }
        return opResult.data;
      })
      .filter(
        (
          operation: z.infer<typeof ProposedOperationSchema> | null
        ): operation is z.infer<typeof ProposedOperationSchema> => operation !== null
      );

    return {
      reasoning: String(reasoning),
      proposedOperations,
      questions: parsed?.questions,
    };
  } catch (parseError) {
    console.warn('Failed to parse LLM JSON:', parseError);
    return {
      reasoning: text,
      proposedOperations: [],
    };
  }
}

function escapeNewlinesInJsonStrings(input: string): string {
  let inString = false;
  let escapeNext = false;
  let output = '';

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (escapeNext) {
      output += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      output += char;
      if (inString) escapeNext = true;
      continue;
    }

    if (char === '"') {
      output += char;
      inString = !inString;
      continue;
    }

    if (inString && char === '\n') {
      output += '\\n';
      continue;
    }

    if (inString && char === '\r') {
      output += '\\r';
      continue;
    }

    if (inString && char === '\u2028') {
      output += '\\u2028';
      continue;
    }

    if (inString && char === '\u2029') {
      output += '\\u2029';
      continue;
    }

    output += char;
  }

  return output;
}

function extractFirstJsonObject(text: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.substring(start, i + 1);
      }
    }
  }
  return null;
}

function cleanJsonString(str: string): string {
  return str
    .replace(/,\s*([\}\]])/g, '$1')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}
