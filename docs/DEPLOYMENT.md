# Deployment and Atlas setup

No resources have been created and nothing has been publicly published. The following is configuration for a future approved deployment. Local backend/MongoDB checks now pass. The container build and browser journey remain unverified.

## Prepare a verified artifact first

On a host with network and local process access:

```sh
npm ci
npm run check
npm run eval
```

`package-lock.json` now records registry artifacts and integrity hashes. CI and both Docker stages use `npm ci`; keep the manifest and lockfile together. Review outstanding dependency audit findings before a release. Local build success does not establish that the Docker image or hosted deployment works.

Run the browser checklist in `docs/DEMO.md`, including a database/API restart to verify persistence. Run live development evaluations with a dedicated provider project before enabling semantic suggestions in a public demo. Configure prices and thresholds from that development run; preserve the test holdout.

## Single-container application

The Dockerfile compiles the Express service and React client, then serves both from port 3001 under an unprivileged Node user. The database is external. Uploaded images persist in MongoDB, so the application container needs no writable image volume. The included Compose file is a **local development database only**, not a production deployment configuration.

```sh
docker build -t civic-desk:1.0.0 .
```

Use the hosting platform's secret manager for `MONGODB_URI` and `OPENAI_API_KEY`. Set:

```dotenv
NODE_ENV=production
PORT=3001
APP_ORIGIN=https://your-approved-host.example
MONGODB_URI=mongodb+srv://<app-user>:<password>@<cluster>/civic_desk?retryWrites=true&w=majority
DEMO_ACCOUNTS=false
RETRIEVAL_MODE=atlas
ATLAS_VECTOR_INDEX=complaints_vector_v1
DRAFT_MODEL=gpt-4.1-mini-2025-04-14
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
AI_DAILY_BUDGET_USD=2
```

Use TLS termination at the hosting ingress. Preserve the original host/origin and route the app at `/`. The health endpoint `GET /api/health` pings MongoDB. Runtime startup verifies connectivity and creates normal database indexes. Restrict database ingress to the application, use TLS and a least-privilege database user, and do not expose a local unauthenticated MongoDB port publicly. Deploy one application replica initially because rate limits are process-local; the MongoDB worker leases and budget reservations are cross-process safe.

If behind an ingress, set `TRUST_PROXY_HOPS` to the exact number of trusted proxies and ensure the ingress overwrites forwarding headers; default `0` trusts none. Do not use a broad unconditional trust setting. Application limits use the resulting client address, with additional authenticated-account limits on AI and uploads.

There is no production role-promotion HTTP endpoint. For a portfolio-only database, create approved demonstration accounts using the gated seed command in a private local setup pointing at that database **before** deploying production mode. Keep passwords in a secret manager and do not publish staff credentials alongside a public app with a paid AI key. For real use, add an audited administrator provisioning process, password reset/email verification, and abuse/retention controls before onboarding users.

## Atlas Vector Search

Create your Atlas cluster/project only after the resource and any cost are approved. This repo does not provision it. Use a deployment that supports `$vectorSearch`. No vector capabilities are assumed on ordinary local MongoDB.

1. Set `MONGODB_URI` to the target database and seed synthetic data if desired.
2. Enable `OPENAI_API_KEY` and run the API. Its worker will fill `embedding.vector` with actual provider vectors.
3. In Atlas, create a **Vector Search** index on `civic_desk.complaints`, named `complaints_vector_v1`. Use the `definition` from [`atlas-vector-index.json`](atlas-vector-index.json). That file also contains the name/type wrapper for a driver `createSearchIndex` call. The UI expects only the definition object.
4. Wait until the index is queryable. Confirm `numDimensions` matches `EMBEDDING_DIMENSIONS` (default 1536).
5. Set `RETRIEVAL_MODE=atlas`, restart, and check `/api/duplicates` with an authenticated account. A successful response has `mode: "semantic-atlas"`; a keyword response is an explicit fallback, **not evidence that Atlas works**.
6. Confirm candidate coverage and staff indexing aggregates. Test content edits: the record must be excluded until its new embedding is ready. The adapter refetches candidates from MongoDB and rechecks hash/model/version after Atlas retrieval to prevent stale indexed content from being presented.

The query uses `$vectorSearch` as the first stage, `path: "embedding.vector"`, 40 candidates returned, and `numCandidates: 400`. Prefilters include only indexed scalar metadata: municipality, embedding model/version/dimensions, and ready state. It never puts unsupported geospatial operators in the vector prefilter. Searching the whole demonstration municipality preserves neighboring-area candidates; precise distance checks happen in the ranker.

Changing embedding dimensions requires a matching new or rebuilt Atlas index plus reindexing records. Prefer a versioned index name and switch only after the new index is ready. Run `npm run embeddings:retry` to queue incompatible/failed embeddings. With current-version pending records after an interruption, simply restart the worker; leases expire and stale writes are rejected. Three failed attempts require an explicit requeue. Conservative budget reservations remain charged after failed operations until the UTC day changes.

## Operational checks

- `GET /api/health` succeeds and public static assets load under the same origin.
- Registering with `role: "staff"` is rejected; an ordinary resident gets 403 on staff routes.
- Two concurrent complaint requests with one idempotency key yield one stored complaint.
- A status update and its timeline event are present after an API/database restart.
- No key, expired key, provider timeout, or exhausted budget leaves manual submission available.
- Malformed and oversized uploads fail; a resident cannot access another resident's private photo.
- Following an incident is idempotent; staff linking leaves both complaints intact.
- Hybrid candidates at distant/uncertain locations remain unconfirmed even for highly similar text.
- Secret values and report contents do not appear in application logs or AI telemetry.

Before real deployment, add shared rate limiting if scaling, alerting, MongoDB backups/restore tests, encrypted storage controls, an explicit deletion/retention policy, object storage at media scale, and human-reviewed evaluation data. Keep the demonstration warning visible. Do not present the portfolio interface as an emergency reporting system.
