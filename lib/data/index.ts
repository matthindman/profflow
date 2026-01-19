import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import lockfile from 'proper-lockfile';
import { Task, TasksFile, Plan, PlansFile, Message, MessagesFile, TaskCompletion, CompletionsFile, SettingsFile, LearningsFile, TaskCategory, ProposedOperation, OperationResult, TaskWithCompletion, EnergyFile, EnergyCheckIn, WorkBlock, BreakLog, MoodType, BreakActivityType, DailyEnergyPattern, WeeklyEnergyPattern, WeeklyReview, WeeklyReviewsFile, WeeklyReviewMetrics, BigThreeItem, ReviewStepType } from '@/types/data';
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
// Energy & Recovery Tracking
// ============================================

const energyDefault = (): EnergyFile => ({
  version: 2,
  checkIns: [],
  workBlocks: [],
  breakLogs: [],
});

// Energy Check-ins

export async function getEnergyCheckIn(date: string): Promise<EnergyCheckIn | null> {
  const file = await readData<EnergyFile>('energy.json', energyDefault);
  return file.checkIns.find((c) => c.date === date) || null;
}

export async function getEnergyCheckIns(startDate: string, endDate: string): Promise<EnergyCheckIn[]> {
  const file = await readData<EnergyFile>('energy.json', energyDefault);
  return file.checkIns.filter((c) => c.date >= startDate && c.date <= endDate);
}

export async function createEnergyCheckIn(
  data: Omit<EnergyCheckIn, 'id' | 'createdAt'>
): Promise<EnergyCheckIn> {
  return updateData<EnergyCheckIn>('energy.json', energyDefault, (file: EnergyFile) => {
    // Remove existing check-in for this date if any
    file.checkIns = file.checkIns.filter((c) => c.date !== data.date);

    const checkIn: EnergyCheckIn = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    file.checkIns.push(checkIn);
    return checkIn;
  });
}

// Work Blocks

export async function getWorkBlocksForDate(date: string): Promise<WorkBlock[]> {
  const file = await readData<EnergyFile>('energy.json', energyDefault);
  return file.workBlocks.filter((b) => b.date === date);
}

export async function getActiveWorkBlock(): Promise<WorkBlock | null> {
  const file = await readData<EnergyFile>('energy.json', energyDefault);
  return file.workBlocks.find((b) => b.endTime === null) || null;
}

export async function startWorkBlock(
  data: {
    date: string;
    startTime: string;
    plannedDurationMinutes: number;
    taskId?: string | null;
    notes?: string | null;
  }
): Promise<WorkBlock> {
  return updateData<WorkBlock>('energy.json', energyDefault, (file: EnergyFile) => {
    // End any active work block first
    const activeBlock = file.workBlocks.find((b) => b.endTime === null);
    if (activeBlock) {
      const now = new Date();
      activeBlock.endTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const [startH, startM] = activeBlock.startTime.split(':').map(Number);
      const [endH, endM] = activeBlock.endTime.split(':').map(Number);
      activeBlock.actualDurationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
      activeBlock.updatedAt = now.toISOString();
    }

    const now = new Date().toISOString();
    const workBlock: WorkBlock = {
      id: crypto.randomUUID(),
      date: data.date,
      startTime: data.startTime,
      endTime: null,
      plannedDurationMinutes: data.plannedDurationMinutes,
      actualDurationMinutes: null,
      taskId: data.taskId ?? null,
      focusRating: null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    file.workBlocks.push(workBlock);
    return workBlock;
  });
}

export async function endWorkBlock(
  id: string,
  data: {
    endTime: string;
    focusRating?: number | null;
    notes?: string | null;
  }
): Promise<WorkBlock | null> {
  return updateData<WorkBlock | null>('energy.json', energyDefault, (file: EnergyFile) => {
    const block = file.workBlocks.find((b) => b.id === id);
    if (!block) return null;

    block.endTime = data.endTime;
    const [startH, startM] = block.startTime.split(':').map(Number);
    const [endH, endM] = data.endTime.split(':').map(Number);
    block.actualDurationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (data.focusRating !== undefined) block.focusRating = data.focusRating;
    if (data.notes !== undefined) block.notes = data.notes;
    block.updatedAt = new Date().toISOString();

    return block;
  });
}

export async function updateWorkBlock(
  id: string,
  updates: Partial<Pick<WorkBlock, 'focusRating' | 'notes' | 'taskId'>>
): Promise<WorkBlock | null> {
  return updateData<WorkBlock | null>('energy.json', energyDefault, (file: EnergyFile) => {
    const block = file.workBlocks.find((b) => b.id === id);
    if (!block) return null;

    if (updates.focusRating !== undefined) block.focusRating = updates.focusRating;
    if (updates.notes !== undefined) block.notes = updates.notes;
    if (updates.taskId !== undefined) block.taskId = updates.taskId;
    block.updatedAt = new Date().toISOString();

    return block;
  });
}

// Break Logs

export async function getBreakLogsForDate(date: string): Promise<BreakLog[]> {
  const file = await readData<EnergyFile>('energy.json', energyDefault);
  return file.breakLogs.filter((b) => b.date === date);
}

export async function getActiveBreak(): Promise<BreakLog | null> {
  const file = await readData<EnergyFile>('energy.json', energyDefault);
  return file.breakLogs.find((b) => b.endTime === null) || null;
}

export async function startBreak(
  data: {
    date: string;
    startTime: string;
    activities?: BreakActivityType[];
    notes?: string | null;
  }
): Promise<BreakLog> {
  return updateData<BreakLog>('energy.json', energyDefault, (file: EnergyFile) => {
    const now = new Date().toISOString();
    const breakLog: BreakLog = {
      id: crypto.randomUUID(),
      date: data.date,
      startTime: data.startTime,
      endTime: null,
      durationMinutes: null,
      activities: data.activities ?? [],
      restorativeScore: null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    file.breakLogs.push(breakLog);
    return breakLog;
  });
}

export async function endBreak(
  id: string,
  data: {
    endTime: string;
    activities?: BreakActivityType[];
    restorativeScore?: number | null;
    notes?: string | null;
  }
): Promise<BreakLog | null> {
  return updateData<BreakLog | null>('energy.json', energyDefault, (file: EnergyFile) => {
    const breakLog = file.breakLogs.find((b) => b.id === id);
    if (!breakLog) return null;

    breakLog.endTime = data.endTime;
    const [startH, startM] = breakLog.startTime.split(':').map(Number);
    const [endH, endM] = data.endTime.split(':').map(Number);
    breakLog.durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (data.activities !== undefined) breakLog.activities = data.activities;
    if (data.restorativeScore !== undefined) breakLog.restorativeScore = data.restorativeScore;
    if (data.notes !== undefined) breakLog.notes = data.notes;
    breakLog.updatedAt = new Date().toISOString();

    return breakLog;
  });
}

export async function logBreak(
  data: {
    date: string;
    startTime: string;
    endTime: string;
    activities: BreakActivityType[];
    restorativeScore?: number | null;
    notes?: string | null;
  }
): Promise<BreakLog> {
  return updateData<BreakLog>('energy.json', energyDefault, (file: EnergyFile) => {
    const [startH, startM] = data.startTime.split(':').map(Number);
    const [endH, endM] = data.endTime.split(':').map(Number);
    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);

    const now = new Date().toISOString();
    const breakLog: BreakLog = {
      id: crypto.randomUUID(),
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      durationMinutes,
      activities: data.activities,
      restorativeScore: data.restorativeScore ?? null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    file.breakLogs.push(breakLog);
    return breakLog;
  });
}

// Energy Patterns & Analytics

export async function getDailyEnergyPattern(date: string): Promise<DailyEnergyPattern> {
  const file = await readData<EnergyFile>('energy.json', energyDefault);

  const checkIn = file.checkIns.find((c) => c.date === date);
  const workBlocks = file.workBlocks.filter((b) => b.date === date && b.endTime !== null);
  const breakLogs = file.breakLogs.filter((b) => b.date === date);

  const totalFocusMinutes = workBlocks.reduce((sum, b) => sum + (b.actualDurationMinutes ?? 0), 0);
  const focusRatings = workBlocks.filter((b) => b.focusRating !== null).map((b) => b.focusRating!);
  const restorativeScores = breakLogs.filter((b) => b.restorativeScore !== null).map((b) => b.restorativeScore!);

  return {
    date,
    morningEnergy: checkIn?.energyLevel ?? null,
    mood: checkIn?.mood ?? null,
    workBlockCount: workBlocks.length,
    totalFocusMinutes,
    averageFocusRating: focusRatings.length > 0
      ? focusRatings.reduce((a, b) => a + b, 0) / focusRatings.length
      : null,
    breakCount: breakLogs.length,
    averageRestorativeScore: restorativeScores.length > 0
      ? restorativeScores.reduce((a, b) => a + b, 0) / restorativeScores.length
      : null,
  };
}

export async function getWeeklyEnergyPattern(weekStartDate: string): Promise<WeeklyEnergyPattern> {
  const file = await readData<EnergyFile>('energy.json', energyDefault);

  // Generate 7 days from weekStart
  const dates: string[] = [];
  const startDate = new Date(weekStartDate + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    dates.push(getLocalDateString(date));
  }

  const dailyPatterns: DailyEnergyPattern[] = [];
  for (const date of dates) {
    const checkIn = file.checkIns.find((c) => c.date === date);
    const workBlocks = file.workBlocks.filter((b) => b.date === date && b.endTime !== null);
    const breakLogs = file.breakLogs.filter((b) => b.date === date);

    const totalFocusMinutes = workBlocks.reduce((sum, b) => sum + (b.actualDurationMinutes ?? 0), 0);
    const focusRatings = workBlocks.filter((b) => b.focusRating !== null).map((b) => b.focusRating!);
    const restorativeScores = breakLogs.filter((b) => b.restorativeScore !== null).map((b) => b.restorativeScore!);

    dailyPatterns.push({
      date,
      morningEnergy: checkIn?.energyLevel ?? null,
      mood: checkIn?.mood ?? null,
      workBlockCount: workBlocks.length,
      totalFocusMinutes,
      averageFocusRating: focusRatings.length > 0
        ? focusRatings.reduce((a, b) => a + b, 0) / focusRatings.length
        : null,
      breakCount: breakLogs.length,
      averageRestorativeScore: restorativeScores.length > 0
        ? restorativeScores.reduce((a, b) => a + b, 0) / restorativeScores.length
        : null,
    });
  }

  // Aggregate stats
  const energyLevels = dailyPatterns
    .filter((p) => p.morningEnergy !== null)
    .map((p) => p.morningEnergy!);
  const averageEnergy = energyLevels.length > 0
    ? energyLevels.reduce((a, b) => a + b, 0) / energyLevels.length
    : null;

  // Most common mood
  const moodCounts = new Map<MoodType, number>();
  for (const p of dailyPatterns) {
    if (p.mood) {
      moodCounts.set(p.mood, (moodCounts.get(p.mood) ?? 0) + 1);
    }
  }
  let mostCommonMood: MoodType | null = null;
  let maxMoodCount = 0;
  for (const [mood, count] of moodCounts) {
    if (count > maxMoodCount) {
      maxMoodCount = count;
      mostCommonMood = mood;
    }
  }

  const totalWorkBlocks = dailyPatterns.reduce((sum, p) => sum + p.workBlockCount, 0);
  const totalFocusMinutes = dailyPatterns.reduce((sum, p) => sum + p.totalFocusMinutes, 0);

  // Find optimal work time (hour with highest average focus rating)
  const hourlyFocus = new Map<number, { total: number; count: number }>();
  for (const date of dates) {
    const workBlocks = file.workBlocks.filter((b) => b.date === date && b.focusRating !== null);
    for (const block of workBlocks) {
      const hour = parseInt(block.startTime.split(':')[0], 10);
      const existing = hourlyFocus.get(hour) ?? { total: 0, count: 0 };
      existing.total += block.focusRating!;
      existing.count += 1;
      hourlyFocus.set(hour, existing);
    }
  }

  let optimalWorkTime: string | null = null;
  let maxAvgFocus = 0;
  for (const [hour, data] of hourlyFocus) {
    const avg = data.total / data.count;
    if (avg > maxAvgFocus) {
      maxAvgFocus = avg;
      optimalWorkTime = `${String(hour).padStart(2, '0')}:00`;
    }
  }

  // Best restorative activities
  const activityScores = new Map<BreakActivityType, { total: number; count: number }>();
  for (const date of dates) {
    const breakLogs = file.breakLogs.filter((b) => b.date === date && b.restorativeScore !== null);
    for (const breakLog of breakLogs) {
      for (const activity of breakLog.activities) {
        const existing = activityScores.get(activity) ?? { total: 0, count: 0 };
        existing.total += breakLog.restorativeScore!;
        existing.count += 1;
        activityScores.set(activity, existing);
      }
    }
  }

  const sortedActivities = Array.from(activityScores.entries())
    .map(([activity, data]) => ({ activity, avg: data.total / data.count }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3)
    .map((x) => x.activity);

  return {
    weekStart: weekStartDate,
    dailyPatterns,
    averageEnergy,
    mostCommonMood,
    totalWorkBlocks,
    totalFocusMinutes,
    optimalWorkTime,
    bestRestorativeActivities: sortedActivities,
  };
}

// Get current energy state (for UI)
export async function getCurrentEnergyState(date: string): Promise<{
  checkIn: EnergyCheckIn | null;
  activeWorkBlock: WorkBlock | null;
  activeBreak: BreakLog | null;
  todayWorkBlocks: WorkBlock[];
  todayBreaks: BreakLog[];
}> {
  return withGlobalLock(async () => {
    const file = await readDataUnlocked<EnergyFile>('energy.json', energyDefault);

    return {
      checkIn: file.checkIns.find((c) => c.date === date) ?? null,
      activeWorkBlock: file.workBlocks.find((b) => b.endTime === null) ?? null,
      activeBreak: file.breakLogs.find((b) => b.endTime === null) ?? null,
      todayWorkBlocks: file.workBlocks.filter((b) => b.date === date),
      todayBreaks: file.breakLogs.filter((b) => b.date === date),
    };
  });
}

// ============================================
// Weekly Review Ritual
// ============================================

const weeklyReviewsDefault = (): WeeklyReviewsFile => ({
  version: 2,
  reviews: [],
});

// Helper to get Monday of a given week
function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return getLocalDateString(d);
}

// Helper to get Sunday of a given week
function getSundayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? 0 : 7);
  d.setDate(diff);
  return getLocalDateString(d);
}

// Get a weekly review by week start date
export async function getWeeklyReview(weekStart: string): Promise<WeeklyReview | null> {
  const file = await readData<WeeklyReviewsFile>('weekly-reviews.json', weeklyReviewsDefault);
  return file.reviews.find((r) => r.weekStart === weekStart) ?? null;
}

// Get the current week's review or in-progress review
export async function getCurrentWeeklyReview(): Promise<WeeklyReview | null> {
  const file = await readData<WeeklyReviewsFile>('weekly-reviews.json', weeklyReviewsDefault);
  const currentWeekStart = getMondayOfWeek(new Date());

  // First check for in-progress review
  const inProgress = file.reviews.find((r) => r.status === 'in_progress');
  if (inProgress) return inProgress;

  // Then check for current week's review
  return file.reviews.find((r) => r.weekStart === currentWeekStart) ?? null;
}

// Get all reviews (for history)
export async function getWeeklyReviews(limit?: number): Promise<WeeklyReview[]> {
  const file = await readData<WeeklyReviewsFile>('weekly-reviews.json', weeklyReviewsDefault);
  const sorted = [...file.reviews].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  return limit ? sorted.slice(0, limit) : sorted;
}

// Calculate metrics for a week
export async function calculateWeekMetrics(weekStart: string, weekEnd: string): Promise<WeeklyReviewMetrics> {
  return withGlobalLock(async () => {
    const completionsFile = await readDataUnlocked<CompletionsFile>('completions.json', completionsDefault);
    const tasksFile = await readDataUnlocked<TasksFile>('tasks.json', tasksDefault);
    const energyFile = await readDataUnlocked<EnergyFile>('energy.json', energyDefault);

    // Count completed tasks (non-recurring done + recurring completions)
    const completionsInWeek = completionsFile.completions.filter(
      (c) => c.completedOnDate >= weekStart && c.completedOnDate <= weekEnd
    );
    const uniqueTasksCompleted = new Set(completionsInWeek.map((c) => c.taskId));
    const tasksCompleted = uniqueTasksCompleted.size;

    // Count focus blocks
    const workBlocksInWeek = energyFile.workBlocks.filter(
      (b) => b.date >= weekStart && b.date <= weekEnd && b.endTime !== null
    );
    const focusBlocksCompleted = workBlocksInWeek.length;
    const totalFocusMinutes = workBlocksInWeek.reduce((sum, b) => sum + (b.actualDurationMinutes ?? 0), 0);

    // Calculate average energy
    const checkInsInWeek = energyFile.checkIns.filter(
      (c) => c.date >= weekStart && c.date <= weekEnd
    );
    const averageEnergy = checkInsInWeek.length > 0
      ? checkInsInWeek.reduce((sum, c) => sum + c.energyLevel, 0) / checkInsInWeek.length
      : null;

    // Calculate average focus rating
    const blocksWithRating = workBlocksInWeek.filter((b) => b.focusRating !== null);
    const averageFocusRating = blocksWithRating.length > 0
      ? blocksWithRating.reduce((sum, b) => sum + b.focusRating!, 0) / blocksWithRating.length
      : null;

    // Calculate habits completion rate
    const recurringTasks = tasksFile.tasks.filter((t) => t.recurrenceRule && t.status === 'active');
    if (recurringTasks.length === 0) {
      return {
        tasksCompleted,
        focusBlocksCompleted,
        totalFocusMinutes,
        averageEnergy,
        averageFocusRating,
        habitsCompletedRate: null,
      };
    }

    // Count days in the week
    const daysInWeek = 7;
    const totalPossibleHabitCompletions = recurringTasks.length * daysInWeek;
    const habitCompletions = completionsInWeek.filter((c) =>
      recurringTasks.some((t) => t.id === c.taskId)
    ).length;
    const habitsCompletedRate = (habitCompletions / totalPossibleHabitCompletions) * 100;

    return {
      tasksCompleted,
      focusBlocksCompleted,
      totalFocusMinutes,
      averageEnergy,
      averageFocusRating,
      habitsCompletedRate,
    };
  });
}

// Start a new weekly review
export async function startWeeklyReview(weekStart?: string): Promise<WeeklyReview> {
  const now = new Date();
  const resolvedWeekStart = weekStart ?? getMondayOfWeek(now);
  const weekEnd = getSundayOfWeek(new Date(resolvedWeekStart + 'T00:00:00'));

  // Calculate metrics for the week
  const metrics = await calculateWeekMetrics(resolvedWeekStart, weekEnd);

  return updateData<WeeklyReview>('weekly-reviews.json', weeklyReviewsDefault, (file: WeeklyReviewsFile) => {
    // Check if review already exists for this week
    const existing = file.reviews.find((r) => r.weekStart === resolvedWeekStart);
    if (existing) {
      return existing;
    }

    const nowStr = now.toISOString();
    const review: WeeklyReview = {
      id: crypto.randomUUID(),
      weekStart: resolvedWeekStart,
      weekEnd,

      // Step 1: Celebrate
      wins: [],
      progressRating: null,

      // Step 2: Challenges
      challenges: [],
      obstacles: [],

      // Step 3: Learnings
      learnings: [],
      insights: [],

      // Step 4: Values check
      valuesAlignment: null,
      valuesReflection: null,

      // Step 5: Big Three
      bigThree: [],

      // Step 6: Schedule confirmation
      scheduleConfirmed: false,
      scheduledFocusBlocks: null,
      capacityCheck: null,

      // Metrics snapshot
      metrics,

      // Metadata
      status: 'in_progress',
      currentStep: 'celebrate',
      startedAt: nowStr,
      completedAt: null,
      durationMinutes: null,
      createdAt: nowStr,
      updatedAt: nowStr,
    };

    file.reviews.push(review);
    return review;
  });
}

// Update a weekly review step
export async function updateWeeklyReviewStep(
  id: string,
  step: ReviewStepType,
  data: Partial<WeeklyReview>
): Promise<WeeklyReview | null> {
  return updateData<WeeklyReview | null>('weekly-reviews.json', weeklyReviewsDefault, (file: WeeklyReviewsFile) => {
    const review = file.reviews.find((r) => r.id === id);
    if (!review) return null;

    // Update the step data
    if (step === 'celebrate') {
      if (data.wins !== undefined) review.wins = data.wins;
      if (data.progressRating !== undefined) review.progressRating = data.progressRating;
    } else if (step === 'challenges') {
      if (data.challenges !== undefined) review.challenges = data.challenges;
      if (data.obstacles !== undefined) review.obstacles = data.obstacles;
    } else if (step === 'learnings') {
      if (data.learnings !== undefined) review.learnings = data.learnings;
      if (data.insights !== undefined) review.insights = data.insights;
    } else if (step === 'values') {
      if (data.valuesAlignment !== undefined) review.valuesAlignment = data.valuesAlignment;
      if (data.valuesReflection !== undefined) review.valuesReflection = data.valuesReflection;
    } else if (step === 'big_three') {
      if (data.bigThree !== undefined) review.bigThree = data.bigThree;
    } else if (step === 'schedule') {
      if (data.scheduleConfirmed !== undefined) review.scheduleConfirmed = data.scheduleConfirmed;
      if (data.scheduledFocusBlocks !== undefined) review.scheduledFocusBlocks = data.scheduledFocusBlocks;
      if (data.capacityCheck !== undefined) review.capacityCheck = data.capacityCheck;
    }

    review.currentStep = step;
    review.updatedAt = new Date().toISOString();

    return review;
  });
}

// Navigate to next step
export async function advanceWeeklyReviewStep(id: string): Promise<WeeklyReview | null> {
  const stepOrder: ReviewStepType[] = ['celebrate', 'challenges', 'learnings', 'values', 'big_three', 'schedule'];

  return updateData<WeeklyReview | null>('weekly-reviews.json', weeklyReviewsDefault, (file: WeeklyReviewsFile) => {
    const review = file.reviews.find((r) => r.id === id);
    if (!review) return null;

    const currentIndex = stepOrder.indexOf(review.currentStep);
    if (currentIndex < stepOrder.length - 1) {
      review.currentStep = stepOrder[currentIndex + 1];
    }

    review.updatedAt = new Date().toISOString();
    return review;
  });
}

// Navigate to previous step
export async function goBackWeeklyReviewStep(id: string): Promise<WeeklyReview | null> {
  const stepOrder: ReviewStepType[] = ['celebrate', 'challenges', 'learnings', 'values', 'big_three', 'schedule'];

  return updateData<WeeklyReview | null>('weekly-reviews.json', weeklyReviewsDefault, (file: WeeklyReviewsFile) => {
    const review = file.reviews.find((r) => r.id === id);
    if (!review) return null;

    const currentIndex = stepOrder.indexOf(review.currentStep);
    if (currentIndex > 0) {
      review.currentStep = stepOrder[currentIndex - 1];
    }

    review.updatedAt = new Date().toISOString();
    return review;
  });
}

// Complete a weekly review
export async function completeWeeklyReview(id: string): Promise<WeeklyReview | null> {
  return updateData<WeeklyReview | null>('weekly-reviews.json', weeklyReviewsDefault, (file: WeeklyReviewsFile) => {
    const review = file.reviews.find((r) => r.id === id);
    if (!review) return null;

    const now = new Date();
    const startedAt = new Date(review.startedAt);
    const durationMinutes = Math.round((now.getTime() - startedAt.getTime()) / 60000);

    review.status = 'completed';
    review.completedAt = now.toISOString();
    review.durationMinutes = durationMinutes;
    review.updatedAt = now.toISOString();

    return review;
  });
}

// Add a Big Three item
export async function addBigThreeItem(
  reviewId: string,
  item: Omit<BigThreeItem, 'id' | 'completed'>
): Promise<WeeklyReview | null> {
  return updateData<WeeklyReview | null>('weekly-reviews.json', weeklyReviewsDefault, (file: WeeklyReviewsFile) => {
    const review = file.reviews.find((r) => r.id === reviewId);
    if (!review) return null;

    if (review.bigThree.length >= 3) {
      return review; // Max 3 items
    }

    const bigThreeItem: BigThreeItem = {
      id: crypto.randomUUID(),
      title: item.title,
      category: item.category,
      linkedTaskId: item.linkedTaskId,
      completed: false,
    };

    review.bigThree.push(bigThreeItem);
    review.updatedAt = new Date().toISOString();

    return review;
  });
}

// Update a Big Three item completion status
export async function toggleBigThreeItem(
  reviewId: string,
  itemId: string,
  completed: boolean
): Promise<WeeklyReview | null> {
  return updateData<WeeklyReview | null>('weekly-reviews.json', weeklyReviewsDefault, (file: WeeklyReviewsFile) => {
    const review = file.reviews.find((r) => r.id === reviewId);
    if (!review) return null;

    const item = review.bigThree.find((i) => i.id === itemId);
    if (!item) return review;

    item.completed = completed;
    review.updatedAt = new Date().toISOString();

    return review;
  });
}

// Check if a review is due (for reminder)
export async function isWeeklyReviewDue(): Promise<{ isDue: boolean; weekStart: string | null }> {
  const file = await readData<WeeklyReviewsFile>('weekly-reviews.json', weeklyReviewsDefault);
  const now = new Date();
  const currentWeekStart = getMondayOfWeek(now);
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

  // Review is suggested on Friday (5), Saturday (6), or Sunday (0)
  const isReviewDay = dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0;

  if (!isReviewDay) {
    return { isDue: false, weekStart: null };
  }

  // Check if current week's review exists and is completed
  const existingReview = file.reviews.find((r) => r.weekStart === currentWeekStart);

  if (!existingReview || existingReview.status === 'in_progress') {
    return { isDue: true, weekStart: currentWeekStart };
  }

  return { isDue: false, weekStart: null };
}
