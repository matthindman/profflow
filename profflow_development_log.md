# ProfFlow Development Log (for AI coding models)

Last updated: 2025-12-23

This document is written for an AI coding model working on the ProfFlow codebase. It summarizes the
project architecture, data model, key “gotchas”, and the major implementation work completed during
this chat session (UI redesign, drawer behavior, multi‑day schedule navigation, and Task Manifest
improvements including drag‑and‑drop + manual completion).

---

## 0) TL;DR (What ProfFlow Is)

ProfFlow is a **Next.js 14 (App Router)** web app that pairs a sci‑fi “Ambient Outpost” UI with an
AI-driven workflow. Users manage **tasks** and **daily plans**. The AI proposes operations (create
tasks, create plans, complete tasks, etc.) that can be confirmed and executed server-side. Data is
stored in JSON files protected by a global lock for correctness under concurrent access.

---

## 1) Quick Start (Local Dev)

From repo root:

- Install: `npm install`
- Dev server: `npm run dev`
- Typecheck: `npm run typecheck`

Notes:

- **Do not commit** `.env.local` (contains secrets like the Gemini API key).
- If the dev server gets into a bad Next.js cache state (e.g. missing `.next/server/...js` chunks),
  stop the server, delete `.next`, and restart `npm run dev`.

---

## 2) Repository Structure (Key Paths)

High-level tree (relevant parts):

```
app/
  layout.tsx                 # Root layout (imports globals.css, loads Google fonts)
  globals.css                # Tailwind directives + base styles
  page.tsx                   # Main UI (drawers, background, chat, focus, schedule)
  api/
    chat/route.ts            # AI chat endpoint
    chat/confirm/route.ts    # Executes confirmed proposed operations
    tasks/route.ts           # GET tasks (+completedToday); POST create task
    tasks/[id]/route.ts      # PATCH task (status/category)  [added in this chat]
    tasks/[id]/complete-today/route.ts  # POST/DELETE daily completion [added]
    tasks/manifest/route.ts  # PATCH ordering/category changes [added]
    plans/today/route.ts     # GET daily plan (supports ?date=YYYY-MM-DD)
    health/route.ts          # health check

lib/
  data/index.ts              # JSON store w/ global lock + migrations + task/plan APIs
  executor/index.ts          # Applies proposed operations (complete_task, complete_habit, etc.)
  llm/*                      # Gemini integration + operation parsing
  middleware/security.ts     # Origin validation for mutating routes (CSRF mitigation)
  validation/schemas.ts      # Zod schemas + file versions/migrations
  utils/date.ts              # Local date helpers (YYYY-MM-DD)
  utils/paths.ts             # getDataDir()

types/
  data.ts                    # Domain types (Task, Plan, TaskCompletion, TaskWithCompletion, ...)

public/backgrounds/
  ambient-outpost.jpg        # Background image (tracked)

tailwind.config.ts
postcss.config.js
```

Important:

- Runtime JSON data defaults to `~/ProfFlow/data` (i.e. `<home>/ProfFlow/data`). This repo is
  typically located at that path, so the runtime data directory is a sibling folder in the repo.
  These JSON files are **ignored** by git.

---

## 3) Data Model (Conceptual)

### 3.1 Tasks

Core fields (see `types/data.ts`):

- `id`, `title`, `notes`, `category`, `status`
- optional schedule metadata: `dueOn` (YYYY-MM-DD), `dueTime` (HH:mm), `location`
- recurrence: `recurrenceRule` (`'daily'` or `null`)
- timestamps: `createdAt`, `updatedAt`

Recurring tasks are treated as “habits”: they do **not** become `status:'done'`. Instead, they are
recorded as **completed for a date**.

### 3.2 Completions

Completions are stored in `completions.json` as separate records:

- `taskId`, `completedOnDate` (YYYY-MM-DD), `completedAt`, optional `notes`

The server can derive `completedToday: boolean` for tasks by looking for a completion record for
the requested date.

### 3.3 Plans / Schedule Blocks

Plans are keyed by `planDate` (local date string). They contain:

- `rankedTaskIds`
- `nextActions`
- `scheduleBlocks`: time blocks with `{ start, end, label, type, taskId }`

`/api/plans/today` supports a `?date=` param to fetch other dates’ plans.

---

## 4) Data Layer + Concurrency Guarantees

### 4.1 Locking

All JSON reads/writes go through `lib/data/index.ts` which enforces a **global lock** using
`proper-lockfile` on `data.global.lock`. Do not bypass this; use the provided helpers:

- `readData(...)`, `updateData(...)`, and higher-level functions like `updateTask(...)`.

### 4.2 File Versions + Migrations

Schemas and migrations are defined in `lib/validation/schemas.ts` (Zod). The data layer migrates
on read if needed, validates, then writes migrated content back.

---

## 5) Security Model for Mutating Requests

All mutating API routes (`POST`, `PATCH`, `DELETE`) should call:

- `requireValidOrigin(req)` from `lib/middleware/security.ts`

Allowed origins default to localhost; additional ones can be configured by
`PROFFLOW_ALLOWED_ORIGINS` in `.env.local` (never commit secrets).

---

## 6) UI Architecture (Ambient Outpost)

ProfFlow’s main UI is currently implemented in a single file: `app/page.tsx`. Key UI units:

- **AmbientBackground**: full-bleed background image w/ subtle overlays; **no dimming** when all
  drawers are closed; very subtle dimming when a drawer is open.
- **GlassPanel**: reusable glass-morphism container (blur + borders + glow).
- **TaskDrawer** (left): Task Manifest.
- **ScheduleDrawer** (right): Daily schedule, with multi-day navigation (yesterday → +2 days).
- **FocusDrawer** (bottom): Current focus card.
- **ChatOverlay** (modal): AI terminal + proposed operations confirmation.
- **ChatToggle** (floating button): Always clickable and not blocked by drawer overlays.

Design rules from this chat:

- Drawers should not blur the entire background; overlays are subtle and non-blurred.
- Background image should not be dimmed when *all* drawers are closed.
- Chat toggle must remain clickable above overlays.

---

## 7) API Surface (Current)

### 7.1 Tasks

- `GET /api/tasks`
  - Returns `{ tasks: TaskWithCompletion[] }` where each task includes `completedToday` for the
    server’s local date.
- `POST /api/tasks`
  - Creates a task (requires valid origin).
- `PATCH /api/tasks/[id]` (added in this chat)
  - Updates `status` and/or `category` (requires valid origin).
  - If setting `status:'done'` for a non-recurring task, also records a completion for today.
  - If setting `status:'active'`, removes today’s completion record (undo for today).
- `POST /api/tasks/[id]/complete-today` (added in this chat)
  - Records a completion for `date` (defaults to today) without changing task status.
- `DELETE /api/tasks/[id]/complete-today` (added in this chat)
  - Removes completion record(s) for `date` (defaults to today).
- `PATCH /api/tasks/manifest` (added in this chat)
  - Persists drag/drop ordering and cross-category moves for **active tasks**.
  - Body: `{ orderByCategory: { research: string[], teaching_service: string[], family: string[], health: string[] } }`

### 7.2 Plans

- `GET /api/plans/today`
  - Supports `?date=YYYY-MM-DD`. Returns `{ plan }`.

### 7.3 Chat

- `POST /api/chat`
  - Produces assistant reasoning + proposed operations.
- `POST /api/chat/confirm`
  - Executes accepted operation indexes.

Execution is implemented in `lib/executor/index.ts`.

---

## 8) Summary of This Chat (Chronological)

1. **UI redesign request (Technical Design Doc)**:
   - Tailwind config + PostCSS config added/replaced.
   - `app/layout.tsx`, `app/globals.css`, `app/page.tsx` replaced to implement the “Ambient Outpost”
     sci-fi aesthetic (glass panels, background image, drawer layout, chat modal).
2. **Drawer behavior refinements**:
   - Right schedule and bottom focus changed to behave like drawers (slide in/out).
   - Removed background blur when drawers open; ensured chat button is clickable (z-index/overlay).
   - Adjusted background dimming: **no dim when all drawers are closed**; only subtle dim when any
     drawer is open.
3. **Multi-day schedule navigation**:
   - Schedule now defaults to today but supports viewing **yesterday** and up to **+2 days**.
   - Uses `/api/plans/today?date=YYYY-MM-DD` with a small in-memory cache in `app/page.tsx`.
4. **Build/runtime hiccup**:
   - Encountered a Next.js dev cache issue: `Cannot find module './682.js'` from `.next/server`.
   - Fix: stop dev server, delete `.next`, restart.
5. **Task Manifest upgrades (this work)**:
   - Added **manual completion** (checkbox) so AI is not required.
   - Added “Completed Today” collapsible section with uncheck (undo).
   - Added **drag-and-drop reorder** and **cross-category move** via `@dnd-kit`.
   - Added backend endpoints to persist ordering and completion toggles.
   - Fixed `.gitignore` to avoid ignoring `lib/data/` (see “Gotchas” below).

---

## 9) Detailed Changes Implemented (What & Where)

### 9.1 Task completion + undo (manual)

Frontend (`app/page.tsx`):

- Task rows include checkboxes.
- Completing a task:
  - Non-recurring: `PATCH /api/tasks/[id] { status:'done' }`
  - Recurring: `POST /api/tasks/[id]/complete-today`
- Undo:
  - Non-recurring: `PATCH /api/tasks/[id] { status:'active' }`
  - Recurring: `DELETE /api/tasks/[id]/complete-today`
- Focus drawer “Mark Complete ✓” now completes directly (no AI required).

Backend:

- `app/api/tasks/[id]/route.ts` (PATCH) added.
- `app/api/tasks/[id]/complete-today/route.ts` added.
- `lib/data/index.ts` added `removeCompletionForDate(...)` to support “uncheck”.

### 9.2 “Completed Today” list in Task Manifest

Frontend (`app/page.tsx`):

- Collapsible section at bottom of Task Manifest.
- Items are derived from `completedToday` coming from `GET /api/tasks`.
- Recurring tasks that are completed today are “popped out” of the active manifest list.

### 9.3 Drag-and-drop ordering + category moves

Frontend (`app/page.tsx`):

- Uses `@dnd-kit/core` + `@dnd-kit/sortable`.
- Drag handle (`⠿`) starts the drag; click elsewhere focuses the task.
- On drop, client calls `PATCH /api/tasks/manifest` with new `orderByCategory`.

Backend:

- `app/api/tasks/manifest/route.ts` validates IDs and persists ordering.
- `lib/data/index.ts` added `updateTaskManifest(...)` to:
  - update categories for moved tasks,
  - reorder active tasks in `tasks.json` to match the manifest order.

### 9.4 Tasks GET now includes completion state

Backend (`app/api/tasks/route.ts`):

- `GET` now returns `getTasksWithCompletions(getLocalDateString())`, adding `completedToday`.

Frontend:

- `Task` interface now includes optional `completedToday?: boolean`.

### 9.5 Repo hygiene / correctness fix

`.gitignore`:

- Changed `data/` → `/data/` so we ignore only the runtime data directory at repo root, and **do not
  accidentally ignore** source code under `lib/data/`.

This is important for AI models: a pattern like `data/` matches any nested folder named `data`
(`lib/data`, `app/data`, etc.) and can silently prevent important source files from being tracked.

---

## 10) Known Gotchas & Troubleshooting

### 10.1 Tailwind not applying

Verify:

- `tailwind.config.ts` exists at repo root
- `postcss.config.js` exists at repo root
- `app/globals.css` starts with Tailwind directives
- `app/layout.tsx` imports `./globals.css`

Then stop dev server, delete `.next`, restart.

### 10.2 Next.js dev cache error: missing `.next/server/...js`

If you see errors like:

- `Cannot find module './682.js'` from `.next/server/webpack-runtime.js`

Fix:

- Stop dev server
- `rm -rf .next`
- `npm run dev`

### 10.3 Mutating API calls returning 403

Cause: origin blocked by `requireValidOrigin`.

Fix:

- Add your origin(s) to `PROFFLOW_ALLOWED_ORIGINS` in `.env.local` (comma-separated).

### 10.4 ESLint configuration prompt

`npm run lint` may prompt to configure ESLint if it hasn’t been initialized in this repo.
This is expected until an ESLint config is committed.

---

## 11) Working Agreements / Preferences (From This Chat)

- Keep the “Ambient Outpost” aesthetic: glass panels, cyan accents, mono data labels.
- Do not blur the background when drawers are open.
- No background dimming when all drawers are closed; dimming when open should be subtle.
- Chat toggle must remain clickable and visually consistent.
- Recurring tasks are “completed today” (habit completion), not permanently done.

---

## 12) Future Work Ideas (If Needed Later)

- Expand “Completed Today” to “Recently Completed” with a rolling window (requires returning last
  completion date(s) from the API).
- Persist schedule view offset in localStorage.
- Refactor `app/page.tsx` into smaller components under `components/` to reduce file size.
- Add tests for new API routes (task patching, completion toggles, manifest updates).
