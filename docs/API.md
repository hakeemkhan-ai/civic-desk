# REST API contract

JSON base path: `/api`. The React application and API share one origin. Error responses have an `error` message; validation errors also include `fields`; AI unavailability includes a bounded outcome `code`. Raw provider errors are not forwarded.

Every mutation requires `X-Civic-Request: 1`. If `Origin` is supplied, it must equal `APP_ORIGIN`. Authentication uses an HttpOnly session cookie set on registration/sign-in. CLI clients must retain the cookie. API clients cannot set or upgrade roles. Identifiers are UUIDs except internal seed keys.

## Authentication and metadata

- `GET /health`: database ping; public, no sensitive configuration.
- `GET /config`: demonstration city, category/status list, directory and drafting availability; public, no keys or internal model names.
- `POST /auth/register`: `{name,email,password}`; resident only. Password length 12–72. Unknown fields rejected.
- `POST /auth/login`: `{email,password}`.
- `POST /auth/logout`: invalidates the presented session and clears its cookie.
- `GET /auth/me`: current user ID, display name and role; authenticated.

## Reports and tracking

- `POST /complaints`: authenticated. Requires `Idempotency-Key` UUID. Body: `{original,content,draftId:null|uuid,photoId:null|uuid}`. Repeated identical submissions return the same record; changed content under the same key returns 409. Draft/photo references must belong to the current account. Referenced original notes must exactly match the saved draft input.
- `GET /complaints?scope=all|mine|following&category=roads&status=submitted&page=1`: authenticated projection; 20 per page, total count and current page returned. Omit category/status for all. Status values with spaces must be URL-encoded.
- `GET /complaints/:id`: authenticated; private original notes, AI suggestion and photo reference visible only to the owner or staff. Account contact details never appear. Staff actor IDs appear only to staff.
- `PUT /complaints/:id/follow`: idempotently follows a report for the current account.
- `DELETE /complaints/:id/follow`: idempotently unfollows.

`original`:

```json
{
  "notes": "A pothole outside the library entrance.",
  "location": {
    "label": "Afzal Gunj, State Central Library",
    "area": "central",
    "precision": "exact",
    "lat": 17.3713,
    "lng": 78.4803,
    "assetId": ""
  },
  "observedAt": null
}
```

Areas: north, central, south, unknown. Precision: exact, approximate, unknown. Coordinates must be both numbers or both null. They are resident-supplied and unverified. Observation time is an optional ISO datetime. Unknown location is permitted so manual intake remains usable; duplicate confidence is restricted accordingly.

`content`: `{title,description,category}`. Categories: roads, waste, water, streetlights, drainage. Content is the resident-approved draft, then the latest staff-approved content after review. The immutable original and AI suggestion remain separate; prior approved content appears in private review history.

## AI and retrieval

- `POST /drafts`: original report body; returns `{id,suggestion}`. Suggestion contains title, description, nullable categorySuggestion, extractedFacts `{fact,evidence}[]`, and missingInformation `{field,question}[]`. It never submits a complaint. 503 on unavailable/refused/incomplete/timeout/invalid/provider/budget outcomes; manual path remains independent.
- `POST /duplicates`: `{original,content,strategy?,excludeComplaintId?}`; optional strategy keyword, embedding, hybrid (default). Returns mode, explanation, candidates with supporting facts and non-probabilistic scores, and indexed/total/limited coverage. The optional UUID `excludeComplaintId` removes the complaint being reviewed before selecting the top five results. It does not merge or follow anything.
- `POST /feedback/duplicate`: `{candidateId,reason,complaintId?,query?}`; records rejected suggestions. Attaching feedback to an existing complaint requires ownership or staff. Pre-submission feedback is stored privately under the resident account. The UI supplies a query snapshot of approved content/location/observation time; staff-linked feedback derives it from the authorized complaint. The server also records the candidate snapshot and ranker version for later pair evaluation.

## Private images

- `POST /uploads`: one multipart `photo` field, JPEG/PNG/WebP, at most 5 MB. Decodes up to 20 million pixels, rotates, bounds to 1600×1600, and re-encodes JPEG without metadata. Returns `{id}`. Images are never analyzed by AI.
- `GET /uploads/:id`: author or staff only; private/no-store JPEG response. Random IDs do not replace authorization.

## Staff-only operations

- `PUT /complaints/:id/review`: `{content,department,note,version}`; confirms category, approved wording and a directory department; records category corrections, previous approved content, actor, and note. Text changes invalidate the embedding in the same atomic write.
- `POST /complaints/:id/status`: `{status,note,version}`; only defined transitions are accepted. Assignment requires confirmed review. Stale version returns 409. Status and event update atomically.
- `POST /complaints/:id/duplicate`: `{targetId,note,version}`; target must be an earlier existing report. Records a link without merging/deleting either report. Strict chronological/ID ordering prevents cycles under concurrent writes.
- `GET /staff/metrics`: aggregate status counts, indexing states, AI outcomes, mean latency and estimated cost. No resident text or contact information.

The server applies authorization before mutation. Request bodies, model outputs, retrieved text, and category suggestions cannot authorize an operation.

Location pins use the existing `location.lat`/`location.lng` fields; both must be present or both null. No map endpoint was added. Timeline `kind` also supports `migration`, with `actorRole: "system"`, for the local Hyderabad data migration.
