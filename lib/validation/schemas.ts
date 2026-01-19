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

// Implementation Intentions schemas
export const IntentionCueSchema = z.object({
  type: z.enum(['time', 'location', 'activity', 'event']),
  description: z.string().min(1),
  timeAnchor: TimeStringSchema.nullable(),
});

export const ImplementationIntentionSchema = z.object({
  id: UUIDSchema,
  taskId: UUIDSchema.nullable(),
  cue: IntentionCueSchema,
  action: z.string().min(1),
  duration: z.number().int().positive().nullable(),
  isActive: z.boolean(),
  isCopingPlan: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastTriggeredAt: z.string().nullable(),
  successCount: z.number().int().min(0),
  missCount: z.number().int().min(0),
});

export const IntentionsFileSchemaV1 = z.object({
  version: z.literal(1),
  intentions: z.array(ImplementationIntentionSchema),
});

// ============================================
// Energy & Recovery Tracking Schemas
// ============================================

export const MoodTypeSchema = z.enum(['energized', 'calm', 'neutral', 'tired', 'stressed']);

export const EnergyCheckInSchema = z.object({
  id: UUIDSchema,
  date: DateStringSchema,
  energyLevel: z.number().int().min(1).max(10),
  mood: MoodTypeSchema,
  notes: z.string().nullable(),
  createdAt: z.string(),
});

export const WorkBlockSchema = z.object({
  id: UUIDSchema,
  date: DateStringSchema,
  startTime: TimeStringSchema,
  endTime: TimeStringSchema.nullable(),
  plannedDurationMinutes: z.number().int().min(1).max(240),
  actualDurationMinutes: z.number().int().min(0).nullable(),
  taskId: UUIDSchema.nullable(),
  focusRating: z.number().int().min(1).max(5).nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BreakActivityTypeSchema = z.enum([
  'walk',
  'stretch',
  'meditation',
  'snack',
  'social',
  'phone',
  'nap',
  'fresh_air',
  'other',
]);

export const BreakLogSchema = z.object({
  id: UUIDSchema,
  date: DateStringSchema,
  startTime: TimeStringSchema,
  endTime: TimeStringSchema.nullable(),
  durationMinutes: z.number().int().min(0).nullable(),
  activities: z.array(BreakActivityTypeSchema),
  restorativeScore: z.number().int().min(1).max(5).nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const EnergyFileSchemaV2 = z.object({
  version: z.literal(2),
  checkIns: z.array(EnergyCheckInSchema),
  workBlocks: z.array(WorkBlockSchema),
  breakLogs: z.array(BreakLogSchema),
});

// ============================================
// Weekly Review Ritual Schemas
// ============================================

export const ReviewStepTypeSchema = z.enum([
  'celebrate',
  'challenges',
  'learnings',
  'values',
  'big_three',
  'schedule',
]);

export const TaskCategorySchema = z.enum(['research', 'teaching_service', 'family', 'health']);

export const BigThreeItemSchema = z.object({
  id: UUIDSchema,
  title: z.string().min(1),
  category: TaskCategorySchema,
  linkedTaskId: UUIDSchema.nullable(),
  completed: z.boolean(),
});

export const WeeklyReviewMetricsSchema = z.object({
  tasksCompleted: z.number().int().min(0),
  focusBlocksCompleted: z.number().int().min(0),
  totalFocusMinutes: z.number().int().min(0),
  averageEnergy: z.number().min(1).max(10).nullable(),
  averageFocusRating: z.number().min(1).max(5).nullable(),
  habitsCompletedRate: z.number().min(0).max(100).nullable(),
});

export const WeeklyReviewSchema = z.object({
  id: UUIDSchema,
  weekStart: DateStringSchema,
  weekEnd: DateStringSchema,

  // Step 1: Celebrate
  wins: z.array(z.string()),
  progressRating: z.number().int().min(1).max(5).nullable(),

  // Step 2: Challenges
  challenges: z.array(z.string()),
  obstacles: z.array(z.string()),

  // Step 3: Learnings
  learnings: z.array(z.string()),
  insights: z.array(z.string()),

  // Step 4: Values check
  valuesAlignment: z.number().int().min(1).max(5).nullable(),
  valuesReflection: z.string().nullable(),

  // Step 5: Big Three
  bigThree: z.array(BigThreeItemSchema).max(3),

  // Step 6: Schedule confirmation
  scheduleConfirmed: z.boolean(),
  scheduledFocusBlocks: z.number().int().min(0).nullable(),
  capacityCheck: z.number().min(0).max(100).nullable(),

  // Metrics snapshot
  metrics: WeeklyReviewMetricsSchema,

  // Metadata
  status: z.enum(['in_progress', 'completed']),
  currentStep: ReviewStepTypeSchema,
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  durationMinutes: z.number().int().min(0).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const WeeklyReviewsFileSchemaV2 = z.object({
  version: z.literal(2),
  reviews: z.array(WeeklyReviewSchema),
});

// ============================================
// Self-Compassion & Recovery Schemas
// ============================================

export const RecoveryEventTypeSchema = z.enum([
  'missed_task',
  'missed_intention',
  'missed_day',
  'return_after_gap',
]);

export const CompassionStyleSchema = z.enum(['gentle', 'coach', 'minimal']);

export const RecoveryEventSchema = z.object({
  id: UUIDSchema,
  date: DateStringSchema,
  type: RecoveryEventTypeSchema,
  relatedId: UUIDSchema.nullable(),
  context: z.string().nullable(),
  copingPlanCreated: UUIDSchema.nullable(),
  nextActionTaken: z.string().nullable(),
  dismissed: z.boolean(),
  createdAt: z.string(),
});

export const CompassionSettingsSchema = z.object({
  enableCompassionPrompts: z.boolean(),
  missedDayThreshold: z.number().int().min(1).max(14),
  preferredStyle: CompassionStyleSchema,
});

export const RecoveryFileSchemaV1 = z.object({
  version: z.literal(1),
  events: z.array(RecoveryEventSchema),
  lastActiveDate: DateStringSchema.nullable(),
});

// ============================================
// Google Calendar Integration Schemas
// ============================================

export const CalendarAuthFileSchemaV1 = z.object({
  version: z.literal(1),
  connected: z.boolean(),
  accessToken: z.string().nullable(),
  refreshToken: z.string().nullable(),
  tokenExpiry: z.string().nullable(),
  email: z.string().email().nullable(),
  connectedAt: z.string().nullable(),
});

export const CalendarEventSchema = z.object({
  id: z.string(),
  summary: z.string(),
  description: z.string().nullable(),
  start: z.string(),
  end: z.string(),
  isAllDay: z.boolean(),
  source: z.enum(['google', 'profflow']),
  calendarId: z.string(),
});

export const CreateCalendarEventInputSchema = z.object({
  summary: z.string().min(1),
  description: z.string().optional(),
  start: z.string(),
  end: z.string(),
  isAllDay: z.boolean().optional(),
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
  'intentions.json': {
    current: 1,
    schemas: { 1: IntentionsFileSchemaV1 },
  },
  'energy.json': {
    current: 2,
    schemas: { 2: EnergyFileSchemaV2 },
  },
  'weekly-reviews.json': {
    current: 2,
    schemas: { 2: WeeklyReviewsFileSchemaV2 },
  },
  'recovery.json': {
    current: 1,
    schemas: { 1: RecoveryFileSchemaV1 },
  },
  'calendar-auth.json': {
    current: 1,
    schemas: { 1: CalendarAuthFileSchemaV1 },
  },
};
