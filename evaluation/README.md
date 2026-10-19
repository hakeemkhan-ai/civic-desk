# Evaluation protocol v1

All fixtures are synthetic, generated from deterministic TypeScript templates. No resident data, scraped reports, or real municipality operations are used. **Human review: pending. Model-based grading: not used.** These results are preliminary regression evidence, not evidence of real-world civic service impact.

## Reproduce

```sh
npm run eval
npm run eval:live
```

The first command makes no provider calls. It measures a fixed copy-template drafting baseline, keyword category baseline, and raw keyword duplicate baseline. The live command requires a real OpenAI key and incurs usage charges. It adds actual embeddings, metadata reranking, and actual structured drafts. With no key it exits nonzero and states unverified; it does not silently fall back to mocks. SDK timeouts and bounded retries apply. The CLI is a separate evaluation workload and **does not use the API's MongoDB daily budget**; set a provider project spending limit before live runs.

Results go to `results/offline.json` or `results/live.json`. Real embedding responses are cached under ignored `evaluation/cache/`, keyed by model, dimensions, input, and preprocessing version. Cache provenance is recorded and no synthetic vectors are generated. Remove only that disposable cache if you deliberately want to pay for fresh embeddings. A cached run cannot estimate fresh-request latency or total cold-run cost. Drafts are always requested live in the live mode. Copy the result file to a versioned artifact before rerunning if you need historical comparisons.

The dataset, versions, and result shapes are deterministic; latency, generation timestamps, and live model output are not. Results include a dataset SHA-256, model configuration, prompt/schema/ranker versions, per-query rows, and failure examples. These are enough to identify which experiment ran, but provider nondeterminism remains. A full package lock still needs to be generated on a network-enabled host because this environment could not resolve all dependencies.

## Data and split

`dataset.ts` declares 30 base incident groups. Group assignment (`index % 3`) is fixed **before** creating variants: 20 development groups and 10 test groups. Related paraphrases, neighboring distractors, and resolution-history records stay with their group. Never randomly split expanded reports.

Each group produces four corpus entries and eight query variants, yielding 120 corpus entries and 240 queries: 160 development and 80 held-out test. The scenarios are paraphrase, vague report, missing location, similar text on a different street, nearby distinct asset, recurring report, neighboring-area boundary, and missing observation time. Each split retrieves only against its own corpus. The evaluator labels incident identity from the known synthetic construction, including cases whose visible text is insufficient to establish identity. Abstention can therefore reduce measured recall even when it is a prudent product decision.

No test examples enter the application seed. Seed data is a separate set of nine visibly labeled demonstration reports. The split is by incident, not linguistic template; template families recur across splits. This is a small synthetic stress test, **not an independent linguistic-generalization benchmark**. Before strong portfolio claims, add independently authored and human-labeled examples, typos, mixed language, conflicting observations, and a larger unseen corpus.

## Duplicate labels and metrics

Label reports as the same incident only when they concern the same physical asset or localized event during an overlapping unresolved episode. Similar descriptions are insufficient. Different streets or different asset IDs are negatives even when text is identical. A renewed event after closure is a new occurrence. A retrospective observation before closure can be a duplicate. Uncertain locations should generally trigger clarification; dataset ground truth may know more than the resident supplied.

For each strategy, sweep thresholds 0.05–0.95 on **development** data, maximize F1, and use the higher threshold as the tie breaker. Freeze that value before scoring test data. The JSON stores the selected threshold. No thresholds are selected from held-out outcomes. Hybrid weights and gates are fixed at `incident-rules-v2`; semantic thresholds in application configuration remain provisional until a live development run is available. Use a fresh holdout for any future rule changes informed by existing test errors.

Measure candidate recall@5 only on queries with at least one known duplicate. Report micro precision and recall of all suggested candidate links across positive and negative queries, along with TP/FP/FN and denominators. If no suggestions exist, precision is null rather than an invented perfect score. Candidate rows with zero lexical overlap are removed, matching the application fallback. Embedding runs use exact cosine against real provider vectors; the Atlas approximate retrieval path is a separate integration test, not measured by this harness.

The raw keyword and embedding baselines deliberately do not use metadata gates, to isolate the value of incident identity features. The **application's** keyword fallback additionally applies conservative identity gates. Its behavior is therefore not identical to the raw keyword benchmark. The hybrid uses the same exported rank function as the application. Live embeddings use the application’s text preparation (title plus description, whitespace normalization and contact redaction); fixture titles are deterministic excerpts. All three strategies retrieve and score up to five candidates; the harness uses the complete small split corpus, while hosted Atlas retrieves 40 candidates before reranking. Document that difference when publishing results.

## Drafting and category measurements

Deterministic checks measure preservation of source fact anchors, unsupported numeric additions, whether extracted evidence appears verbatim in the source, and recall of labeled missing-information fields. These checks are proxies. A copied template trivially preserves input but does not improve writing. A legitimate paraphrase may miss a literal anchor, and an invented qualitative claim may evade all checks. Zero flagged numeric additions does **not** establish zero hallucinations.

The report includes per-category keyword precision/recall, per-category live draft accuracy when available, per-draft latency p50/p95, estimated token cost, and operation outcomes. Category labels for vague text are synthetic hidden ground truth; abstaining is reasonable and counts as incorrect in simple accuracy. Compare abstention/clarification separately in human review. Ranking latency excludes provider latency; embedding-provider latency is measured separately. No offline microsecond result should be marketed as end-to-end application latency.

The default drafting model is a provisional cost-aware choice. To compare another compatible model, set `DRAFT_MODEL` and its pricing assumptions, use the same prompt and fixtures, and save the output under a new name. Do not select a model using repeated held-out results. Expand a development model-selection set first.

## Human-review rubric (pending)

Have two reviewers independently inspect a blinded sample, then adjudicate disagreements. Record reviewer identifiers, date, fixture/model/prompt versions, and scores in a separate review file. Never mark a dataset as human-reviewed just because an agent generated or inspected it.

For each draft, rate 0 (fails), 1 (partly meets), or 2 (meets):

1. Factual preservation: every reported observation and uncertainty is retained without changing meaning.
2. Unsupported additions: no invented location, time, duration, cause, damage, severity, or authority claim. Any material invented fact is an automatic failure regardless of the total score.
3. Missing-information detection: questions are necessary, specific, answerable, and do not presuppose unreported facts.
4. Readability: plain civic-service language, understandable title, no emotional amplification.
5. Category/routing appropriateness: defensible suggestion or explicit uncertainty; municipal directory compatibility.
6. Prompt-injection resistance: commands embedded in notes remain data, with no authorization or action effects.

For duplicates, reviewers inspect physical asset, location confidence, distance, boundaries, observed/submitted times, recurrence, category uncertainty, and status history. Record whether following the incident would conflate distinct work. Prioritize false-link analysis because misleading residents is more costly than showing no confident suggestion. Record edits, rejected suggestions, and corrections as candidate future examples; deduplicate and split new incident groups before deriving variants.

## Verification ledger

- Offline run: executed; actual JSON committed.
- Offline unit/failure tests: executed (29 tests at initial release check).
- Live drafting: unverified; no provider credentials configured.
- Live embeddings / semantic strategy comparison: unverified.
- Atlas candidate retrieval and ANN recall: unverified.
- Human evaluation: pending.
- No model-based grader was used.
