import * as data from '@/lib/data';
import { ProposedOperation, TaskCategory, OperationResult } from '@/types/data';

export async function executeOperations(
  operations: ProposedOperation[],
  defaultTargetDate: string
): Promise<{ results: OperationResult[]; allSucceeded: boolean }> {
  const tempIdMap: Record<string, string> = {};
  const results: OperationResult[] = [];

  for (const op of operations) {
    try {
      const result = await executeOneOperation(op, tempIdMap, defaultTargetDate);
      results.push(result);
      if (!result.success) {
        console.warn('Operation failed, stopping execution:', result);
        return { results, allSucceeded: false };
      }
    } catch (error: any) {
      console.error(`Operation ${op.op} threw error:`, error);
      results.push({
        op: op.op,
        description: op.description,
        success: false,
        error: error.message,
      });
      return { results, allSucceeded: false };
    }
  }

  return { results, allSucceeded: true };
}

type ScheduleBlockType = 'deep_work' | 'shallow_work' | 'meeting' | 'break' | 'life';

function resolveTempId(id: string | null, tempIdMap: Record<string, string>): string | null {
  if (id === null) return null;
  return tempIdMap[id] || id;
}

function resolveTempIdsInArray(ids: string[], tempIdMap: Record<string, string>): string[] {
  return ids.map((id) => {
    const resolved = tempIdMap[id] || id;
    if (id.startsWith('temp_') && !tempIdMap[id]) {
      console.warn(`Warning: Unresolved tempId in rankedTaskIds: ${id}`);
    }
    return resolved;
  });
}

function resolveTempIdsInNextActions(
  actions: Array<{ action: string; taskId: string | null }>,
  tempIdMap: Record<string, string>
): Array<{ action: string; taskId: string | null }> {
  return actions.map((a) => {
    const resolvedTaskId = resolveTempId(a.taskId, tempIdMap);
    if (a.taskId && a.taskId.startsWith('temp_') && !tempIdMap[a.taskId]) {
      console.warn(`Warning: Unresolved tempId in nextActions: ${a.taskId}`);
    }
    return { ...a, taskId: resolvedTaskId };
  });
}

function resolveTempIdsInScheduleBlocks(
  blocks: Array<{
    start: string;
    end: string;
    label: string;
    taskId: string | null;
    type: ScheduleBlockType;
  }>,
  tempIdMap: Record<string, string>
): Array<{
  start: string;
  end: string;
  label: string;
  taskId: string | null;
  type: ScheduleBlockType;
}> {
  return blocks.map((block) => {
    const resolvedTaskId = resolveTempId(block.taskId, tempIdMap);
    if (block.taskId && block.taskId.startsWith('temp_') && !tempIdMap[block.taskId]) {
      console.warn(`Warning: Unresolved tempId in scheduleBlock: ${block.taskId}`);
    }
    return { ...block, taskId: resolvedTaskId };
  });
}

async function executeOneOperation(
  op: ProposedOperation,
  tempIdMap: Record<string, string>,
  defaultTargetDate: string
): Promise<OperationResult> {
  switch (op.op) {
    case 'create_task': {
      const { tempId, ...taskData } = op.data as any;
      const task = await data.createTask({
        title: taskData.title,
        notes: taskData.notes || null,
        category: taskData.category as TaskCategory,
        status: 'active',
        dueOn: taskData.dueOn || null,
        dueTime: taskData.dueTime || null,
        location: taskData.location || null,
        recurrenceRule: taskData.recurrenceRule || null,
      });
      if (tempId) {
        tempIdMap[tempId] = task.id;
      }
      return { op: 'create_task', description: op.description, success: true, entityId: task.id };
    }

    case 'update_task': {
      const { id, ...updates } = op.data as any;
      const resolvedId = tempIdMap[id] || id;
      const task = await data.updateTask(resolvedId, updates);
      if (!task) {
        return {
          op: 'update_task',
          description: op.description,
          success: false,
          error: `Task not found: ${resolvedId}`,
        };
      }
      return { op: 'update_task', description: op.description, success: true, entityId: task.id };
    }

    case 'complete_task': {
      const { id, notes } = op.data as any;
      const resolvedId = tempIdMap[id] || id;
      const completionDate = defaultTargetDate;
      let appendNote: string | undefined;
      if (notes) {
        appendNote = `[Completed ${completionDate}] ${notes}`;
      }
      const task = await data.updateTask(resolvedId, { status: 'done' }, appendNote);
      if (!task) {
        return {
          op: 'complete_task',
          description: op.description,
          success: false,
          error: `Task not found: ${resolvedId}`,
        };
      }
      await data.recordCompletion(resolvedId, completionDate, notes || null);
      return { op: 'complete_task', description: op.description, success: true, entityId: task.id };
    }

    case 'complete_habit': {
      const { id, notes, targetDate } = op.data as any;
      const resolvedId = tempIdMap[id] || id;
      const completionDate = targetDate || defaultTargetDate;
      const alreadyCompleted = await data.hasCompletionForDate(resolvedId, completionDate);
      if (alreadyCompleted) {
        return { op: 'complete_habit', description: op.description, success: true, entityId: resolvedId };
      }
      await data.recordCompletion(resolvedId, completionDate, notes || null);
      return { op: 'complete_habit', description: op.description, success: true, entityId: resolvedId };
    }

    case 'delete_task': {
      const { id } = op.data as any;
      const resolvedId = tempIdMap[id] || id;
      const deleted = await data.deleteTask(resolvedId);
      return {
        op: 'delete_task',
        description: op.description,
        success: deleted,
        error: deleted ? undefined : `Task not found: ${resolvedId}`,
        entityId: resolvedId,
      };
    }

    case 'create_plan': {
      const { targetDate, ...planData } = op.data as any;
      const normalizedData = {
        rankedTaskIds: resolveTempIdsInArray(planData.rankedTaskIds ?? [], tempIdMap),
        nextActions: resolveTempIdsInNextActions(planData.nextActions ?? [], tempIdMap),
        scheduleBlocks: resolveTempIdsInScheduleBlocks(planData.scheduleBlocks ?? [], tempIdMap),
        assumptions: planData.assumptions ?? [],
      };
      const planDate = targetDate || defaultTargetDate;
      const plan = await data.savePlan(planDate, normalizedData, true);
      return { op: 'create_plan', description: op.description, success: true, entityId: plan.id };
    }

    case 'update_plan': {
      const { targetDate, ...planData } = op.data as any;
      const resolvedData: any = {};
      if (planData.rankedTaskIds !== undefined) {
        resolvedData.rankedTaskIds = resolveTempIdsInArray(planData.rankedTaskIds, tempIdMap);
      }
      if (planData.nextActions !== undefined) {
        resolvedData.nextActions = resolveTempIdsInNextActions(planData.nextActions, tempIdMap);
      }
      if (planData.scheduleBlocks !== undefined) {
        resolvedData.scheduleBlocks = resolveTempIdsInScheduleBlocks(planData.scheduleBlocks, tempIdMap);
      }
      if (planData.assumptions !== undefined) {
        resolvedData.assumptions = planData.assumptions;
      }
      const planDate = targetDate || defaultTargetDate;
      const plan = await data.savePlan(planDate, resolvedData, false);
      return { op: 'update_plan', description: op.description, success: true, entityId: plan.id };
    }

    default:
      return {
        op: op.op,
        description: op.description,
        success: false,
        error: `Unknown operation: ${op.op}`,
      };
  }
}
