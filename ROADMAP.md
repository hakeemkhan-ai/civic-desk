# Civic Desk — Applied AI Engineering Portfolio Roadmap

Position Civic Desk as a civic complaint intake and triage platform: residents report issues, AI helps structure and match them, and staff review and manage resolution. The portfolio should demonstrate the complete path from data and baselines to evaluation, deployment, and human feedback.

Planning assumption: one developer working approximately 10–15 hours per week for 8–10 weeks, already comfortable with the core web stack. Adjust the schedule for learning time. All metrics below are proposed evaluation measures, not achieved results.

## Scope and user journey

Start with one demonstration municipality and five categories: roads, waste, water, streetlights, and drainage. Use a documented demo department directory. Clearly distinguish simulated workflows from actual municipal integrations.

Resident enters rough notes and a location → AI creates an editable draft and asks for missing information → system suggests existing incidents → resident follows an existing incident or submits a new one → staff reviews routing and priority → resident tracks status and updates.

Build resident and staff roles. Store complaint updates as an audit timeline. Start with submitted, under review, assigned, in progress, resolved, and reopened states; validate transitions on the server. Preserve the original report separately from AI output and the final approved text.

## Recommended architecture

- React + TypeScript for resident forms, report pages, and staff review.
- Node.js + Express + TypeScript for authentication, authorization, complaint APIs, and AI orchestration.
- MongoDB for users, complaints, status events, duplicate links, department rules, AI runs, and feedback.
- MongoDB Atlas Vector Search for embedding retrieval once the baseline is working. Keep vector retrieval behind an interface so experiments remain replaceable.
- Object storage for uploaded images; store file references in MongoDB.
- An AI module with separate drafting, classification, duplicate retrieval, and optional grounded-answering functions. Keep prompts and schemas versioned.
- A background worker for embeddings and other asynchronous processing. Add a durable queue when retries and deployment require it; do not introduce multiple services on day one.
- A small evaluation harness in TypeScript or Python. Use Python where its data tools help; a separate Python API is optional.

Keep model credentials on the server. Record model/version, prompt version, latency, token usage, outcome, and estimated cost per AI operation without logging unnecessary personal information. Manual complaint submission must continue working when AI is unavailable.

Suggested API boundaries: create/list/read complaints, append authorized status events, generate a draft, retrieve duplicate candidates, confirm a duplicate link, record feedback, and read staff metrics. AI output must not grant permissions or bypass status-transition rules.

## Implementation sequence

### Week 1 — Product contract and evaluation data

Define categories, department mapping, status rules, and a minimum data model. Write a labeling guide defining what counts as the same incident. Assemble approximately 200–300 initial complaint examples with known provenance, anonymization where needed, and manual review. Synthetic examples are useful for edge cases but must be labeled as synthetic.

Create duplicate groups and difficult nonmatches: similar descriptions on different streets, two nearby but distinct incidents, recurring issues after resolution, vague locations, spelling errors, and mixed-language reports. Split data by incident group before generating paraphrases so related examples cannot leak across development and test sets.

Deliverable: a narrow product specification, seed data, labeling rules, and an initial held-out evaluation set.

### Weeks 2–3 — Working complaint platform

Implement sign-in, resident/staff permissions, complaint submission, location entry, optional photo upload, filtering, tracking, and staff updates. Enforce authorization on the backend. Use sample accounts and clear demo data. Deploy a first working version early.

Deliverable: a resident can submit and track a complaint, and staff can update it through the approved lifecycle. Test unauthorized access, invalid transitions, and upload limits.

### Week 4 — Structured drafting and category suggestions

Convert rough notes into title, description, category suggestion, extracted facts, and missing-information questions. Preserve uncertain or absent facts as unknown. Ask for location or duration rather than inventing them. Let residents edit and approve the draft.

Use schema-constrained model output and application validation. Structured Outputs supports schema adherence, but does not establish factual correctness; explicitly handle refusals, incomplete output, and request failures. See [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

Compare against a fixed complaint template and simple keyword classification. Evaluate fact preservation, unsupported additions, missing-field detection, per-category performance, latency, and cost. Choose an available model using this small benchmark rather than model reputation alone.

Deliverable: editable AI drafting, manual fallback, versioned prompts, and the first baseline comparison.

### Weeks 5–6 — Duplicate detection as the flagship feature

Separate semantic similarity from incident identity. Two broken streetlights can sound identical while being different incidents.

1. Normalize text and create an embedding.
2. Retrieve plausible candidates using semantic similarity with area, time, and status constraints. Handle uncertain categories conservatively so a classification error does not exclude the correct match.
3. Use a coarse area identifier for supported metadata filtering, then check actual geographic distance separately. Account for adjacent area boundaries. Do not assume arbitrary geospatial operators can be placed inside a vector prefilter.
4. Rerank using description similarity, distance, time, category compatibility, and resolution history. Start with interpretable rules; experiment with a model reranker only if evaluation justifies it.
5. Show the strongest candidates with supporting facts. Let residents follow an incident or proceed with a new report; let staff confirm links.

MongoDB documents metadata prefiltering for vector retrieval in its [vector search guide](https://www.mongodb.com/docs/vector-search/query/aggregation-stages/vector-search-stage/?deployment-type=atlas&embedding=byo&interface=driver&language=python). Validate the chosen deployment's supported filters during implementation.

Compare keyword matching, embeddings alone, and embeddings plus incident metadata. Measure candidate recall@5 separately from precision and recall of final duplicate suggestions. Tune thresholds on development data; freeze them before the held-out run. Report false matches and missed duplicates. A similarity score is not a calibrated probability.

Deliverable: a duplicate suggestion flow, evaluation results, and a written explanation of when the approach fails.

### Week 7 — Staff triage and corrections

Suggest category and department from a versioned municipality-specific directory. Use explicit rules and extracted evidence for priority; wording intensity alone should not determine urgency. Send ambiguous cases for staff review. Keep AI suggestions distinct from staff decisions and record corrections.

Deliverable: review queue, routing explanation, override controls, audit records, and feedback usable in future evaluation sets.

### Week 8 — Reliability and release evaluation

Add bounded retries, timeouts, idempotent submissions/jobs, server-side rate limits, upload validation, and an AI spending limit. Run fixed regression examples after prompt or model changes. Verify that edits and deletions are reflected in retrieval. Test malicious instructions embedded in complaint text and prevent them from becoming tool permissions.

Publish test-set size, dataset origin, baseline comparison, per-category breakdowns, duplicate failure examples, p50/p95 latency, and estimated cost per completed complaint. Label small or synthetic evaluations as preliminary. OpenAI recommends task-specific evaluation and ongoing expansion with observed failures: [evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices).

Deliverable: deployed core project, reproducible evaluation command, release checklist, and documented limitations.

### Weeks 9–10 — One extension and portfolio packaging

Choose one extension below. Then record a short demonstration, write the architecture and evaluation case study, and improve setup documentation. Prefer a finished, measured extension over several partial features.

## Applied AI extensions, in priority order

### 1. Grounded municipal guidance — recommended next extension

Answer questions about supported departments, required reporting details, and escalation procedures using a small curated document collection. Store source URL, jurisdiction, version/date, and section metadata; retrieve relevant passages and cite them. Separate example policies from real official material. Ask for clarification or abstain when evidence is insufficient.

Evaluate retrieval recall, citation support, answer correctness, and handling of unanswerable questions. This demonstrates retrieval-augmented generation, data ingestion, grounding, and abstention. Keep live complaint status in authorized database queries, not in document retrieval.

### 2. Multilingual or voice reporting

Support English and one locally relevant language first. Transcribe voice notes, preserve the original input, extract facts, and show a reviewable draft. Test code-switching, landmarks, names, numbers, and noisy audio. Measure fact preservation as well as transcription quality. This demonstrates language and speech pipeline evaluation.

### 3. Photo-assisted reporting

Use image understanding to suggest visible issue type and an editable description. Keep user-supplied location separate from image inference. Evaluate blurry images, irrelevant uploads, multiple issues, and disagreement between the image and text. Do not present apparent severity or repair completion as verified from a photo alone. This demonstrates multimodal extraction and uncertainty handling.

### 4. Bounded staff assistant

Let staff ask for overdue cases or request a suggested response. Define narrow tools for authorized lookup, timeline retrieval, and drafting. Require staff confirmation for actions such as assignment, linking, or closure. Evaluate tool selection, parameter correctness, permissions, and failed-tool recovery. Add this once the underlying APIs are reliable.

### 5. Feedback-driven model improvement

Collect category corrections, rejected duplicate suggestions, and edited drafts. Curate the errors into versioned datasets, compare new prompts or rerankers, and require evaluation before rollout. With enough representative labeled examples, experiment with a small trained classifier or fine-tuning and compare quality, latency, and cost against the existing baseline.

Defer resolution-time prediction until meaningful historical outcomes exist. Defer broad autonomous workflows and citywide prediction until there is a measurable product need and suitable data.

## What makes the portfolio credible

- A public demo with safe sample data and separate resident/staff walkthroughs.
- A README covering the problem, architecture, setup, data provenance, and limitations.
- A reproducible evaluation suite with fixed datasets and clear split rules.
- Baseline comparisons and failure analysis, including the cost of falsely linking distinct incidents.
- An architecture diagram showing the web app, API, AI modules, database, retrieval, and worker.
- Visible operational behavior: processing states, retries, manual fallback, review, and trace records.
- A three-minute demo: rough report → approved draft → duplicate suggestions → staff correction → tracking → evaluation results.

For resume bullets, describe only implemented behavior and measured outcomes. Replace placeholders with real evaluation results after the project is built; distinguish benchmark improvements from demonstrated impact on real users.

## First implementation milestone

Build one vertical slice: create a complaint, save it, display its detail page, and append an authorized staff status update. Add AI drafting to that working flow next. Keep duplicate detection as the main technical deep dive, and add grounded guidance after the evaluated core is stable.
