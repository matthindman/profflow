// types/data.ts
// Core domain models used throughout ProfFlow.

export type TaskCategory = 'research' | 'teaching_service' | 'family' | 'health';
export type TaskStatus = 'active' | 'done' | 'archived';
export type RecurrenceRule = 'daily';
export type ExecutionStatus = 'pending' | 'executing' | 'executed';

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  category: TaskCategory;
  status: TaskStatus;
  dueOn: string | null;
  dueTime: string | null;
  location: string | null;
  recurrenceRule: RecurrenceRule | null;
  createdAt: string;
  updatedAt: string;
}

export interface TasksFile {
  version: 2;
  tasks: Task[];
}

export interface ScheduleBlock {
  start: string;
  end: string;
  label: string;
  taskId: string | null;
  type: 'deep_work' | 'shallow_work' | 'meeting' | 'break' | 'life';
}

export interface NextAction {
  action: string;
  taskId: string | null;
}

export interface Plan {
  id: string;
  planDate: string;
  rankedTaskIds: string[];
  nextActions: NextAction[];
  scheduleBlocks: ScheduleBlock[];
  assumptions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PlansFile {
  version: 2;
  plans: Record<string, Plan>;
}

export interface ProposedOperation {
  op:
    | 'create_task'
    | 'update_task'
    | 'complete_task'
    | 'delete_task'
    | 'complete_habit'
    | 'create_plan'
    | 'update_plan';
  description: string;
  data: Record<string, any>;
}

export interface OperationResult {
  op: string;
  description: string;
  success: boolean;
  error?: string;
  entityId?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposedOperations: ProposedOperation[] | null;
  executionSucceeded: boolean;
  executionStatus: ExecutionStatus;
  executedAt: string | null;
  executionResults: OperationResult[] | null;
  createdAt: string;
  targetDate: string | null;
}

export interface MessagesFile {
  version: 2;
  messages: Message[];
}

export interface TaskCompletion {
  id: string;
  taskId: string;
  completedAt: string;
  completedOnDate: string;
  notes: string | null;
}

export interface CompletionsFile {
  version: 2;
  completions: TaskCompletion[];
}

export interface SettingsFile {
  version: 2;
  userName: string;
  defaultCategory: TaskCategory;
  theme: 'light' | 'dark' | 'system';
  customPromptAddendum: string | null;
  contextCutoffMessageId: string | null;
}

export interface Learning {
  id: string;
  content: string;
  createdAt: string;
}

export interface LearningsFile {
  version: 2;
  learnings: Learning[];
}

export interface TaskWithCompletion extends Task {
  completedToday: boolean;
}

// Implementation Intentions - If-Then Planning
export type IntentionCueType = 'time' | 'location' | 'activity' | 'event';

export interface IntentionCue {
  type: IntentionCueType;
  description: string;        // e.g., "After morning coffee"
  timeAnchor: string | null;  // Optional: "08:00" for time-based cues
}

export interface ImplementationIntention {
  id: string;
  taskId: string | null;      // Links to task (optional - can be standalone)
  cue: IntentionCue;
  action: string;             // "Open dissertation chapter and write for 25 minutes"
  duration: number | null;    // Minutes (optional)
  isActive: boolean;          // Max 3 active at once recommended
  isCopingPlan: boolean;      // True for obstacle-response intentions
  createdAt: string;
  updatedAt: string;
  lastTriggeredAt: string | null;
  successCount: number;
  missCount: number;
}

export interface IntentionsFile {
  version: 1;
  intentions: ImplementationIntention[];
}

// ============================================
// Energy & Recovery Tracking
// ============================================

export type MoodType = 'energized' | 'calm' | 'neutral' | 'tired' | 'stressed';

export interface EnergyCheckIn {
  id: string;
  date: string; // YYYY-MM-DD
  energyLevel: number; // 1-10
  mood: MoodType;
  notes: string | null;
  createdAt: string;
}

export interface WorkBlock {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string | null; // HH:MM - null if still in progress
  plannedDurationMinutes: number; // Target: 90-120 min
  actualDurationMinutes: number | null;
  taskId: string | null;
  focusRating: number | null; // 1-5 self-rated focus quality
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BreakActivityType =
  | 'walk'
  | 'stretch'
  | 'meditation'
  | 'snack'
  | 'social'
  | 'phone'
  | 'nap'
  | 'fresh_air'
  | 'other';

export interface BreakLog {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string | null; // HH:MM
  durationMinutes: number | null;
  activities: BreakActivityType[];
  restorativeScore: number | null; // 1-5 how refreshed you feel
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnergyFile {
  version: 2;
  checkIns: EnergyCheckIn[];
  workBlocks: WorkBlock[];
  breakLogs: BreakLog[];
}

// Analytics types
export interface DailyEnergyPattern {
  date: string;
  morningEnergy: number | null;
  mood: MoodType | null;
  workBlockCount: number;
  totalFocusMinutes: number;
  averageFocusRating: number | null;
  breakCount: number;
  averageRestorativeScore: number | null;
}

export interface WeeklyEnergyPattern {
  weekStart: string; // Monday YYYY-MM-DD
  dailyPatterns: DailyEnergyPattern[];
  averageEnergy: number | null;
  mostCommonMood: MoodType | null;
  totalWorkBlocks: number;
  totalFocusMinutes: number;
  optimalWorkTime: string | null; // HH:MM when energy/focus peaks
  bestRestorativeActivities: BreakActivityType[];
}

export interface EnergySuggestion {
  id: string;
  type: 'break_reminder' | 'energy_tip' | 'pattern_insight' | 'schedule_adjustment';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  actionable: boolean;
  createdAt: string;
}

// ============================================
// Weekly Review Ritual
// ============================================

export type ReviewStepType =
  | 'celebrate'      // Step 1: Celebrate progress
  | 'challenges'     // Step 2: Acknowledge challenges
  | 'learnings'      // Step 3: Capture learnings
  | 'values'         // Step 4: Values check
  | 'big_three'      // Step 5: Plan Big Three for next week
  | 'schedule';      // Step 6: Schedule confirmation

export interface BigThreeItem {
  id: string;
  title: string;
  category: TaskCategory;
  linkedTaskId: string | null;
  completed: boolean;
}

export interface WeeklyReviewMetrics {
  tasksCompleted: number;
  focusBlocksCompleted: number;
  totalFocusMinutes: number;
  averageEnergy: number | null;
  averageFocusRating: number | null;
  habitsCompletedRate: number | null; // percentage
}

export interface WeeklyReview {
  id: string;
  weekStart: string; // Monday YYYY-MM-DD
  weekEnd: string; // Sunday YYYY-MM-DD

  // Step 1: Celebrate
  wins: string[];
  progressRating: number | null; // 1-5 how satisfied with progress

  // Step 2: Challenges
  challenges: string[];
  obstacles: string[];

  // Step 3: Learnings
  learnings: string[];
  insights: string[];

  // Step 4: Values check
  valuesAlignment: number | null; // 1-5 how aligned work was with values
  valuesReflection: string | null;

  // Step 5: Big Three for next week
  bigThree: BigThreeItem[];

  // Step 6: Schedule confirmation
  scheduleConfirmed: boolean;
  scheduledFocusBlocks: number | null;
  capacityCheck: number | null; // percentage of time scheduled (target 60-70%)

  // Metrics snapshot
  metrics: WeeklyReviewMetrics;

  // Metadata
  status: 'in_progress' | 'completed';
  currentStep: ReviewStepType;
  startedAt: string;
  completedAt: string | null;
  durationMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyReviewsFile {
  version: 2;
  reviews: WeeklyReview[];
}

export interface ReviewReminder {
  id: string;
  weekStart: string;
  scheduledFor: string; // ISO datetime
  dismissed: boolean;
  createdAt: string;
}
