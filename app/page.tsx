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

interface IntentionCue {
  type: 'time' | 'location' | 'activity' | 'event';
  description: string;
  timeAnchor: string | null;
}

interface Intention {
  id: string;
  taskId: string | null;
  cue: IntentionCue;
  action: string;
  duration: number | null;
  isActive: boolean;
  isCopingPlan: boolean;
  createdAt: string;
  updatedAt: string;
  lastTriggeredAt: string | null;
  successCount: number;
  missCount: number;
}

// Energy tracking types
type MoodType = 'energized' | 'calm' | 'neutral' | 'tired' | 'stressed';
type BreakActivityType = 'walk' | 'stretch' | 'meditation' | 'snack' | 'social' | 'phone' | 'nap' | 'fresh_air' | 'other';

interface EnergyCheckIn {
  id: string;
  date: string;
  energyLevel: number;
  mood: MoodType;
  notes: string | null;
  createdAt: string;
}

interface WorkBlock {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  plannedDurationMinutes: number;
  actualDurationMinutes: number | null;
  taskId: string | null;
  focusRating: number | null;
  notes: string | null;
}

interface BreakLog {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  activities: BreakActivityType[];
  restorativeScore: number | null;
}

interface EnergySuggestion {
  id: string;
  type: 'break_reminder' | 'energy_tip' | 'pattern_insight' | 'schedule_adjustment';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  actionable: boolean;
}

interface EnergyState {
  checkIn: EnergyCheckIn | null;
  activeWorkBlock: WorkBlock | null;
  activeBreak: BreakLog | null;
  todayWorkBlocks: WorkBlock[];
  todayBreaks: BreakLog[];
}

// Weekly Review types
type ReviewStepType = 'celebrate' | 'challenges' | 'learnings' | 'values' | 'big_three' | 'schedule';
type TaskCategory = 'research' | 'teaching_service' | 'family' | 'health';

interface BigThreeItem {
  id: string;
  title: string;
  category: TaskCategory;
  linkedTaskId: string | null;
  completed: boolean;
}

interface WeeklyReviewMetrics {
  tasksCompleted: number;
  focusBlocksCompleted: number;
  totalFocusMinutes: number;
  averageEnergy: number | null;
  averageFocusRating: number | null;
  habitsCompletedRate: number | null;
}

interface WeeklyReview {
  id: string;
  weekStart: string;
  weekEnd: string;
  wins: string[];
  progressRating: number | null;
  challenges: string[];
  obstacles: string[];
  learnings: string[];
  insights: string[];
  valuesAlignment: number | null;
  valuesReflection: string | null;
  bigThree: BigThreeItem[];
  scheduleConfirmed: boolean;
  scheduledFocusBlocks: number | null;
  capacityCheck: number | null;
  metrics: WeeklyReviewMetrics;
  status: 'in_progress' | 'completed';
  currentStep: ReviewStepType;
  startedAt: string;
  completedAt: string | null;
  durationMinutes: number | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposedOperations?: ProposedOperation[] | null;
  timestamp: Date;
}

// Recovery & Self-Compassion types
type RecoveryEventType = 'missed_task' | 'missed_intention' | 'missed_day' | 'return_after_gap';
type RecoveryStatus = 'green' | 'yellow' | 'recovering';

interface RecoveryState {
  daysInactive: number;
  needsReturnFlow: boolean;
  needsCompassionPrompt: boolean;
  promptType: RecoveryEventType | null;
  compassionMessage: { message: string; actionPrompt: string } | null;
}

interface IntentionRecoveryState {
  intentionId: string;
  status: RecoveryStatus;
  lastCompleted: string | null;
  lastMissed: string | null;
  consecutiveMisses: number;
}

// Google Calendar types
interface CalendarAuthStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
  tokenExpired: boolean;
}

interface CalendarEvent {
  id: string;
  summary: string;
  description: string | null;
  start: string;
  end: string;
  isAllDay: boolean;
  source: 'google' | 'profflow';
  calendarId: string;
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

const CUE_TYPE_CONFIG = {
  time: { label: 'Time', icon: '⏰', example: 'At 9:00 AM' },
  location: { label: 'Location', icon: '📍', example: 'When I arrive at office' },
  activity: { label: 'Activity', icon: '▶', example: 'After morning coffee' },
  event: { label: 'Event', icon: '📅', example: 'When I finish lunch' },
} as const;

const MOOD_CONFIG: Record<MoodType, { label: string; icon: string; color: string }> = {
  energized: { label: 'Energized', icon: '⚡', color: 'text-yellow-400' },
  calm: { label: 'Calm', icon: '◎', color: 'text-emerald-400' },
  neutral: { label: 'Neutral', icon: '◉', color: 'text-slate-400' },
  tired: { label: 'Tired', icon: '◐', color: 'text-blue-400' },
  stressed: { label: 'Stressed', icon: '◈', color: 'text-rose-400' },
};

const BREAK_ACTIVITY_CONFIG: Record<BreakActivityType, { label: string; icon: string }> = {
  walk: { label: 'Walk', icon: '🚶' },
  stretch: { label: 'Stretch', icon: '🧘' },
  meditation: { label: 'Meditate', icon: '🧘' },
  snack: { label: 'Snack', icon: '🍎' },
  social: { label: 'Social', icon: '💬' },
  phone: { label: 'Phone', icon: '📱' },
  nap: { label: 'Nap', icon: '😴' },
  fresh_air: { label: 'Fresh Air', icon: '🌿' },
  other: { label: 'Other', icon: '✨' },
};

const DEFAULT_WORK_BLOCK_DURATION = 90; // Ultradian rhythm: 90-120 minutes

const REVIEW_STEP_CONFIG: Record<ReviewStepType, { title: string; subtitle: string; icon: string }> = {
  celebrate: { title: 'Celebrate Progress', subtitle: 'What went well this week?', icon: '✦' },
  challenges: { title: 'Acknowledge Challenges', subtitle: 'What got in the way?', icon: '◇' },
  learnings: { title: 'Capture Learnings', subtitle: 'What did you learn?', icon: '◈' },
  values: { title: 'Values Check', subtitle: 'Did your work align with what matters?', icon: '◎' },
  big_three: { title: 'Plan Big Three', subtitle: 'Your top priorities for next week', icon: '◉' },
  schedule: { title: 'Confirm Schedule', subtitle: 'Set yourself up for success', icon: '◐' },
};

const REVIEW_STEP_ORDER: ReviewStepType[] = ['celebrate', 'challenges', 'learnings', 'values', 'big_three', 'schedule'];

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
// INTENTIONS DRAWER (LEFT BOTTOM - SLIDES IN)
// ============================================

function IntentionCard({
  intention,
  onTrigger,
  onEdit,
  onDelete,
  tasks,
}: {
  intention: Intention;
  onTrigger: (id: string, success: boolean) => void;
  onEdit: (intention: Intention) => void;
  onDelete: (id: string) => void;
  tasks: Task[];
}) {
  const linkedTask = intention.taskId ? tasks.find((t) => t.id === intention.taskId) : null;
  const totalTriggers = intention.successCount + intention.missCount;
  const successRate = totalTriggers > 0 ? Math.round((intention.successCount / totalTriggers) * 100) : null;
  const cueConfig = CUE_TYPE_CONFIG[intention.cue.type];

  return (
    <div
      className={`
        p-3 rounded-lg
        ${intention.isActive ? 'bg-slate-800/40 border border-slate-700/50' : 'bg-slate-900/30 border border-slate-800/30 opacity-60'}
        transition-all duration-200
        hover:border-cyan-500/30
      `}
    >
      {/* Cue */}
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
        <span>{cueConfig.icon}</span>
        <span className="font-mono uppercase tracking-wider">{intention.cue.description}</span>
        {intention.cue.timeAnchor && (
          <span className="text-cyan-400 font-mono">@ {intention.cue.timeAnchor}</span>
        )}
      </div>

      {/* Arrow */}
      <div className="text-cyan-400 text-xs mb-1">↓ then I will</div>

      {/* Action */}
      <p className="text-slate-200 text-sm font-medium mb-2">{intention.action}</p>

      {/* Duration & Linked Task */}
      <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
        {intention.duration && (
          <span className="font-mono">{intention.duration} min</span>
        )}
        {linkedTask && (
          <span className="truncate">→ {linkedTask.title}</span>
        )}
        {intention.isCopingPlan && (
          <span className="text-amber-400 font-mono uppercase">Coping Plan</span>
        )}
      </div>

      {/* Stats */}
      {totalTriggers > 0 && (
        <div className="flex items-center gap-2 text-xs mb-3">
          <span className={`font-mono ${successRate !== null && successRate >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {successRate}% success
          </span>
          <span className="text-slate-600">({totalTriggers} triggers)</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onTrigger(intention.id, true)}
          className="
            flex-1 py-1.5 rounded text-xs font-medium
            bg-emerald-600/20 border border-emerald-500/30
            text-emerald-400
            hover:bg-emerald-600/30
            transition-colors
          "
        >
          ✓ Did it
        </button>
        <button
          onClick={() => onTrigger(intention.id, false)}
          className="
            flex-1 py-1.5 rounded text-xs font-medium
            bg-slate-700/30 border border-slate-600/30
            text-slate-400
            hover:bg-slate-700/50
            transition-colors
          "
        >
          ✗ Skipped
        </button>
        <button
          onClick={() => onEdit(intention)}
          className="
            p-1.5 rounded text-xs
            text-slate-500 hover:text-slate-300
            transition-colors
          "
          aria-label="Edit intention"
        >
          ✎
        </button>
        <button
          onClick={() => onDelete(intention.id)}
          className="
            p-1.5 rounded text-xs
            text-slate-500 hover:text-rose-400
            transition-colors
          "
          aria-label="Delete intention"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function CreateIntentionModal({
  isOpen,
  onClose,
  onCreate,
  tasks,
  editingIntention,
  onUpdate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    taskId: string | null;
    cue: IntentionCue;
    action: string;
    duration: number | null;
    isCopingPlan: boolean;
  }) => void;
  tasks: Task[];
  editingIntention: Intention | null;
  onUpdate: (id: string, data: {
    taskId?: string | null;
    cue?: IntentionCue;
    action?: string;
    duration?: number | null;
    isActive?: boolean;
    isCopingPlan?: boolean;
  }) => void;
}) {
  const [cueType, setCueType] = useState<'time' | 'location' | 'activity' | 'event'>('activity');
  const [cueDescription, setCueDescription] = useState('');
  const [timeAnchor, setTimeAnchor] = useState('');
  const [action, setAction] = useState('');
  const [duration, setDuration] = useState('');
  const [taskId, setTaskId] = useState<string>('');
  const [isCopingPlan, setIsCopingPlan] = useState(false);

  useEffect(() => {
    if (editingIntention) {
      setCueType(editingIntention.cue.type);
      setCueDescription(editingIntention.cue.description);
      setTimeAnchor(editingIntention.cue.timeAnchor || '');
      setAction(editingIntention.action);
      setDuration(editingIntention.duration?.toString() || '');
      setTaskId(editingIntention.taskId || '');
      setIsCopingPlan(editingIntention.isCopingPlan);
    } else {
      setCueType('activity');
      setCueDescription('');
      setTimeAnchor('');
      setAction('');
      setDuration('');
      setTaskId('');
      setIsCopingPlan(false);
    }
  }, [editingIntention, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cueDescription.trim() || !action.trim()) return;

    const intentionData = {
      taskId: taskId || null,
      cue: {
        type: cueType,
        description: cueDescription.trim(),
        timeAnchor: timeAnchor || null,
      },
      action: action.trim(),
      duration: duration ? parseInt(duration, 10) : null,
      isCopingPlan,
    };

    if (editingIntention) {
      onUpdate(editingIntention.id, intentionData);
    } else {
      onCreate(intentionData);
    }
    onClose();
  };

  if (!isOpen) return null;

  const activeTasks = tasks.filter((t) => t.status === 'active');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <GlassPanel className="relative w-full max-w-md p-6" glow>
        <h3 className="text-slate-200 font-semibold mb-4">
          {editingIntention ? 'Edit Intention' : 'Create Implementation Intention'}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cue Type */}
          <div>
            <label className="block text-slate-400 text-xs font-mono uppercase tracking-wider mb-2">
              Cue Type
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(CUE_TYPE_CONFIG) as Array<keyof typeof CUE_TYPE_CONFIG>).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setCueType(type)}
                  className={`
                    p-2 rounded text-xs
                    border transition-all
                    ${cueType === type
                      ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400'
                      : 'bg-slate-800/30 border-slate-700/50 text-slate-400 hover:border-slate-600'}
                  `}
                >
                  <span className="block mb-1">{CUE_TYPE_CONFIG[type].icon}</span>
                  {CUE_TYPE_CONFIG[type].label}
                </button>
              ))}
            </div>
          </div>

          {/* Cue Description */}
          <div>
            <label className="block text-slate-400 text-xs font-mono uppercase tracking-wider mb-2">
              When / After (cue)
            </label>
            <input
              type="text"
              value={cueDescription}
              onChange={(e) => setCueDescription(e.target.value)}
              placeholder={CUE_TYPE_CONFIG[cueType].example}
              className="
                w-full p-3 rounded-lg
                bg-slate-800/50 border border-slate-700/50
                text-slate-200 placeholder-slate-500
                focus:outline-none focus:border-cyan-500/50
                text-sm
              "
              required
            />
          </div>

          {/* Time Anchor (optional for time-based) */}
          {cueType === 'time' && (
            <div>
              <label className="block text-slate-400 text-xs font-mono uppercase tracking-wider mb-2">
                Time (optional)
              </label>
              <input
                type="time"
                value={timeAnchor}
                onChange={(e) => setTimeAnchor(e.target.value)}
                className="
                  w-full p-3 rounded-lg
                  bg-slate-800/50 border border-slate-700/50
                  text-slate-200
                  focus:outline-none focus:border-cyan-500/50
                  text-sm
                "
              />
            </div>
          )}

          {/* Action */}
          <div>
            <label className="block text-slate-400 text-xs font-mono uppercase tracking-wider mb-2">
              I will (action)
            </label>
            <input
              type="text"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="Open my document and write for 25 minutes"
              className="
                w-full p-3 rounded-lg
                bg-slate-800/50 border border-slate-700/50
                text-slate-200 placeholder-slate-500
                focus:outline-none focus:border-cyan-500/50
                text-sm
              "
              required
            />
          </div>

          {/* Duration */}
          <div>
            <label className="block text-slate-400 text-xs font-mono uppercase tracking-wider mb-2">
              Duration (minutes, optional)
            </label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="25"
              min="1"
              max="480"
              className="
                w-full p-3 rounded-lg
                bg-slate-800/50 border border-slate-700/50
                text-slate-200 placeholder-slate-500
                focus:outline-none focus:border-cyan-500/50
                text-sm
              "
            />
          </div>

          {/* Link to Task */}
          <div>
            <label className="block text-slate-400 text-xs font-mono uppercase tracking-wider mb-2">
              Link to Task (optional)
            </label>
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="
                w-full p-3 rounded-lg
                bg-slate-800/50 border border-slate-700/50
                text-slate-200
                focus:outline-none focus:border-cyan-500/50
                text-sm
              "
            >
              <option value="">No linked task</option>
              {activeTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </div>

          {/* Coping Plan Toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isCopingPlan}
              onChange={(e) => setIsCopingPlan(e.target.checked)}
              className="accent-amber-500"
            />
            <span className="text-slate-300 text-sm">This is a coping plan (for handling obstacles)</span>
          </label>

          {/* Preview */}
          <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/30">
            <p className="text-slate-500 text-xs font-mono uppercase tracking-wider mb-2">Preview</p>
            <p className="text-slate-300 text-sm">
              <span className="text-cyan-400">If</span> {cueDescription || '[cue]'},{' '}
              <span className="text-cyan-400">then</span> I will {action || '[action]'}
              {duration && <span className="text-slate-500"> for {duration} minutes</span>}.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="
                flex-1 py-2 rounded
                bg-slate-700 hover:bg-slate-600
                text-slate-300 text-sm
                transition-colors
              "
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!cueDescription.trim() || !action.trim()}
              className="
                flex-1 py-2 rounded
                bg-cyan-600 hover:bg-cyan-500
                disabled:bg-slate-700 disabled:cursor-not-allowed
                text-white text-sm font-medium
                transition-colors
              "
            >
              {editingIntention ? 'Save Changes' : 'Create Intention'}
            </button>
          </div>
        </form>
      </GlassPanel>
    </div>
  );
}

function IntentionsDrawer({
  isOpen,
  onToggle,
  intentions,
  tasks,
  onTrigger,
  onCreateClick,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  isOpen: boolean;
  onToggle: () => void;
  intentions: Intention[];
  tasks: Task[];
  onTrigger: (id: string, success: boolean) => void;
  onCreateClick: () => void;
  onEdit: (intention: Intention) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
}) {
  const activeIntentions = intentions.filter((i) => i.isActive && !i.isCopingPlan);
  const copingPlans = intentions.filter((i) => i.isActive && i.isCopingPlan);
  const inactiveIntentions = intentions.filter((i) => !i.isActive);
  const [showInactive, setShowInactive] = useState(false);

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className={`
          fixed left-4 bottom-32 z-50
          w-12 h-12 rounded-full
          bg-slate-900/80 backdrop-blur-md
          border border-slate-700/50
          flex items-center justify-center
          transition-all duration-300
          hover:bg-slate-800/80 hover:border-cyan-500/30
          group
          ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}
        `}
        style={{ WebkitBackdropFilter: 'blur(12px)' }}
        aria-label="Open intentions"
      >
        <span className="text-slate-400 group-hover:text-cyan-400 transition-colors text-lg">
          ⟡
        </span>
        {activeIntentions.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-cyan-500 rounded-full text-xs text-white flex items-center justify-center">
            {activeIntentions.length}
          </span>
        )}
      </button>

      {/* Drawer Panel */}
      <div
        className={`
          fixed left-0 bottom-0 z-40
          w-80 max-h-[70vh]
          transition-transform duration-500 ease-out
          ${isOpen ? 'translate-x-0 translate-y-0' : '-translate-x-full'}
        `}
      >
        <GlassPanel className="h-full flex flex-col rounded-l-none rounded-b-none">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 text-sm font-mono">⟡</span>
              <h2 className="text-slate-200 font-semibold tracking-wide">IF-THEN PLANS</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onCreateClick}
                className="
                  px-3 py-1 rounded text-xs
                  bg-cyan-600/20 border border-cyan-500/30
                  text-cyan-400
                  hover:bg-cyan-600/30
                  transition-colors
                "
              >
                + New
              </button>
              <button
                onClick={onToggle}
                className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                aria-label="Close intentions"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
            {/* Active Intentions */}
            <div>
              <p className="text-slate-400 text-xs font-mono uppercase tracking-wider mb-2">
                Active ({activeIntentions.length}/3 recommended)
              </p>
              {activeIntentions.length === 0 ? (
                <p className="text-slate-600 text-sm italic py-2">
                  No active intentions. Create one to automate your most important behaviors.
                </p>
              ) : (
                <div className="space-y-2">
                  {activeIntentions.map((intention) => (
                    <IntentionCard
                      key={intention.id}
                      intention={intention}
                      onTrigger={onTrigger}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      tasks={tasks}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Coping Plans */}
            {copingPlans.length > 0 && (
              <div>
                <p className="text-amber-400 text-xs font-mono uppercase tracking-wider mb-2">
                  Coping Plans ({copingPlans.length})
                </p>
                <div className="space-y-2">
                  {copingPlans.map((intention) => (
                    <IntentionCard
                      key={intention.id}
                      intention={intention}
                      onTrigger={onTrigger}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      tasks={tasks}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Inactive */}
            {inactiveIntentions.length > 0 && (
              <div className="pt-2 border-t border-slate-700/30">
                <button
                  onClick={() => setShowInactive((v) => !v)}
                  className="
                    w-full flex items-center gap-2 py-2
                    text-slate-400 hover:text-slate-200
                    transition-colors
                  "
                >
                  <span className="text-slate-600 text-xs font-mono">◇</span>
                  <span className="text-xs font-mono uppercase tracking-wider">
                    Inactive
                  </span>
                  <span className="text-slate-600 text-xs">({inactiveIntentions.length})</span>
                  <span className="ml-auto text-slate-600">
                    {showInactive ? '▼' : '▶'}
                  </span>
                </button>

                {showInactive && (
                  <div className="space-y-2 mt-2">
                    {inactiveIntentions.map((intention) => (
                      <div key={intention.id} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <IntentionCard
                            intention={intention}
                            onTrigger={onTrigger}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            tasks={tasks}
                          />
                        </div>
                        <button
                          onClick={() => onToggleActive(intention.id, true)}
                          className="
                            p-2 rounded text-xs
                            text-slate-500 hover:text-cyan-400
                            transition-colors
                          "
                          title="Activate"
                        >
                          ↑
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-700/50">
            <p className="text-slate-600 text-xs font-mono text-center">
              "After [cue], I will [action]"
            </p>
          </div>
        </GlassPanel>
      </div>

      {/* Backdrop */}
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
// ENERGY CHECK-IN MODAL
// ============================================

function EnergyCheckInModal({
  isVisible,
  onClose,
  onSubmit,
  existingCheckIn,
}: {
  isVisible: boolean;
  onClose: () => void;
  onSubmit: (energyLevel: number, mood: MoodType, notes: string | null) => void;
  existingCheckIn: EnergyCheckIn | null;
}) {
  const [energyLevel, setEnergyLevel] = useState(existingCheckIn?.energyLevel ?? 5);
  const [mood, setMood] = useState<MoodType>(existingCheckIn?.mood ?? 'neutral');
  const [notes, setNotes] = useState(existingCheckIn?.notes ?? '');

  useEffect(() => {
    if (existingCheckIn) {
      setEnergyLevel(existingCheckIn.energyLevel);
      setMood(existingCheckIn.mood);
      setNotes(existingCheckIn.notes ?? '');
    }
  }, [existingCheckIn]);

  if (!isVisible) return null;

  const handleSubmit = () => {
    onSubmit(energyLevel, mood, notes.trim() || null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <GlassPanel className="relative w-full max-w-md p-6" glow>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 text-sm font-mono">◆</span>
            <h2 className="text-slate-200 font-semibold tracking-wide">ENERGY CHECK-IN</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
            ✕
          </button>
        </div>

        {/* Energy Level Slider */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm">Energy Level</span>
            <span className="text-cyan-400 text-lg font-mono font-bold">{energyLevel}</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={energyLevel}
            onChange={(e) => setEnergyLevel(Number(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-1">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>

        {/* Mood Selection */}
        <div className="mb-6">
          <span className="text-slate-400 text-sm block mb-3">How are you feeling?</span>
          <div className="grid grid-cols-5 gap-2">
            {(Object.keys(MOOD_CONFIG) as MoodType[]).map((m) => {
              const config = MOOD_CONFIG[m];
              return (
                <button
                  key={m}
                  onClick={() => setMood(m)}
                  className={`
                    p-2 rounded-lg border transition-all duration-200
                    flex flex-col items-center gap-1
                    ${mood === m
                      ? 'bg-slate-700/50 border-cyan-500/50'
                      : 'bg-slate-800/30 border-slate-700/30 hover:border-slate-600/50'}
                  `}
                >
                  <span className={`text-lg ${config.color}`}>{config.icon}</span>
                  <span className="text-[10px] text-slate-400">{config.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Notes */}
        <div className="mb-6">
          <span className="text-slate-400 text-sm block mb-2">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did you sleep? Any observations..."
            rows={2}
            className="
              w-full p-3 rounded-lg
              bg-slate-800/50 border border-slate-700/50
              text-slate-200 placeholder-slate-600
              focus:outline-none focus:border-cyan-500/50
              resize-none text-sm
            "
          />
        </div>

        <button
          onClick={handleSubmit}
          className="
            w-full py-3 rounded-lg
            bg-emerald-600 hover:bg-emerald-500
            text-white font-medium
            transition-colors
          "
        >
          {existingCheckIn ? 'Update Check-in' : 'Log Check-in'}
        </button>
      </GlassPanel>
    </div>
  );
}

// ============================================
// WORK BLOCK TIMER
// ============================================

function WorkBlockTimer({
  activeWorkBlock,
  currentTime,
  onEndBlock,
  onStartBlock,
  linkedTask,
}: {
  activeWorkBlock: WorkBlock | null;
  currentTime: Date;
  onEndBlock: (focusRating: number | null) => void;
  onStartBlock: (durationMinutes: number) => void;
  linkedTask: Task | null;
}) {
  const [showRating, setShowRating] = useState(false);
  const [focusRating, setFocusRating] = useState<number>(3);

  if (!activeWorkBlock) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => onStartBlock(DEFAULT_WORK_BLOCK_DURATION)}
          className="
            px-4 py-2 rounded-lg
            bg-cyan-600/20 border border-cyan-500/30
            text-cyan-400 text-sm font-medium
            hover:bg-cyan-600/30 hover:border-cyan-500/50
            transition-all flex items-center gap-2
          "
        >
          <span>▶</span>
          <span>Start Focus Block</span>
        </button>
      </div>
    );
  }

  const [startH, startM] = activeWorkBlock.startTime.split(':').map(Number);
  const elapsedMinutes = Math.floor(
    (currentTime.getHours() * 60 + currentTime.getMinutes()) - (startH * 60 + startM)
  );
  const plannedMinutes = activeWorkBlock.plannedDurationMinutes;
  const remainingMinutes = plannedMinutes - elapsedMinutes;
  const progress = Math.min(100, (elapsedMinutes / plannedMinutes) * 100);
  const isOvertime = elapsedMinutes > plannedMinutes;

  const formatTime = (minutes: number) => {
    const h = Math.floor(Math.abs(minutes) / 60);
    const m = Math.abs(minutes) % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  if (showRating) {
    return (
      <GlassPanel className="p-4" glow>
        <div className="text-center mb-4">
          <span className="text-slate-400 text-sm">Rate your focus</span>
        </div>
        <div className="flex justify-center gap-2 mb-4">
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              key={rating}
              onClick={() => setFocusRating(rating)}
              className={`
                w-10 h-10 rounded-lg border transition-all
                ${focusRating === rating
                  ? 'bg-cyan-600/30 border-cyan-500/50 text-cyan-400'
                  : 'bg-slate-800/30 border-slate-700/30 text-slate-400 hover:border-slate-600/50'}
              `}
            >
              {rating}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              onEndBlock(focusRating);
              setShowRating(false);
            }}
            className="
              flex-1 py-2 rounded-lg
              bg-emerald-600 hover:bg-emerald-500
              text-white text-sm font-medium
              transition-colors
            "
          >
            End Block
          </button>
          <button
            onClick={() => setShowRating(false)}
            className="
              px-4 py-2 rounded-lg
              bg-slate-700 hover:bg-slate-600
              text-slate-300 text-sm
              transition-colors
            "
          >
            Cancel
          </button>
        </div>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="p-4" glow>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full animate-pulse ${isOvertime ? 'bg-amber-400' : 'bg-cyan-400'}`} />
          <span className="text-xs text-slate-400 font-mono uppercase tracking-wider">
            Focus Block Active
          </span>
        </div>
        <span className="text-xs text-slate-500 font-mono">
          Started {activeWorkBlock.startTime}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full transition-all duration-1000 ${isOvertime ? 'bg-amber-500' : 'bg-cyan-500'}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className={`text-2xl font-mono font-bold ${isOvertime ? 'text-amber-400' : 'text-cyan-400'}`}>
          {formatTime(elapsedMinutes)}
        </span>
        <span className="text-slate-500 text-sm">
          {isOvertime ? `+${formatTime(Math.abs(remainingMinutes))} over` : `${formatTime(remainingMinutes)} left`}
        </span>
      </div>

      {linkedTask && (
        <p className="text-slate-400 text-sm mb-3 truncate">
          → {linkedTask.title}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setShowRating(true)}
          className="
            flex-1 py-2 rounded-lg
            bg-slate-700/50 border border-slate-600/30
            text-slate-300 text-sm
            hover:bg-slate-700 hover:border-slate-500/50
            transition-all
          "
        >
          End Block
        </button>
      </div>

      {isOvertime && (
        <p className="text-amber-400 text-xs mt-3 text-center">
          Consider taking a break for optimal recovery
        </p>
      )}
    </GlassPanel>
  );
}

// ============================================
// BREAK QUALITY MODAL
// ============================================

function BreakQualityModal({
  isVisible,
  onClose,
  onSubmit,
  activeBreak,
}: {
  isVisible: boolean;
  onClose: () => void;
  onSubmit: (activities: BreakActivityType[], restorativeScore: number | null) => void;
  activeBreak: BreakLog | null;
}) {
  const [selectedActivities, setSelectedActivities] = useState<Set<BreakActivityType>>(
    new Set(activeBreak?.activities ?? [])
  );
  const [restorativeScore, setRestorativeScore] = useState<number | null>(null);

  if (!isVisible) return null;

  const toggleActivity = (activity: BreakActivityType) => {
    const newSet = new Set(selectedActivities);
    if (newSet.has(activity)) {
      newSet.delete(activity);
    } else {
      newSet.add(activity);
    }
    setSelectedActivities(newSet);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <GlassPanel className="relative w-full max-w-md p-6" glow>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 text-sm font-mono">◇</span>
            <h2 className="text-slate-200 font-semibold tracking-wide">BREAK QUALITY</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
            ✕
          </button>
        </div>

        {/* Activities */}
        <div className="mb-6">
          <span className="text-slate-400 text-sm block mb-3">What did you do?</span>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(BREAK_ACTIVITY_CONFIG) as BreakActivityType[]).map((activity) => {
              const config = BREAK_ACTIVITY_CONFIG[activity];
              const isSelected = selectedActivities.has(activity);
              return (
                <button
                  key={activity}
                  onClick={() => toggleActivity(activity)}
                  className={`
                    p-2 rounded-lg border transition-all duration-200
                    flex flex-col items-center gap-1
                    ${isSelected
                      ? 'bg-emerald-600/20 border-emerald-500/50'
                      : 'bg-slate-800/30 border-slate-700/30 hover:border-slate-600/50'}
                  `}
                >
                  <span className="text-lg">{config.icon}</span>
                  <span className="text-[10px] text-slate-400">{config.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Restorative Score */}
        <div className="mb-6">
          <span className="text-slate-400 text-sm block mb-3">How refreshed do you feel?</span>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((score) => (
              <button
                key={score}
                onClick={() => setRestorativeScore(score)}
                className={`
                  w-12 h-12 rounded-lg border transition-all
                  flex items-center justify-center
                  ${restorativeScore === score
                    ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-400'
                    : 'bg-slate-800/30 border-slate-700/30 text-slate-400 hover:border-slate-600/50'}
                `}
              >
                <span className="font-mono font-bold">{score}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-600 mt-2 px-2">
            <span>Drained</span>
            <span>Refreshed</span>
          </div>
        </div>

        <button
          onClick={() => {
            onSubmit(Array.from(selectedActivities), restorativeScore);
            onClose();
          }}
          className="
            w-full py-3 rounded-lg
            bg-emerald-600 hover:bg-emerald-500
            text-white font-medium
            transition-colors
          "
        >
          End Break
        </button>
      </GlassPanel>
    </div>
  );
}

// ============================================
// COMPASSION PROMPT MODAL
// ============================================

// ============================================
// CALENDAR COMPONENTS
// ============================================

function CalendarConnectionCard({
  authStatus,
  onConnect,
  onDisconnect,
}: {
  authStatus: CalendarAuthStatus | null;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (!authStatus) {
    return (
      <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
        <div className="flex items-center gap-2 text-slate-400">
          <span className="animate-pulse">◎</span>
          <span className="text-xs font-mono uppercase tracking-wider">Loading...</span>
        </div>
      </div>
    );
  }

  if (!authStatus.configured) {
    return (
      <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-amber-400">⚠</span>
          <span className="text-slate-300 text-sm font-medium">Calendar Not Configured</span>
        </div>
        <p className="text-slate-500 text-xs">
          Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env.local file.
        </p>
      </div>
    );
  }

  if (!authStatus.connected || authStatus.tokenExpired) {
    return (
      <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-slate-400">📅</span>
              <span className="text-slate-300 text-sm font-medium">Google Calendar</span>
            </div>
            {authStatus.tokenExpired && (
              <p className="text-amber-400 text-xs">Session expired. Please reconnect.</p>
            )}
          </div>
          <button
            onClick={onConnect}
            className="
              px-3 py-1.5 rounded-lg
              bg-cyan-500/20 border border-cyan-500/40
              text-cyan-400 text-xs font-mono uppercase tracking-wider
              hover:bg-cyan-500/30 transition-colors
            "
          >
            Connect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-slate-800/30 rounded-lg border border-emerald-500/30">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-emerald-400">✓</span>
            <span className="text-slate-300 text-sm font-medium">Google Calendar</span>
          </div>
          <p className="text-slate-500 text-xs">{authStatus.email}</p>
        </div>
        <button
          onClick={onDisconnect}
          className="
            px-3 py-1.5 rounded-lg
            bg-slate-700/50 border border-slate-600/50
            text-slate-400 text-xs font-mono uppercase tracking-wider
            hover:bg-slate-700 hover:text-slate-300 transition-colors
          "
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

function CalendarEventList({
  events,
  isLoading,
  currentTime,
}: {
  events: CalendarEvent[];
  isLoading: boolean;
  currentTime: Date;
}) {
  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <span className="text-slate-400 text-xs animate-pulse">Loading events...</span>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="p-4 text-center">
        <span className="text-slate-500 text-xs">No upcoming events</span>
      </div>
    );
  }

  const formatEventTime = (event: CalendarEvent) => {
    if (event.isAllDay) return 'All day';
    const start = new Date(event.start);
    return start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const isCurrentEvent = (event: CalendarEvent) => {
    if (event.isAllDay) return false;
    const start = new Date(event.start);
    const end = new Date(event.end);
    return currentTime >= start && currentTime <= end;
  };

  // Group events by date
  const eventsByDate = events.reduce((acc, event) => {
    const dateKey = event.isAllDay
      ? event.start.split('T')[0]
      : new Date(event.start).toLocaleDateString('en-CA');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

  const formatDateHeader = (dateKey: string) => {
    const date = new Date(dateKey + 'T12:00:00');
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-4">
      {Object.entries(eventsByDate).map(([dateKey, dayEvents]) => (
        <div key={dateKey}>
          <p className="text-slate-500 text-[10px] font-mono uppercase tracking-wider mb-2">
            {formatDateHeader(dateKey)}
          </p>
          <div className="space-y-2">
            {dayEvents.map((event) => (
              <div
                key={event.id}
                className={`
                  p-3 rounded-lg border
                  ${isCurrentEvent(event)
                    ? 'bg-cyan-500/10 border-cyan-500/40'
                    : 'bg-slate-800/30 border-slate-700/50'}
                  transition-colors
                `}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-200 text-sm truncate">{event.summary}</p>
                    {event.description && (
                      <p className="text-slate-500 text-xs truncate mt-0.5">{event.description}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    <span className="text-slate-400 text-xs font-mono">{formatEventTime(event)}</span>
                  </div>
                </div>
                {event.source === 'profflow' && (
                  <span className="inline-block mt-1 px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 text-[10px] font-mono uppercase rounded">
                    ProfFlow
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarDrawer({
  isOpen,
  onToggle,
  authStatus,
  events,
  isLoading,
  currentTime,
  onConnect,
  onDisconnect,
  onRefresh,
}: {
  isOpen: boolean;
  onToggle: () => void;
  authStatus: CalendarAuthStatus | null;
  events: CalendarEvent[];
  isLoading: boolean;
  currentTime: Date;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
}) {
  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className={`
          fixed top-1/2 -translate-y-1/2 z-40
          w-10 h-24
          bg-slate-900/80 backdrop-blur-md
          flex items-center justify-center
          transition-all duration-300 ease-in-out
          hover:bg-slate-800/80
          group
          ${isOpen ? 'right-80 rounded-l-xl border-l border-y border-slate-700/50' : 'right-0 rounded-l-xl border-l border-y border-slate-700/50'}
        `}
        style={{ WebkitBackdropFilter: 'blur(12px)' }}
        title={isOpen ? 'Hide Calendar' : 'Show Calendar'}
      >
        <span className={`
          text-slate-400 group-hover:text-cyan-400
          transition-transform duration-300
          ${isOpen ? 'rotate-180' : ''}
        `}>
          📅
        </span>
      </button>

      {/* Drawer Panel */}
      <div
        className={`
          fixed top-0 right-0 h-full w-80 z-30
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        <GlassPanel className="h-full flex flex-col rounded-l-xl rounded-r-none" glow>
          {/* Header */}
          <div className="p-4 border-b border-slate-700/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-cyan-400">📅</span>
                <h2 className="text-slate-200 font-semibold">Calendar</h2>
              </div>
              {authStatus?.connected && (
                <button
                  onClick={onRefresh}
                  disabled={isLoading}
                  className="
                    p-2 rounded-lg
                    hover:bg-slate-800/50
                    text-slate-400 hover:text-cyan-400
                    transition-colors
                    disabled:opacity-50
                  "
                  title="Refresh events"
                >
                  <span className={isLoading ? 'animate-spin' : ''}>↻</span>
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Connection Status */}
            <CalendarConnectionCard
              authStatus={authStatus}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
            />

            {/* Events List */}
            {authStatus?.connected && !authStatus.tokenExpired && (
              <div>
                <p className="text-slate-500 text-[10px] font-mono uppercase tracking-wider mb-3">
                  Upcoming Events
                </p>
                <CalendarEventList
                  events={events}
                  isLoading={isLoading}
                  currentTime={currentTime}
                />
              </div>
            )}
          </div>
        </GlassPanel>
      </div>
    </>
  );
}

function CompassionPromptModal({
  isVisible,
  onClose,
  recoveryState,
  onSubmit,
  context,
  setContext,
}: {
  isVisible: boolean;
  onClose: () => void;
  recoveryState: RecoveryState | null;
  onSubmit: (context: string | null, nextAction: string | null, createCopingPlan: boolean) => void;
  context: string;
  setContext: (value: string) => void;
}) {
  const [nextAction, setNextAction] = useState('');
  const [createCopingPlan, setCreateCopingPlan] = useState(false);

  if (!isVisible || !recoveryState?.compassionMessage) return null;

  const { message, actionPrompt } = recoveryState.compassionMessage;
  const isReturnFlow = recoveryState.promptType === 'return_after_gap';

  const handleSubmit = () => {
    onSubmit(
      context.trim() || null,
      nextAction.trim() || null,
      createCopingPlan
    );
    setNextAction('');
    setCreateCopingPlan(false);
  };

  const handleDismiss = () => {
    onSubmit(null, null, false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleDismiss} />
      <GlassPanel className="relative w-full max-w-md p-6" glow>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 text-lg">♡</span>
            <h2 className="text-slate-200 font-semibold tracking-wide">
              {isReturnFlow ? 'WELCOME BACK' : 'A GENTLE CHECK-IN'}
            </h2>
          </div>
          <button onClick={handleDismiss} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
            ✕
          </button>
        </div>

        {/* Compassion message */}
        <div className="bg-slate-800/30 rounded-lg p-4 mb-6 border border-slate-700/30">
          <p className="text-slate-200 text-sm leading-relaxed">{message}</p>
        </div>

        {/* Context input (what got in the way) */}
        {!isReturnFlow && (
          <div className="mb-4">
            <label className="text-slate-400 text-sm block mb-2">
              What got in the way? <span className="text-slate-600">(optional)</span>
            </label>
            <input
              type="text"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Kids needed attention, meeting ran long, felt tired..."
              className="w-full p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 text-sm"
            />
          </div>
        )}

        {/* Next action prompt */}
        <div className="mb-4">
          <label className="text-slate-400 text-sm block mb-2">{actionPrompt}</label>
          <input
            type="text"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="Open my document, send one email, read for 5 minutes..."
            className="w-full p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 text-sm"
          />
        </div>

        {/* Create coping plan option */}
        {context && (
          <div className="mb-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={createCopingPlan}
                onChange={(e) => setCreateCopingPlan(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-cyan-500/50"
              />
              <span className="text-slate-400 text-sm">
                Create a coping plan for when this happens again
              </span>
            </label>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleDismiss}
            className="flex-1 py-3 rounded-lg bg-slate-800/50 border border-slate-700/30 text-slate-400 hover:text-slate-200 hover:border-slate-600/50 transition-colors text-sm"
          >
            Not now
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-3 rounded-lg bg-amber-600/20 border border-amber-500/30 text-amber-400 hover:bg-amber-600/30 transition-colors text-sm font-medium"
          >
            {nextAction ? "Let's do it" : 'Acknowledge'}
          </button>
        </div>

        {/* Gentle reminder */}
        <p className="text-center text-slate-600 text-xs mt-4">
          Remember: One miss is just data. You've got this.
        </p>
      </GlassPanel>
    </div>
  );
}

// ============================================
// ENERGY DASHBOARD DRAWER
// ============================================

function EnergyDashboardDrawer({
  isOpen,
  onToggle,
  energyState,
  suggestions,
  currentTime,
  onOpenCheckIn,
  onStartWorkBlock,
  onEndWorkBlock,
  onStartBreak,
  onEndBreak,
  focusTask,
}: {
  isOpen: boolean;
  onToggle: () => void;
  energyState: EnergyState | null;
  suggestions: EnergySuggestion[];
  currentTime: Date;
  onOpenCheckIn: () => void;
  onStartWorkBlock: (duration: number) => void;
  onEndWorkBlock: (focusRating: number | null) => void;
  onStartBreak: () => void;
  onEndBreak: () => void;
  focusTask: Task | null;
}) {
  const hasCheckIn = !!energyState?.checkIn;
  const todayFocusMinutes = energyState?.todayWorkBlocks
    .filter(b => b.endTime !== null)
    .reduce((sum, b) => sum + (b.actualDurationMinutes ?? 0), 0) ?? 0;
  const todayBreakCount = energyState?.todayBreaks.length ?? 0;

  return (
    <>
      {/* Toggle Button - top center */}
      <button
        onClick={onToggle}
        className={`
          fixed top-4 left-1/2 -translate-x-1/2 z-50
          px-4 py-2
          bg-slate-900/80 backdrop-blur-md
          border border-slate-700/50
          rounded-b-lg
          flex items-center justify-center gap-2
          transition-all duration-300
          hover:bg-slate-800/80 hover:border-emerald-500/30
          group
          ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}
        `}
        style={{ WebkitBackdropFilter: 'blur(12px)' }}
        aria-label="Open energy tracker"
      >
        {!hasCheckIn && (
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
        )}
        <span className="text-slate-400 group-hover:text-emerald-400 transition-colors text-xs font-mono uppercase tracking-wider">
          Energy
        </span>
        {hasCheckIn && energyState?.checkIn && (
          <span className={`${MOOD_CONFIG[energyState.checkIn.mood].color} text-sm`}>
            {energyState.checkIn.energyLevel}
          </span>
        )}
      </button>

      {/* Drawer Panel */}
      <div
        className={`
          fixed top-0 left-1/2 -translate-x-1/2 z-40
          w-full max-w-lg
          transition-transform duration-500 ease-out
          ${isOpen ? 'translate-y-0' : '-translate-y-full'}
        `}
      >
        <GlassPanel className="rounded-t-none p-4" glow>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 text-sm font-mono">◆</span>
              <h2 className="text-slate-200 font-semibold tracking-wide">ENERGY TRACKER</h2>
            </div>
            <button
              onClick={onToggle}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1"
              aria-label="Close energy tracker"
            >
              ✕
            </button>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-slate-800/30 rounded-lg p-3 text-center">
              <p className="text-slate-500 text-[10px] font-mono uppercase tracking-wider mb-1">Energy</p>
              {hasCheckIn ? (
                <p className={`text-xl font-mono font-bold ${MOOD_CONFIG[energyState!.checkIn!.mood].color}`}>
                  {energyState!.checkIn!.energyLevel}
                </p>
              ) : (
                <button
                  onClick={onOpenCheckIn}
                  className="text-emerald-400 text-xs hover:text-emerald-300 transition-colors"
                >
                  Check in
                </button>
              )}
            </div>
            <div className="bg-slate-800/30 rounded-lg p-3 text-center">
              <p className="text-slate-500 text-[10px] font-mono uppercase tracking-wider mb-1">Focus</p>
              <p className="text-xl font-mono font-bold text-cyan-400">
                {Math.round(todayFocusMinutes / 60 * 10) / 10}h
              </p>
            </div>
            <div className="bg-slate-800/30 rounded-lg p-3 text-center">
              <p className="text-slate-500 text-[10px] font-mono uppercase tracking-wider mb-1">Breaks</p>
              <p className="text-xl font-mono font-bold text-amber-400">{todayBreakCount}</p>
            </div>
          </div>

          {/* Work Block Timer */}
          {energyState && (
            <div className="mb-4">
              <WorkBlockTimer
                activeWorkBlock={energyState.activeWorkBlock}
                currentTime={currentTime}
                onEndBlock={onEndWorkBlock}
                onStartBlock={onStartWorkBlock}
                linkedTask={focusTask}
              />
            </div>
          )}

          {/* Active Break */}
          {energyState?.activeBreak && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-600/10 border border-emerald-500/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-emerald-400 text-sm">Break in progress</span>
                </div>
                <button
                  onClick={onEndBreak}
                  className="text-emerald-400 text-sm hover:text-emerald-300 transition-colors"
                >
                  End Break
                </button>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          {!energyState?.activeWorkBlock && !energyState?.activeBreak && (
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => onStartWorkBlock(DEFAULT_WORK_BLOCK_DURATION)}
                className="
                  flex-1 py-2 rounded-lg
                  bg-cyan-600/20 border border-cyan-500/30
                  text-cyan-400 text-sm
                  hover:bg-cyan-600/30 hover:border-cyan-500/50
                  transition-all
                "
              >
                Start Focus
              </button>
              <button
                onClick={onStartBreak}
                className="
                  flex-1 py-2 rounded-lg
                  bg-emerald-600/20 border border-emerald-500/30
                  text-emerald-400 text-sm
                  hover:bg-emerald-600/30 hover:border-emerald-500/50
                  transition-all
                "
              >
                Take Break
              </button>
              {!hasCheckIn && (
                <button
                  onClick={onOpenCheckIn}
                  className="
                    flex-1 py-2 rounded-lg
                    bg-amber-600/20 border border-amber-500/30
                    text-amber-400 text-sm
                    hover:bg-amber-600/30 hover:border-amber-500/50
                    transition-all
                  "
                >
                  Check In
                </button>
              )}
            </div>
          )}

          {/* AI Suggestions */}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-slate-500 text-[10px] font-mono uppercase tracking-wider">Suggestions</p>
              {suggestions.slice(0, 2).map((suggestion) => (
                <div
                  key={suggestion.id}
                  className={`
                    p-3 rounded-lg border
                    ${suggestion.priority === 'high'
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : suggestion.priority === 'medium'
                        ? 'bg-cyan-500/10 border-cyan-500/30'
                        : 'bg-slate-800/30 border-slate-700/30'}
                  `}
                >
                  <p className={`text-sm font-medium ${
                    suggestion.priority === 'high' ? 'text-amber-400' :
                    suggestion.priority === 'medium' ? 'text-cyan-400' : 'text-slate-300'
                  }`}>
                    {suggestion.title}
                  </p>
                  <p className="text-slate-400 text-xs mt-1">{suggestion.description}</p>
                </div>
              ))}
            </div>
          )}
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
// WEEKLY REVIEW WIZARD
// ============================================

function WeeklyReviewWizard({
  isVisible,
  onClose,
  review,
  onUpdateStep,
  onNavigate,
  onComplete,
  onAddBigThree,
  tasks,
}: {
  isVisible: boolean;
  onClose: () => void;
  review: WeeklyReview;
  onUpdateStep: (step: ReviewStepType, data: Partial<WeeklyReview>) => void;
  onNavigate: (direction: 'next' | 'back') => void;
  onComplete: () => void;
  onAddBigThree: (title: string, category: TaskCategory) => void;
  tasks: Task[];
}) {
  const [inputValue, setInputValue] = useState('');
  const [bigThreeTitle, setBigThreeTitle] = useState('');
  const [bigThreeCategory, setBigThreeCategory] = useState<TaskCategory>('research');

  const currentStepIndex = REVIEW_STEP_ORDER.indexOf(review.currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === REVIEW_STEP_ORDER.length - 1;
  const stepConfig = REVIEW_STEP_CONFIG[review.currentStep];

  if (!isVisible) return null;

  const addListItem = (field: 'wins' | 'challenges' | 'obstacles' | 'learnings' | 'insights') => {
    if (!inputValue.trim()) return;
    const currentList = review[field] || [];
    onUpdateStep(review.currentStep, { [field]: [...currentList, inputValue.trim()] });
    setInputValue('');
  };

  const removeListItem = (field: 'wins' | 'challenges' | 'obstacles' | 'learnings' | 'insights', index: number) => {
    const currentList = review[field] || [];
    onUpdateStep(review.currentStep, { [field]: currentList.filter((_, i) => i !== index) });
  };

  const handleAddBigThree = () => {
    if (!bigThreeTitle.trim() || review.bigThree.length >= 3) return;
    onAddBigThree(bigThreeTitle.trim(), bigThreeCategory);
    setBigThreeTitle('');
  };

  const renderStepContent = () => {
    switch (review.currentStep) {
      case 'celebrate':
        return (
          <div className="space-y-4">
            {/* Metrics Summary */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                <p className="text-slate-500 text-[10px] font-mono uppercase">Tasks Done</p>
                <p className="text-xl font-mono font-bold text-cyan-400">{review.metrics.tasksCompleted}</p>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                <p className="text-slate-500 text-[10px] font-mono uppercase">Focus Time</p>
                <p className="text-xl font-mono font-bold text-emerald-400">
                  {Math.round(review.metrics.totalFocusMinutes / 60)}h
                </p>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                <p className="text-slate-500 text-[10px] font-mono uppercase">Avg Energy</p>
                <p className="text-xl font-mono font-bold text-amber-400">
                  {review.metrics.averageEnergy?.toFixed(1) ?? '-'}
                </p>
              </div>
            </div>

            {/* Wins List */}
            <div>
              <label className="text-slate-400 text-sm block mb-2">What were your wins this week?</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addListItem('wins')}
                  placeholder="Add a win..."
                  className="flex-1 p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 text-sm"
                />
                <button
                  onClick={() => addListItem('wins')}
                  className="px-3 py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-600/30 transition-colors"
                >
                  +
                </button>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {review.wins.map((win, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded bg-slate-800/30">
                    <span className="text-emerald-400">✓</span>
                    <span className="flex-1 text-sm text-slate-300">{win}</span>
                    <button onClick={() => removeListItem('wins', i)} className="text-slate-500 hover:text-slate-300 text-xs">✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Progress Rating */}
            <div>
              <label className="text-slate-400 text-sm block mb-2">How satisfied are you with this week?</label>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    onClick={() => onUpdateStep('celebrate', { progressRating: rating })}
                    className={`w-12 h-12 rounded-lg border transition-all ${
                      review.progressRating === rating
                        ? 'bg-cyan-600/30 border-cyan-500/50 text-cyan-400'
                        : 'bg-slate-800/30 border-slate-700/30 text-slate-400 hover:border-slate-600/50'
                    }`}
                  >
                    {rating}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'challenges':
        return (
          <div className="space-y-4">
            <div>
              <label className="text-slate-400 text-sm block mb-2">What challenges did you face?</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addListItem('challenges')}
                  placeholder="Add a challenge..."
                  className="flex-1 p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 text-sm"
                />
                <button onClick={() => addListItem('challenges')} className="px-3 py-2 rounded-lg bg-amber-600/20 border border-amber-500/30 text-amber-400 hover:bg-amber-600/30 transition-colors">+</button>
              </div>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {review.challenges.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded bg-slate-800/30">
                    <span className="text-amber-400">◇</span>
                    <span className="flex-1 text-sm text-slate-300">{item}</span>
                    <button onClick={() => removeListItem('challenges', i)} className="text-slate-500 hover:text-slate-300 text-xs">✕</button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-slate-400 text-sm block mb-2">What obstacles got in your way?</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addListItem('obstacles')}
                  placeholder="Add an obstacle..."
                  className="flex-1 p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 text-sm"
                />
                <button onClick={() => addListItem('obstacles')} className="px-3 py-2 rounded-lg bg-rose-600/20 border border-rose-500/30 text-rose-400 hover:bg-rose-600/30 transition-colors">+</button>
              </div>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {review.obstacles.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded bg-slate-800/30">
                    <span className="text-rose-400">◈</span>
                    <span className="flex-1 text-sm text-slate-300">{item}</span>
                    <button onClick={() => removeListItem('obstacles', i)} className="text-slate-500 hover:text-slate-300 text-xs">✕</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'learnings':
        return (
          <div className="space-y-4">
            <div>
              <label className="text-slate-400 text-sm block mb-2">What did you learn this week?</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addListItem('learnings')}
                  placeholder="Add a learning..."
                  className="flex-1 p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 text-sm"
                />
                <button onClick={() => addListItem('learnings')} className="px-3 py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-600/30 transition-colors">+</button>
              </div>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {review.learnings.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded bg-slate-800/30">
                    <span className="text-cyan-400">◎</span>
                    <span className="flex-1 text-sm text-slate-300">{item}</span>
                    <button onClick={() => removeListItem('learnings', i)} className="text-slate-500 hover:text-slate-300 text-xs">✕</button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-slate-400 text-sm block mb-2">Any key insights or realizations?</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addListItem('insights')}
                  placeholder="Add an insight..."
                  className="flex-1 p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 text-sm"
                />
                <button onClick={() => addListItem('insights')} className="px-3 py-2 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 transition-colors">+</button>
              </div>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {review.insights.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded bg-slate-800/30">
                    <span className="text-emerald-400">✦</span>
                    <span className="flex-1 text-sm text-slate-300">{item}</span>
                    <button onClick={() => removeListItem('insights', i)} className="text-slate-500 hover:text-slate-300 text-xs">✕</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'values':
        return (
          <div className="space-y-4">
            <div>
              <label className="text-slate-400 text-sm block mb-2">How aligned was your work with your values?</label>
              <div className="flex justify-center gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    onClick={() => onUpdateStep('values', { valuesAlignment: rating })}
                    className={`w-12 h-12 rounded-lg border transition-all ${
                      review.valuesAlignment === rating
                        ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-400'
                        : 'bg-slate-800/30 border-slate-700/30 text-slate-400 hover:border-slate-600/50'
                    }`}
                  >
                    {rating}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-xs text-slate-600 px-2">
                <span>Not aligned</span>
                <span>Highly aligned</span>
              </div>
            </div>

            <div>
              <label className="text-slate-400 text-sm block mb-2">Reflection (optional)</label>
              <textarea
                value={review.valuesReflection ?? ''}
                onChange={(e) => onUpdateStep('values', { valuesReflection: e.target.value || null })}
                placeholder="What would make next week feel more meaningful?"
                rows={3}
                className="w-full p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 resize-none text-sm"
              />
            </div>
          </div>
        );

      case 'big_three':
        return (
          <div className="space-y-4">
            <p className="text-slate-400 text-sm">Choose your top 3 priorities for next week. Focus on outcomes, not tasks.</p>

            {/* Current Big Three */}
            <div className="space-y-2">
              {review.bigThree.map((item, i) => (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                  <span className="text-cyan-400 font-mono font-bold">{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-slate-200 text-sm">{item.title}</p>
                    <p className="text-slate-500 text-xs">{CATEGORY_CONFIG[item.category].label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Add New Big Three */}
            {review.bigThree.length < 3 && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={bigThreeTitle}
                  onChange={(e) => setBigThreeTitle(e.target.value)}
                  placeholder="Add a priority outcome..."
                  className="w-full p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 text-sm"
                />
                <div className="flex gap-2">
                  <select
                    value={bigThreeCategory}
                    onChange={(e) => setBigThreeCategory(e.target.value as TaskCategory)}
                    className="flex-1 p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-200 focus:outline-none focus:border-cyan-500/50 text-sm"
                  >
                    {(Object.keys(CATEGORY_CONFIG) as TaskCategory[]).map((cat) => (
                      <option key={cat} value={cat}>{CATEGORY_CONFIG[cat].label}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddBigThree}
                    disabled={!bigThreeTitle.trim()}
                    className="px-4 py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      case 'schedule':
        return (
          <div className="space-y-4">
            <div className="bg-slate-800/30 rounded-lg p-4">
              <p className="text-slate-300 text-sm mb-3">
                Research suggests scheduling 60-70% of your time for optimal productivity. Leave buffer for unexpected tasks.
              </p>

              <div>
                <label className="text-slate-400 text-sm block mb-2">Planned focus blocks for next week</label>
                <input
                  type="number"
                  min="0"
                  max="35"
                  value={review.scheduledFocusBlocks ?? ''}
                  onChange={(e) => onUpdateStep('schedule', { scheduledFocusBlocks: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="e.g., 15"
                  className="w-full p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 text-sm"
                />
                <p className="text-slate-500 text-xs mt-1">
                  {review.scheduledFocusBlocks
                    ? `~${Math.round((review.scheduledFocusBlocks * 90) / 60)} hours of focus time`
                    : 'Each block is ~90 minutes'}
                </p>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={review.scheduleConfirmed}
                  onChange={(e) => onUpdateStep('schedule', { scheduleConfirmed: e.target.checked })}
                  className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                />
                <span className="text-slate-300 text-sm">I've reviewed my calendar and confirmed my availability</span>
              </label>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <GlassPanel className="relative w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" glow>
        {/* Header */}
        <div className="p-4 border-b border-slate-700/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 text-lg">{stepConfig.icon}</span>
              <h2 className="text-slate-200 font-semibold">{stepConfig.title}</h2>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors p-1">✕</button>
          </div>
          <p className="text-slate-400 text-sm">{stepConfig.subtitle}</p>

          {/* Progress indicator */}
          <div className="flex gap-1 mt-3">
            {REVIEW_STEP_ORDER.map((step, i) => (
              <div
                key={step}
                className={`flex-1 h-1 rounded-full transition-colors ${
                  i <= currentStepIndex ? 'bg-cyan-500' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
          <p className="text-slate-500 text-xs mt-1 text-center">
            Step {currentStepIndex + 1} of {REVIEW_STEP_ORDER.length}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {renderStepContent()}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700/50 flex gap-2">
          {!isFirstStep && (
            <button
              onClick={() => onNavigate('back')}
              className="px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/30 text-slate-300 text-sm hover:bg-slate-700 transition-colors"
            >
              Back
            </button>
          )}
          <div className="flex-1" />
          {isLastStep ? (
            <button
              onClick={onComplete}
              className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
            >
              Complete Review
            </button>
          ) : (
            <button
              onClick={() => onNavigate('next')}
              className="px-6 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors"
            >
              Continue
            </button>
          )}
        </div>
      </GlassPanel>
    </div>
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

  // Intentions State
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [intentionsDrawerOpen, setIntentionsDrawerOpen] = useState(false);
  const [intentionModalOpen, setIntentionModalOpen] = useState(false);
  const [editingIntention, setEditingIntention] = useState<Intention | null>(null);

  // UI State
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [scheduleDrawerOpen, setScheduleDrawerOpen] = useState(false);
  const [focusDrawerOpen, setFocusDrawerOpen] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [pendingOperations, setPendingOperations] = useState<ProposedOperation[] | null>(null);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);

  // Energy tracking state
  const [energyState, setEnergyState] = useState<EnergyState | null>(null);
  const [energySuggestions, setEnergySuggestions] = useState<EnergySuggestion[]>([]);
  const [energyDrawerOpen, setEnergyDrawerOpen] = useState(false);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [breakQualityModalOpen, setBreakQualityModalOpen] = useState(false);

  // Weekly review state
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReview | null>(null);
  const [reviewWizardOpen, setReviewWizardOpen] = useState(false);
  const [isReviewDue, setIsReviewDue] = useState(false);

  // Self-Compassion & Recovery state
  const [recoveryState, setRecoveryState] = useState<RecoveryState | null>(null);
  const [intentionRecoveryStates, setIntentionRecoveryStates] = useState<IntentionRecoveryState[]>([]);
  const [compassionPromptOpen, setCompassionPromptOpen] = useState(false);
  const [compassionContext, setCompassionContext] = useState('');

  // Google Calendar state
  const [calendarAuthStatus, setCalendarAuthStatus] = useState<CalendarAuthStatus | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarDrawerOpen, setCalendarDrawerOpen] = useState(false);

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

  // Handle OAuth callback URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const calendarConnected = params.get('calendar_connected');
    const calendarError = params.get('calendar_error');

    if (calendarConnected === 'true') {
      // Successfully connected - refresh auth status and open drawer
      fetchCalendarAuthStatus();
      setCalendarDrawerOpen(true);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (calendarError) {
      console.error('Calendar connection error:', calendarError);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Fetch initial data in parallel for faster load
  useEffect(() => {
    Promise.all([
      fetchTasks(),
      fetchPlan(),
      fetchIntentions(),
      fetchEnergyState(),
      fetchEnergySuggestions(),
      fetchWeeklyReviewStatus(),
      fetchRecoveryState(),
      fetchIntentionRecoveryStates(),
      fetchCalendarAuthStatus(),
    ]);
  }, []);

  // Refresh energy data only when there's an active work block or break (need timer updates)
  // Otherwise, no polling - data refreshes on user actions
  useEffect(() => {
    const hasActiveTimer = energyState?.activeWorkBlock || energyState?.activeBreak;
    if (!hasActiveTimer) return;

    // Only poll every 5 minutes when timer is active (for elapsed time display)
    const interval = setInterval(() => {
      fetchEnergyState();
    }, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, [energyState?.activeWorkBlock, energyState?.activeBreak]);

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

  const fetchIntentions = async () => {
    try {
      const res = await fetch('/api/intentions');
      if (!res.ok) throw new Error('Failed to fetch intentions');
      const data = await res.json();
      setIntentions(data.intentions || []);
    } catch (err) {
      console.error('Failed to fetch intentions:', err);
    }
  };

  const handleCreateIntention = useCallback(async (intentionData: {
    taskId: string | null;
    cue: IntentionCue;
    action: string;
    duration: number | null;
    isCopingPlan: boolean;
  }) => {
    try {
      const res = await fetch('/api/intentions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(intentionData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error('Failed to create intention:', errorData);
        return;
      }

      // Use response to update state instead of refetching
      const newIntention = await res.json();
      setIntentions((prev) => [newIntention, ...prev]);
    } catch (err) {
      console.error('Failed to create intention:', err);
    }
  }, []);

  const handleUpdateIntention = useCallback(async (id: string, updates: {
    taskId?: string | null;
    cue?: IntentionCue;
    action?: string;
    duration?: number | null;
    isActive?: boolean;
    isCopingPlan?: boolean;
  }) => {
    // Optimistic update
    setIntentions((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...updates } : i))
    );

    try {
      const res = await fetch(`/api/intentions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error('Failed to update intention:', errorData);
        // Revert on error by refetching
        await fetchIntentions();
        return;
      }
      // Success - optimistic update is already applied
    } catch (err) {
      console.error('Failed to update intention:', err);
      await fetchIntentions(); // Revert on error
    }
  }, []);

  const handleDeleteIntention = useCallback(async (id: string) => {
    if (!confirm('Delete this intention?')) return;

    // Optimistic delete
    const prevIntentions = intentions;
    setIntentions((prev) => prev.filter((i) => i.id !== id));

    try {
      const res = await fetch(`/api/intentions/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        console.error('Failed to delete intention');
        setIntentions(prevIntentions); // Revert on error
        return;
      }
      // Success - optimistic delete is already applied
    } catch (err) {
      console.error('Failed to delete intention:', err);
      setIntentions(prevIntentions); // Revert on error
    }
  }, [intentions]);

  const handleTriggerIntention = useCallback(async (id: string, success: boolean) => {
    // Optimistic update
    setIntentions((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              lastTriggeredAt: new Date().toISOString(),
              successCount: success ? i.successCount + 1 : i.successCount,
              missCount: success ? i.missCount : i.missCount + 1,
            }
          : i
      )
    );

    try {
      const res = await fetch(`/api/intentions/${id}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success }),
      });

      if (!res.ok) {
        console.error('Failed to record trigger');
        await fetchIntentions();
        return;
      }

      // Could show feedback from response here
    } catch (err) {
      console.error('Failed to record trigger:', err);
      await fetchIntentions();
    }
  }, []);

  const handleEditIntention = useCallback((intention: Intention) => {
    setEditingIntention(intention);
    setIntentionModalOpen(true);
  }, []);

  const handleToggleIntentionActive = useCallback(async (id: string, active: boolean) => {
    await handleUpdateIntention(id, { isActive: active });
  }, [handleUpdateIntention]);

  const fetchEnergyState = async () => {
    try {
      const res = await fetch('/api/energy/state');
      if (!res.ok) throw new Error('Failed to fetch energy state');
      const data = await res.json();
      setEnergyState(data);
    } catch (err) {
      console.error('Failed to fetch energy state:', err);
    }
  };

  const fetchEnergySuggestions = async () => {
    try {
      const res = await fetch('/api/energy/suggestions');
      if (!res.ok) throw new Error('Failed to fetch suggestions');
      const data = await res.json();
      setEnergySuggestions(data.suggestions || []);
    } catch (err) {
      console.error('Failed to fetch energy suggestions:', err);
    }
  };

  const fetchWeeklyReviewStatus = async () => {
    try {
      const res = await fetch('/api/review');
      if (!res.ok) throw new Error('Failed to fetch review status');
      const data = await res.json();
      setWeeklyReview(data.review || null);
      setIsReviewDue(data.isDue || false);
    } catch (err) {
      console.error('Failed to fetch weekly review status:', err);
    }
  };

  const fetchRecoveryState = async () => {
    try {
      const res = await fetch('/api/recovery');
      if (!res.ok) throw new Error('Failed to fetch recovery state');
      const data = await res.json();
      setRecoveryState(data);
      // Auto-show compassion prompt if needed
      if (data.needsCompassionPrompt && !compassionPromptOpen) {
        setCompassionPromptOpen(true);
      }
    } catch (err) {
      console.error('Failed to fetch recovery state:', err);
    }
  };

  const fetchIntentionRecoveryStates = async () => {
    try {
      const res = await fetch('/api/recovery/intentions');
      if (!res.ok) throw new Error('Failed to fetch intention recovery states');
      const data = await res.json();
      setIntentionRecoveryStates(data);
    } catch (err) {
      console.error('Failed to fetch intention recovery states:', err);
    }
  };

  const fetchCalendarAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/google/status');
      if (!res.ok) throw new Error('Failed to fetch calendar auth status');
      const data = await res.json();
      setCalendarAuthStatus(data);
      // If connected, fetch events
      if (data.connected && !data.tokenExpired) {
        fetchCalendarEvents();
      }
    } catch (err) {
      console.error('Failed to fetch calendar auth status:', err);
    }
  };

  const fetchCalendarEvents = async (timeMin?: string, timeMax?: string) => {
    setCalendarLoading(true);
    try {
      const params = new URLSearchParams();
      if (timeMin) params.set('timeMin', timeMin);
      if (timeMax) params.set('timeMax', timeMax);

      const url = '/api/calendar/events' + (params.toString() ? '?' + params.toString() : '');
      const res = await fetch(url);

      if (!res.ok) {
        const data = await res.json();
        if (data.needsAuth) {
          // Token expired or revoked
          setCalendarAuthStatus(prev => prev ? { ...prev, connected: false, tokenExpired: true } : null);
          setCalendarEvents([]);
          return;
        }
        throw new Error('Failed to fetch calendar events');
      }

      const data = await res.json();
      setCalendarEvents(data.events || []);
    } catch (err) {
      console.error('Failed to fetch calendar events:', err);
    } finally {
      setCalendarLoading(false);
    }
  };

  const handleConnectCalendar = () => {
    // Redirect to Google OAuth flow
    window.location.href = '/api/auth/google';
  };

  const handleDisconnectCalendar = async () => {
    try {
      const res = await fetch('/api/auth/google/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to disconnect calendar');
      setCalendarAuthStatus(prev => prev ? { ...prev, connected: false, email: null } : null);
      setCalendarEvents([]);
    } catch (err) {
      console.error('Failed to disconnect calendar:', err);
    }
  };

  const handleAddToCalendar = async (summary: string, start: string, end: string, description?: string) => {
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary, start, end, description }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.needsAuth) {
          setCalendarAuthStatus(prev => prev ? { ...prev, connected: false, tokenExpired: true } : null);
          return null;
        }
        throw new Error('Failed to create calendar event');
      }

      const data = await res.json();
      // Refresh events
      fetchCalendarEvents();
      return data.event;
    } catch (err) {
      console.error('Failed to add to calendar:', err);
      return null;
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

  // Energy tracking handlers
  const handleEnergyCheckIn = useCallback(async (energyLevel: number, mood: MoodType, notes: string | null) => {
    try {
      const res = await fetch('/api/energy/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ energyLevel, mood, notes }),
      });
      if (!res.ok) throw new Error('Failed to save check-in');
      await Promise.all([fetchEnergyState(), fetchEnergySuggestions()]);
    } catch (err) {
      console.error('Failed to save energy check-in:', err);
    }
  }, []);

  const handleStartWorkBlock = useCallback(async (durationMinutes: number) => {
    try {
      const res = await fetch('/api/energy/workblock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plannedDurationMinutes: durationMinutes,
          taskId: focusTask?.id ?? null,
        }),
      });
      if (!res.ok) throw new Error('Failed to start work block');
      await Promise.all([fetchEnergyState(), fetchEnergySuggestions()]);
    } catch (err) {
      console.error('Failed to start work block:', err);
    }
  }, [focusTask]);

  const handleEndWorkBlock = useCallback(async (focusRating: number | null) => {
    if (!energyState?.activeWorkBlock) return;
    try {
      const res = await fetch('/api/energy/workblock', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: energyState.activeWorkBlock.id,
          focusRating,
        }),
      });
      if (!res.ok) throw new Error('Failed to end work block');
      await Promise.all([fetchEnergyState(), fetchEnergySuggestions()]);
    } catch (err) {
      console.error('Failed to end work block:', err);
    }
  }, [energyState?.activeWorkBlock]);

  const handleStartBreak = useCallback(async () => {
    try {
      const res = await fetch('/api/energy/break', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to start break');
      await Promise.all([fetchEnergyState(), fetchEnergySuggestions()]);
    } catch (err) {
      console.error('Failed to start break:', err);
    }
  }, []);

  const handleEndBreak = useCallback(async (activities?: BreakActivityType[], restorativeScore?: number | null) => {
    if (!energyState?.activeBreak) return;
    try {
      const res = await fetch('/api/energy/break', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: energyState.activeBreak.id,
          activities,
          restorativeScore,
        }),
      });
      if (!res.ok) throw new Error('Failed to end break');
      await Promise.all([fetchEnergyState(), fetchEnergySuggestions()]);
    } catch (err) {
      console.error('Failed to end break:', err);
    }
  }, [energyState?.activeBreak]);

  const handleOpenBreakQualityModal = useCallback(() => {
    setBreakQualityModalOpen(true);
  }, []);

  // Self-Compassion handlers
  const handleCompassionResponse = useCallback(async (
    context: string | null,
    nextAction: string | null,
    createCopingPlan: boolean
  ) => {
    if (!recoveryState?.promptType) return;

    try {
      // Record the recovery event
      await fetch('/api/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: recoveryState.promptType,
          context,
          nextActionTaken: nextAction,
          dismissed: !context && !nextAction,
        }),
      });

      // If user wants to create a coping plan, open the intention modal
      if (createCopingPlan && context) {
        setIntentionModalOpen(true);
        // Pre-fill could be added here
      }

      setCompassionPromptOpen(false);
      setCompassionContext('');
    } catch (err) {
      console.error('Failed to record recovery response:', err);
    }
  }, [recoveryState?.promptType]);

  // Weekly review handlers
  const handleStartWeeklyReview = useCallback(async () => {
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to start review');
      const data = await res.json();
      setWeeklyReview(data.review);
      setReviewWizardOpen(true);
    } catch (err) {
      console.error('Failed to start weekly review:', err);
    }
  }, []);

  const handleUpdateReviewStep = useCallback(async (step: ReviewStepType, stepData: Partial<WeeklyReview>) => {
    if (!weeklyReview) return;
    try {
      const res = await fetch('/api/review/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: weeklyReview.id, step, ...stepData }),
      });
      if (!res.ok) throw new Error('Failed to update review step');
      const data = await res.json();
      setWeeklyReview(data.review);
    } catch (err) {
      console.error('Failed to update review step:', err);
    }
  }, [weeklyReview]);

  const handleNavigateReview = useCallback(async (direction: 'next' | 'back') => {
    if (!weeklyReview) return;
    try {
      const res = await fetch('/api/review/navigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: weeklyReview.id, direction }),
      });
      if (!res.ok) throw new Error('Failed to navigate review');
      const data = await res.json();
      setWeeklyReview(data.review);
    } catch (err) {
      console.error('Failed to navigate review:', err);
    }
  }, [weeklyReview]);

  const handleCompleteReview = useCallback(async () => {
    if (!weeklyReview) return;
    try {
      const res = await fetch('/api/review/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: weeklyReview.id }),
      });
      if (!res.ok) throw new Error('Failed to complete review');
      const data = await res.json();
      setWeeklyReview(data.review);
      setReviewWizardOpen(false);
      setIsReviewDue(false);
    } catch (err) {
      console.error('Failed to complete review:', err);
    }
  }, [weeklyReview]);

  const handleAddBigThree = useCallback(async (title: string, category: TaskCategory) => {
    if (!weeklyReview) return;
    try {
      const res = await fetch('/api/review/big-three', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId: weeklyReview.id, title, category }),
      });
      if (!res.ok) throw new Error('Failed to add Big Three item');
      const data = await res.json();
      setWeeklyReview(data.review);
    } catch (err) {
      console.error('Failed to add Big Three item:', err);
    }
  }, [weeklyReview]);

  return (
    <div className="min-h-screen h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Background */}
      <AmbientBackground dim={taskDrawerOpen || scheduleDrawerOpen || focusDrawerOpen || intentionsDrawerOpen} />

      <AmbientBackground dim={taskDrawerOpen || scheduleDrawerOpen || focusDrawerOpen || energyDrawerOpen} />

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

      {/* Calendar Drawer (Right side - Google Calendar) */}
      {!scheduleDrawerOpen && (
        <CalendarDrawer
          isOpen={calendarDrawerOpen}
          onToggle={() => setCalendarDrawerOpen(!calendarDrawerOpen)}
          authStatus={calendarAuthStatus}
          events={calendarEvents}
          isLoading={calendarLoading}
          currentTime={currentTime}
          onConnect={handleConnectCalendar}
          onDisconnect={handleDisconnectCalendar}
          onRefresh={() => fetchCalendarEvents()}
        />
      )}

      {/* Focus Drawer (Bottom - slides up) */}
      <FocusDrawer
        isOpen={focusDrawerOpen}
        onToggle={() => setFocusDrawerOpen(!focusDrawerOpen)}
        task={focusTask}
        onComplete={handleCompleteTask}
      />

      {/* Intentions Drawer (Left Bottom - slides in) */}
      <IntentionsDrawer
        isOpen={intentionsDrawerOpen}
        onToggle={() => setIntentionsDrawerOpen(!intentionsDrawerOpen)}
        intentions={intentions}
        tasks={tasks}
        onTrigger={handleTriggerIntention}
        onCreateClick={() => {
          setEditingIntention(null);
          setIntentionModalOpen(true);
        }}
        onEdit={handleEditIntention}
        onDelete={handleDeleteIntention}
        onToggleActive={handleToggleIntentionActive}
      />

      {/* Create/Edit Intention Modal */}
      <CreateIntentionModal
        isOpen={intentionModalOpen}
        onClose={() => {
          setIntentionModalOpen(false);
          setEditingIntention(null);
        }}
        onCreate={handleCreateIntention}
        tasks={tasks}
        editingIntention={editingIntention}
        onUpdate={handleUpdateIntention}
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

      {/* Energy Dashboard Drawer (Top - slides down) */}
      <EnergyDashboardDrawer
        isOpen={energyDrawerOpen}
        onToggle={() => setEnergyDrawerOpen(!energyDrawerOpen)}
        energyState={energyState}
        suggestions={energySuggestions}
        currentTime={currentTime}
        onOpenCheckIn={() => setCheckInModalOpen(true)}
        onStartWorkBlock={handleStartWorkBlock}
        onEndWorkBlock={handleEndWorkBlock}
        onStartBreak={handleStartBreak}
        onEndBreak={handleOpenBreakQualityModal}
        focusTask={focusTask}
      />

      {/* Energy Check-in Modal */}
      <EnergyCheckInModal
        isVisible={checkInModalOpen}
        onClose={() => setCheckInModalOpen(false)}
        onSubmit={handleEnergyCheckIn}
        existingCheckIn={energyState?.checkIn ?? null}
      />

      {/* Break Quality Modal */}
      <BreakQualityModal
        isVisible={breakQualityModalOpen}
        onClose={() => setBreakQualityModalOpen(false)}
        onSubmit={(activities, score) => {
          handleEndBreak(activities, score);
          setBreakQualityModalOpen(false);
        }}
        activeBreak={energyState?.activeBreak ?? null}
      />

      {/* Self-Compassion Prompt Modal */}
      <CompassionPromptModal
        isVisible={compassionPromptOpen}
        onClose={() => setCompassionPromptOpen(false)}
        recoveryState={recoveryState}
        onSubmit={handleCompassionResponse}
        context={compassionContext}
        setContext={setCompassionContext}
      />

      {/* Weekly Review Button */}
      <button
        onClick={() => {
          if (weeklyReview && weeklyReview.status === 'in_progress') {
            setReviewWizardOpen(true);
          } else {
            handleStartWeeklyReview();
          }
        }}
        className={`
          fixed bottom-4 right-4 z-20
          px-4 py-2
          bg-slate-900/80 backdrop-blur-md
          border border-slate-700/50
          rounded-lg
          flex items-center gap-2
          transition-all duration-300
          hover:bg-slate-800/80 hover:border-cyan-500/30
          group
          ${scheduleDrawerOpen ? 'right-80' : 'right-4'}
        `}
        style={{ WebkitBackdropFilter: 'blur(12px)' }}
      >
        {isReviewDue && (
          <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
        )}
        <span className="text-slate-400 group-hover:text-cyan-400 transition-colors text-xs font-mono uppercase tracking-wider">
          {weeklyReview?.status === 'in_progress' ? 'Continue Review' : 'Weekly Review'}
        </span>
        {weeklyReview?.status === 'completed' && (
          <span className="text-emerald-400 text-xs">✓</span>
        )}
      </button>

      {/* Weekly Review Wizard Modal */}
      {weeklyReview && (
        <WeeklyReviewWizard
          isVisible={reviewWizardOpen}
          onClose={() => setReviewWizardOpen(false)}
          review={weeklyReview}
          onUpdateStep={handleUpdateReviewStep}
          onNavigate={handleNavigateReview}
          onComplete={handleCompleteReview}
          onAddBigThree={handleAddBigThree}
          tasks={tasks}
        />
      )}

      {/* Version indicator */}
      <div className="fixed bottom-4 left-4 z-10">
        <p className="text-slate-600 text-xs font-mono">PROFFLOW v1.9 // INTENTIONS</p>

        <p className="text-slate-600 text-xs font-mono">PROFFLOW v2.1 // CALENDAR</p>
      </div>
    </div>
  );
}
