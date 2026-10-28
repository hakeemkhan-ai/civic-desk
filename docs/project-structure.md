# Project Structure & Architecture Guide

Civic Desk is a civic complaint intake and review application built for Hyderabad (demonstration service). It is implemented as a full-stack Next.js application (App Router, React, TypeScript) backed by MongoDB and the OpenAI SDK, paired with a separate background embedding worker.

This document outlines the main directories and architectural components of the codebase.

---

## High-Level Architecture

- **Web Application & API Server**: Powered by Next.js App Router (`app/` and `app/api/[[...path]]/route.ts`). Next.js serves both the frontend pages and the same-origin REST/JSON API handlers (`server/app.ts` invoked via Next API routes).
- **Database**: MongoDB (supporting local Docker, `mongodb-memory-server` user-space launcher, or MongoDB Atlas), connected via native MongoDB driver (`server/db.ts`).
- **Background Worker**: A standalone Node.js process (`server/index.ts` initializing `server/retrieval/worker.ts`) that indexes complaints and generates vector embeddings for semantic duplicate detection.
- **Shared Domain**: Common TypeScript interfaces, validation schemas, and constants shared between client and server (`shared/domain.ts`).

---

## Directory Overview

```text
├── app/                  # Next.js App Router pages and API routes
├── client/               # Frontend React components, map integration, and API client
├── server/               # Backend logic, API handlers, authentication, and database services
├── shared/               # Shared TypeScript domain types and validation rules
├── evaluation/           # Offline evaluation datasets, metrics, and benchmark runners
├── tests/                # Unit, integration, security, and Playwright browser tests
├── scripts/              # Database seeding, migration, invitation, and verification scripts
├── public/               # Static assets (icons, SVGs)
└── docs/                 # Project documentation
```

### 1. `app/`
Contains the Next.js App Router pages and API route catch-all:
- **`layout.tsx`**: Root layout wrapping the application with styles, navigation, and providers.
- **`page.tsx`**: Landing page / dashboard for residents and staff.
- **`api/[[...path]]/route.ts`**: Unified catch-all API route routing requests to backend handlers (`server/app.ts` / `server/http.ts`).
- **`report/page.tsx`**: Resident complaint submission flow (notes, photo upload, location map, AI drafting, duplicate comparison).
- **`mine/page.tsx`**, **`following/page.tsx`**: Resident views for tracking submitted or followed complaints.
- **`complaints/[id]/page.tsx`**: Detailed view of an individual complaint, showing status timeline, updates, and staff notes.
- **`staff/page.tsx`**: Staff review dashboard for managing reports, updating statuses, assigning departments, and linking duplicates.
- **`not-found.tsx`**: Custom 404 error page.

### 2. `client/`
Client-side React components and utilities:
- **`CivicDesk.tsx`**: Main client layout / navigation shell.
- **`LocationMap.tsx`**: Interactive map integration for pinning incident locations in Hyderabad.
- **`Charminar.tsx`**: Branding mark / SVG icon component.
- **`api.ts`**: Frontend API client helper for communicating with `/api` routes.
- **`styles.css`**: Global CSS styles and custom properties.

### 3. `server/`
Backend services, database access, authentication, and business logic:
- **`index.ts`**: Background embedding worker process entrypoint (`server/index.ts`).
- **`app.ts` / `http.ts`**: Next.js API request routing, handlers, security headers, and HTTP utility functions.
- **`db.ts`**: MongoDB connection management and client initialization.
- **`auth.ts`**: Session handling, password hashing, and role-based access control (Resident vs. Staff).
- **`complaints.ts`**: Complaint management logic, state transitions, and database queries.
- **`storage.ts`**: Data access abstraction layer for MongoDB collections.
- **`invitations.ts`**: Resident invitation issuance and validation.
- **`privacy.ts` & `uploads.ts`**: Secure handling of private photo uploads and personal information redaction.
- **`limits.ts`**: Rate limiting and request size/validation limits.
- **`config.ts` & `runtime.ts`**: Environment configuration and runtime validation.
- **`ai/`**: OpenAI SDK integration, prompts (`prompts.ts`), AI provider configuration (`provider.ts`), and drafting service (`service.ts`).
- **`retrieval/`**: Vector search, ranking (`rank.ts`), semantic search service (`service.ts`), and background worker (`worker.ts`) for indexing reports.
- **`migrations/`**: Data migration scripts (e.g., `hyderabad.ts`).

### 4. `shared/`
- **`domain.ts`**: Single source of truth for domain types, complaint categories, status enums, user roles, and validation schemas used across both client and server code.

### 5. `evaluation/`
Offline evaluation framework:
- **`dataset.ts`**: Synthetic test cases and queries.
- **`metrics.ts`**: Evaluation metrics for duplicate retrieval and categorization.
- **`run.ts`**: Benchmark execution script.
- **`results/offline.json`**: Committed offline evaluation benchmarks.

### 6. `tests/`
Comprehensive test suites covering unit, integration, and end-to-end behavior:
- **`ai.test.ts`, `api.test.ts`, `domain.test.ts`, `http.test.ts`, `security.test.ts`, `uploads.test.ts`, `worker.test.ts`**: Vitest unit & integration tests.
- **`browser/`**: Playwright browser test suites (`hosted.spec.ts`, `isolated.spec.ts`, helper utilities, and configuration) for end-to-end UI verification.
- **`helpers/`**: Test helper utilities (e.g., lightweight HTTP test server).

### 7. `scripts/`
Operational and maintenance scripts:
- **`seed.ts`**: Handles initial database seeding of demo accounts and baseline complaint records.
- **`invite.ts`**: CLI tool for generating resident invitation codes.
- **`migrate-hyderabad.ts`**: Migrates existing demo data (e.g. from Brookfield demo records to Hyderabad landmarks).
- **`reindex.ts`**: Reindexes complaint documents for embedding retrieval.
- **`local-mongo.ts` & `local-port.ts`**: Local development database and port management utilities.
- **`smoke-next.ts` & `start-next.mjs`**: Production startup and smoke testing scripts.
- **`verify-browser.ts` & `verify-browser-docker.ts`**: Automated browser verification runners.

### 8. `public/`
- Static assets such as `charminar.svg` and other icons.

---

## Key Workflows

1. **Resident Reporting**: Residents sign in, describe a civic issue (notes, landmark, photo, map pin), optionally use AI assistance to clean up the draft, review potential duplicate incidents, and submit the report.
2. **Staff Review & Triage**: Staff sign in to view submitted complaints, confirm categorization and department routing, transition statuses through validated workflows, and link duplicate reports without data loss or deletion.
3. **Background Indexing**: The independent background worker (`server/index.ts` / `server/retrieval/worker.ts`) continuously processes unindexed complaints, generating vector embeddings to power semantic duplicate detection.
