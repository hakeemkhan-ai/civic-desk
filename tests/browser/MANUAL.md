# Browser and container verification

Use Node 24, Docker Engine/Desktop with Compose v2, and Chromium:

```sh
npm ci
npx playwright install --with-deps chromium
npm run verify:browser-docker
```

The command builds the real production Dockerfile once. MongoDB 7.0.24, HTTPS
proxy, web and optional worker use a unique Compose project and disposable
volumes. Published ports bind to loopback. It never uses `compose.yaml`, `.env`,
the persistent `civic_mongo` volume, Atlas or an AI provider. It removes its own
containers, volumes and image on success, failure or ordinary interruption.
If forcibly killed, inspect the project name in
`.cache/browser-verification/docker.json` before removing only that project's
resources. Do not run global Docker prune commands.

The image checks cover default/overridden ports, runtime dependencies and static
assets, persistence through web recreation and Mongo restart, database outage
and recovery, web SIGTERM, and the same image running the direct-Node worker with
its HTTP health check disabled. The AI-disabled worker must leave pending jobs
unchanged. Active-operation draining is separately covered by the worker unit
test; these checks do not prove live AI processing.

The Chromium suite issues an email-bound invitation directly in its disposable
fixture, registers without a session, then signs in separately. It covers resident/staff workflows, private
attachments, retries/idempotency, duplicate comparison, errors, map mouse and
keyboard actions, session/logout/permissions/CSP, serious/critical axe findings,
and 1280×900, 390×844 and 320×844 layouts. Tiles are deterministic fixtures in
this suite, with separate genuine network failure cases. One worker, zero retries
and bounded timeouts make failures visible. Synthetic-only HTML/JSON reports,
screenshots and failure traces are under `.cache/browser-verification/`. CI keeps
them for seven days; they contain only disposable test accounts and data.

Without Docker, `npm run verify:browser` builds the production server and runs
the same browser suite with temporary MongoDB and a loopback HTTPS proxy. It
requires OpenSSL and may download MongoDB. This verifies browser behavior, not
container execution. Neither command silently skips missing prerequisites.

## Manual visual and keyboard review

On a workstation with a display, run either command with `-- --headed --debug`.
Use Playwright Inspector to pause/step through the synthetic browser scenarios.
For the hosted read-only scenarios, use the command below with the same flags.
Keep the Inspector paused while performing the checks; resuming/finishing the
tests closes the disposable browser context.

- At desktop and phone widths, inspect spacing, wrapping, image sizing, map
  controls, navigation and the staff panel. Check loading, empty and error states
  and every wizard step; automated screenshots alone do not establish visual quality.
- Check the invitation field and generic signup acknowledgement with keyboard
  navigation. Use only a disposable invitation: confirm signup does not sign in
  automatically and never capture or share a usable code in evidence.
- Use the browser's menu to set **actual browser zoom to 200%**, confirm the menu
  reads 200%, then inspect forms, details, staff decisions and navigation. Keep
  all controls readable/reachable without lost content. Reset to 100%. Changing
  viewport size, device scale factor or CSS zoom does not complete this check.
- Use only Tab, Shift+Tab, Enter, Space and arrow keys to sign in, reach the skip
  link, navigate, complete the manual wizard, choose map center, and sign out.
  Confirm visible focus, sensible order, no traps, meaningful names and readable
  status/error announcements. Check both forward and reverse traversal.
- Review success/failure screenshots alongside the live page. Record the app
  commit, browser version, viewport, actual zoom, scenarios, findings and reviewer
  in `PROGRESS.md`. Leave unperformed checks explicitly pending.

Chromium phone viewport emulation does not verify physical touch hardware,
mobile Safari, Firefox, or a full screen-reader assessment.

## Existing hosted demo: read-only

Use an explicitly selected private file (gitignored; permissions 0600) containing
`APP_ORIGIN` with the hosted HTTPS URL, `RESIDENT_EMAIL`, `RESIDENT_PASSWORD`,
`STAFF_EMAIL`, and `STAFF_PASSWORD` for **existing** accounts:

```sh
npm run test:ui:hosted -- --env-file .env.hosted-demo
```

The suite uses normal TLS validation and waits for free-host cold starts. It
checks navigation, existing reports/history and an existing private photo,
mobile layout, map-or-fallback and logout. An existing owned report/photo fixture
is required; absence is a failure, not permission to seed the hosted database.
Browser requests reject all writes except same-origin login/logout. Sessions are
created/revoked; reports, photos and staff decisions remain unchanged. No hosted
credentials go to CI. Screenshots, video, traces and persistent reports are
disabled; temporary failure context is deleted by the wrapper, including on
ordinary interruption. Do not add credential values to command arguments.
