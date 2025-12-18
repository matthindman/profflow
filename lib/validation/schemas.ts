import { z } from 'zod';

export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

export const TimeStringSchema = z
  .string()
  .regex(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/, 'Must be HH:MM (24-hour)');

export const UUIDSchema = z.string().uuid();

export const TaskSchemaV2 = z
  .object({
    id: UUIDSchema,
    title: z.string().min(1),
    notes: z.string().nullable(),
    category: z.enum(['research', 'teaching_service', 'family', 'health']),
    status: z.enum(['active', 'done', 'archived']),
    dueOn: DateStringSchema.nullable(),
    dueTime: TimeStringSchema.nullable(),
    location: z.string().nullable(),
    recurrenceRule: z.enum(['daily']).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .refine((data) => {
    if (data.recurrenceRule && data.status === 'done') return false;
    return true;
  }, 'Recurring tasks cannot have status "done"')
  .refine((data) => {
    if (data.dueTime && !data.dueOn) return false;
    return true;
  }, 'dueTime requires dueOn to be set');

export const TasksFileSchemaV2 = z.object({
  version: z.literal(2),
  tasks: z.array(TaskSchemaV2),
});

export const ScheduleBlockSchema = z
  .object({
    start: TimeStringSchema,
    end: TimeStringSchema,
    label: z.string(),
    taskId: UUIDSchema.nullable(),
    type: z.enum(['deep_work', 'shallow_work', 'meeting', 'break', 'life']),
  })
  .refine((data) => {
    const [startH, startM] = data.start.split(':').map(Number);
    const [endH, endM] = data.end.split(':').map(Number);
    return endH * 60 + endM > startH * 60 + startM;
  }, 'end time must be after start time');

export const NextActionSchema = z.object({
  action: z.string(),
  taskId: UUIDSchema.nullable(),
});

export const PlanSchemaV2 = z.object({
  id: UUIDSchema,
  planDate: DateStringSchema,
  rankedTaskIds: z.array(UUIDSchema),
  nextActions: z.array(NextActionSchema),
  scheduleBlocks: z.array(ScheduleBlockSchema),
  assumptions: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PlansFileSchemaV2 = z.object({
  version: z.literal(2),
  plans: z.record(DateStringSchema, PlanSchemaV2),
});

export const ProposedOperationSchema = z.object({
  op: z.enum([
    'create_task',
    'update_task',
    'complete_task',
    'delete_task',
    'complete_habit',
    'create_plan',
    'update_plan',
  ]),
  description: z.string().min(1),
  data: z.record(z.any()),
});

export const OperationResultSchema = z.object({
  op: z.string(),
  description: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
  entityId: z.string().optional(),
});

export const MessageSchemaV2 = z.object({
  id: UUIDSchema,
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  proposedOperations: z.array(ProposedOperationSchema).nullable(),
  executionSucceeded: z.boolean(),
  executionStatus: z.enum(['pending', 'executing', 'executed']),
  executedAt: z.string().nullable(),
  executionResults: z.array(OperationResultSchema).nullable(),
  createdAt: z.string(),
  targetDate: DateStringSchema.nullable(),
});

export const MessagesFileSchemaV2 = z.object({
  version: z.literal(2),
  messages: z.array(MessageSchemaV2),
});

export const TaskCompletionSchema = z.object({
  id: UUIDSchema,
  taskId: UUIDSchema,
  completedAt: z.string(),
  completedOnDate: DateStringSchema,
  notes: z.string().nullable(),
});

export const CompletionsFileSchemaV2 = z.object({
  version: z.literal(2),
  completions: z.array(TaskCompletionSchema),
});

export const SettingsSchemaV2 = z.object({
  version: z.literal(2),
  userName: z.string(),
  defaultCategory: z.enum(['research', 'teaching_service', 'family', 'health']),
  theme: z.enum(['light', 'dark', 'system']),
  customPromptAddendum: z.string().nullable(),
  contextCutoffMessageId: UUIDSchema.nullable(),
});

export const LearningSchema = z.object({
  id: UUIDSchema,
  content: z.string(),
  createdAt: z.string(),
});

export const LearningsFileSchemaV2 = z.object({
  version: z.literal(2),
  learnings: z.array(LearningSchema),
});

export const FILE_SCHEMAS: Record<
  string,
  { current: number; schemas: Record<number, z.ZodSchema> }
> = {
  'tasks.json': {
    current: 2,
    schemas: { 2: TasksFileSchemaV2 },
  },
  'plans.json': {
    current: 2,
    schemas: { 2: PlansFileSchemaV2 },
  },
  'messages.json': {
    current: 2,
    schemas: { 2: MessagesFileSchemaV2 },
  },
  'completions.json': {
    current: 2,
    schemas: { 2: CompletionsFileSchemaV2 },
  },
  'settings.json': {
    current: 2,
    schemas: { 2: SettingsSchemaV2 },
  },
  'learnings.json': {
    current: 2,
    schemas: { 2: LearningsFileSchemaV2 },
  },
};
