'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ============================================
// TYPES
// ============================================

interface Task {
  id: string;
  title: string;
  notes: string | null;
  category: 'research' | 'teaching_service' | 'family' | 'health';
  status: 'active' | 'done' | 'archived';
  dueOn: string | null;
  dueTime: string | null;
  location: string | null;
  recurrenceRule: string | null;
  createdAt: string;
  updatedAt: string;
  completedToday?: boolean;
}

interface ScheduleBlock {
  start: string;
  end: string;
  label: string;
  taskId: string | null;
  type: 'deep_work' | 'shallow_work' | 'meeting' | 'break' | 'life';
}

interface Plan {
  id: string;
  date: string;
  rankedTaskIds: string[];
  nextActions: { action: string; taskId: string | null }[];
  scheduleBlocks: ScheduleBlock[];
  assumptions: string[];
  createdAt: string;
  updatedAt: string;
}

interface ProposedOperation {
  op: string;
  description: string;
  data: Record<string, unknown>;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposedOperations?: ProposedOperation[] | null;
  timestamp: Date;
}

// ============================================
// CONSTANTS
// ============================================

const CATEGORY_CONFIG = {
  research: { label: 'Research', icon: '◈', color: 'text-cyan-400' },
  teaching_service: { label: 'Teaching & Service', icon: '◎', color: 'text-amber-400' },
  family: { label: 'Family', icon: '◉', color: 'text-rose-400' },
  health: { label: 'Health', icon: '◐', color: 'text-emerald-400' },
} as const;

type TaskCategoryKey = keyof typeof CATEGORY_CONFIG;

const BLOCK_TYPE_STYLES = {
  deep_work: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', label: 'Deep Work' },
  shallow_work: { bg: 'bg-amber-500/20', border: 'border-amber-500/40', label: 'Shallow Work' },
  meeting: { bg: 'bg-purple-500/20', border: 'border-purple-500/40', label: 'Meeting' },
  break: { bg: 'bg-slate-500/20', border: 'border-slate-500/40', label: 'Break' },
  life: { bg: 'bg-rose-500/20', border: 'border-rose-500/40', label: 'Life' },
} as const;

const SCHEDULE_OFFSET_MIN = -1;
const SCHEDULE_OFFSET_MAX = 2;

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateAtLocalMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDaysLocal(base: Date, days: number): Date {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  date.setDate(date.getDate() + days);
  return date;
}

function getScheduleOffsetTag(offset: number): string {
  if (offset === -1) return 'YESTERDAY';
  if (offset === 0) return 'TODAY';
  if (offset === 1) return 'TOMORROW';
  return `+${offset}`;
}

// ============================================
// GLASS PANEL COMPONENT
// ============================================

function GlassPanel({ 
  children, 
  className = '',
  glow = false,
}: { 
  children: React.ReactNode; 
  className?: string;
  glow?: boolean;
}) {
  return (
    <div 
      className={`
        relative
        bg-slate-900/70 backdrop-blur-xl
        border border-slate-700/50
        rounded-lg
        shadow-2xl
        ${glow ? 'shadow-[0_0_30px_rgba(6,182,212,0.15)]' : ''}
        ${className}
      `}
      style={{ WebkitBackdropFilter: 'blur(24px)' }}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-400/30 to-transparent" />
      {children}
    </div>
  );
}

// ============================================
// AMBIENT BACKGROUND
// ============================================

function AmbientBackground({ dim }: { dim: boolean }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setImageLoaded(true);
    img.onerror = () => setImageError(true);
    img.src = '/backgrounds/ambient-outpost.jpg';
  }, []);

  return (
    <div className="fixed inset-0 z-0">
      {/* Gradient fallback - always visible as base */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-black" />

      {/* Atmospheric effects for fallback */}
      {imageError && (
        <>
          <div className="absolute bottom-0 left-0 right-0 h-[40%] bg-gradient-to-t from-slate-800/50 to-transparent" />
          <div className="absolute bottom-[25%] left-[20%] w-32 h-20 bg-amber-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-[20%] right-[30%] w-24 h-16 bg-amber-500/10 rounded-full blur-3xl" />
        </>
      )}

      {/* Actual background image */}
      {imageLoaded && !imageError && (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000"
          style={{ backgroundImage: `url('/backgrounds/ambient-outpost.jpg')` }}
        />
      )}

      {dim && (
        <>
          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/25 via-slate-950/10 to-transparent" />

          {/* Vignette effect */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.18)_100%)]" />

          {/* Noise texture */}
          <div
            className="absolute inset-0 opacity-[0.02] pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            }}
          />
        </>
      )}
    </div>
  );
}

// ============================================
// TASK DRAWER (LEFT - SLIDES IN)
// ============================================

function CategoryDropZone({ id, children }: { id: TaskCategoryKey; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`
        rounded-lg
        ${isOver ? 'bg-cyan-500/5 ring-1 ring-cyan-500/20' : ''}
      `}
    >
      {children}
    </div>
  );
}

function SortableManifestTask({
  task,
  onSelectTask,
  onSetTaskCompleted,
}: {
  task: Task;
  onSelectTask: (task: Task) => void;
  onSetTaskCompleted: (task: Task, completed: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelectTask(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelectTask(task);
      }}
      role="button"
      tabIndex={0}
      className={`
        w-full text-left p-2 rounded
        bg-slate-800/30 hover:bg-slate-700/50
        border border-transparent hover:border-slate-600/50
        transition-all duration-200
        group cursor-pointer
        flex items-start gap-3
        ${isDragging ? 'opacity-60' : ''}
      `}
    >
      <div className="flex flex-col items-center gap-2 pt-0.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="
            text-slate-600 group-hover:text-slate-400
            cursor-grab active:cursor-grabbing
            select-none
          "
          aria-label="Drag to reorder"
        >
          ⠿
        </button>
        <input
          type="checkbox"
          checked={false}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            if (e.target.checked) onSetTaskCompleted(task, true);
          }}
          className="accent-cyan-500"
          aria-label={`Complete task: ${task.title}`}
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-slate-300 text-sm group-hover:text-slate-100 transition-colors truncate">
          {task.title}
        </p>
        {task.dueOn && (
          <p className="text-slate-500 text-xs font-mono mt-1">
            {task.dueTime ? `${task.dueOn} @ ${task.dueTime}` : task.dueOn}
          </p>
        )}
        {task.recurrenceRule && (
          <p className="text-slate-600 text-[10px] font-mono mt-1 uppercase tracking-wider">
            Daily
          </p>
        )}
      </div>
    </div>
  );
}

function ManifestTaskOverlay({ task }: { task: Task }) {
  return (
    <div className="w-72">
      <div className="p-2 rounded bg-slate-900/90 border border-slate-700/60 shadow-xl">
        <p className="text-slate-200 text-sm truncate">{task.title}</p>
        {task.recurrenceRule && (
          <p className="text-slate-500 text-[10px] font-mono mt-1 uppercase tracking-wider">
            Daily
          </p>
        )}
      </div>
    </div>
  );
}

function TaskDrawer({
  isOpen,
  onToggle,
  tasks,
  onSelectTask,
  onSetTaskCompleted,
  onUpdateManifestOrder,
}: {
  isOpen: boolean;
  onToggle: () => void;
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onSetTaskCompleted: (task: Task, completed: boolean) => void;
  onUpdateManifestOrder: (orderByCategory: Record<TaskCategoryKey, string[]>) => Promise<void>;
}) {
  const isCompletedToday = (task: Task) => Boolean(task.completedToday);
  const isVisibleInManifest = (task: Task) =>
    task.status === 'active' && !(task.recurrenceRule && isCompletedToday(task));

  const categories = Object.keys(CATEGORY_CONFIG) as TaskCategoryKey[];

  const buildManifestOrder = (taskList: Task[]): Record<TaskCategoryKey, string[]> => ({
    research: taskList.filter((task) => isVisibleInManifest(task) && task.category === 'research').map((t) => t.id),
    teaching_service: taskList
      .filter((task) => isVisibleInManifest(task) && task.category === 'teaching_service')
      .map((t) => t.id),
    family: taskList.filter((task) => isVisibleInManifest(task) && task.category === 'family').map((t) => t.id),
    health: taskList.filter((task) => isVisibleInManifest(task) && task.category === 'health').map((t) => t.id),
  });

  const [manifestOrder, setManifestOrder] = useState<Record<TaskCategoryKey, string[]>>(() =>
    buildManifestOrder(tasks)
  );
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const manifestSnapshotRef = useRef<Record<TaskCategoryKey, string[]> | null>(null);
  const [manifestSaving, setManifestSaving] = useState(false);

  useEffect(() => {
    if (activeDragId) return;
    setManifestOrder(buildManifestOrder(tasks));
  }, [tasks, activeDragId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const findContainer = (items: Record<TaskCategoryKey, string[]>, id: string): TaskCategoryKey | null => {
    const maybeCategory = id as TaskCategoryKey;
    if (categories.includes(maybeCategory)) return maybeCategory;
    return categories.find((category) => items[category].includes(id)) ?? null;
  };

  const orderSignature = (order: Record<TaskCategoryKey, string[]>): string =>
    categories.map((category) => `${category}:${order[category].join(',')}`).join('|');

  const persistManifestOrder = async (orderByCategory: Record<TaskCategoryKey, string[]>) => {
    setManifestSaving(true);
    try {
      await onUpdateManifestOrder(orderByCategory);
    } finally {
      setManifestSaving(false);
    }
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    manifestSnapshotRef.current = manifestOrder;
    setActiveDragId(String(active.id));
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    setManifestOrder((prev) => {
      const activeContainer = findContainer(prev, activeId);
      const overContainer = findContainer(prev, overId);
      if (!activeContainer || !overContainer) return prev;
      if (activeContainer === overContainer) return prev;

      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      if (!activeItems.includes(activeId)) return prev;

      const nextActive = activeItems.filter((id) => id !== activeId);
      const overIndex = overId === overContainer ? overItems.length : overItems.indexOf(overId);
      const insertIndex = overIndex === -1 ? overItems.length : overIndex;
      const nextOver = [
        ...overItems.slice(0, insertIndex),
        activeId,
        ...overItems.slice(insertIndex),
      ];

      return {
        ...prev,
        [activeContainer]: nextActive,
        [overContainer]: nextOver,
      };
    });
  };

  const handleDragCancel = () => {
    if (manifestSnapshotRef.current) {
      setManifestOrder(manifestSnapshotRef.current);
    }
    manifestSnapshotRef.current = null;
    setActiveDragId(null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const activeId = String(active.id);
    setActiveDragId(null);

    if (!over) {
      if (manifestSnapshotRef.current) setManifestOrder(manifestSnapshotRef.current);
      manifestSnapshotRef.current = null;
      return;
    }

    const overId = String(over.id);
    const snapshot = manifestSnapshotRef.current;
    manifestSnapshotRef.current = null;

    let nextOrder: Record<TaskCategoryKey, string[]> | null = null;

    setManifestOrder((prev) => {
      const activeContainer = findContainer(prev, activeId);
      const overContainer = findContainer(prev, overId);
      if (!activeContainer || !overContainer) {
        nextOrder = prev;
        return prev;
      }

      if (activeContainer !== overContainer) {
        nextOrder = prev;
        return prev;
      }

      const activeIndex = prev[activeContainer].indexOf(activeId);
      const overIndex =
        overId === overContainer
          ? prev[overContainer].length - 1
          : prev[overContainer].indexOf(overId);

      if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) {
        nextOrder = prev;
        return prev;
      }

      const updated = {
        ...prev,
        [overContainer]: arrayMove(prev[overContainer], activeIndex, overIndex),
      };
      nextOrder = updated;
      return updated;
    });

    const candidate = nextOrder ?? manifestOrder;
    if (snapshot && orderSignature(snapshot) === orderSignature(candidate)) {
      return;
    }
    void persistManifestOrder(candidate);
  };

  const completedTodayTasks = tasks.filter((task) => isCompletedToday(task));
  const [showCompleted, setShowCompleted] = useState(false);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const activeDragTask = activeDragId ? taskById.get(activeDragId) : null;

  return (
    <>
      {/* Toggle Button - visible when drawer is closed */}
      <button
        onClick={onToggle}
        className={`
          fixed left-4 top-1/2 -translate-y-1/2 z-50
          w-12 h-24 
          bg-slate-900/80 backdrop-blur-md
          border border-slate-700/50
          rounded-r-lg
          flex items-center justify-center
          transition-all duration-300
          hover:bg-slate-800/80 hover:border-cyan-500/30
          group
          ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}
        `}
        style={{ WebkitBackdropFilter: 'blur(12px)' }}
        aria-label="Open task list"
      >
        <span className="text-slate-400 group-hover:text-cyan-400 transition-colors text-lg">
          ▶
        </span>
      </button>

      {/* Drawer Panel */}
      <div 
        className={`
          fixed left-0 top-0 h-full z-40
          transition-transform duration-500 ease-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <GlassPanel className="h-full w-80 flex flex-col rounded-l-none">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 text-sm font-mono">◆</span>
              <h2 className="text-slate-200 font-semibold tracking-wide">TASK MANIFEST</h2>
              {manifestSaving && (
                <span className="text-slate-500 text-xs font-mono uppercase tracking-wider">
                  Saving…
                </span>
              )}
            </div>
            <button
              onClick={onToggle}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1"
              aria-label="Close task list"
            >
              ✕
            </button>
          </div>

          {/* Task Categories */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragCancel={handleDragCancel}
              onDragEnd={handleDragEnd}
            >
              {categories.map((category) => {
                const config = CATEGORY_CONFIG[category];
                const taskIds = manifestOrder[category] ?? [];
                return (
                  <CategoryDropZone key={category} id={category}>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className={config.color}>{config.icon}</span>
                        <span className="text-slate-400 font-mono uppercase tracking-wider text-xs">
                          {config.label}
                        </span>
                        <span className="text-slate-600 text-xs">({taskIds.length})</span>
                      </div>

                      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
                        {taskIds.length === 0 ? (
                          <p className="text-slate-600 text-xs italic pl-5 py-2">
                            Drop tasks here
                          </p>
                        ) : (
                          <div className="space-y-1 pl-5">
                            {taskIds.map((taskId) => {
                              const task = taskById.get(taskId);
                              if (!task) return null;
                              return (
                                <SortableManifestTask
                                  key={taskId}
                                  task={task}
                                  onSelectTask={onSelectTask}
                                  onSetTaskCompleted={onSetTaskCompleted}
                                />
                              );
                            })}
                          </div>
                        )}
                      </SortableContext>
                    </div>
                  </CategoryDropZone>
                );
              })}

              <DragOverlay>
                {activeDragTask ? <ManifestTaskOverlay task={activeDragTask} /> : null}
              </DragOverlay>
            </DndContext>

            <div className="pt-2 border-t border-slate-700/30">
              <button
                onClick={() => setShowCompleted((v) => !v)}
                className="
                  w-full flex items-center gap-2 py-2
                  text-slate-400 hover:text-slate-200
                  transition-colors
                "
              >
                <span className="text-amber-400 text-xs font-mono">◆</span>
                <span className="text-xs font-mono uppercase tracking-wider">
                  Completed Today
                </span>
                <span className="text-slate-600 text-xs">({completedTodayTasks.length})</span>
                <span className="ml-auto text-slate-600">
                  {showCompleted ? '▼' : '▶'}
                </span>
              </button>

              {showCompleted && (
                <div className="pl-5 space-y-1">
                  {completedTodayTasks.length === 0 ? (
                    <p className="text-slate-600 text-xs italic py-2">
                      Nothing completed yet
                    </p>
                  ) : (
                    completedTodayTasks.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => onSelectTask(task)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onSelectTask(task);
                        }}
                        role="button"
                        tabIndex={0}
                        className="
                          w-full text-left p-2 rounded
                          bg-slate-900/40 hover:bg-slate-900/60
                          border border-slate-800/40 hover:border-slate-700/60
                          transition-all duration-200
                          group cursor-pointer
                          flex items-start gap-3
                        "
                      >
                        <div className="flex flex-col items-center gap-2 pt-0.5">
                          <span
                            className="text-slate-700 select-none"
                            aria-hidden="true"
                          >
                            ·
                          </span>
                          <input
                            type="checkbox"
                            checked
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              if (!e.target.checked) onSetTaskCompleted(task, false);
                            }}
                            className="accent-cyan-500"
                            aria-label={`Undo completion: ${task.title}`}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-slate-400 text-sm truncate line-through">
                            {task.title}
                          </p>
                          <p className="text-slate-600 text-xs font-mono mt-1 uppercase tracking-wider">
                            {task.recurrenceRule ? 'Completed today' : 'Completed'}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-700/50">
            <p className="text-slate-600 text-xs font-mono text-center">
              {tasks.filter(isVisibleInManifest).length} ACTIVE TASKS
            </p>
          </div>
        </GlassPanel>
      </div>

      {/* Backdrop overlay when drawer is open */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/[0.06] z-30"
          onClick={onToggle}
        />
      )}
    </>
  );
}

// ============================================
// SCHEDULE PANEL (RIGHT - ALWAYS VISIBLE)
// ============================================

function SchedulePanel({
  onClose,
  plan,
  tasks,
  currentTime,
  viewDate,
  offset,
  canPrevDay,
  canNextDay,
  onPrevDay,
  onNextDay,
  onGoToday,
  isLoading,
  error,
}: {
  onClose?: () => void;
  plan: Plan | null;
  tasks: Task[];
  currentTime: Date;
  viewDate: Date;
  offset: number;
  canPrevDay: boolean;
  canNextDay: boolean;
  onPrevDay: () => void;
  onNextDay: () => void;
  onGoToday: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  const scheduleBlocks = plan?.scheduleBlocks || [];
  const taskMap = tasks.reduce((acc, t) => ({ ...acc, [t.id]: t }), {} as Record<string, Task>);
  const viewDateLabel = viewDate
    .toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
    .toUpperCase();
  const offsetTag = getScheduleOffsetTag(offset);

  return (
    <GlassPanel className="w-72 h-full flex flex-col rounded-r-none" glow>
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 text-sm font-mono">◇</span>
            <h2 className="text-slate-200 font-semibold tracking-wide">DAILY SCHEDULE</h2>
          </div>
          <div className="flex items-center gap-1">
            {onClose && (
              <button
                onClick={onClose}
                className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                aria-label="Close schedule"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Day navigator */}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={onPrevDay}
            disabled={!canPrevDay || isLoading}
            className="
              w-8 h-8 rounded
              bg-slate-800/30 hover:bg-slate-700/50
              border border-slate-700/40 hover:border-cyan-500/30
              text-slate-400 hover:text-cyan-400
              transition-all duration-200
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-400 disabled:hover:bg-slate-800/30
            "
            aria-label="Previous day"
          >
            ◀
          </button>

          <div className="flex-1 min-w-0 text-center">
            <p className="text-slate-500 text-xs font-mono truncate">{viewDateLabel}</p>
            <p className="text-slate-600 text-[10px] font-mono tracking-[0.2em] mt-0.5">
              {offsetTag}
            </p>
          </div>

          <button
            onClick={onNextDay}
            disabled={!canNextDay || isLoading}
            className="
              w-8 h-8 rounded
              bg-slate-800/30 hover:bg-slate-700/50
              border border-slate-700/40 hover:border-cyan-500/30
              text-slate-400 hover:text-cyan-400
              transition-all duration-200
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-400 disabled:hover:bg-slate-800/30
            "
            aria-label="Next day"
          >
            ▶
          </button>
        </div>

        {offset !== 0 && (
          <button
            onClick={onGoToday}
            disabled={isLoading}
            className="
              mt-2 w-full py-1.5 rounded
              bg-slate-800/20 hover:bg-slate-800/40
              border border-slate-700/30 hover:border-slate-600/50
              text-slate-400 hover:text-slate-200
              text-xs font-mono uppercase tracking-wider
              transition-all duration-200
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            Today
          </button>
        )}
      </div>

      {/* Current time display */}
      <div className="px-4 py-2 border-b border-slate-700/30">
        <p className="text-cyan-400 text-lg font-mono">
          {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
        </p>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-600 text-sm font-mono">Loading…</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-rose-400 text-sm font-mono text-center">{error}</p>
          </div>
        ) : scheduleBlocks.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-600 text-sm italic">No schedule planned</p>
          </div>
        ) : (
          <div className="space-y-2">
            {scheduleBlocks.map((block, idx) => {
              const style = BLOCK_TYPE_STYLES[block.type] || BLOCK_TYPE_STYLES.shallow_work;
              const linkedTask = block.taskId ? taskMap[block.taskId] : null;

              return (
                <div
                  key={idx}
                  className={`
                    p-3 rounded-lg border
                    ${style.bg} ${style.border}
                    transition-all duration-200
                    hover:scale-[1.02]
                  `}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-300 text-xs font-mono">
                      {block.start} — {block.end}
                    </span>
                  </div>
                  <p className="text-slate-200 text-sm font-medium">{block.label}</p>
                  {linkedTask && (
                    <p className="text-slate-400 text-xs mt-1 truncate">
                      → {linkedTask.title}
                    </p>
                  )}
                  <p className="text-slate-500 text-xs mt-1 font-mono uppercase">
                    {style.label}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-700/50">
        <p className="text-slate-600 text-xs font-mono text-center">
          {isLoading ? 'LOADING' : error ? 'ERROR' : `${scheduleBlocks.length} BLOCKS SCHEDULED`}
        </p>
      </div>
    </GlassPanel>
  );
}

// ============================================
// SCHEDULE DRAWER (RIGHT - SLIDES IN)
// ============================================

function ScheduleDrawer({
  isOpen,
  onToggle,
  plan,
  tasks,
  currentTime,
  viewDate,
  offset,
  canPrevDay,
  canNextDay,
  onPrevDay,
  onNextDay,
  onGoToday,
  isLoading,
  error,
}: {
  isOpen: boolean;
  onToggle: () => void;
  plan: Plan | null;
  tasks: Task[];
  currentTime: Date;
  viewDate: Date;
  offset: number;
  canPrevDay: boolean;
  canNextDay: boolean;
  onPrevDay: () => void;
  onNextDay: () => void;
  onGoToday: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  return (
    <>
      {/* Toggle Button - visible when drawer is closed */}
      <button
        onClick={onToggle}
        className={`
          fixed right-4 top-1/2 -translate-y-1/2 z-50
          w-12 h-24
          bg-slate-900/80 backdrop-blur-md
          border border-slate-700/50
          rounded-l-lg
          flex items-center justify-center
          transition-all duration-300
          hover:bg-slate-800/80 hover:border-cyan-500/30
          group
          ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}
        `}
        style={{ WebkitBackdropFilter: 'blur(12px)' }}
        aria-label="Open schedule"
      >
        <span className="text-slate-400 group-hover:text-cyan-400 transition-colors text-lg">
          ◀
        </span>
      </button>

      {/* Drawer Panel */}
      <div
        className={`
          fixed right-0 top-0 h-full z-40
          transition-transform duration-500 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        <SchedulePanel
          onClose={onToggle}
          plan={plan}
          tasks={tasks}
          currentTime={currentTime}
          viewDate={viewDate}
          offset={offset}
          canPrevDay={canPrevDay}
          canNextDay={canNextDay}
          onPrevDay={onPrevDay}
          onNextDay={onNextDay}
          onGoToday={onGoToday}
          isLoading={isLoading}
          error={error}
        />
      </div>

      {/* Backdrop overlay when drawer is open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/[0.06] z-30"
          onClick={onToggle}
        />
      )}
    </>
  );
}

// ============================================
// CHAT OVERLAY (CENTER - TOGGLEABLE MODAL)
// ============================================

function ChatOverlay({
  isVisible,
  onToggle,
  messages,
  onSendMessage,
  isSending,
  pendingOperations,
  onConfirmOperations,
  onDismissOperations,
}: {
  isVisible: boolean;
  onToggle: () => void;
  messages: ChatMessage[];
  onSendMessage: (message: string, calendar?: string) => void;
  isSending: boolean;
  pendingOperations: ProposedOperation[] | null;
  onConfirmOperations: (indexes: number[]) => void;
  onDismissOperations: () => void;
}) {
  const [inputValue, setInputValue] = useState('');
  const [calendarValue, setCalendarValue] = useState('');
  const [selectedOps, setSelectedOps] = useState<Set<number>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (pendingOperations) {
      setSelectedOps(new Set(pendingOperations.map((_, i) => i)));
    }
  }, [pendingOperations]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isSending) {
      onSendMessage(inputValue.trim(), calendarValue.trim() || undefined);
      setInputValue('');
      setCalendarValue('');
    }
  };

  const toggleOp = (idx: number) => {
    const newSet = new Set(selectedOps);
    if (newSet.has(idx)) {
      newSet.delete(idx);
    } else {
      newSet.add(idx);
    }
    setSelectedOps(newSet);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onToggle}
      />

      {/* Chat Panel */}
      <GlassPanel className="relative w-full max-w-2xl h-[70vh] flex flex-col" glow>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
            <h2 className="text-slate-200 font-semibold tracking-wide">PROFFLOW TERMINAL</h2>
          </div>
          <button
            onClick={onToggle}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1 text-xl"
            aria-label="Close chat"
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-slate-600 text-sm italic">Start a conversation...</p>
            </div>
          )}
          
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`
                max-w-[80%] p-3 rounded-lg
                ${msg.role === 'user' 
                  ? 'bg-cyan-600/30 border border-cyan-500/30' 
                  : 'bg-slate-800/50 border border-slate-700/50'}
              `}>
                <p className="text-xs text-slate-500 font-mono mb-1 uppercase">
                  {msg.role === 'user' ? 'You' : 'ProfFlow'}
                </p>
                <p className="text-slate-200 text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {isSending && (
            <div className="flex justify-start">
              <div className="bg-slate-800/50 border border-slate-700/50 p-3 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-ping" />
                  <span className="text-slate-400 text-sm">Processing...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Pending Operations Panel */}
        {pendingOperations && pendingOperations.length > 0 && (
          <div className="border-t border-slate-700/50 p-4 bg-slate-800/30">
            <p className="text-xs text-amber-400 font-mono mb-3 uppercase">
              ◆ Proposed Operations ({pendingOperations.length})
            </p>
            <div className="space-y-2 max-h-32 overflow-y-auto mb-3 scrollbar-thin">
              {pendingOperations.map((op, idx) => (
                <label
                  key={idx}
                  className="flex items-start gap-3 p-2 rounded bg-slate-900/50 hover:bg-slate-900/70 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedOps.has(idx)}
                    onChange={() => toggleOp(idx)}
                    className="mt-1 accent-cyan-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-300 text-sm">{op.description}</p>
                    <p className="text-slate-500 text-xs font-mono">{op.op}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onConfirmOperations(Array.from(selectedOps))}
                disabled={selectedOps.size === 0}
                className="
                  flex-1 py-2 px-4 rounded
                  bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:cursor-not-allowed
                  text-white text-sm font-medium
                  transition-colors
                "
              >
                Confirm ({selectedOps.size})
              </button>
              <button
                onClick={onDismissOperations}
                className="
                  py-2 px-4 rounded
                  bg-slate-700 hover:bg-slate-600
                  text-slate-300 text-sm
                  transition-colors
                "
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-slate-700/50 space-y-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Enter command or request..."
            disabled={isSending}
            rows={2}
            className="
              w-full p-3 rounded-lg
              bg-slate-800/50 border border-slate-700/50
              text-slate-200 placeholder-slate-500
              focus:outline-none focus:border-cyan-500/50
              resize-none
              text-sm
            "
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={calendarValue}
              onChange={(e) => setCalendarValue(e.target.value)}
              placeholder="Calendar context (optional)"
              disabled={isSending}
              className="
                flex-1 p-2 rounded
                bg-slate-800/30 border border-slate-700/30
                text-slate-300 placeholder-slate-600
                focus:outline-none focus:border-slate-600
                text-xs
              "
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isSending}
              className="
                px-6 py-2 rounded
                bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:cursor-not-allowed
                text-white text-sm font-medium
                transition-colors
              "
            >
              {isSending ? '...' : 'Send'}
            </button>
          </div>
        </form>
      </GlassPanel>
    </div>
  );
}

// ============================================
// FOCUS TASK (BOTTOM CENTER - ALWAYS VISIBLE)
// ============================================

function FocusTask({
  onClose,
  task,
  onComplete,
}: {
  onClose?: () => void;
  task: Task | null;
  onComplete: () => void;
}) {
  if (!task) {
    return (
      <div className="w-full max-w-xl">
        <GlassPanel className="p-6 text-center">
          {onClose && (
            <button
              onClick={onClose}
              className="absolute top-3 right-3 text-slate-500 hover:text-slate-300 transition-colors p-1"
              aria-label="Close current focus"
            >
              ✕
            </button>
          )}
          <p className="text-slate-500 text-sm italic">No focus task selected</p>
          <p className="text-slate-600 text-xs mt-2">Open the task panel or use chat to set your focus</p>
        </GlassPanel>
      </div>
    );
  }

  const config = CATEGORY_CONFIG[task.category];

  return (
    <div className="w-full max-w-xl">
      <GlassPanel className="p-6 border-cyan-500/30" glow>
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-slate-500 hover:text-slate-300 transition-colors p-1"
            aria-label="Close current focus"
          >
            ✕
          </button>
        )}
        {/* Status indicator */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '75ms' }} />
            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
          </div>
          <span className="text-cyan-400 text-xs font-mono uppercase tracking-wider">
            Current Focus
          </span>
        </div>

        {/* Task title */}
        <h3 className="text-slate-100 text-xl font-semibold mb-2">{task.title}</h3>

        {/* Meta info */}
        <div className="flex items-center gap-4 text-sm">
          <span className={`flex items-center gap-1 ${config.color}`}>
            {config.icon} {config.label}
          </span>
          {task.dueTime && (
            <span className="text-slate-400 font-mono">
              Due: {task.dueTime}
            </span>
          )}
        </div>

        {/* Notes */}
        {task.notes && (
          <p className="text-slate-400 text-sm mt-3 line-clamp-2">{task.notes}</p>
        )}

        {/* Action */}
        <button
          onClick={onComplete}
          className="
            mt-4 w-full py-2 rounded
            bg-emerald-600/20 border border-emerald-500/30
            text-emerald-400 text-sm font-medium
            hover:bg-emerald-600/30 hover:border-emerald-500/50
            transition-all
          "
        >
          Mark Complete ✓
        </button>
      </GlassPanel>
    </div>
  );
}

// ============================================
// FOCUS DRAWER (BOTTOM CENTER - SLIDES UP)
// ============================================

function FocusDrawer({
  isOpen,
  onToggle,
  task,
  onComplete,
}: {
  isOpen: boolean;
  onToggle: () => void;
  task: Task | null;
  onComplete: () => void;
}) {
  return (
    <>
      {/* Toggle Button - visible when drawer is closed */}
      <button
        onClick={onToggle}
        className={`
          fixed bottom-4 left-1/2 -translate-x-1/2 z-50
          px-6 py-3
          bg-slate-900/80 backdrop-blur-md
          border border-slate-700/50
          rounded-t-lg
          flex items-center justify-center gap-2
          transition-all duration-300
          hover:bg-slate-800/80 hover:border-cyan-500/30
          group
          ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}
        `}
        style={{ WebkitBackdropFilter: 'blur(12px)' }}
        aria-label="Open current focus"
      >
        <span className="text-slate-400 group-hover:text-cyan-400 transition-colors text-sm">
          ▲
        </span>
        <span className="text-slate-400 group-hover:text-cyan-400 transition-colors text-xs font-mono uppercase tracking-wider">
          Current Focus
        </span>
      </button>

      {/* Drawer Panel */}
      <div
        className={`
          fixed inset-x-0 bottom-0 z-40
          flex justify-center px-4 pb-8
          transition-transform duration-500 ease-out
          ${isOpen ? 'translate-y-0' : 'translate-y-full'}
        `}
      >
        <FocusTask task={task} onComplete={onComplete} onClose={onToggle} />
      </div>

      {/* Backdrop overlay when drawer is open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/[0.06] z-30"
          onClick={onToggle}
        />
      )}
    </>
  );
}

// ============================================
// CHAT TOGGLE BUTTON (FLOATING)
// ============================================

function ChatToggle({
  onClick,
  hasUnread,
  rightOffsetClass,
}: {
  onClick: () => void;
  hasUnread: boolean;
  rightOffsetClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        fixed bottom-8 ${rightOffsetClass} z-50
        w-14 h-14 rounded-full
        bg-slate-900/80 backdrop-blur-md
        border border-slate-700/50
        flex items-center justify-center
        hover:bg-slate-800/80 hover:border-cyan-500/30
        transition-all duration-300
        group
        shadow-lg
      `}
      style={{ WebkitBackdropFilter: 'blur(12px)' }}
      aria-label="Toggle chat"
    >
      <span className="text-slate-400 group-hover:text-cyan-400 transition-colors text-xl">
        💬
      </span>
      {hasUnread && (
        <span className="absolute top-0 right-0 w-3 h-3 bg-cyan-400 rounded-full animate-pulse" />
      )}
    </button>
  );
}

// ============================================
// MAIN PAGE COMPONENT
// ============================================

export default function ProfFlowPage() {
  // Data State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [focusTask, setFocusTask] = useState<Task | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [scheduleOffset, setScheduleOffset] = useState(0);
  const [scheduleViewPlan, setScheduleViewPlan] = useState<Plan | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const schedulePlanCacheRef = useRef<Record<string, Plan | null>>({});
  const [scheduleReloadNonce, setScheduleReloadNonce] = useState(0);

  // UI State
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [scheduleDrawerOpen, setScheduleDrawerOpen] = useState(false);
  const [focusDrawerOpen, setFocusDrawerOpen] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [pendingOperations, setPendingOperations] = useState<ProposedOperation[] | null>(null);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);

  const todayDate = getDateAtLocalMidnight(currentTime);
  const scheduleViewDate = addDaysLocal(todayDate, scheduleOffset);
  const scheduleViewDateKey = getLocalDateKey(scheduleViewDate);
  const canPrevScheduleDay = scheduleOffset > SCHEDULE_OFFSET_MIN;
  const canNextScheduleDay = scheduleOffset < SCHEDULE_OFFSET_MAX;

  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch initial data
  useEffect(() => {
    fetchTasks();
    fetchPlan();
  }, []);

  // Load plan for the schedule viewer day (separate from today's plan used for focus).
  useEffect(() => {
    const dateKey = scheduleViewDateKey;

    if (scheduleOffset === 0) {
      schedulePlanCacheRef.current[dateKey] = plan ?? null;
      setScheduleViewPlan(plan ?? null);
      setScheduleLoading(false);
      setScheduleError(null);
      return;
    }

    const cache = schedulePlanCacheRef.current;
    if (Object.prototype.hasOwnProperty.call(cache, dateKey)) {
      setScheduleViewPlan(cache[dateKey] ?? null);
      setScheduleLoading(false);
      setScheduleError(null);
      return;
    }

    const controller = new AbortController();
    setScheduleLoading(true);
    setScheduleError(null);

    fetch(`/api/plans/today?date=${encodeURIComponent(dateKey)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch plan: ${res.status}`);
        }
        const data = await res.json();
        const fetchedPlan = (data.plan ?? null) as Plan | null;
        schedulePlanCacheRef.current[dateKey] = fetchedPlan;
        setScheduleViewPlan(fetchedPlan);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('Failed to fetch schedule plan:', err);
        setScheduleError('Failed to load schedule');
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setScheduleLoading(false);
      });

    return () => controller.abort();
  }, [plan, scheduleOffset, scheduleViewDateKey, scheduleReloadNonce]);

  // Set focus task from plan's top ranked task
  useEffect(() => {
    if (tasks.length === 0) {
      setFocusTask(null);
      return;
    }

    const isEligible = (task: Task) =>
      task.status === 'active' && !(task.recurrenceRule && task.completedToday);

    if (focusTask) {
      const refreshed = tasks.find((task) => task.id === focusTask.id) || null;
      if (refreshed && isEligible(refreshed)) {
        setFocusTask(refreshed);
        return;
      }
    }

    let nextFocus: Task | null = null;
    if (plan && plan.rankedTaskIds.length > 0) {
      for (const taskId of plan.rankedTaskIds) {
        const ranked = tasks.find((task) => task.id === taskId) || null;
        if (ranked && isEligible(ranked)) {
          nextFocus = ranked;
          break;
        }
      }
    }

    if (!nextFocus) {
      nextFocus = tasks.find(isEligible) || null;
    }

    setFocusTask(nextFocus);
  }, [plan, tasks, focusTask]);

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
  };

  const fetchPlan = async () => {
    try {
      const res = await fetch('/api/plans/today');
      if (!res.ok) throw new Error('Failed to fetch plan');
      const data = await res.json();
      setPlan(data.plan || null);
    } catch (err) {
      console.error('Failed to fetch plan:', err);
    }
  };

  const handleSetTaskCompleted = useCallback(async (task: Task, completed: boolean) => {
    setTasks((prev) =>
      prev.map((existing) => {
        if (existing.id !== task.id) return existing;
        if (existing.recurrenceRule) {
          return { ...existing, completedToday: completed };
        }
        return {
          ...existing,
          status: completed ? 'done' : 'active',
          completedToday: completed,
        };
      })
    );

    try {
      if (task.recurrenceRule) {
        const res = await fetch(`/api/tasks/${task.id}/complete-today`, {
          method: completed ? 'POST' : 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error(`Completion update failed: ${res.status}`);
      } else {
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: completed ? 'done' : 'active' }),
        });
        if (!res.ok) throw new Error(`Task update failed: ${res.status}`);
      }

      await fetchTasks();
    } catch (err) {
      console.error('Failed to update task completion:', err);
      await fetchTasks();
    }
  }, []);

  const handleUpdateManifestOrder = useCallback(
    async (orderByCategory: Record<TaskCategoryKey, string[]>) => {
      setTasks((prev) => {
        const categories: TaskCategoryKey[] = ['research', 'teaching_service', 'family', 'health'];
        const taskById = new Map(prev.map((task) => [task.id, task]));
        const seen = new Set<string>();
        const next: Task[] = [];

        for (const category of categories) {
          for (const taskId of orderByCategory[category] ?? []) {
            const task = taskById.get(taskId);
            if (!task || seen.has(taskId)) continue;
            seen.add(taskId);
            next.push(task.category === category ? task : { ...task, category });
          }
        }

        for (const task of prev) {
          if (seen.has(task.id)) continue;
          next.push(task);
        }

        return next;
      });

      try {
        const res = await fetch('/api/tasks/manifest', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderByCategory }),
        });
        if (!res.ok) throw new Error(`Manifest update failed: ${res.status}`);
        await fetchTasks();
      } catch (err) {
        console.error('Failed to update manifest order:', err);
        await fetchTasks();
      }
    },
    []
  );

  const refreshScheduleView = () => {
    schedulePlanCacheRef.current = {};
    setScheduleReloadNonce((n) => n + 1);
  };

  const handlePrevScheduleDay = () => {
    setScheduleOffset((prev) => Math.max(SCHEDULE_OFFSET_MIN, prev - 1));
  };

  const handleNextScheduleDay = () => {
    setScheduleOffset((prev) => Math.min(SCHEDULE_OFFSET_MAX, prev + 1));
  };

  const handleGoToTodaySchedule = () => {
    setScheduleOffset(0);
  };

  const handleSendMessage = useCallback(async (content: string, calendar?: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsSending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: content,
          calendarText: calendar,
        }),
      });

      if (!res.ok) {
        throw new Error(`Chat failed: ${res.status}`);
      }

      const data = await res.json();

      const assistantMsg: ChatMessage = {
        id: data.messageId || crypto.randomUUID(),
        role: 'assistant',
        content: data.reasoning || 'I understand. Let me help with that.',
        proposedOperations: data.proposedOperations,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      if (data.proposedOperations && data.proposedOperations.length > 0) {
        setPendingOperations(data.proposedOperations);
        setPendingMessageId(data.messageId);
      }

    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, there was an error processing your request. Please try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsSending(false);
    }
  }, []);

  const handleConfirmOperations = useCallback(async (indexes: number[]) => {
    if (!pendingMessageId) return;

    try {
      const res = await fetch('/api/chat/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: pendingMessageId,
          acceptedOperationIndexes: indexes,
        }),
      });

      if (!res.ok) {
        throw new Error(`Confirm failed: ${res.status}`);
      }

      const data = await res.json();

      // Add confirmation message
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.success 
          ? `✓ ${indexes.length} operation(s) completed successfully.`
          : `⚠ Some operations failed. Please check and try again.`,
        timestamp: new Date(),
      }]);

      // Refresh data
      await fetchTasks();
      await fetchPlan();
      refreshScheduleView();

    } catch (err) {
      console.error('Confirm error:', err);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Failed to confirm operations. Please try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setPendingOperations(null);
      setPendingMessageId(null);
    }
  }, [pendingMessageId]);

  const handleDismissOperations = useCallback(() => {
    setPendingOperations(null);
    setPendingMessageId(null);
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: 'Operations dismissed. How else can I help?',
      timestamp: new Date(),
    }]);
  }, []);

  const handleSelectTask = useCallback((task: Task) => {
    setFocusTask(task);
    setTaskDrawerOpen(false);
  }, []);

  const handleCompleteTask = useCallback(async () => {
    if (!focusTask) return;
    await handleSetTaskCompleted(focusTask, true);
  }, [focusTask, handleSetTaskCompleted]);

  return (
    <div className="min-h-screen h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Background */}
      <AmbientBackground dim={taskDrawerOpen || scheduleDrawerOpen || focusDrawerOpen} />

      {/* Task Drawer (Left - slides in) */}
      <TaskDrawer
        isOpen={taskDrawerOpen}
        onToggle={() => setTaskDrawerOpen(!taskDrawerOpen)}
        tasks={tasks}
        onSelectTask={handleSelectTask}
        onSetTaskCompleted={handleSetTaskCompleted}
        onUpdateManifestOrder={handleUpdateManifestOrder}
      />

      {/* Schedule Drawer (Right - slides in) */}
      <ScheduleDrawer
        isOpen={scheduleDrawerOpen}
        onToggle={() => setScheduleDrawerOpen(!scheduleDrawerOpen)}
        plan={scheduleViewPlan}
        tasks={tasks}
        currentTime={currentTime}
        viewDate={scheduleViewDate}
        offset={scheduleOffset}
        canPrevDay={canPrevScheduleDay}
        canNextDay={canNextScheduleDay}
        onPrevDay={handlePrevScheduleDay}
        onNextDay={handleNextScheduleDay}
        onGoToday={handleGoToTodaySchedule}
        isLoading={scheduleLoading}
        error={scheduleError}
      />

      {/* Focus Drawer (Bottom - slides up) */}
      <FocusDrawer
        isOpen={focusDrawerOpen}
        onToggle={() => setFocusDrawerOpen(!focusDrawerOpen)}
        task={focusTask}
        onComplete={handleCompleteTask}
      />

      {/* Main Content Area */}
      <div className="relative z-10 h-full flex">
        {/* Spacer for left toggle button */}
        <div className="w-16 flex-shrink-0" />

        {/* Center Content */}
        <main className="flex-1" />
      </div>

      {/* Chat Overlay (Center - modal) */}
      <ChatOverlay
        isVisible={chatVisible}
        onToggle={() => setChatVisible(!chatVisible)}
        messages={messages}
        onSendMessage={handleSendMessage}
        isSending={isSending}
        pendingOperations={pendingOperations}
        onConfirmOperations={handleConfirmOperations}
        onDismissOperations={handleDismissOperations}
      />

      {/* Chat Toggle Button (Floating) */}
      {!chatVisible && (
        <ChatToggle 
          onClick={() => setChatVisible(true)} 
          hasUnread={pendingOperations !== null}
          rightOffsetClass={scheduleDrawerOpen ? 'right-80' : 'right-8'}
        />
      )}

      {/* Version indicator */}
      <div className="fixed bottom-4 left-4 z-10">
        <p className="text-slate-600 text-xs font-mono">PROFFLOW v1.8 // AMBIENT</p>
      </div>
    </div>
  );
}
