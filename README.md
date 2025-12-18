# ProfFlow

ProfFlow is a local-first task and planning service built with Next.js 14, the Gemini API, and a JSON-backed data layer. The system follows a _propose → confirm → commit_ loop where the assistant suggests operations, the user confirms them, and the server applies changes to structured files within `~/ProfFlow/data/`.

## Getting Started

1. Install dependencies (requires Node.js 18+):
   ```bash
   npm install
   ```
2. Provide the Gemini API key and optional overrides in `.env.local`:
   ```bash
   GEMINI_API_KEY=your-key
   PROFFLOW_DATA_DIR=~/ProfFlow/data   # optional
   PROFFLOW_ALLOWED_ORIGINS=http://localhost:3000
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

The main pages live in `app/`; API routes that power chat, confirm, tasks, and health checks are under `app/api/…`. Shared modules are organized in `lib/`, and domain types live in `types/`.

## Key Commands

- `npm run dev` – start Next.js locally
- `npm run build` – production build
- `npm run start` – serve production build
- `npm run lint` – run Next.js linting
- `npm run typecheck` – ensure TypeScript types are sound

## Data Directory

All persistent data is stored as JSON under the directory resolved by `getDataDir()` (defaults to `~/ProfFlow/data`). The data layer uses:

- Atomic writes via temp-file and rename
- A process-wide lock guard (`proper-lockfile`) with re-entrant support
- Migration hooks driven by Zod schemas in `lib/validation/schemas.ts`

## Testing Notes

The design checklist recommends exercising:

1. Migration from v1 files to v2
2. Concurrent requests (opens tabs, rapid confirm)
3. Lock recovery after crashes
4. CSRF protection (Origin/Referer)
5. Plan replacement semantics and tempId resolution
6. Calendar text passthrough in chat
7. Completion history recording for both habits and one-off tasks
8. `npm run typecheck` to validate schema/type parity

Automated tests are not yet included; focus on deterministic fixtures and manual end-to-end runs via the API routes.
