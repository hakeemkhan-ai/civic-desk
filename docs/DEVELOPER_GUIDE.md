# A beginner's guide to Civic Desk

Civic Desk is a full-stack TypeScript application: a browser interface, an HTTP server, and a MongoDB database work together. It is an independent Hyderabad demonstration with synthetic reports, not a municipal service.

Start with the [local setup instructions](../README.md#local-setup). You can learn and run the core workflow with no OpenAI key. Choose **Write it myself** when drafting is unavailable.

## Understand the three parts

**The frontend** lives in `client/`. React turns application state into the pages you see. A component is a function describing part of that interface. `useState` stores values such as form inputs; `useEffect` connects a component to work such as fetching data. Editing an input changes browser state—it does not save a complaint until the form makes an API request.

**The backend** lives in `server/`. Express receives HTTP requests, checks permissions and input, and reads or writes the database. A route combines an HTTP method and path: for example, `POST /api/complaints` creates a report, while `GET /api/complaints` lists reports. The server must enforce permissions even when the UI hides a button.

**The database** stores documents in MongoDB collections. A document resembles a JavaScript object; a collection groups related documents. This project uses the native MongoDB driver, not Mongoose. `server/db.ts` defines stored types, collection access and indexes. Indexes help lookups and enforce rules such as preventing repeated submissions with the same key.

During development, Vite serves the frontend on port 5173 and forwards `/api` requests to Express on port 3001. MongoDB normally listens on loopback port 27017. `npm run dev` starts the frontend and API; it does not start MongoDB.

## Read the code in this order

1. [`shared/domain.ts`](../shared/domain.ts): categories, status transitions, department mappings, request schemas and response types. Both client and server use this contract. TypeScript checks code during development; Zod validates actual values at runtime, including untrusted HTTP input.
2. [`client/main.tsx`](../client/main.tsx): the main interface. Search for `App`, `Auth`, `ReportList`, `ReportForm`, `Detail` and `StaffReview`. These components cover navigation/session state, sign-in, browsing, reporting, tracking and staff decisions respectively.
3. [`client/api.ts`](../client/api.ts): the shared request helper. It adds `/api`, includes session cookies, supplies the request header, and converts unsuccessful responses into `ApiError` objects.
4. [`server/app.ts`](../server/app.ts): middleware and routes. Middleware runs around route handlers to apply shared checks. Look for the complaint creation route, then follow the functions it calls.
5. [`server/complaints.ts`](../server/complaints.ts): constructing a complaint, checking transitions, and returning a view that exposes only the fields the current user may see.
6. [`tests/api.test.ts`](../tests/api.test.ts): executable examples of expected behavior, including permissions, repeated submissions and coordinate persistence.

Other useful entry points:

- `client/styles.css` controls layout and appearance; `Charminar.tsx` contains the logo.
- `client/LocationMap.tsx` wraps Leaflet. Pins update coordinates; they do not verify a location or infer an address. OpenStreetMap supplies the map tiles.
- `server/index.ts` connects MongoDB, starts Express and starts the embedding worker.
- `server/config.ts` reads and validates server environment variables. Keep credentials in ignored `.env`, never in client code.
- `server/auth.ts` handles sessions and role checks; `server/uploads.ts` validates and re-encodes photos.
- `scripts/seed.ts` adds missing demo accounts and samples. It deliberately preserves existing records and passwords.

## Follow one report from click to storage

Open `ReportForm` and find its `submit` function. The request contains the original report, approved content, optional draft/photo references and an idempotency key.

1. The form calls the API helper with `POST /complaints`.
2. The browser sends `/api/complaints`; Vite forwards it to Express in development.
3. Server middleware authenticates the session. The route validates input and checks whether the submission key already exists for this resident.
4. The route verifies that referenced drafts and photos belong to the resident. `newComplaint` creates the stored document with `submitted` status and its first timeline event.
5. MongoDB saves the document. `view` creates the permitted response, and the frontend displays the saved report.

**Idempotency** means retrying the same submission does not create a second complaint. Reusing its key with different content produces a conflict. **Revision checks** prevent one staff member's stale screen from silently overwriting a newer decision.

Original input, AI suggestions and approved content are separate fields. Preserve that distinction: an AI suggestion is not a staff decision. Status changes append history instead of erasing earlier events.

## Where AI and duplicate matching fit

`server/ai/prompts.ts` defines the versioned drafting instructions. `provider.ts` adapts the OpenAI SDK, while `service.ts` manages application concerns such as budgets and outcomes. Without a provider, manual reporting remains available.

An **embedding** is a numeric representation of text used for similarity comparisons. `server/retrieval/service.ts` retrieves candidates; `rank.ts` combines similarity with incident facts such as location and time. Similar wording alone does not establish that two reports describe the same incident.

`server/retrieval/worker.ts` processes pending embeddings in the background. Its lease and content-hash checks prevent stale work from replacing a newer report's embedding. Staff confirms duplicate links; the model does not merge records.

`evaluation/` measures behavior on explicitly synthetic data. Unit tests can check a mocked provider's contract, but they cannot establish real model quality. `npm run eval` is offline; `npm run eval:live` makes paid calls and is not needed for local development.

## Make a small change safely

For a first exercise, change a form's helper text in `client/main.tsx`, run the app, and inspect the affected screen. Keep input labels clear and preserve keyboard access.

For a new saved field, follow its entire path: shared Zod schema/type → form state → API validation → stored document → permitted response → detail display. Decide how old documents without the field behave. Add a test for the user-visible behavior, including invalid input where relevant.

Use the existing checks:

```sh
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
```

`npm run check` combines type checking, all tests and the production build. Integration tests start a disposable real MongoDB process; they need permission to open local ports and may need an initial binary download. They do not use your seeded development database. A successful build does not prove map interaction, mobile layout or keyboard usability; use the [demo checklist](DEMO.md) for those checks.

## Common local problems

- **Database connection refused:** start one database option from the README before the API. Keep the user-space database terminal running.
- **`dev:db` crashes with a JSON parsing error:** check for an existing MongoDB process first. The launcher now checks port 27017 before starting and reports when it is occupied. It also disables automatic port switching. If you still see a JSON parser error, inspect the underlying MongoDB startup failure; this guard does not replace the dependency's log parser. Keep only one process using `.data/mongo`. Do not delete that directory to troubleshoot—it contains your data.
- **Writes are rejected after changing the browser address:** use `http://localhost:5173` as configured by `APP_ORIGIN`, or update that setting and restart the API.
- **A changed demo password does not work:** seeding preserves existing accounts. Changing `DEMO_PASSWORD` only affects accounts created later.
- **Map tiles do not load:** tiles need internet access. Manual landmark/coordinate entry still works.
- **An integration test fails with `listen EPERM`:** the environment denied socket binding. This differs from a failed application assertion; use an environment that permits local test servers.

Before sharing code, keep `.env`, `.data`, `.cache`, `node_modules` and build artifacts out of the repository. The [portfolio preparation checklist](PORTFOLIO.md) explains the remaining release work.
