import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import lockfile from 'proper-lockfile';
import { Task, TasksFile, Plan, PlansFile, Message, MessagesFile, TaskCompletion, CompletionsFile, SettingsFile, LearningsFile, TaskCategory, ProposedOperation, OperationResult, TaskWithCompletion, ImplementationIntention, IntentionsFile, IntentionCue } from '@/types/data';
import { FILE_SCHEMAS } from '@/lib/validation/schemas';
import { getDataDir } from '@/lib/utils/paths';
import { getLocalDateString } from '@/lib/utils/date';

const DATA_DIR = getDataDir();
const GLOBAL_LOCK_FILE = 'data.global.lock';
const MAX_MESSAGES = 1000;

const LOCK_CONFIG = {
  stale: 15000,
  retries: {
    retries: 20,
    minTimeout: 100,
    maxTimeout: 1000,
  },
  onCompromised: (err: Error) => {
    console.error('CRITICAL: Data lock was compromised!', err);
    console.error(
      'This typically indicates: stale lock, process crash during write, or external file modification'
    );
    throw new Error('Data integrity cannot be guaranteed - lock was compromised. Check logs.');
  },
};

interface LockContext {
  depth: number;
  release: (() => Promise<void>) | null;
}

const lockStorage = new AsyncLocalStorage<LockContext>();

async function withGlobalLock<T>(fn: () => Promise<T>): Promise<T> {
  const existingContext = lockStorage.getStore();
  if (existingContext && existingContext.depth > 0) {
    existingContext.depth += 1;
    try {
      return await fn();
    } finally {
      existingContext.depth -= 1;
    }
  }

  const lockPath = path.join(DATA_DIR, GLOBAL_LOCK_FILE);
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.writeFile(lockPath, '', { flag: 'wx' });
  } catch (error: any) {
    if (error.code !== 'EEXIST') throw error;
  }

  let release: (() => Promise<void>) | null = null;
  try {
    release = await lockfile.lock(lockPath, LOCK_CONFIG);
  } catch (error: any) {
    console.error('Failed to acquire global lock:', error);
    throw new Error('System is busy. Please try again in a moment.');
  }

  const newContext: LockContext = { depth: 1, release };
  try {
    return await lockStorage.run(newContext, fn);
  } finally {
    if (newContext.release) {
      await newContext.release();
      newContext.release = null;
    }
  }
}

async function migrateData(
  filename: string,
  data: any
): Promise<{ data: any; migrated: boolean }> {
  const fileConfig = FILE_SCHEMAS[filename];
  if (!fileConfig) return { data, migrated: false };

  const currentVersion = fileConfig.current;
  let version = data.version ?? 1;
  if (version > currentVersion) {
    throw new Error(
      `File ${filename} version ${version} is newer than supported ${currentVersion}. Please update the application.`
    );
  }
  if (version === currentVersion) {
    return { data, migrated: false };
  }

  console.log(`Migrating ${filename} from v${version} to v${currentVersion}`);
  let migrated = data;
  while (version < currentVersion) {
    migrated = await migrateOneStep(filename, migrated, version, version + 1);
    version += 1;
  }
  return { data: migrated, migrated: true };
}

async function migrateOneStep(
  filename: string,
  data: any,
  fromVersion: number,
  toVersion: number
): Promise<any> {
  console.log(`  Migrating ${filename} v${fromVersion} → v${toVersion}`);

  if (filename === 'tasks.json' && fromVersion === 1 && toVersion === 2) {
    data.tasks = data.tasks.map((task: any) => {
      if (task.dueAt) {
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(task.dueAt)) {
          console.warn(`  Invalid dueAt format for task ${task.id}`);
          return { ...task, dueOn: null, dueTime: null, dueAt: undefined };
        }
        try {
          const dueDate = new Date(task.dueAt);
          if (Number.isNaN(dueDate.getTime())) {
            return { ...task, dueOn: null, dueTime: null, dueAt: undefined };
          }
          const year = dueDate.getFullYear();
          const month = String(dueDate.getMonth() + 1).padStart(2, '0');
          const day = String(dueDate.getDate()).padStart(2, '0');
          const hours = String(dueDate.getHours()).padStart(2, '0');
          const minutes = String(dueDate.getMinutes()).padStart(2, '0');
          return {
            ...task,
            dueOn: `${year}-${month}-${day}`,
            dueTime: `${hours}:${minutes}`,
            dueAt: undefined,
          };
        } catch {
          return { ...task, dueOn: null, dueTime: null, dueAt: undefined };
        }
      }
      return { ...task, dueOn: null, dueTime: null, dueAt: undefined };
    });
    data.tasks = data.tasks.map((task: any) => {
      if (task.recurrenceRule && task.recurrenceRule !== 'daily') {
        console.warn(`  Converting ${task.recurrenceRule} to daily for task ${task.id}`);
        task.recurrenceRule = 'daily';
      }
      return task;
    });
  }

  if (filename === 'messages.json' && fromVersion === 1 && toVersion === 2) {
    data.messages = data.messages.map((msg: any) => ({
      ...msg,
      executionStatus: msg.executedAt ? 'executed' : 'pending',
      executedAt: msg.executedAt ?? null,
      executionResults: msg.executionResults ?? null,
      targetDate: null,
      executionSucceeded: msg.accepted ?? msg.executionSucceeded ?? false,
      accepted: undefined,
    }));
  }

  if (filename === 'plans.json' && fromVersion === 1 && toVersion === 2) {
    for (const plan of Object.values(data.plans)) {
      const p = plan as any;
      if (p.scheduleBlocks) {
        p.scheduleBlocks = p.scheduleBlocks.map((block: any) => ({
          ...block,
          taskId: block.taskId ?? null,
        }));
      }
    }
  }

  if (filename === 'settings.json' && fromVersion === 1 && toVersion === 2) {
    data.defaultCategory = data.defaultCategory ?? 'research';
    data.customPromptAddendum = data.customPromptAddendum ?? null;
    data.contextCutoffMessageId = data.contextCutoffMessageId ?? null;
  }

  data.version = toVersion;
  return data;
}

async function readData<T>(filename: string, defaultFactory: () => T): Promise<T> {
  return withGlobalLock(async () => {
    const filepath = path.join(DATA_DIR, filename);
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      const parsed = JSON.parse(content);
      const { data: migrated, migrated: wasMigrated } = await migrateData(filename, parsed);
      const fileConfig = FILE_SCHEMAS[filename];
      if (fileConfig) {
        const schema = fileConfig.schemas[fileConfig.current];
        const result = schema.safeParse(migrated);
        if (!result.success) {
          console.error(`Validation failed for ${filename}:`, result.error);
          throw new Error(`Invalid file structure after migration: ${filename}`);
        }
        if (wasMigrated) {
          console.log(`Writing migrated ${filename}`);
          await writeDataUnsafe(filename, result.data);
        }
        return result.data;
      }
      if (wasMigrated) {
        await writeDataUnsafe(filename, migrated);
      }
      return migrated;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return defaultFactory();
      }
      if (error instanceof SyntaxError || error.message?.includes('Invalid file structure')) {
        console.error(`Corrupted file: ${filename}`, error.message);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const corruptPath = `${filepath}.corrupt.${timestamp}`;
        try {
          await fs.rename(filepath, corruptPath);
          console.log(`Renamed corrupted file to ${corruptPath}`);
        } catch {}
        return defaultFactory();
      }
      throw error;
    }
  });
}

async function updateData<TResult>(
  filename: string,
  defaultFactory: () => any,
  updater: (current: any) => Promise<TResult> | TResult
): Promise<TResult> {
  return withGlobalLock(async () => {
    const current = await readDataUnlocked(filename, defaultFactory);
    const result = await updater(current);
    const fileConfig = FILE_SCHEMAS[filename];
    if (fileConfig) {
      const schema = fileConfig.schemas[fileConfig.current];
      const validation = schema.safeParse(current);
      if (!validation.success) {
        console.error(`Validation failed before write for ${filename}:`, validation.error);
        throw new Error(`Invalid data structure: ${validation.error.message}`);
      }
      await writeDataUnsafe(filename, current);
    } else {
      await writeDataUnsafe(filename, current);
    }
    return result;
  });
}

async function readDataUnlocked<T>(filename: string, defaultFactory: () => T): Promise<T> {
  const lockContext = lockStorage.getStore();
  if (!lockContext || lockContext.depth === 0) {
    throw new Error(
      `readDataUnlocked called outside lock context for ${filename}. This is a bug - use readData()`
    );
  }

  const filepath = path.join(DATA_DIR, filename);
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    const parsed = JSON.parse(content);
    const { data: migrated, migrated: wasMigrated } = await migrateData(filename, parsed);
    const fileConfig = FILE_SCHEMAS[filename];
    if (fileConfig) {
      const schema = fileConfig.schemas[fileConfig.current];
      const result = schema.safeParse(migrated);
      if (!result.success) {
        console.error(`Validation failed for ${filename} in unlocked read:`, result.error);
        throw new Error(`Invalid file structure after migration: ${filename}`);
      }
      if (wasMigrated) {
        console.log(`Writing migrated ${filename} (from unlocked read)`);
        await writeDataUnsafe(filename, result.data);
      }
      return result.data;
    }
    if (wasMigrated) {
      await writeDataUnsafe(filename, migrated);
    }
    return migrated;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return defaultFactory();
    }
    if (error instanceof SyntaxError || error.message?.includes('Invalid file structure')) {
      console.error(`Corrupted file in unlocked read: ${filename}`, error.message);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const corruptPath = `${filepath}.corrupt.${timestamp}`;
      try {
        await fs.rename(filepath, corruptPath);
        console.log(`Renamed corrupted file to ${corruptPath}`);
      } catch {}
      return defaultFactory();
    }
    throw error;
  }
}

async function writeDataUnsafe(filename: string, data: any): Promise<void> {
  const filepath = path.join(DATA_DIR, filename);
  const tempPath = `${filepath}.tmp.${crypto.randomUUID()}`;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tempPath, filepath);
}

const tasksDefault = (): TasksFile => ({ version: 2, tasks: [] });

export async function getTasks(): Promise<Task[]> {
  const file = await readData<TasksFile>('tasks.json', tasksDefault);
  return file.tasks;
}

export async function createTask(
  task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Task> {
  return updateData<Task>('tasks.json', tasksDefault, (file: TasksFile) => {
    const now = new Date().toISOString();
    const newTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    file.tasks.push(newTask);
    return newTask;
  });
}

export type TaskUpdates = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>;

export async function updateTask(
  id: string,
  updates: TaskUpdates,
  appendToNotes?: string
): Promise<Task | null> {
  return updateData<Task | null>('tasks.json', tasksDefault, (file: TasksFile) => {
    const index = file.tasks.findIndex((t) => t.id === id);
    if (index === -1) return null;
    const task = file.tasks[index];

    let finalUpdates = { ...updates };
    if (appendToNotes) {
      finalUpdates.notes = task.notes ? `${task.notes}\n\n${appendToNotes}` : appendToNotes;
    }

    const nextRecurrence =
      finalUpdates.recurrenceRule !== undefined ? finalUpdates.recurrenceRule : task.recurrenceRule;
    const nextStatus = finalUpdates.status !== undefined ? finalUpdates.status : task.status;
    const nextDueOn = finalUpdates.dueOn !== undefined ? finalUpdates.dueOn : task.dueOn;
    const nextDueTime = finalUpdates.dueTime !== undefined ? finalUpdates.dueTime : task.dueTime;

    if (nextRecurrence && nextStatus === 'done') {
      throw new Error('Cannot mark recurring task as done. Use complete_habit.');
    }
    if (nextDueTime && !nextDueOn) {
      throw new Error('Cannot set dueTime without dueOn');
    }

    file.tasks[index] = {
      ...task,
      ...finalUpdates,
      updatedAt: new Date().toISOString(),
    };
    return file.tasks[index];
  });
}

export async function updateTaskManifest(
  orderByCategory: Record<TaskCategory, string[]>
): Promise<Task[]> {
  return updateData<Task[]>('tasks.json', tasksDefault, (file: TasksFile) => {
    const now = new Date().toISOString();
    const taskById = new Map(file.tasks.map((task) => [task.id, task]));
    const seen = new Set<string>();
    const orderedActive: Task[] = [];

    const categories: TaskCategory[] = ['research', 'teaching_service', 'family', 'health'];

    for (const category of categories) {
      for (const taskId of orderByCategory[category] ?? []) {
        if (seen.has(taskId)) continue;
        const task = taskById.get(taskId);
        if (!task || task.status !== 'active') continue;
        if (task.category !== category) {
          task.category = category;
          task.updatedAt = now;
        }
        seen.add(taskId);
        orderedActive.push(task);
      }
    }

    for (const task of file.tasks) {
      if (task.status !== 'active') continue;
      if (seen.has(task.id)) continue;
      orderedActive.push(task);
    }

    const orderedInactive = file.tasks.filter((task) => task.status !== 'active');
    file.tasks = [...orderedActive, ...orderedInactive];
    return file.tasks;
  });
}

export async function deleteTask(id: string): Promise<boolean> {
  return withGlobalLock(async () => {
    const tasksFile = await readDataUnlocked<TasksFile>('tasks.json', tasksDefault);
    const initialLength = tasksFile.tasks.length;
    tasksFile.tasks = tasksFile.tasks.filter((t) => t.id !== id);
    if (tasksFile.tasks.length === initialLength) {
      return false;
    }
    await writeDataUnsafe('tasks.json', tasksFile);

    const completionsFile = await readDataUnlocked<CompletionsFile>('completions.json', () => ({
      version: 2,
      completions: [],
    }));
    completionsFile.completions = completionsFile.completions.filter((c) => c.taskId !== id);
    await writeDataUnsafe('completions.json', completionsFile);

    const plansFile = await readDataUnlocked<PlansFile>('plans.json', () => ({
      version: 2,
      plans: {},
    }));

    for (const plan of Object.values(plansFile.plans)) {
      let modified = false;
      const originalRanked = plan.rankedTaskIds.length;
      plan.rankedTaskIds = plan.rankedTaskIds.filter((taskId) => taskId !== id);
      if (plan.rankedTaskIds.length !== originalRanked) modified = true;

      for (const action of plan.nextActions) {
        if (action.taskId === id) {
          action.taskId = null;
          modified = true;
        }
      }

      for (const block of plan.scheduleBlocks) {
        if (block.taskId === id) {
          block.taskId = null;
          modified = true;
        }
      }

      if (modified) {
        plan.updatedAt = new Date().toISOString();
      }
    }

    await writeDataUnsafe('plans.json', plansFile);
    return true;
  });
}

const plansDefault = (): PlansFile => ({ version: 2, plans: {} });

export async function getPlanForDate(localDate: string): Promise<Plan | null> {
  const file = await readData<PlansFile>('plans.json', plansDefault);
  return file.plans[localDate] || null;
}

export async function savePlan(
  localDate: string,
  planData: Partial<Omit<Plan, 'id' | 'planDate' | 'createdAt' | 'updatedAt'>>,
  replaceMode = false
): Promise<Plan> {
  return updateData<Plan>('plans.json', plansDefault, async (file: PlansFile) => {
    const now = new Date().toISOString();
    const existingPlan = file.plans[localDate];
    const tasksFile = await readDataUnlocked<TasksFile>('tasks.json', tasksDefault);
    const taskIds = new Set(tasksFile.tasks.map((t) => t.id));

    let plan: Plan;
    if (replaceMode) {
      plan = {
        id: existingPlan?.id || crypto.randomUUID(),
        planDate: localDate,
        rankedTaskIds: planData.rankedTaskIds ?? [],
        nextActions: planData.nextActions ?? [],
        scheduleBlocks: planData.scheduleBlocks ?? [],
        assumptions: planData.assumptions ?? [],
        createdAt: existingPlan?.createdAt || now,
        updatedAt: now,
      };
    } else {
      plan = {
        id: existingPlan?.id || crypto.randomUUID(),
        planDate: localDate,
        rankedTaskIds:
          planData.rankedTaskIds !== undefined
            ? planData.rankedTaskIds
            : existingPlan?.rankedTaskIds ?? [],
        nextActions:
          planData.nextActions !== undefined ? planData.nextActions : existingPlan?.nextActions ?? [],
        scheduleBlocks:
          planData.scheduleBlocks !== undefined
            ? planData.scheduleBlocks
            : existingPlan?.scheduleBlocks ?? [],
        assumptions:
          planData.assumptions !== undefined ? planData.assumptions : existingPlan?.assumptions ?? [],
        createdAt: existingPlan?.createdAt || now,
        updatedAt: now,
      };
    }

    const invalidRanked = plan.rankedTaskIds.filter((id) => !taskIds.has(id));
    if (invalidRanked.length > 0) {
      console.warn('Dropping invalid rankedTaskIds:', invalidRanked);
      plan.rankedTaskIds = plan.rankedTaskIds.filter((id) => taskIds.has(id));
    }

    for (const action of plan.nextActions) {
      if (action.taskId && !taskIds.has(action.taskId)) {
        console.warn(`Invalid taskId in nextAction: ${action.taskId}`);
        action.taskId = null;
      }
    }

    for (const block of plan.scheduleBlocks) {
      if (block.taskId && !taskIds.has(block.taskId)) {
        console.warn(`Invalid taskId in scheduleBlock: ${block.taskId}`);
        block.taskId = null;
      }
    }

    file.plans[localDate] = plan;
    return plan;
  });
}

const messagesDefault = (): MessagesFile => ({ version: 2, messages: [] });

type AddMessageInput = Omit<
  Message,
  'id' | 'createdAt' | 'executionStatus' | 'executedAt' | 'executionResults' | 'targetDate'
>;

export async function addMessage(
  message: AddMessageInput,
  targetDate: string | null = null
): Promise<Message> {
  return updateData<Message>('messages.json', messagesDefault, (file: MessagesFile) => {
    const newMessage: Message = {
      ...message,
      id: crypto.randomUUID(),
      executionStatus: 'pending',
      executedAt: null,
      executionResults: null,
      targetDate,
      createdAt: new Date().toISOString(),
    };
    file.messages.push(newMessage);
    if (file.messages.length > MAX_MESSAGES) {
      file.messages = file.messages.slice(-MAX_MESSAGES);
    }
    return newMessage;
  });
}

export async function getRecentMessages(
  limit: number,
  cutoffMessageId: string | null = null
): Promise<Message[]> {
  const file = await readData<MessagesFile>('messages.json', messagesDefault);
  let messages = file.messages;
  if (cutoffMessageId) {
    const cutoffIndex = messages.findIndex((m) => m.id === cutoffMessageId);
    if (cutoffIndex !== -1) {
      messages = messages.slice(cutoffIndex + 1);
    }
  }
  return messages.slice(-limit);
}

export async function validateMessageForExecution(
  messageId: string
): Promise<{ valid: boolean; message: Message | null; reason?: string }> {
  const file = await readData<MessagesFile>('messages.json', messagesDefault);
  const message = file.messages.find((m) => m.id === messageId);
  if (!message) {
    return { valid: false, message: null, reason: 'Message not found' };
  }
  if (message.role !== 'assistant') {
    return { valid: false, message, reason: 'Can only execute assistant messages' };
  }
  if (!message.proposedOperations || message.proposedOperations.length === 0) {
    return { valid: false, message, reason: 'No operations to execute' };
  }
  return { valid: true, message };
}

export async function claimMessageExecution(
  messageId: string
): Promise<{ canExecute: boolean; message: Message | null; storedOperations: ProposedOperation[] | null }>
{
  return withGlobalLock(async () => {
    const file = await readDataUnlocked<MessagesFile>('messages.json', messagesDefault);
    const message = file.messages.find((m) => m.id === messageId);
    if (!message) {
      return { canExecute: false, message: null, storedOperations: null };
    }
    if (message.role !== 'assistant' || !message.proposedOperations) {
      return { canExecute: false, message, storedOperations: null };
    }
    const status = message.executionStatus;
    if (status === 'executed') {
      return { canExecute: false, message, storedOperations: message.proposedOperations };
    }
    if (status === 'executing') {
      return { canExecute: false, message, storedOperations: null };
    }
    message.executionStatus = 'executing';
    await writeDataUnsafe('messages.json', file);
    return { canExecute: true, message, storedOperations: message.proposedOperations };
  });
}

export async function markMessageExecuted(
  messageId: string,
  results: OperationResult[],
  success: boolean
): Promise<void> {
  await updateData<void>('messages.json', messagesDefault, (file: MessagesFile) => {
    const message = file.messages.find((m) => m.id === messageId);
    if (message) {
      message.executionStatus = 'executed';
      message.executedAt = new Date().toISOString();
      message.executionResults = results;
      message.executionSucceeded = success;
    }
  });
}

export async function resetMessageExecution(messageId: string, errorMessage: string): Promise<void> {
  await updateData<void>('messages.json', messagesDefault, (file: MessagesFile) => {
    const message = file.messages.find((m) => m.id === messageId);
    if (message && message.executionStatus === 'executing') {
      message.executionStatus = 'pending';
      message.executionResults = [
        {
          op: 'system_reset',
          description: 'Execution reset due to infrastructure error',
          success: false,
          error: errorMessage,
        },
      ];
    }
  });
}

const completionsDefault = (): CompletionsFile => ({ version: 2, completions: [] });

export async function recordCompletion(
  taskId: string,
  completedOnDate: string,
  notes: string | null = null
): Promise<TaskCompletion> {
  return updateData<TaskCompletion>('completions.json', completionsDefault, (file: CompletionsFile) => {
    const completion: TaskCompletion = {
      id: crypto.randomUUID(),
      taskId,
      completedAt: new Date().toISOString(),
      completedOnDate,
      notes,
    };
    file.completions.push(completion);
    return completion;
  });
}

export async function hasCompletionForDate(taskId: string, date: string): Promise<boolean> {
  const file = await readData<CompletionsFile>('completions.json', completionsDefault);
  return file.completions.some((c) => c.taskId === taskId && c.completedOnDate === date);
}

export async function removeCompletionForDate(taskId: string, date: string): Promise<number> {
  return updateData<number>('completions.json', completionsDefault, (file: CompletionsFile) => {
    const before = file.completions.length;
    file.completions = file.completions.filter(
      (completion) => !(completion.taskId === taskId && completion.completedOnDate === date)
    );
    return before - file.completions.length;
  });
}

const settingsDefault = (): SettingsFile => ({
  version: 2,
  userName: 'User',
  defaultCategory: 'research',
  theme: 'system',
  customPromptAddendum: null,
  contextCutoffMessageId: null,
});

export async function getSettings(): Promise<SettingsFile> {
  return readData<SettingsFile>('settings.json', settingsDefault);
}

export async function updateSettings(
  updates: Partial<Omit<SettingsFile, 'version'>>
): Promise<SettingsFile> {
  return updateData<SettingsFile>('settings.json', settingsDefault, (file: SettingsFile) => {
    Object.assign(file, updates);
    return file;
  });
}

export async function getDefaultCategory(): Promise<TaskCategory> {
  const settings = await getSettings();
  return settings.defaultCategory;
}

const learningsDefault = (): LearningsFile => ({ version: 2, learnings: [] });

export async function getLearnings(): Promise<string[]> {
  const file = await readData<LearningsFile>('learnings.json', learningsDefault);
  return file.learnings.map((l) => l.content);
}

export async function getTasksWithCompletions(localDate: string): Promise<TaskWithCompletion[]> {
  return withGlobalLock(async () => {
    const tasksFile = await readDataUnlocked<TasksFile>('tasks.json', tasksDefault);
    const completionsFile = await readDataUnlocked<CompletionsFile>('completions.json', completionsDefault);
    const todayCompletions = new Set(
      completionsFile.completions
        .filter((c) => c.completedOnDate === localDate)
        .map((c) => c.taskId)
    );
    return tasksFile.tasks.map((task) => ({
      ...task,
      completedToday: todayCompletions.has(task.id),
    }));
  });
}

// ============================================
// Implementation Intentions
// ============================================

const intentionsDefault = (): IntentionsFile => ({ version: 1, intentions: [] });

export async function getIntentions(): Promise<ImplementationIntention[]> {
  const file = await readData<IntentionsFile>('intentions.json', intentionsDefault);
  // Return sorted: active first, then by creation date
  return [...file.intentions].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function getActiveIntentions(): Promise<ImplementationIntention[]> {
  const file = await readData<IntentionsFile>('intentions.json', intentionsDefault);
  return file.intentions.filter((i) => i.isActive);
}

export async function getIntentionById(id: string): Promise<ImplementationIntention | null> {
  const file = await readData<IntentionsFile>('intentions.json', intentionsDefault);
  return file.intentions.find((i) => i.id === id) || null;
}

export interface CreateIntentionInput {
  taskId?: string | null;
  cue: IntentionCue;
  action: string;
  duration?: number | null;
  isActive?: boolean;
  isCopingPlan?: boolean;
}

export async function createIntention(input: CreateIntentionInput): Promise<ImplementationIntention> {
  return updateData<ImplementationIntention>('intentions.json', intentionsDefault, (file: IntentionsFile) => {
    const now = new Date().toISOString();
    const newIntention: ImplementationIntention = {
      id: crypto.randomUUID(),
      taskId: input.taskId ?? null,
      cue: input.cue,
      action: input.action,
      duration: input.duration ?? null,
      isActive: input.isActive ?? true,
      isCopingPlan: input.isCopingPlan ?? false,
      createdAt: now,
      updatedAt: now,
      lastTriggeredAt: null,
      successCount: 0,
      missCount: 0,
    };
    file.intentions.push(newIntention);
    return newIntention;
  });
}

export interface UpdateIntentionInput {
  taskId?: string | null;
  cue?: IntentionCue;
  action?: string;
  duration?: number | null;
  isActive?: boolean;
  isCopingPlan?: boolean;
}

export async function updateIntention(
  id: string,
  updates: UpdateIntentionInput
): Promise<ImplementationIntention | null> {
  return updateData<ImplementationIntention | null>('intentions.json', intentionsDefault, (file: IntentionsFile) => {
    const index = file.intentions.findIndex((i) => i.id === id);
    if (index === -1) return null;

    const intention = file.intentions[index];
    file.intentions[index] = {
      ...intention,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    return file.intentions[index];
  });
}

export async function deleteIntention(id: string): Promise<boolean> {
  return updateData<boolean>('intentions.json', intentionsDefault, (file: IntentionsFile) => {
    const initialLength = file.intentions.length;
    file.intentions = file.intentions.filter((i) => i.id !== id);
    return file.intentions.length < initialLength;
  });
}

export async function recordIntentionTrigger(
  id: string,
  success: boolean
): Promise<ImplementationIntention | null> {
  return updateData<ImplementationIntention | null>('intentions.json', intentionsDefault, (file: IntentionsFile) => {
    const index = file.intentions.findIndex((i) => i.id === id);
    if (index === -1) return null;

    const intention = file.intentions[index];
    const now = new Date().toISOString();

    file.intentions[index] = {
      ...intention,
      lastTriggeredAt: now,
      updatedAt: now,
      successCount: success ? intention.successCount + 1 : intention.successCount,
      missCount: success ? intention.missCount : intention.missCount + 1,
    };
    return file.intentions[index];
  });
}

export interface IntentionAuditSummary {
  intention: ImplementationIntention;
  totalTriggers: number;
  successRate: number;
  needsReview: boolean;
  suggestion: string | null;
}

export async function getIntentionsAudit(): Promise<IntentionAuditSummary[]> {
  const intentions = await getIntentions();

  return intentions.map((intention) => {
    const totalTriggers = intention.successCount + intention.missCount;
    const successRate = totalTriggers > 0 ? intention.successCount / totalTriggers : 0;
    const needsReview = totalTriggers >= 3 && successRate < 0.5;

    let suggestion: string | null = null;
    if (needsReview) {
      suggestion = `This intention fires ${Math.round(successRate * 100)}% of the time. Consider adjusting the cue or making the action smaller.`;
    } else if (totalTriggers === 0 && intention.isActive) {
      suggestion = 'This intention hasn\'t been triggered yet. Make sure the cue is specific and visible.';
    }

    return {
      intention,
      totalTriggers,
      successRate,
      needsReview,
      suggestion,
    };
  });
}
