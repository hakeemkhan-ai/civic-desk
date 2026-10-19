# Civic Desk — implementation and verification ledger

Updated 2026-10-19. Original ROADMAP.md preserved; no existing application or applicable AGENTS.md was found. Roadmap weeks were treated as dependencies. No agents were delegated, resources provisioned, or public deployment performed.

## Hyderabad implementation — current status

Hyderabad branding, custom Charminar SVG/favicon, and an optional Leaflet/OpenStreetMap location picker are implemented. The local database has been migrated with a private backup: 10 reports retained, nine synthetic examples relocated, manual report coordinates preserved. All 45 tests, full typecheck/build and offline evaluation pass. Browser interaction/visual checks remain unverified because no browser is connected. See the latest evidence below.

## Current continuation status — 2026-10-16

Local npm/network and localhost-binding blockers are resolved. Clean dependency installation, full TypeScript/build, all 43 tests (14 real MongoDB HTTP integration tests), additive seeding, and API/database restart persistence pass. Browser checks remain blocked: connected browser inventory is empty and opening `iab` returns `Browser is not available: iab`. No paid provider calls, external resources, or publication were performed. Detailed evidence is appended below; earlier blocker entries are historical.

## Implemented

- MongoDB-backed resident registration, hashed sessions, server-enforced staff roles, category/status filters, idempotent complaint creation, following and chronological audit history.
- Separate raw input, saved AI suggestions, approved content and prior-review content. Staff content/category/department review, constrained transitions, duplicate links and correction/rejection feedback with query/candidate snapshots.
- Private validated image uploads, decoded/re-encoded without metadata, stored as MongoDB binaries; no image understanding.
- Versioned structured OpenAI drafting, verbatim evidence checks, refusal/incomplete/error/timeout handling, explicit manual fallback, configurable models/prices, atomic conservative daily budget and content-free AI telemetry.
- Keyword baseline, true embedding cosine, metadata reranking, Atlas `$vectorSearch` adapter, content-hash/model/version/dimension checks, and leased bounded-retry indexing with stale-write protection.
- Responsive React UI: sign-in, report/edit/compare/submit, following, details/timeline, staff review and linking. Clear synthetic municipality and data labels. No simulated runtime AI outputs.
- Additive seed, persistent user-space real MongoDB helper, Docker Compose database, application Dockerfile and Atlas index definition.
- 240-query synthetic incident-group evaluation harness, development-only threshold tuning, held-out metrics, provider cache provenance, human-review rubric, deployment/API docs, case study and three-minute script.

## Executed evidence

- `npm run typecheck:client`: passed.
- `npm run build:client`: passed (React production bundle).
- `npm run test:unit`: 29 passed, explicitly offline / mocked provider contracts where indicated.
- Backend syntax transpilation with esbuild (external packages): passed; this is not a server type/build or runtime check.
- `npm run eval`: passed, wrote actual `evaluation/results/offline.json`.
- Keyword held-out metrics: recall@5 0.46 (50 positive queries), precision 0.15517, recall 0.36, 18 TP / 98 FP / 32 FN across 80 test queries; development-selected threshold 0.35.
- Fixed-copy template: literal-anchor preservation 1.0, missing-information recall 0.75, no flagged unsupported numbers/evidence; not a live model-quality result.
- Official OpenAI structured output, embeddings and model docs consulted. MongoDB index docs consulted; stage-page fetch incomplete, Atlas adapter unverified.

## Initial blockers and honest status (historical)

- Full `npm install` failed: npm registry DNS/network access unavailable (`EAI_AGAIN`). Missing backend/test packages include MongoDB, multer, helmet, cookie-parser, supertest and their types. Cached packages allowed limited checks; no dependency lock could be resolved honestly.
- Full `npm run typecheck` and full `npm test` attempted, blocked by those missing packages. An independently identified evaluation type mismatch was fixed. Full server compilation is still unverified.
- Vite development-server startup cannot bind local sockets (`listen EPERM`). Docker daemon access denied. A real MongoDB process and HTTP test server cannot run under these permissions.
- Browser inventory returned no browsers. Browser workflow and screenshots are unverified; no mock UI was passed off as the main workflow.
- No OpenAI key or Atlas setup: live drafting/embedding quality, cost/latency, Atlas retrieval and hosted deployment unverified. Human review pending.
- The first release is implemented in source, but its end-to-end definition of done is **not yet verified**. Do not call this deployed or production-ready.

## Original next-session sequence (see continuation evidence below)

1. On an environment with npm network access and permission to bind localhost, run `npm install`. Review/commit the generated lockfile and switch Docker/CI installs to `npm ci`.
2. Run `npm run typecheck`, `npm run test:integration`, and `npm run build`; fix any actual backend/type/integration failures before declaring completion. Unit suite is independently runnable with `npm run test:unit`.
3. Copy `.env.example` to `.env`, choose a demo password; start `docker compose up -d mongo` or `npm run dev:db`; run `npm run seed` twice to verify additive behavior, then `npm run dev`.
4. Execute `docs/DEMO.md` browser checklist in resident/staff profiles, including process restart persistence and mobile/keyboard checks. Record actual evidence here.
5. If credentials are available, run `npm run eval:live` (paid provider calls), inspect development thresholds, reserve a fresh holdout for future tuning, and retain results. Configure Atlas using `docs/DEPLOYMENT.md` and verify semantic-atlas response mode; word fallback is not success evidence.
6. Only after approval, create paid resources or publish. No permission is needed for routine local fixes/checks already authorized.

## Known tradeoffs

Single-instance rate limiting; MongoDB binary photo storage; embedded timelines; 2,000-record local retrieval bound; provisional semantic weights/threshold; simple contact redaction; synthetic template-family reuse; no retention cleanup/password reset/email verification/notifications. Nearby distinct assets without IDs and vague locations remain expected matching failure cases. Follow-up AI extensions are deliberately deferred.

## Continuation checks — 2026-10-16

- Rechecked npm registry access and an ephemeral localhost bind after the access-change discussion: still `EAI_AGAIN` and `EPERM`, respectively. No approval bypass or public publishing attempted.
- Fixed duplicate identity normalization to preserve Unicode letters, marks and numbers; empty punctuation-only identifiers cannot match. Ranking rules are now `incident-rules-v2`. Added regression coverage for distinct Devanagari IDs and equivalent full-width Latin IDs.
- Staff duplicate requests now exclude the current complaint server-side before selecting the top five. Added a six-candidate MongoDB HTTP regression test, pending environment access.
- Reran 29 offline tests, client type checking, client production build, backend external-package syntax transpilation and the offline evaluation: all passed. These checks do not replace MongoDB integration, full server type checking or browser verification.


## Local backend and MongoDB verification — 2026-10-16

- Read ROADMAP.md and this ledger; preserved existing application source and the roadmap. No git metadata/commit changes or deployment.
- Initial `npm ping --fetch-retries=0 --fetch-timeout=15000`: PONG. Node bound an ephemeral port on `127.0.0.1` successfully.
- Initial dependency install hit a read-only npm cache; approved escalation succeeded. The first lock inherited cached entries without integrity metadata, so a fresh lock was resolved in an isolated directory from the unchanged package manifest. All 328 non-root entries now have registry URLs and integrity hashes, and root declarations match package.json. Clean `npm ci --no-fund` passed. CI and both Docker stages now use `npm ci`.
- Environment: Node v26.8.1 / npm 11.19.0. CI's Node 24 and Docker image remain unexecuted locally. npm 11 withheld esbuild and mongodb-memory-server postinstall scripts; the installed platform binary and explicit MongoDB runtime download/start worked for the executed checks.
- `npm run check` after the clean install: full TypeScript passed; 43/43 tests in four files passed (29 unit tests, 14 real MongoDB HTTP integration tests); server compilation and Vite production build passed. Vite reports a non-fatal >500 kB JavaScript chunk warning (572.15 kB, gzip 167.14 kB).
- Fixed the only failing integration assertion: rejection feedback is correctly stamped `incident-rules-v2`, matching the previous Unicode identity fix; the test still expected v1. No runtime logic change was needed.
- `npm run eval` passed after the clean install and refreshed actual offline measurements; semantic evaluation remains unverified because no live embeddings were requested.
- `npm run dev:db` launched actual MongoDB 7.0.24 with persistent WiredTiger data in `.data/mongo`. Created a gitignored `.env` only because none existed, with a generated local demo password and empty provider key. Ran `npm run seed` twice; compared sorted complete documents and confirmed exactly two users and nine seed complaints were unchanged by the second run.
- Running Vite/API HTTP checks passed: HTML and proxied health, wrong-password 401, resident/staff login, AI-unavailable 503, successful manual creation, following, resident status-update 403, and staff status/timeline update. One clearly titled synthetic persistence-check complaint remains in the local demo database.
- Stopped the exact API/Vite and database helper processes started for verification; confirmed ports 3001, 5173 and 27017 were closed, then restarted. The full resident-visible complaint/timeline matched its pre-restart snapshot exactly; following and session persisted. Logout returned 204 and the old session then received 401. Dev services were restarted for local use at http://localhost:5173.
- Temporary local verification scripts/snapshots are under ignored `.cache/verification`; they are not release artifacts. No password or session token is included in this ledger.
- Final `npm audit` reports five affected packages: @vitest/mocker and vitest (moderate), sharp (high), shell-quote and concurrently (critical). This is not a clean security audit; remediation remains a release follow-up. Exact machine output is in ignored `.cache/verification/npm-audit.json`. No forced major upgrades were applied.

## Remaining verification

1. Connect a browser and run every item in `docs/DEMO.md`: resident/staff UI, photo preview/errors, filters/pagination, duplicate rejection/linking, mobile 390px, keyboard focus, 200% zoom, and logout. Browser tools returned no available browsers; HTTP checks above are not browser evidence.
2. Review/remediate the dependency audit findings and verify the Node 24/Docker runtime before release.
3. Live OpenAI evaluations and Atlas Vector Search still require credentials and explicit paid-call/resource authorization. Neither was run. Human evaluation remains pending.
4. Publish only with authorization. The project remains local and is not an end-to-end verified or production-ready release.


## Hyderabad branding, location map and data migration — 2026-10-16

- Updated city labels, metadata, config endpoint and versioned drafting prompt to an independent Hyderabad demonstration. Replaced building artwork with a custom vector Charminar mark; added a favicon and copied public assets in Docker builds. Existing demo login addresses and passwords remain unchanged for compatibility.
- Added lazy-loaded Leaflet 1.9.4 and OpenStreetMap tiles, attribution, scoped map styles, tile-failure notice, click/tap/drag pinning, clear pin, keyboard-accessible Use map center, and View Hyderabad controls. Map coordinates synchronize with existing inputs without changing precision or inventing an address. Complaint details render a read-only marker. Manual entry remains available without tiles. No geolocation, geocoding, paid maps or provider calls.
- Map requests use the narrow tile image CSP allowance and strict-origin-when-cross-origin referrer policy. Browser behavior is not claimed as verified.
- Added `npm run migrate:hyderabad`, gated to non-production/demo mode, with a synced mode-0600 Extended JSON backup under `.data/backups` before mutation, revision-checked updates, explicit system timeline events, and repeat-run safety. The migration preserves original reports, history, account IDs, relationships, attachments and user edits; changed seed content invalidates embeddings and resets indexing state. Shared fresh-seed definitions use approximate Hyderabad landmark positions and explicitly synthetic incidents.
- Executed migration against the local database: 10 migrated / 9 relocated; second run: 0 / 0. Backup: `.data/backups/hyderabad-1792144517195-c2c33db1-edfa-4187-9a49-25e2fa97010d.ejson`. Compared every migrated record against that backup: originals, followers, duplicate links, owners, photo references, idempotency fields and prior timeline events preserved; manual content and coordinates unchanged. Ran seed twice and verified all complete user/complaint documents unchanged.
- Added real MongoDB HTTP tests for selected coordinates, cleared coordinates and partial-coordinate rejection. Added migration coverage for backup failure, exact relocation, edited seed fields, unchanged manual reports, preserved history/relationships, embedding invalidation and repeat runs. Updated the provider-contract assertion to prompt v2.
- `npm run check`: full TypeScript passed, 45 tests passed (29 unit/provider-contract and 16 MongoDB HTTP integration), server/client build passed. Leaflet is emitted as a separate lazy JS/CSS chunk. Existing main bundle size warning remains (~574 kB uncompressed).
- `npm run eval`: passed; synthetic benchmark fixtures were intentionally retained for comparison. This is not live Hyderabad/model-quality evaluation.
- Running localhost checks confirmed health, Hyderabad config, Charminar asset, tile CSP and referrer headers. No browser was available (`apps: [], browsers: []`), so pin interaction, mobile layout, keyboard usability, favicon rendering and visual QA still require the browser checklist in docs/DEMO.md.
- No publication, paid resources, account-password changes or live AI calls. The five previously recorded dependency audit findings remain outside this feature change.


## Local portfolio preparation — 2026-10-19

- User confirmed local preparation first; no GitHub publication or paid resources authorized in this pass.
- Added a beginner developer guide tracing React → API → MongoDB, explaining the shared contract, AI/retrieval boundaries, safe changes, commands and local troubleshooting. Linked it from the README.
- Added a portfolio checklist with evidence-based project wording, release gates and a review-before-upload procedure. Corrected stale case-study and verification JSON claims that dependencies/type checking were still missing.
- Fresh `npm run check`: TypeScript and 29 unit tests passed; all 16 integration tests were skipped after MongoDB startup failed with socket `listen EPERM`. A separate `npm run build` passed for server/client; main bundle warning remains (~574 kB). Runtime: Node 26.8.1 / npm 11.19.0.
- Fresh `npm audit --json` could not access the npm registry (EAI_AGAIN). Escalations for a full check and advisory lookup were not executed because automatic approval review failed due to model capacity, not because the operations were judged unsafe. No current clean-audit claim.
- Git status/remote inspection reports no Git repository; `.git` is a read-only placeholder. Connected GitHub login is hakeemkhan-ai, with no repositories returned by the connector. No Git metadata, remote or external repository was changed.
- Historical 2026-10-16 MongoDB verification remains recorded above, distinct from today's blocked rerun. Browser, Node 24, Docker, live provider and Atlas checks remain outstanding. The known duplicate-launch `dev:db` issue is documented in the beginner guide and not yet fixed.


## Database launcher preparation — 2026-10-19

- Added an exclusive loopback port preflight before database-directory creation or mongod startup. Occupied port 27017 reports recovery instructions; permission failures report the socket error clearly. Disabled mongodb-memory-server port generation so it cannot silently select another port while using the persistent database path.
- Added two real-socket regression tests for occupied-port handling (preserving the existing listener) and probe cleanup (allowing the next listener). Included them in `test:integration`; total suite now contains 47 tests, with no claim that the new tests have passed.
- TypeScript and the existing 29 unit tests pass. Running `npm run dev:db` in the sandbox exits 1 with a concise EPERM message before spawning MongoDB. The port check reduces the common duplicate-launch failure; it does not repair upstream log parsing or eliminate a race with another process binding immediately after the probe closes.
- Requested unrestricted integration verification, but automatic approval review again failed due to model capacity; command not executed. No data files were removed and no running database was stopped.
- Browser inventory now exposes an in-app browser. Opening localhost was also not executed because automatic approval review failed. UI verification therefore remains pending for a different reason than the historical missing-browser inventory.


## Integration verification and source review — 2026-10-19

- Unrestricted `npm run test:integration` was authorized and completed: all 18 tests passed (16 real MongoDB HTTP tests plus two real-socket launcher checks). Together with the current 29 unit tests, all 47 tests are verified. Earlier blocked-run entries are historical.
- Reviewed 64 source/documentation candidates with credential-pattern checks, excluding local data/caches/secrets. The only match was the explicit `<app-user>:<password>@<cluster>` MongoDB documentation placeholder. This is a limited pattern scan, not an exhaustive security audit. Git/Docker ignore rules exclude local credentials, database backups and caches.
- Confirmed dependency lists match the lockfile and all package entries have integrity hashes.
- A new npm advisory lookup and browser navigation were not executed: automatic approval review failed due to model capacity. No attempt to bypass that review. Dependency audit and UI verification remain outstanding.
- The project remains local per the user's latest instruction. GitHub destination/visibility and publication authorization remain pending; no external repository was created or changed.


## Public repository preparation — 2026-10-19

- Owner authorized creating and pushing public `hakeemkhan-ai/civic-desk`. Initialized Git metadata without changing application data. Use GitHub noreply commit identity; keep all local credentials, data, backups and tooling caches excluded.
- Expanded README with clone/setup instructions, resident/staff walkthrough and troubleshooting. Preserved detailed architecture, evaluation limits and configuration documentation.
- Refreshed dependency audit and applied patch fixes: sharp 0.35.5, Vitest 4.1.12 and concurrently 10.0.6. Audit now reports zero known vulnerabilities, superseding historical findings above.
- Full checks after updates passed all 47 tests, TypeScript and production build. Offline evaluation rerun without provider calls. The existing bundle-size warning remains; browser, Docker and live-provider checks are not claimed.
- First pre-commit review scanned 65 candidate source/documentation files for credential patterns, actual local secret values, personal filesystem paths and excluded data paths: no findings. Only `.env.example` is eligible for version control; `.env` and database files remain local.
