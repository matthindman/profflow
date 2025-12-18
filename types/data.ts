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
