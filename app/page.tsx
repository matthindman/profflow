'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Plan, ProposedOperation, ScheduleBlock, Task } from '@/types/data';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface PendingOperationsState {
  messageId: string;
  operations: ProposedOperation[];
}

interface TasksResponse {
  tasks: Task[];
}

interface PlanResponse {
  plan: Plan | null;
  date: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  research: 'Research',
  teaching_service: 'Teaching & Service',
  family: 'Family',
  health: 'Health',
};

const BLOCK_TYPE_LABELS: Record<ScheduleBlock['type'], string> = {
  deep_work: 'Deep Work',
  shallow_work: 'Shallow Work',
  meeting: 'Meeting',
  break: 'Break',
  life: 'Life',
};

interface OperationSelection {
  [index: number]: boolean;
}

function formatTimeLabel(time: string): string {
  if (!time.includes(':')) return time;
  const [hour, minute] = time.split(':').map(Number);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const normalizedHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalizedHour}:${minute.toString().padStart(2, '0')} ${suffix}`;
}

function groupTasksByCategory(tasks: Task[]): Record<string, Task[]> {
  return tasks.reduce<Record<string, Task[]>>((acc, task) => {
    const key = task.category;
    if (!acc[key]) acc[key] = [];
    acc[key].push(task);
    return acc;
  }, {});
}

function TaskCard({ task }: { task: Task }) {
  return (
    <div className="task-card">
      <div className="task-title">{task.title}</div>
      <div className="task-meta">
        <span>{task.status === 'done' ? 'Completed' : task.category}</span>
        {task.dueOn ? <span>Due {task.dueOn}</span> : null}
      </div>
    </div>
  );
}

function ScheduleBlockCard({ block }: { block: ScheduleBlock }) {
  return (
    <div className="schedule-block">
      <div className="time-range">
        {formatTimeLabel(block.start)} – {formatTimeLabel(block.end)}
      </div>
      <div className="block-label">{block.label}</div>
      <div className="block-type">{BLOCK_TYPE_LABELS[block.type]}</div>
    </div>
  );
}

function ProposedOperationsList({
  pending,
  selections,
  onToggle,
}: {
  pending: PendingOperationsState;
  selections: OperationSelection;
  onToggle: (index: number) => void;
}) {
  if (pending.operations.length === 0) {
    return (
      <div className="proposed-ops">
        <div className="proposed-ops__title">No structured operations detected</div>
        <p>The assistant responded with reasoning only. You can continue the conversation.</p>
      </div>
    );
  }

  return (
    <div className="proposed-ops">
      <div className="proposed-ops__title">Review Proposed Changes</div>
      <ul>
        {pending.operations.map((op, index) => (
          <li key={`${pending.messageId}-${index}`}>
            <label>
              <input
                type="checkbox"
                checked={selections[index] ?? true}
                onChange={() => onToggle(index)}
              />
              <span>
                <strong>{op.op}</strong>: {op.description || 'No description provided'}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HomePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planDate, setPlanDate] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [calendarText, setCalendarText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingOps, setPendingOps] = useState<PendingOperationsState | null>(null);
  const [operationSelections, setOperationSelections] = useState<OperationSelection>({});
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const response = await fetch('/api/tasks', { cache: 'no-store' });
      const data: TasksResponse = await response.json();
      setTasks(data.tasks ?? []);
    } catch (err) {
      console.error('Failed to fetch tasks', err);
    }
  }, []);

  const fetchPlan = useCallback(async () => {
    try {
      const response = await fetch('/api/plans/today', { cache: 'no-store' });
      const data: PlanResponse = await response.json();
      setPlan(data.plan ?? null);
      setPlanDate(data.date);
    } catch (err) {
      console.error('Failed to fetch plan', err);
    }
  }, []);

  const refreshState = useCallback(async () => {
    await Promise.all([fetchTasks(), fetchPlan()]);
  }, [fetchTasks, fetchPlan]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const groupedTasks = useMemo(() => groupTasksByCategory(tasks), [tasks]);

  const nowQueue = useMemo(() => {
    return tasks.filter((task) => task.status === 'active').slice(0, 5);
  }, [tasks]);

  const handleSend = async () => {
    if (!input.trim()) return;
    setError(null);
    setStatusMessage(null);
    const newMessage: ChatMessage = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newMessage]);
    setIsSending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, calendarText: calendarText || undefined }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Chat request failed');
      }

      const data = await response.json();
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.reasoning,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      const operations: ProposedOperation[] = data.proposedOperations ?? [];
      setPendingOps({ messageId: data.messageId, operations });

      const defaultSelections = operations.reduce<OperationSelection>((acc, _, index) => {
        acc[index] = true;
        return acc;
      }, {});
      setOperationSelections(defaultSelections);
      setInput('');
      setCalendarText('');
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleConfirm = async () => {
    if (!pendingOps) return;

    const selectedIndexes = Object.entries(operationSelections)
      .filter(([, selected]) => selected)
      .map(([idx]) => Number(idx))
      .sort((a, b) => a - b);

    try {
      const response = await fetch('/api/chat/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: pendingOps.messageId,
          acceptedOperationIndexes: selectedIndexes,
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Confirm request failed');
      }

      const result = await response.json();
      setStatusMessage(result.message || 'Operations processed');
      setPendingOps(null);
      setOperationSelections({});
      await refreshState();
    } catch (err: any) {
      setError(err.message || 'Failed to confirm operations');
    }
  };

  const handleReject = () => {
    setPendingOps(null);
    setOperationSelections({});
    setStatusMessage('Dismissed proposed operations');
  };

  const toggleSelection = (index: number) => {
    setOperationSelections((prev) => ({
      ...prev,
      [index]: !(prev[index] ?? true),
    }));
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>ProfFlow</h1>
          <p>Plan your day with the AI-first productivity workspace.</p>
        </div>
        <button className="refresh-button" onClick={refreshState} type="button">
          Refresh Data
        </button>
      </header>

      <main className="layout-grid">
        <section className="category-panel">
          <h2>Category Panels</h2>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <div key={key} className="category-section">
              <div className="category-title">{label}</div>
              {groupedTasks[key]?.length ? (
                groupedTasks[key].map((task) => <TaskCard key={task.id} task={task} />)
              ) : (
                <p className="empty-state">No tasks in this category yet.</p>
              )}
            </div>
          ))}
        </section>

        <section className="chat-panel">
          <div className="chat-thread">
            {messages.length === 0 ? (
              <div className="empty-state">
                Start by telling ProfFlow what you need help with today.
              </div>
            ) : (
              messages.map((message, index) => (
                <div key={`${message.timestamp}-${index}`} className={`chat-message ${message.role}`}>
                  <div className="chat-role">{message.role === 'user' ? 'You' : 'ProfFlow'}</div>
                  <div className="chat-bubble">{message.content}</div>
                </div>
              ))
            )}
          </div>

          {pendingOps ? (
            <div className="proposed-panel">
              <ProposedOperationsList
                pending={pendingOps}
                selections={operationSelections}
                onToggle={toggleSelection}
              />
              <div className="proposed-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={handleConfirm}
                  disabled={isSending}
                >
                  Confirm Selected
                </button>
                <button type="button" onClick={handleReject} disabled={isSending}>
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}

          <div className="chat-input">
            <textarea
              placeholder="Type or dictate your request..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={3}
            />
            <textarea
              placeholder="Optional calendar paste (e.g., 2pm-3pm: Meeting)"
              value={calendarText}
              onChange={(event) => setCalendarText(event.target.value)}
              rows={2}
            />
            <button type="button" onClick={handleSend} disabled={isSending}>
              {isSending ? 'Sending...' : 'Send to ProfFlow'}
            </button>
            {error ? <p className="error-text">{error}</p> : null}
            {statusMessage ? <p className="status-text">{statusMessage}</p> : null}
          </div>
        </section>

        <section className="sidebar-panel">
          <div className="now-queue">
            <h2>Now Queue</h2>
            {nowQueue.length === 0 ? (
              <p className="empty-state">No active tasks queued right now.</p>
            ) : (
              nowQueue.map((task) => <TaskCard key={task.id} task={task} />)
            )}
          </div>

          <div className="schedule-view">
            <h2>Schedule for {planDate || 'Today'}</h2>
            {plan && plan.scheduleBlocks.length > 0 ? (
              plan.scheduleBlocks.map((block) => (
                <ScheduleBlockCard key={`${block.start}-${block.label}`} block={block} />
              ))
            ) : (
              <p className="empty-state">No schedule created for today yet.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
