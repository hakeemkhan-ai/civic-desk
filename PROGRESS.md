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


## Public documentation cleanup — 2026-10-19

- Removed `docs/` from the current public source tree at the owner's request and ignored local copies. README retains setup, usage, architecture and testing instructions; removed links to the excluded folder. Earlier references above describe historical work. Previous commits still contain the documentation; no history rewrite was performed.


## Next.js and MongoDB migration — 2026-10-20

- User explicitly requested orchestration of subagents. Three implementation scopes covered the native API, App Router interface, and dependencies/build/tests. The parent integrated and reviewed their changes and completed runtime/browser verification after resuming the interrupted session.
- Replaced Vite/React Router/Express with Next.js 16.4.2 App Router pages and native Node-runtime Request/Response handlers under `app/api/[[...path]]/route.ts`. Preserved API paths, request validation, permissions, session hashing/cookie attributes, private normalized uploads, idempotency, revision-checked status/review decisions, duplicate links and audit events. MongoDB string IDs, BSON formats and indexes remain compatible; no schema/data migration or persistent-database writes were performed.
- Cached the in-flight MongoDB runtime promise across development reloads, closing failed connections and allowing retries. Production HTTPS-origin validation runs at runtime initialization so builds do not need a live database or production credentials. API success/error/HEAD responses remain private and uncached.
- Added bounded JSON/multipart parsing, safe query/cookie parsing, trusted-proxy address validation and IPv6 /56 grouping. Anonymous traffic conservatively shares a bucket without configured trusted ingress; authenticated limits use verified accounts. Limits remain in-process, so multi-instance deployment still needs shared enforcement.
- Moved indexing to a separate persistent worker. Development supervises web and worker together; production uses `npm start` and `npm run worker:start` separately. Worker shutdown clears future ticks and drains active work before closing MongoDB; its lifecycle regression passes.
- Kept the existing UI, replacing routing with native Next links/navigation and loading Leaflet only in the browser. Added dynamic nonce-compatible layouts and page security headers. Staff decisions retain the decision note across successful updates, refresh approved fields and synchronize the next displayed/submitted status. Browser checks verified consecutive status saves.
- Removed application Express/Vite/router dependencies and obsolete entry/config files; updated lockfile, Node 24 CI, Docker configuration, environment comments, README and repository guidance. Next uses explicit Webpack mode with `.js` → TypeScript extension aliases, preserving server-side Node import conventions. Generated `.next/`, `next-env.d.ts` and incremental type state are ignored; typecheck generates Next route types for a fresh checkout. Next dev also generated its marked agent-guidance block in AGENTS.md.
- Node 24.20.0 verification: type generation and TypeScript pass; 37 unit tests and 19 integration tests pass (56 total); final production build passes. Real MongoDB/socket checks and Next build required approved execution outside the restricted sandbox. Native-handler regressions include body limits, multipart ambiguity, cookie/query parsing, HEAD/cache behavior, proxy identities, throttling before database lookup, logout revocation and worker drain. `git diff --check` passes.
- Added `npm run test:next` and included it in CI after the build. Against the final built Next server and a fresh disposable MongoDB, it passes direct/deep page routes, static JS/CSS/branding assets, matching bootstrap/CSP nonces, bare API/HEAD behavior, authentication/CSRF, manual fallback, duplicate comparison, idempotency, staff authorization, timeline updates, following, JPEG-normalized private uploads and logout. Synthetic provider-disabled fixtures only; child server and database shut down after each successful smoke.
- `npm run eval` passed without live embeddings; retained the committed benchmark artifact instead of replacing it with incidental timing changes. Fresh approved `npm audit --json` reports zero known vulnerabilities. No paid provider calls, Atlas resources, publication or Git push occurred.
- Real Chromium 155 browser scenarios through REA passed: desktop login → native report route → manual draft → comparison → submit → detail/follow; keyboard map pan, pin selection and clearing; 390px mobile My reports → Following navigation; staff queue/detail → review → under review → assigned using the retained note/default selection → logout → protected reload remains signed out. No unhandled page errors were captured; expected unauthenticated `/api/auth/me` 401 console messages remain. Screenshots were visually inspected at 1280×900 and 390×844. Local ignored evidence: `.cache/verification/next-browser-evidence.json`, `next-resident.png`, `next-mobile.png`.
- REA Evidence IDs: resident `ev_64ecd1f424fb1f594a27b7774b15d6685a46ca9c03969b245d609b03f66a9def`; mobile `ev_25c45d254035bb1f824336c4b3febd7d4726be613cc253d0e63a20ea6f803c74`; staff `ev_2f971788ccc9dd047c835807e2094166b65860ae2999ee666daa415e58def23a`. Passing captures report owned-browser cleanup. An initial staff selector capture was cancelled and its exact temporary browser stopped; a queued transport timeout is excluded from success evidence. The subsequent bounded fresh staff scenario completed. The browser fixture used its own temporary MongoDB, not `.data/mongo`; stopping its process group caused a temporary Mongo cleanup assertion, so temporary-directory removal is not claimed.
- Remaining limits: Docker execution could not run because no Docker daemon/socket is available. Comprehensive 200% zoom, full keyboard traversal and browser photo/failure-path checks remain outside the completed scenarios; live AI and Atlas still require separate authorized verification. Production deployment and existing-data restart compatibility were not exercised against the persistent local database.


## Pre-commit review and recheck — 2026-10-20

- User requested another full check and a commit to the existing GitHub repository. Confirmed `origin` is `https://github.com/hakeemkhan-ai/civic-desk.git`, branch `main`, and fetched remote history without divergence. Repository identity uses the existing GitHub noreply address.
- Three independent read-only reviews covered the API/runtime, App Router/UI, and infrastructure. Fixed the concrete findings before committing: share only the MongoDB connection across hot reloads so route handlers refresh; preserve staff draft fields when Follow/Unfollow changes only the following flag; load `.env` before production port selection; and document disabling the inherited web HTTP health check for a worker container.
- Added four meaningful runtime regressions: concurrent initialization plus fresh API handlers after module reload on the same pool; connection failure cleanup/retry; index initialization failure cleanup/retry; and API initialization retry without discarding a healthy pool. The production launcher uses Next's package-declared CLI, enforces production mode, forwards signals and preserves exit status. Docker starts the launcher directly.
- Clean `npm ci --no-audit --no-fund` passed on Node 24.20.0 after approved escalation for esbuild's binary check. The full `npm run check` passed: generated types, TypeScript, all 60 tests (41 unit / 19 MongoDB/socket integration) and production build. Fresh advisory lookup reports zero known vulnerabilities; offline evaluation passed without provider calls, with incidental benchmark timing changes excluded from the commit.
- Updated actual-production smoke passed through the real launcher using a disposable environment file that supplied `PORT` and `NODE_ENV=development`, with inherited PORT/NODE_ENV removed. This verifies `.env` port selection and that production cookie/CSP enforcement wins over a development file. Existing page/asset/API workflows passed, and stopping the launcher also closed the child HTTP server.
- A fresh controlled browser regression passed editing approved title, description, category and department → Follow → Unfollow → save review → logout. Captures show every edited field retained before saving, the new title persisted after the decision, and no unhandled page errors. REA Evidence `ev_5495bc02ee26a6befcad8fa534c02d7fd6125d448d9e67895842bb9fd24ab576`; local ignored summary `.cache/verification/next-review-regression.json`. This fixture shut down cleanly via its parent process; its synthetic MongoDB and test browser were stopped.
- Pre-staging scan found no credential patterns, actual local secret values or local-only artifacts among candidate files. Manifest dependencies/engines match the lockfile and registry packages have integrity hashes. `.env`, data, caches, generated Next files and local docs remain excluded. Original ROADMAP.md and persistent data are unchanged. Docker execution and live-provider/Atlas limits above still apply.

## Free deployment preparation (2026-10-20)

- The migration commit `2acc56d` is on GitHub `main`; its hosted `Verify Civic Desk` workflow completed successfully: https://github.com/hakeemkhan-ai/civic-desk/actions/runs/39386043473.
- User selected a free public demo with AI enabled later. Added `render.yaml` for one Free Node 24.20.0 web service in Singapore, with deployment after CI checks pass, `/api/health`, private Atlas URI input and a self-reference to Render's assigned HTTPS origin. The configuration includes no worker, paid database, disk or provider key.
- Added public README instructions for Atlas Free setup, a database-scoped user, Render outbound CIDR allowlisting, one-time guarded local seeding via a gitignored environment file, hosted acceptance checks and free-tier limits. Local data remains untouched; shared anonymous rate limiting stays conservative until the live proxy chain is verified.
- Verification: parsed the Blueprint and validated it against Render's official JSON Schema fetched from `https://render.com/schema/render.yaml.json`; checked the single free service, secret input, matching origin reference, Node version, CI trigger and disabled AI settings. `git diff --check` passed. No application source changed, so the already-passing application suite was not repeated.
- Hosting accounts still need to be created and connected. No Render service or Atlas cluster has been provisioned; no hosted/browser acceptance checks, paid provider calls or database transfers occurred.

## Free public demo deployed (2026-10-20)

- With explicit authorization for `main`, free resources only and AI disabled, deployed https://civic-desk-demo.onrender.com in the user-confirmed Render workspace. Render service `srv-dbbi4b6q1p3s73cmt7r0` uses the Free Node web plan in Singapore; the source application commit is `1b0dd53d25470b377f8657198e96706d1d4a60af`. Initial deploy `dep-dbbi4buq1p3s73cmta50` and persistence-check deploy `dep-dbbi89navr4c73dvh4i0` both reached `live`.
- Created a dedicated Civic Desk Demo Atlas project and one Free cluster in AWS Singapore (`AP_SOUTHEAST_1`), running MongoDB 8.0.34. The web database user has `readWrite` only on `civic_desk_demo`, scoped to this cluster. Its generated credential was transferred privately to Render and not saved locally or committed. Atlas network access is restricted to the two Render outbound CIDRs supplied by the user.
- Direct MCP creation manages the current service settings; the committed Blueprint remains a reusable, unlinked template. The service starts with `APP_ORIGIN="${APP_ORIGIN:-$RENDER_EXTERNAL_URL}" npm start`, Node 24.20.0, production cookies/CSP and the platform port. The user set `/api/health` in Render, and the resulting setting was verified through the connector. Automatic deploys are off; connect the Git provider and select After CI Checks Pass, or manually deploy after CI, for future code updates.
- AI is disabled (`OPENAI_API_KEY` empty, `draftingAvailable: false`), retrieval is exact/keyword fallback and no worker, paid database, disk or add-on was created. No provider calls were made. Render startup/build completed successfully; recent error-level logs were empty.
- Used the repository's existing seed logic with an in-memory database capture and fresh, distinct random resident/staff passwords, then inserted only the generated synthetic records through the Atlas connector. No local records were uploaded or changed. The private hosted login details are in gitignored `.env.hosted-demo` with mode `0600`; the local demo password was not reused. There are two demo accounts, nine seeded examples and one labeled synthetic deployment-verification report. The temporary additional resident used to test registration and photo isolation was removed after logout.
- Hosted HTTP checks passed: MongoDB-backed health, pages/deep links, JavaScript/CSS assets, matching production CSP script nonces, resident registration and resident/staff login, Secure/HttpOnly/SameSite sessions, CSRF enforcement, authenticated access, provider-unavailable/manual workflow, idempotent submission, keyword comparison, staff-only status changes, timeline history, stale-version rejection, following, JPEG normalization, private owner/staff photo access, denial to another resident and anonymous access, and logout. Confirmed expected MongoDB email, session-expiry, submission, status, worker and text indexes.
- After the second deploy reached `live`, logged in again and confirmed all ten reports, the verification report's staff status/timeline, following relationship, private JPEG photo and demo accounts survived; logged out again. Private evidence is in ignored `.cache/verification/hosted-evidence.json`. Hosted visual/mobile/map interaction checks could not run because no CUA browser is connected; previous local browser evidence does not establish hosted UI correctness. Docker, live AI and Atlas Vector Search limitations remain.
