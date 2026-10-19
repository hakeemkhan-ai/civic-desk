# Repository Guidelines

## Project Structure & Module Organization

- `client/`: React interface, API helper, Leaflet map and styles; `public/` holds static assets.
- `server/`: Express routes, authentication, MongoDB persistence, uploads, AI adapters and retrieval worker.
- `shared/domain.ts`: shared types, Zod schemas, categories and status transitions.
- `scripts/`: database launcher, additive seeding, migration and reindexing commands.
- `tests/`: automated tests; `evaluation/`: synthetic datasets and offline/live evaluation.
- `docs/`: API reference, developer guide, demo checklist and portfolio case study. Record verification evidence in `PROGRESS.md`; preserve the original `ROADMAP.md`.

## Build, Test, and Development Commands

Use Node 24, matching CI. Run `npm ci`, copy `.env.example` to `.env` if absent, and choose a local demo password.

- `npm run dev:db`: start persistent local MongoDB; run only one database instance.
- `npm run seed`: create missing demo accounts and samples without overwriting existing records.
- `npm run dev`: start Vite on port 5173 and Express on port 3001.
- `npm run check`: type-check, run all tests and build production output.
- `npm run build` / `npm start`: build into `dist/`, then run the production server.
- `npm run eval`: run the offline synthetic benchmark without provider calls.

## Coding Style & Naming Conventions

Use strict TypeScript, ES modules, two-space indentation and semicolons. Follow `.prettierrc.json`: single quotes, trailing commas and 100-column width. Prettier configuration exists, but no formatter or linter script is installed. Use PascalCase for React components/types and camelCase for functions/variables. Preserve `.js` suffixes in server-side relative imports. Validate external input with Zod and enforce permissions on the server.

## Testing Guidelines

Use Vitest and name tests `tests/*.test.ts`. Run `npm run test:unit` for isolated checks and `npm run test:integration` for Supertest/MongoDB and socket tests. Integration tests require local ports and may download MongoDB. No numeric coverage threshold is configured; cover changed behavior, authorization and failure paths. Follow `docs/DEMO.md` for browser checks; builds do not establish UI correctness.

## Commit & Pull Request Guidelines

Git history is unavailable here; no established commit convention is verified. Use concise imperative subjects, such as `Fix duplicate database startup`. PRs should explain behavior changes, link relevant issues, report executed checks and limitations, and include screenshots for UI changes. Document schema/data migrations and preserve existing records.

## Security & Configuration

Never commit `.env`, database backups, caches or credentials. Use synthetic demo data. Keep AI keys server-side and preserve manual fallback. Publishing, paid provider calls and resource creation require explicit authorization.
