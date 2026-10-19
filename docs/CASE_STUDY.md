# Civic Desk: separating similar language from the same incident

Civic reports arrive as rough observations. Making those observations readable is useful; directing a resident toward the wrong incident is harmful. Civic Desk explores this distinction through a complete resident/staff workflow for an independent Hyderabad demonstration.

## What was built

The implementation includes authenticated resident reporting, editable structured AI drafts with manual fallback, private optional images, duplicate comparison, following, staff review/routing, constrained status transitions, and chronological audit history. MongoDB is the persistence layer; the model cannot create accounts, assign roles, change statuses, or merge complaints. Original input, AI suggestions, and approved text remain separate.

This implementation is **not yet an end-to-end verified deployment**. The 2026-10-16 verification ledger records 45 passing tests, including 16 real MongoDB HTTP tests, plus local persistence checks. On 2026-10-19, full type checking, the production build and all 47 tests passed: 29 unit tests, 16 MongoDB HTTP tests and two database-launch port checks. Integration tests required execution outside the socket-restricted sandbox. Browser, Docker, live OpenAI and Atlas checks remain unverified. See [verification evidence](verification.json) for the distinction between historical and current results.

## The main technical question

“How alike are these descriptions?” and “Are these the same unresolved physical problem?” are different questions. A dark lamp on Oak Avenue may sound exactly like a dark lamp on Willow Street. A drain that floods again after repair may be a new incident at the same location. A report near an area boundary must not disappear because the other report has a different neighborhood label.

I implemented three comparison paths: keyword overlap, real embedding similarity, and real embeddings reranked using explicit incident signals. Location confidence, coordinates, asset IDs, observation time, category compatibility, and status history control whether a candidate becomes a suggestion. Uncertain locations remain comparison candidates with an explanation. Users retain the option to submit a new report. Staff links records explicitly; nothing automatically merges or disappears.

The local semantic adapter performs exact cosine on actual provider embeddings; Atlas uses `$vectorSearch` with metadata prefilters, then refetches and reranks current documents. Model/version/dimensions and a content hash protect retrieval from stale edits. A leased worker uses compare-and-set writes so an older in-flight embedding cannot overwrite edited content.

## What the measurements actually show

The deterministic synthetic benchmark has 30 incident groups, split before related variants are generated: 20 development groups (160 queries) and 10 test groups (80 queries). Each split has its own related corpus. Thresholds are selected on development only; the raw keyword threshold froze at 0.35.

The held-out **raw keyword baseline** measured:

- Candidate recall@5: **46%**, across 50 queries with known duplicates.
- Suggestion precision: **15.5%** (18 true links, 98 false links).
- Suggestion recall: **36%** (18 found, 32 missed).
- Ranking latency: approximately **0.10 ms p50 / 0.11 ms p95** in the recorded local run. This excludes database, network, and provider time.

These are synthetic stress-test results, not performance claims on municipal data. The raw keyword baseline lacks the application's conservative identity gates by design. It demonstrates how similar phrases can produce false matches even when the wording looks persuasive.

A fixed copy-template baseline preserved **100% of literal source anchors** and triggered zero unsupported-number/evidence flags. That is expected for copying and does not demonstrate useful AI drafting or absence of other hallucinations. Missing-information recall was **75%**. Template construction took roughly **0.001 ms p50 / 0.007 ms p95**, with **$0 provider cost**. Live drafting quality, latency, and cost remain unverified.

Keyword category performance was also limited. Roads had 33.3% precision and 87.5% recall; each other category had 100% precision and 43.8% recall on 16 examples per category. Street-name wording such as “Road” can mislead the deliberately simple classifier, while vague text lacks enough evidence. No improvement from the AI classifier is claimed without live evaluation.

The exact machine-readable results, denominators, hashes, and failure rows are in [`evaluation/results/offline.json`](../evaluation/results/offline.json). **Embedding-only and hybrid results have not been measured.** Real integrations and a live comparison command are implemented; replacing those missing results with invented vectors would undermine the project's purpose. Human review is pending, and no model-based grader was used.

## Tradeoffs and failure cases

- Conservative location gates protect against false links but miss real duplicates with vague reports. Asking for a landmark is often better than raising a score.
- Different asset IDs suppress nearby false matches. Without IDs, two distinct problems within 40 meters can still be confused; the UI exposes comparison facts and asks for a human decision.
- Resolution history prevents a later recurrence from inheriting an old incident's identity. Incorrect staff closure or missing observation times can still cause errors.
- Water and drainage are compatible categories; other confident category mismatches block suggestions. A category error can therefore reduce recall, which is why category correction is stored for evaluation.
- Municipality-wide retrieval avoids hard neighborhood boundaries. Exact local retrieval is capped at 2,000 newest records and is explicitly labeled when limited. Atlas ANN recall and index propagation need separate measurement.
- The small benchmark reuses templates across incident splits. It controls incident leakage but does not establish broad language generalization. Independent examples and human adjudication are the next data investment.
- Images are private MongoDB binaries for a simple first deployment. Object storage is the better scaling boundary. A single instance and conservative internal cost reservations prioritize understandable operational behavior over throughput.

## Next evidence to collect

First complete browser lifecycle checks and refresh the dependency audit on a host that permits them. Then run live development comparisons, freeze chosen models/rules/thresholds, and score a fresh holdout. Review unsupported qualitative additions and false duplicate links with two humans. Add adjudicated production-like failures as new incident groups before future tuning.

A portfolio claim supported today is: “Implemented a civic intake/review platform with versioned structured drafting, real embedding/Atlas adapters, interpretable incident ranking, and a reproducible synthetic evaluation harness; measured lexical baseline failure modes and tested deterministic safety contracts.” A claim of improved city outcomes, superior semantic accuracy, or a production-ready deployment is not yet supported.
