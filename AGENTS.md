# Repository Guidelines

## Project Structure & Module Organization
- `app/` contains the Next.js 14 app router pages and API routes (`app/api/...`).
- Shared libraries (data layer, executors, prompts, LLM helpers) live in `lib/`.
- Domain types live in `types/`.
- JSON files that back the runtime are **not** committed; the server reads/writes under the path returned by `getDataDir()` (defaults to `~/ProfFlow/data`).
- Keep additional assets (images, docs) scoped to dedicated folders and avoid polluting the repo root.

## Build, Test, and Development Commands
- Install deps: `npm install`
- Dev server: `npm run dev`
- Production build: `npm run build && npm run start`
- Lint: `npm run lint`
- Type safety: `npm run typecheck`
- Environment: provide `GEMINI_API_KEY` (and optional `PROFFLOW_DATA_DIR`, `PROFFLOW_ALLOWED_ORIGINS`) via `.env.local`.

## Coding Style & Naming Conventions
- Use TypeScript with strict mode (`tsconfig.json`). Prefer explicit types for exported APIs.
- Indentation: 2 spaces; avoid tabs. Target ≤100 characters per line.
- Path aliases use `@/` (see `tsconfig.json`). Keep modules small and composable.
- When editing shared logic, add concise comments only where behavior is non-obvious (locking, migrations, etc.).

## Data & Concurrency Guarantees
- File schemas and migrations are defined with Zod in `lib/validation/schemas.ts`. Update both the schema map and the corresponding interfaces when evolving formats.
- The JSON store uses a single `proper-lockfile` mutex with AsyncLocalStorage-backed re-entrancy. Never bypass `withGlobalLock()`/`updateData()`.
- Writes must remain atomic: stick to `writeDataUnsafe()` for persistence.

## Testing Guidelines
- Lean on `npm run typecheck` plus targeted scenario testing against the API routes.
- When adding reusable helpers, consider colocating lightweight unit tests (e.g., `vitest`) or describing manual validation steps in PR notes.
- Follow the implementation checklist in `README.md` (migrations, CSRF, plan replacement, completion history).

## Commit & Pull Request Guidelines
- Use clear, imperative commit messages (prefer the `feat:/fix:/docs:/chore:` prefixes).
- PR descriptions should call out: scope, rationale, screenshots/log excerpts for API responses, and any data expectations.
- Keep PRs focused; land schema changes together with migrations & validation updates.

## Security & Configuration Tips
- Never commit credentials. All secrets should flow through environment variables (`.env.local` ignored by git).
- Respect CSRF protections (`requireValidOrigin`) for any new mutating route.
- Data directory paths must go through `getDataDir()` to ensure tilde expansion and single source of truth.

## Agent-Specific Instructions
- Scope: edit files within this repository only; do not touch unrelated directories in `$HOME`.
- Preserve the locking/data invariants when extending the data layer—avoid ad-hoc fs access.
- Update this document whenever you introduce new conventions or tooling expectations.
