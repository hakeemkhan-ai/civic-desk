# Repository Guidelines

## Project Structure & Module Organization

- `app/`: Next.js App Router layouts, pages and native Node-runtime API route handlers.
- `client/`: interactive React interface, API helper, browser-only Leaflet map and styles; `public/` holds static assets.
- `server/`: native Request/Response API logic, authentication, MongoDB persistence, uploads, AI adapters and a separate persistent retrieval worker.
- `shared/domain.ts`: shared types, Zod schemas, categories and status transitions.
- `scripts/`: database launcher, additive seeding, invitation issuance, migration and reindexing commands.
- `tests/`: automated tests; `evaluation/`: synthetic datasets and offline/live evaluation.
- `README.md`: public setup, usage and architecture guide. Record verification evidence in `PROGRESS.md`; preserve the original `ROADMAP.md`. Keep local `docs/` untracked.

## Build, Test, and Development Commands

Use Node 24, matching CI. Run `npm ci`, copy `.env.example` to `.env` if absent, and choose a local demo password.

- `npm run dev:db`: start persistent local MongoDB; run only one database instance.
- `npm run seed`: create missing demo accounts and samples without overwriting existing records.
- `npm run invite -- address@example.test`: issue a private, single-use, email-bound resident invitation against the selected database; expires after 24 hours.
- `npm run dev`: start Next.js on port 5173 and the separate embedding worker.
- `npm run check`: type-check, run all tests and build production output.
- `npm run build` / `npm start`: build into `.next/`, then run the production Next.js server on `PORT` (default 3001).
- `npm run worker:start`: run the production embedding worker separately with the same environment.
- `npm run test:next`: after building, verify the actual Next.js server with an isolated temporary MongoDB; no provider calls or persistent data changes.
- `npm run eval`: run the offline synthetic benchmark without provider calls.

## Coding Style & Naming Conventions

Use strict TypeScript, ES modules, two-space indentation and semicolons. Follow `.prettierrc.json`: single quotes, trailing commas and 100-column width. Prettier configuration exists, but no formatter or linter script is installed. Use PascalCase for React components/types and camelCase for functions/variables. Preserve `.js` suffixes in server-side relative imports. Validate external input with Zod and enforce permissions on the server.

## Testing Guidelines

Use Vitest and name tests `tests/*.test.ts`. Run `npm run test:unit` for isolated checks and `npm run test:integration` for native-handler/MongoDB security regressions, Supertest HTTP workflows and socket tests. Integration tests and `test:next` require local ports and may download MongoDB. No numeric coverage threshold is configured; cover changed behavior, authorization and failure paths. Check invited registration/separate sign-in, resident/staff flows, map pinning, mobile layout, keyboard access and logout in a browser; builds and HTTP smoke tests do not establish UI correctness.

## Commit & Pull Request Guidelines

Use concise imperative subjects, such as `Fix duplicate database startup`. PRs should explain behavior changes, link relevant issues, report executed checks and limitations, and include screenshots for UI changes. Document schema/data migrations and preserve existing records.

## Security & Configuration

Never commit `.env`, database backups, caches or credentials. Use synthetic demo data. Keep AI keys server-side and preserve manual fallback. Publishing, paid provider calls and resource creation require explicit authorization.

Invitation codes are credentials: deliver privately and never record them in shared logs. Keep rate limits in shared atomic storage, with independent session/account/invitation scopes. Trust forwarded client identities only behind verified ingress. Preserve existing records when adding optional quota/expiry fields. Atomically remove a photo's expiry before saving a report reference; never expire attached or legacy photos.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
