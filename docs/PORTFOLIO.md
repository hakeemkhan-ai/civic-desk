# Preparing Civic Desk for a GitHub portfolio

The owner authorized a public GitHub portfolio repository on 2026-10-19. Repository publication does not deploy a live service or provision paid resources.

## What a reviewer can explore

- Start with the README for the product, setup and architecture.
- Use the [beginner developer guide](DEVELOPER_GUIDE.md) to trace a report from React through Express to MongoDB.
- Read the [case study](CASE_STUDY.md) for duplicate detection tradeoffs and measured lexical baseline failures.
- Follow the [demo script](DEMO.md) with synthetic data to explore resident and staff workflows.
- Inspect the tests and the committed offline evaluation output. Separate implemented integrations from measured live results.

Suggested repository description: **Hyderabad civic reporting demo with React, TypeScript, Express and MongoDB; optional AI drafting, incident comparison and staff audit history.**

A defensible portfolio summary: **Built a full-stack civic reporting demo with server-enforced permissions, idempotent submissions, map pinning, private photos and auditable staff decisions. Implemented optional structured AI drafting and incident-aware duplicate ranking, with a reproducible synthetic evaluation harness and explicit manual fallback.**

Do not claim real municipal adoption, improved model accuracy, a deployed service or a clean security audit without supporting evidence.

## Local readiness checklist

- [x] Beginner guide, architecture, API documentation, case study and demo checklist are present.
- [x] Type checking, 29 unit tests and production build rerun successfully on 2026-10-19 with Node 26.8.1.
- [x] All 18 integration tests passed outside the socket-restricted sandbox on 2026-10-19: 16 MongoDB HTTP tests and two database-launch port regression tests.
- [x] Updated sharp, Vitest and concurrently to patched versions; npm audit reports zero known vulnerabilities on 2026-10-19.
- [ ] Verify the documented Node 24 runtime and CI workflow after repository setup.
- [ ] Complete browser checks, including map pinning, keyboard use and mobile layout; capture actual screenshots using synthetic data.
- [ ] Verify Docker if presenting it as a tested setup option.

Live OpenAI and Atlas checks remain optional, unverified integrations. They require separate authorization for paid calls/resources. The core demo must continue working without them.

## Before the first GitHub upload

The approved destination is `hakeemkhan-ai/civic-desk`, public. Git metadata has been initialized. Use a GitHub noreply identity for commits to avoid exposing a personal email.

Review the exact files to be uploaded. Include source, tests, public assets, documentation, lockfile, `.env.example` and the CI workflow. Exclude `.env`, database files/backups, cached requests or sessions, credentials, generated builds and dependencies. Existing ignore rules cover those local paths, but inspect the staged diff before committing. Avoid uploading the whole workspace through an unfiltered archive.

Choose a license explicitly before describing the code as open source. Once publication is authorized and Git access works, commit the reviewed files, push to the selected repository, verify its contents and Actions results, and then add the repository to the owner's portfolio. A live hosted demo is a separate decision.
