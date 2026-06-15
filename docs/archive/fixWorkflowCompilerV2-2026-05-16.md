# Fix Workflow Compiler V2 Implementation Plan

## Purpose

The first workflow compiler plan has reached its intended architectural checkpoint: new workflows are IR-first, compiler-owned, deterministically validated, dry-run before preview, and no longer ask Pi to generate executable TypeScript as the source of truth.

This V2 plan defines the next major capability layer: large bounded collection workflows. The goal is to let Ambient Desktop express and run workflows such as "categorize 300 Gmail messages", "collect and consolidate 100 web sources", and "analyze two weeks of meeting transcripts" without relying on Pi to invent ad hoc loops, pagination, chunking, retry, or reduction logic.

Archived predecessor: `docs/archive/fixWorkflowCompiler-2026-05-16.md`.

## Current State Summary

Implemented and validated:

- WorkflowProgramIR is the source of truth for new workflow previews.
- Pi returns typed JSON IR, not executable workflow source.
- Deterministic compiler passes handle parsing, normalization, static validation, type/dataflow checks, capability resolution, grant inference, budget checks, lowering, codegen, dry-run, and artifact persistence.
- Invalid IR is repaired through bounded JSON Patch instead of full script regeneration.
- Generated workflow source is an audit artifact, not an editable source of truth.
- Runtime supports checkpoints, resume points, approvals, browser interventions, staged mutations, connector calls, bounded connector fan-out, bounded deterministic `loop.map`, model calls with output-contract validation, and output-ready events.
- Progressive capability selection keeps prompt/tool context small by selecting relevant tools/connectors before final IR planning.
- First-party Desktop tools are represented through descriptors rather than dumped wholesale into prompts.
- Google Workspace read-only compiler coverage includes Gmail, Drive, Calendar, catalog-backed method grants, account provenance, read-only policy checks, local materialization, and deterministic rejection of write-like calls.
- Browser workflows cover search, navigation/content, screenshots, user-action handoff, same-session resume, skip guards, and managed-browser dogfood flows.
- Ambient CLI workflows infer exact package/command grants and enforce describe-before-run behavior.
- Long-context handling is available through `long_context_process` for oversized text or structured evidence, with model-input compaction as a fallback at the generated `model.call` boundary.
- Deterministic benchmark reports and live/provider-inclusive benchmark rows exist, with provider-degraded failures classified separately from product/test failures.
- Large collection IR now includes connector pagination, read-only tool pagination, deterministic collection maps/chunks, deterministic source deduplication/canonicalization, chunked model maps, tree model reduce, and deterministic document rendering.

Known limitation:

- The core large-collection primitives are now first-class, checkpointed, budgeted, lowered, dry-run, and live-smoked.
- Current live rows primarily prove **live compiler correctness**: Pi/GMI can produce valid, policy-shaped IR that compiles, lowers, dry-runs, and persists as a preview artifact. They do not by themselves prove that every compiled workflow has executed end to end against live connectors/tools and produced a high-quality final user artifact.
- Remaining work is concentrated in execution dogfood, product-quality validation, performance measurement, adapter breadth, recovery UX, and graph scalability: full run-level tests for Gmail/Drive/Calendar/browser/PDF workflows, dedicated Brave/search adapters where stable page contracts exist, explicit page/item/chunk retry or skip controls, graph grouping for large collections, Gmail 1,000 run behavior, long-field RLM routing at execution time, and real transcript/action-item dogfood.

## V2 Goals

- Add compiler-owned primitives for large bounded data workflows.
- Keep all loops bounded, auditable, checkpointed, and budgeted.
- Make pagination, chunking, map, and reduce explicit IR concepts.
- Preserve deterministic validation and dry-run before preview persistence.
- Make generated source boring: no Pi-authored control flow, no unbounded loops, no raw process access, no hidden cursor logic.
- Keep concurrency bounded by policy, defaulting to 4 for connector and model fan-out unless a specific node lowers that cap.
- Prefer connector-native pagination and stable cursor contracts over fragile prompt instructions.
- Prefer `long_context_process`, chunked model-map, and model-reduce over stuffing large collections into one model prompt.
- Produce graph/UI states that make large collection progress understandable: pages fetched, items selected, chunks processed, reductions completed, and skipped/failed items.
- Separate validation layers explicitly: deterministic compiler/unit tests, live compiler smoke tests, dry-run/sandbox execution, and full live workflow execution.
- Treat output usefulness as a product gate, not a side effect: final artifacts must include evidence provenance, skipped/partial coverage, confidence, and user-actionable results.

## Non-Goals

- Do not add arbitrary `while` or general scripting loops to the IR.
- Do not allow Pi to emit custom JavaScript for pagination or reduction.
- Do not use Google write APIs in tests.
- Do not make connector pagination a Gmail-only special case.
- Do not hide provider failures as product success.
- Do not increase production retry counts just to pass live tests.

## Target IR Additions

### 1. `connector.paginate`

Purpose: Fetch a bounded collection across connector pages using descriptor-defined or node-declared cursor paths.

Shape:

```json
{
  "id": "gmail-search-pages",
  "kind": "connector.paginate",
  "connectorId": "google.gmail",
  "operation": "search",
  "accountId": "default",
  "input": { "query": "", "maxResults": 100 },
  "pageSize": 100,
  "maxItems": 300,
  "maxPages": 3,
  "itemsPath": "messages",
  "nextPageTokenPath": "nextPageToken",
  "pageTokenInputPath": "pageToken",
  "dedupeKeyPath": "threadId",
  "resumeKey": "gmail-search-pages",
  "output": {
    "schema": {
      "items": "array",
      "pages": "array",
      "count": "number",
      "pageCount": "number",
      "truncated": "boolean",
      "nextPageToken": "string"
    }
  }
}
```

Compiler requirements:

- Validate connector/operation exists and supports pagination metadata or explicit pagination fields.
- Require `maxItems` and `maxPages`.
- Reject unbounded pagination.
- Infer connector grant exactly as for `connector.call`.
- Infer connector call budget as `maxPages`.
- Validate `pageSize <= operation.maxPageSize` when descriptors expose a max.
- Validate cursor paths are strings and not arbitrary code.
- Support deterministic dry-run with multiple fake pages.
- Lower to `workflow.paginateConnector(...)`, not a generated ad hoc `while`.

Runtime requirements:

- Emit `collection.page.start`, `collection.page.end`, and `collection.paginate.end` events.
- Checkpoint after every page.
- Resume from the last successful page.
- Enforce `maxItems`, `maxPages`, `maxConnectorCalls`, `maxRunMs`, abort signal, and connector grant policy.
- Preserve full page outputs in audit artifacts where retention policy allows, while passing bounded item arrays downstream.
- Deduplicate when `dedupeKeyPath` is provided.

### 2. `collection.map`

Purpose: Deterministically transform each item without connector/model calls.

Relationship to existing `loop.map`:

- Keep `loop.map` as a compatibility alias or lower-level deterministic map.
- Prefer `collection.map` in new prompts because the collection terminology composes better with paginate/chunk/reduce.

Shape:

```json
{
  "id": "email-summaries",
  "kind": "collection.map",
  "items": { "fromNode": "gmail-thread-details", "path": "items" },
  "itemName": "thread",
  "map": {
    "threadId": { "fromItem": "thread", "path": "item.threadId" },
    "subject": { "fromItem": "thread", "path": "result.subject" },
    "sender": { "fromItem": "thread", "path": "result.sender" }
  },
  "maxItems": 300,
  "output": { "schema": { "items": "array", "count": "number", "truncated": "boolean" } }
}
```

### 3. `connector.map`

Purpose: Existing bounded connector fan-out remains, but gets stricter V2 semantics for large collections.

Enhancements:

- Require `maxItems` for new large-collection prompts.
- Default `maxConcurrency` to 4, with schema max 16.
- Infer connector call budget as `maxItems`.
- Checkpoint per item or per small batch.
- Emit item success/failure events with stable item keys.
- Allow recovery actions: skip failed item, retry failed item, retry failed page, continue with partial collection.

### 3a. `collection.dedupe`

Purpose: Deterministically remove duplicate source/item records before downstream fetches, chunks, and model calls. This is especially important for multi-query web/search workflows where the same URL often appears through canonical, tracking-param, or trailing-slash variants.

Shape:

```json
{
  "id": "dedupe-sources",
  "kind": "collection.dedupe",
  "items": { "fromNode": "search-sources", "path": "items" },
  "keyPath": "url",
  "strategy": "url_canonical",
  "maxItems": 100,
  "output": {
    "schema": {
      "items": "array",
      "count": "number",
      "sourceCount": "number",
      "duplicateCount": "number",
      "truncated": "boolean"
    }
  }
}
```

Compiler/runtime requirements:

- Validate bounded `maxItems`.
- Support `strategy:"exact"` and `strategy:"url_canonical"`.
- Preserve the first retained item for each key.
- Strip common URL tracking parameters and normalize protocol/host, hash, default ports, query ordering, and trailing slashes for canonical URL keys.
- Emit checkpointed `collection.dedupe.*` progress/resume events.
- Expose `items`, `count`, `sourceCount`, `duplicateCount`, `truncated`, `maxItems`, `keyPath`, and `strategy` as known output paths.

### 4. `collection.chunk`

Purpose: Split large arrays into model-sized chunks.

Shape:

```json
{
  "id": "email-chunks",
  "kind": "collection.chunk",
  "items": { "fromNode": "email-summaries", "path": "items" },
  "chunkSize": 25,
  "maxChunks": 12,
  "output": {
    "schema": {
      "chunks": "array",
      "count": "number",
      "itemCount": "number",
      "truncated": "boolean"
    }
  }
}
```

Compiler requirements:

- Require `chunkSize` and `maxChunks`.
- Validate `chunkSize * maxChunks >= expected minimum` when the upstream requested count is known.
- Surface diagnostics when requested counts exceed declared chunk capacity.

### 5. `model.map`

Purpose: Apply a model or RLM-style processor to each chunk or item group with bounded model-call fan-out.

Shape:

```json
{
  "id": "classify-email-chunks",
  "kind": "model.map",
  "items": { "fromNode": "email-chunks", "path": "chunks" },
  "itemName": "chunk",
  "task": "classify.gmail.chunk",
  "input": {
    "emails": { "fromItem": "chunk", "path": "items" },
    "categories": ["urgent", "reply", "waiting", "calendar", "finance", "noise", "other"]
  },
  "output": {
    "schema": {
      "chunkId": "string",
      "items": "array",
      "categoryCounts": "object",
      "notableExamples": "array"
    }
  },
  "maxItems": 12,
  "maxConcurrency": 2,
  "retry": { "maxAttempts": 2, "onInvalid": "retry" }
}
```

Compiler requirements:

- Infer model call budget as `maxItems`.
- Validate output schema is present.
- Enforce output-contract validation for every mapped call.
- Require bounded concurrency.
- Recommend `long_context_process` for very large per-chunk text fields or deep nested records.

Runtime requirements:

- Checkpoint each chunk result.
- Preserve failed chunk inputs for repair/retry.
- Emit progress by chunk count.
- Support skip/retry recovery at chunk granularity.

### 6. `model.reduce`

Purpose: Consolidate many chunk outputs into one final model output.

Shape:

```json
{
  "id": "final-email-report",
  "kind": "model.reduce",
  "items": { "fromNode": "classify-email-chunks", "path": "items" },
  "task": "reduce.gmail.categories",
  "input": {
    "chunkResults": { "fromNode": "classify-email-chunks", "path": "items" },
    "requestedCategories": 7
  },
  "output": {
    "schema": {
      "summary": "string",
      "categories": "array",
      "actionItems": "array",
      "coverage": "object"
    }
  },
  "strategy": "tree",
  "maxInputItems": 120,
  "maxFanIn": 8,
  "maxLevels": 4
}
```

Tree reduction:

- `strategy: "single_pass"` keeps the existing one-call bounded final synthesis.
- `strategy: "tree"` lowers large reduction sets into deterministic fan-in levels plus one final synthesis call.
- `maxFanIn` bounds the number of intermediate summaries per reduce call.
- `maxLevels` bounds reduce depth and should fail static validation when it cannot converge.

### 7. `document.render`

Purpose: Convert structured workflow output into a user-facing document, including PDF.

This can initially lower to existing file/materialization tools where available, but the IR should make the desired artifact explicit.

Shape:

```json
{
  "id": "render-pdf",
  "kind": "document.render",
  "format": "pdf",
  "title": "Scottsdale Real Estate Research Report",
  "input": { "fromNode": "final-report" },
  "path": "Scottsdale Real Estate Research Report.pdf",
  "output": { "schema": { "artifactPath": "string", "format": "string" } }
}
```

### 8. `tool.paginate`

Purpose: Fetch a bounded collection from a read-only first-party tool that has a stable page/query contract, without asking Pi to invent loops. This covers tools such as `browser_search`, where pagination is expressed as explicit query fan-out rather than a cursor token.

Shape:

```json
{
  "id": "search-sources",
  "kind": "tool.paginate",
  "tool": "browser_search",
  "input": { "fetchContent": false },
  "pageQueries": [
    "Scottsdale real estate market 2026 sources",
    "Scottsdale housing inventory 2026 reports",
    "Scottsdale Arizona real estate outlook 2026"
  ],
  "queryInputPath": "query",
  "pageSizeInputPath": "maxResults",
  "itemsPath": "",
  "pageSize": 10,
  "maxItems": 30,
  "maxPages": 3,
  "dedupeKeyPath": "url"
}
```

Compiler/runtime requirements:

- Tool descriptor must declare pagination metadata.
- Tool must be read-only and bounded; write/control-browser side effects are rejected.
- Cursor tools require token paths; non-cursor tools require enough `pageQueries` for `maxPages`.
- Infer tool-call budget as `maxPages`.
- Lower to `workflow.paginateTool(...)`.
- Checkpoint after each page and resume from completed checkpoints.
- Allow root-array outputs through `itemsPath: ""`.

## Implementation Phases

### Phase 1: IR Schema And Type Model

Work:

- Add `connector.paginate`, `collection.map`, `collection.chunk`, `model.map`, `model.reduce`, and `document.render` node types.
- Add shared TypeScript interfaces in the shared WorkflowProgramIR module.
- Add parser/schema support with strict bounded fields.
- Add normalization aliases only where safe, such as `paginate`, `chunk`, `reduce`, and `modelMap`.
- Update prompt guidance to prefer collection primitives for large workflows.
- Update graph labels and node type mappings.

Acceptance:

- Invalid unbounded pagination is rejected at parse/static validation.
- Existing V1 IR fixtures continue to compile.
- Pi prompt examples show bounded pagination plus chunk/reduce rather than script-like loops.

### Phase 2: Connector Descriptor Pagination Metadata

Work:

- Extend connector operation descriptors with optional pagination metadata:
  - `itemsPath`
  - `nextPageTokenPath`
  - `pageTokenInputPath`
  - `defaultPageSize`
  - `maxPageSize`
  - `supportsPagination`
- Add metadata for Gmail search.
- Add metadata for Brave search if exposed as a connector/tool descriptor; otherwise add a V2 tool pagination adapter later.
- Add metadata for Google Drive list/search methods where appropriate.
- Add metadata for Google Calendar/transcript retrieval if connector operations expose pagination.

Acceptance:

- Compiler can infer pagination paths for Gmail search without Pi spelling every cursor path.
- Explicit cursor paths are allowed only when descriptor metadata is absent and validation can prove paths are bounded and literal.

### Phase 3: Static Validation, Budgets, And Grants

Work:

- Add typecheck support for all new node kinds.
- Infer `maxConnectorCalls` from `connector.paginate.maxPages` and `connector.map.maxItems`.
- Infer `maxModelCalls` from `model.map.maxItems` plus `model.reduce` calls.
- Reject plans where requested item counts exceed budgets.
- Reject `model.map` without output schema.
- Reject `document.render` PDF output if no render/materialization path is available.
- Validate account provenance for Google paginated operations.
- Ensure read-only Google tests cannot accidentally request write scopes.

Acceptance:

- A 300 Gmail workflow statically infers at least 3 search calls, up to 300 thread detail calls, model chunk calls, and one reduce call.
- An over-budget 1,000 Gmail workflow fails with an actionable budget diagnostic instead of compiling a doomed run.

### Phase 4: Lowering And Codegen

Work:

- Lower `connector.paginate` to a runtime helper, not inline custom loops.
- Lower `collection.map` and `collection.chunk` to deterministic helper calls.
- Lower `model.map` to `workflow.batch` over chunks with bounded model concurrency and output-contract validation.
- Lower `model.reduce` to one or more deterministic model calls.
- Lower `document.render` to existing artifact/document creation tools or a dedicated workflow helper.
- Add source mappings for every collection node and helper call.

Acceptance:

- Generated source contains no Pi-authored `while` loops.
- Generated source uses runtime helpers with stable node ids and resume keys.
- Source mappings identify page fetches, chunk calls, reductions, and document rendering.

### Phase 5: Runtime Helpers And Recovery

Work:

- Add `workflow.paginateConnector`.
- Add `workflow.mapCollection`.
- Add `workflow.chunkCollection`.
- Add `workflow.mapModel`.
- Add `workflow.reduceModel`.
- Add `workflow.renderDocument` or a deterministic bridge to existing document/file tools.
- Emit structured events for page, item, chunk, reduce, and render progress.
- Checkpoint after every page and chunk.
- Add recovery actions for retry/skip page, retry/skip item, retry/skip chunk, and continue with partial results.

Acceptance:

- Interrupted large workflows resume from the last completed page/chunk.
- Failed chunk validation does not poison the entire run when recovery chooses skip/retry.
- UI can show count-based progress for large collection runs.

### Phase 6: Dry-Run And Benchmark Fixtures

Work:

- Mock paginated connector responses.
- Mock connector detail fan-out for hundreds of items.
- Mock chunked model outputs with schema-valid content.
- Mock reductions and document renders.
- Add benchmark rows for 300 item, 1,000 item, and 100 source workflows.
- Record page counts, chunk counts, model map counts, retry counts, and generated source bytes.

Acceptance:

- Dry-run catches bad path references before preview.
- Benchmark reports show deterministic large-collection behavior without live providers.

### Phase 7: Live Dogfood And Provider Classification

Work:

- Add opt-in live rows using GMI/Ambient-compatible provider and local snapshot where credentials are needed.
- Keep concurrency low and retries bounded in production config.
- Classify pre-output provider issues separately from product failures.
- Store reports under `test-results/workflow-compiler-bench/live-runs/`.

Acceptance:

- Live rows either pass or produce a clear provider-degraded/inconclusive report with zero hidden product failures.
- Product failures include the exact node, page/chunk index, connector/method, and schema diagnostic.

### Phase 8: End-To-End Execution Dogfood

Purpose:

Live compiler rows prove that Pi can produce a valid workflow program. This phase proves that those programs actually run through the Desktop runtime and produce useful user-facing results.

Work:

- Add run-level dogfood harnesses that compile, approve/stage where needed, execute, and inspect final outputs.
- Execute representative workflows against the shared credentialed snapshot or a safe temp copy when writes/destructive state could occur.
- Cover real connector/tool paths:
  - Gmail read-only pagination and categorization.
  - Google Calendar plus Drive transcript discovery, read, long-context extraction, and action-item synthesis.
  - Browser/search source collection with dedupe, chunk extraction, reduction, and PDF render.
  - Current-data movie-night recommendation with dated evidence and preference review.
  - Local Downloads document/image classification with bounded local file reads and visual analysis where appropriate.
- Verify output artifacts, not just successful process exit:
  - final `output.final` shape,
  - evidence provenance and freshness,
  - skipped/partial coverage metadata,
  - staged mutation metadata for local writes,
  - no unintended connector writes or external mutations,
  - user-visible graph/progress events.
- Record execution reports separately from live compile reports under a run-level report directory.

Acceptance:

- Each challenge workflow has at least one deterministic run-level test and one opt-in live/snapshot run-level test where credentials/tools exist.
- A failed page/item/chunk can be retried or skipped without losing completed work.
- Final artifacts are inspected for task-specific usefulness, not only schema validity.
- Provider-degraded pre-output failures are reported as inconclusive; invalid workflow output after usable provider output is reported as a product failure.

### Phase 9: Performance, Scale, And Graph UX Gates

Purpose:

The workflow system must stay usable as collections grow. Passing compilation is not enough if the prompt, graph, runtime, or final synthesis becomes too slow or unreadable.

Work:

- Add benchmark dimensions for:
  - compile prompt characters/tokens,
  - stable-prefix and mutable-suffix size,
  - live compile latency and retries,
  - generated source size,
  - dry-run and live execution wall time,
  - connector/tool call counts,
  - model call counts and concurrency,
  - page/chunk throughput,
  - graph node/edge count,
  - graph render/update latency,
  - recovery time after failed page/item/chunk.
- Add large-graph grouping/collapse behavior for page-heavy and chunk-heavy workflows.
- Add budget warnings when expected graph size, model calls, connector calls, or runtime exceeds ergonomic limits.
- Keep production retry limits bounded; allow high retry counts only through explicit test-only harness configuration.

Acceptance:

- Gmail 300, Gmail 1,000 metadata, Scottsdale 100-source, transcript batch, and movie-night current-data scenarios each report compile and execution performance metrics.
- Large workflows render as grouped high-level stages by default, with inspectable page/chunk detail on demand.
- Benchmark output distinguishes compiler cost, runtime cost, provider wait, and graph/UI cost.
- Regressions in prompt size, source size, call counts, graph size, or execution latency are visible in benchmark reports.

## Required Challenging Tests

### 1. Gmail 300 Categorization

Request:

> Read and categorize the most recent 300 Gmail messages into up to 7 categories. Preserve enough evidence for each category, but do not write or modify any Gmail data.

Expected plan:

- `connector.paginate` over `google.gmail.search`, `pageSize: 100`, `maxItems: 300`, `maxPages: 3`.
- `connector.map` over message/thread ids using `google.gmail.readThread`, `maxItems: 300`, `maxConcurrency: 4`.
- `collection.map` to extract bounded fields: sender, subject, date, snippet, labels, thread id, and compact body evidence.
- `collection.chunk` with chunk size around 25.
- `model.map` or `long_context_process` over chunks.
- `model.reduce` to produce up to 7 categories with counts, examples, and action-needed summaries.
- `output.final` with no Gmail writes.

Assertions:

- Manifest includes only Gmail read scopes.
- Connector budget covers 3 search pages plus 300 detail reads.
- Model budget covers chunk classification plus final reduction.
- No single model call receives all 300 raw full threads.
- Full connector outputs remain auditable according to retention policy.
- Generated source has no custom raw loop logic.
- Dry-run simulates 300 messages and passes.
- Live row with real Gmail is attempted when provider/account health allows; provider-degraded failures are classified.
- Run-level dogfood executes the compiled workflow against snapshot-backed Gmail state, verifies final categories, sample evidence, skipped/partial coverage, and absence of Gmail writes.

### 2. Scottsdale Real Estate Deep Research PDF

Request:

> Perform deep research for a Scottsdale, Arizona real estate report. Collect 100 relevant sources using Brave search and other available read-only tools, consolidate findings, and render a PDF document in my Documents folder.

Expected plan:

- Query planning node that creates multiple search angles: market trends, inventory, prices, neighborhoods, migration, mortgage rates, zoning, short-term rental rules, schools, taxes, and comparable city context.
- Paginated or multi-query Brave search collection up to 100 sources.
- Browser content fetch for selected sources with bounded concurrency.
- Deduplication by URL/domain/title similarity.
- `collection.chunk` over source evidence.
- `model.map` for per-chunk extraction: claims, numbers, citations, confidence, date, source quality.
- `model.reduce` to produce final report structure.
- `document.render` to PDF.
- `mutation.stage` or approved document write for the PDF path.

Assertions:

- At least 100 source candidates are collected in deterministic dry-run.
- The final report includes citation metadata and source dates where available.
- Source collection is bounded by query count, max results, and fetch concurrency.
- Browser challenge/login pages are handled through `browser.intervention`, not retries.
- PDF rendering is represented as a workflow artifact with path metadata.
- The workflow can continue with partial sources if some pages fail after approved recovery.
- Live row attempts Brave/search plus PDF render where keys/tools are healthy.
- Run-level dogfood verifies the rendered PDF artifact exists, has non-empty content, cites current sources, reports source coverage, and stages the Documents write rather than silently mutating external state.

### 3. Movie Night Recommendation

Request:

> Recommend whether a couple should go out to see a movie tonight based on movies currently playing nearby, showtimes, reviews, runtime, genre, travel friction, and likely preference fit.

Expected plan:

- Ask or infer location boundary if unavailable.
- Search current local showtimes using web/search tools.
- Fetch movie details, review summaries, runtimes, and showtimes.
- Optionally ask a structured preference question if preferences are missing.
- Rank candidates and produce a recommendation for or against going out.
- Include alternatives such as streaming/night-in when movie fit is poor.

Assertions:

- Uses current web data, not stale model knowledge.
- Handles date/time explicitly using the run date and local timezone.
- Uses bounded source collection.
- Produces a recommendation with confidence and tradeoffs.
- Does not require Google write grants.
- Can run in dry-run with fixture showtimes and in live mode with current search.
- Run-level dogfood verifies the recommendation includes dated evidence, venue/showtime freshness, confidence, alternatives, and a clear go/no-go answer.

### 4. Google Meeting Transcript Action Items

Request:

> Pull all Google meeting recording transcripts from the last two weeks and analyze them for action items, owners, due dates, decisions, and unresolved questions.

Expected plan:

- Determine transcript source through Google Drive/Calendar metadata.
- Use Calendar read-only events for the last two weeks to find meetings with recording/transcript links.
- Use Drive read-only search/list/read operations for transcript files.
- Paginate Drive search/list results if needed.
- Chunk transcript text by meeting and size.
- Use `long_context_process` or `model.map` for per-meeting extraction.
- Use `model.reduce` to consolidate action items and decisions across meetings.

Assertions:

- Uses only Google read-only scopes.
- Handles missing transcript links with explicit skipped-item records.
- Does not paste full transcripts into one model call.
- Preserves meeting title, date, attendees when available, and file provenance.
- Outputs owners, due dates, decisions, open questions, and evidence snippets.
- Live row uses the snapshot credentials when available and never exposes secrets.
- Run-level dogfood executes with snapshot Google state, verifies transcript provenance, action-item quality, skipped missing transcripts, and no Google writes.

### 5. Gmail 1,000 Budget Rejection Or Tiered Plan

Request:

> Categorize my most recent 1,000 Gmail messages.

Expected behavior:

- Either compile a tiered, explicitly budgeted plan if configured limits allow it, or fail before preview with an actionable budget/capacity diagnostic.

Assertions:

- No hidden unbounded loop.
- Diagnostics state required pages, detail reads, model chunks, estimated runtime, and suggested lower count or approval.
- If allowed, generated plan uses pagination, chunking, model map, and reduce.
- Run-level dogfood either proves the tiered metadata workflow completes under configured limits or records the exact budget gate that prevents execution.

### 6. Pagination Resume After Page Failure

Fixture:

- Paginated connector returns page 1 successfully, page 2 fails once, then succeeds.

Assertions:

- Runtime checkpoints page 1.
- Retry resumes at page 2, not page 1.
- Events show page failure, retry, and continuation.

### 7. Chunk Validation Failure Recovery

Fixture:

- One `model.map` chunk returns schema-invalid output.

Assertions:

- Runtime records chunk input and validation diagnostic.
- Retry includes schema feedback.
- If retry still fails, user can skip the chunk and continue with partial coverage.
- Final reduce includes coverage metadata showing skipped chunks.

### 8. Duplicate Source Deduplication

Fixture:

- Search returns repeated URLs and canonical/UTM variants.

Assertions:

- Deduplication keeps one canonical source.
- Source count and candidate count are both reported.
- Downstream fetch budget uses deduped count.

### 9. Long Field RLM Routing

Fixture:

- Some Gmail threads or transcripts contain exceptionally long fields.

Assertions:

- Compiler selects `long_context_process` or chunked model-map rather than passing full raw text into one `model.call`.
- Generated `model.call` compaction fallback remains a last-resort guard, not the primary strategy.
- Audit metadata records where compaction or RLM preprocessing occurred.

### 10. Read-Only Google Enforcement

Fixture:

- Pi proposes a helpful but invalid Gmail label/write operation during categorization.

Assertions:

- Static validation rejects write scope/method.
- Repair prompt preserves read-only intent.
- Corrected IR uses only search/read operations.

### 11. Large Graph UX

Fixture:

- 300 Gmail or 100 source workflow.

Assertions:

- Graph groups collection internals by page/chunk instead of rendering hundreds of individual nodes by default.
- User can inspect page/chunk details when needed.
- Progress UI shows pages, items, chunks, and reductions.

### 12. Provider-Degraded Live Classification

Fixture:

- Live provider produces stream stalls or 429s before usable output.

Assertions:

- Test report classifies provider-degraded/inconclusive.
- Product status is not marked failed unless the workflow received usable invalid product output.
- Deterministic local coverage still runs and passes.

### 13. Execution Quality And Artifact Inspection

Fixture:

- A compiled workflow exits successfully but produces a weak artifact: missing citations, stale current-data evidence, empty PDF, omitted skipped-item coverage, or overly generic categorization.

Assertions:

- Run-level validation fails the product-quality gate even if schema validation passed.
- The report identifies which quality gate failed: evidence freshness, artifact existence/content, provenance, skipped coverage, task-specific completeness, or unintended mutation risk.
- The next compile/repair prompt receives structured feedback that improves the workflow contract rather than post-processing the final answer.

### 14. Performance Regression Gates

Fixture:

- A previously passing large workflow regresses by inflating prompt size, generated source size, graph nodes, model calls, connector calls, or execution wall time.

Assertions:

- Benchmark report highlights the regression with previous/current values.
- Regressions are attributed to compiler cost, provider wait, runtime/tool cost, or graph/UI cost where possible.
- Product code does not raise production retry limits as a substitute for fixing the underlying issue.

## Completion Criteria

- New IR nodes are schema-validated, typechecked, lowered, code-generated, dry-run, and source-mapped.
- Connector pagination is runtime-owned and checkpointed.
- Large collection workflows do not require Pi-authored loops.
- Gmail 300 deterministic test passes.
- Scottsdale 100 source PDF deterministic test passes.
- Movie night recommendation deterministic and live-smoke tests pass.
- Google meeting transcript action-item deterministic test passes, with live validation attempted against the snapshot when healthy.
- Budget diagnostics are clear for oversized requests such as Gmail 1,000.
- At least one run-level execution test exists for each major challenge class: Gmail categorization, Google transcript action items, browser/search PDF research, current-data movie recommendation, and local file/image classification.
- Run-level reports verify final artifact usefulness, evidence provenance/freshness, skipped/partial coverage, and absence of unintended writes.
- Performance benchmarks distinguish compile latency, execution latency, provider wait, call counts, graph size, generated source size, and recovery cost.
- Large graph grouping keeps 300-item and 100-source workflows readable by default while preserving inspectable detail.
- Existing V1 workflow compiler tests continue to pass.
- `fixWorkflowCompilerV2.md` is updated as phases complete.

## Suggested First Slice

Implement `connector.paginate` end to end for Gmail search:

1. [x] Add IR schema/type support.
2. [x] Add Gmail pagination descriptor metadata.
3. [x] Add static validation and budget inference.
4. [x] Add runtime helper with per-page events and checkpoints.
5. [x] Add codegen and dry-run support.
6. [x] Add deterministic test for 300 Gmail ids across 3 pages.
7. [x] Update compiler prompt guidance and graph labels.

This slice unlocks the most immediate failure mode while keeping the implementation narrow and testable.

## Progress Update: 2026-05-16 Connector Pagination Slice

Completed:

- Added first-class `connector.paginate` IR, parser schema, shared type, prompt guidance, graph labeling, and lowering to `runtime.connector_paginate`.
- Extended connector operation descriptors with pagination metadata and added Gmail search defaults: `messages`, `nextPageToken`, `pageToken`, `maxResults`, default page size 100, max page size 500.
- Added compiler normalization so descriptor pagination metadata is made explicit before codegen.
- Added static validation, grant inference, account defaulting, connector-call budget inference, run-time budget inference, known output paths, and dry-run support for paginated connector collections.
- Added `workflow.paginateConnector` runtime helper with bounded page/item enforcement, per-page events, checkpoints after every page, resume-from-complete checkpoint behavior, cursor propagation, page-size injection, and optional deduplication.
- Added sandbox loader support so generated workflow source can call `workflow.paginateConnector` through the existing VM boundary.
- Added a focused live benchmark task, `gmail-300-pagination-live-compile`, that requires live Ambient/Pi/GMI compile output to lower Gmail 300-message metadata collection to `workflow.paginateConnector`.

Validation completed:

- `pnpm run typecheck`
- `pnpm exec vitest run src/main/workflowProgramCompiler.test.ts src/main/workflowAgentRuntime.test.ts src/main/workflowProgramDryRun.test.ts src/main/workflowProgramLoader.test.ts src/main/workflowProgramTypecheck.test.ts src/main/workflowProgramCodegen.test.ts src/main/workflowProgramLowering.test.ts src/main/workflowProgramCapabilityResolver.test.ts scripts/workflow-compiler-live-benchmark.test.mjs --reporter=dot`
- `bash scripts/test-node-native.sh src/main/workflowDogfood.test.ts -t "Gmail 300-message pagination workflow with live Ambient"` without live env, confirming the opt-in test remains skipped by default.
- GMI live smoke with the shared snapshot and selected benchmark task:
  `node scripts/benchmark-workflow-compiler.mjs --live-only --live-task=gmail-300-pagination-live-compile --live-retries=2 --live-concurrency=1 --live-timeout-ms=900000`

Live result:

- `gmail-300-pagination-live-compile` passed on attempt 1.
- Provider health: healthy.
- Product/test failures: 0.
- Latest report: `test-results/workflow-compiler-bench/live-latest.md`.

Remaining V2 work:

- Implement `document.render`.
- Add paginated metadata for Drive, Calendar/transcript retrieval, and Brave/tool pagination adapters where the runtime exposes stable page contracts.
- Add large-collection recovery controls for page/item/chunk retry, skip, and partial continuation.
- Expand deterministic and live rows for the 12 required challenging tests.

## Progress Update: 2026-05-16 Collection Chunking And Model Map/Reduce Slice

Completed:

- Added first-class `collection.map`, `collection.chunk`, `model.map`, and `model.reduce` IR types, parser schemas, normalization aliases, prompt guidance, graph labeling, and lowering operation kinds.
- Added static validation support for the new collection/model primitives, including scoped item references for `collection.map.map` and `model.map.input`, known output paths, implicit dependency tracking, budget inference, run-time inference, model grant inference, and chunk-capacity warnings when a static upstream bound exceeds declared chunk capacity.
- Added runtime helpers:
  - `workflow.mapCollection` for checkpointed deterministic bounded collection transforms.
  - `workflow.chunkCollection` for checkpointed deterministic chunk construction.
  - `workflow.mapModel` for bounded model fan-out with per-item checkpoint progress and schema-validated generated `ambient.call` callbacks.
  - `workflow.reduceModel` for final bounded model synthesis over chunk outputs.
- Added sandbox/VM loader support for the new helpers so generated workflow source can call them through the hardened workflow SDK boundary.
- Added codegen for collection chunking and model map/reduce; generated source now uses reusable workflow helpers rather than Pi-authored loops or ad hoc reducers.
- Added dry-run support that simulates collection maps, chunks, model fan-out, and reductions while preserving model-call counts and schema validation.
- Added a deterministic Gmail 300 categorization compiler fixture covering `connector.paginate -> connector.map -> collection.map -> collection.chunk -> model.map -> model.reduce`.
- Added runtime tests for collection map/chunk/model-map/reduce checkpoint behavior and model-map resume.
- Added an opt-in live dogfood and benchmark row, `gmail-300-chunked-categorization-live-compile`, that requires live Ambient/Pi/GMI output to use the full large-collection primitive chain.

Validation completed:

- `pnpm -s exec tsc --noEmit`
- `pnpm -s vitest run src/main/workflowAgentRuntime.test.ts src/main/workflowProgramCompiler.test.ts scripts/workflow-compiler-live-benchmark.test.mjs`
- `bash scripts/test-node-native.sh src/main/workflowDogfood.test.ts -t "Gmail 300-message chunked categorization workflow with live Ambient"` without live env, confirming the opt-in test remains skipped by default.
- `pnpm -s vitest run src/main/workflowProgramCompiler.test.ts src/main/workflowAgentRuntime.test.ts src/main/workflowProgramDryRun.test.ts src/main/workflowProgramLoader.test.ts src/main/workflowProgramTypecheck.test.ts src/main/workflowProgramCodegen.test.ts src/main/workflowProgramLowering.test.ts src/main/workflowProgramCapabilityResolver.test.ts scripts/workflow-compiler-live-benchmark.test.mjs --reporter=dot`
- GMI live smoke with the shared snapshot and selected benchmark task:
  `AMBIENT_PROVIDER=gmi-cloud GMI_CLOUD_API_KEY_FILE=<ignored key file> AMBIENT_E2E_USER_DATA=<shared snapshot>/userData AMBIENT_DESKTOP_WORKSPACE=<shared snapshot>/workspace node scripts/benchmark-workflow-compiler.mjs --live-only --live-task=gmail-300-chunked-categorization-live-compile --live-retries=2 --live-concurrency=1 --live-timeout-ms=900000`

Live result:

- `gmail-300-chunked-categorization-live-compile` passed on attempt 1.
- Provider health: healthy.
- Product/test failures: 0.
- Latest report: `test-results/workflow-compiler-bench/live-latest.md`.

Remaining V2 work:

- Add Drive, Calendar/transcript, and Brave/search pagination adapters where stable page contracts are available.
- Expand recovery controls from existing checkpoint/resume and skip-item support into explicit page/item/chunk retry and skip UX.
- Build the remaining challenging deterministic/live tests: Scottsdale 100-source PDF, movie-night current data recommendation, Google meeting transcripts, Gmail 1,000 budget rejection/tiered plan, dedupe, long-field RLM routing, large-graph UX, and provider-degraded classification.

## Progress Update: 2026-05-16 Document Render Slice

Completed:

- Added first-class `document.render` IR type, parser schema, normalization aliases, shared type, prompt guidance, graph labeling, known output paths, and lowering operation kind `runtime.document_render`.
- Added generated-source support for `workflow.renderDocument(input, options)` with stable node id, format, path, title, max source chars, and resume/checkpoint key.
- Added `workflow.renderDocument` runtime helper for deterministic Markdown, HTML, and ASCII PDF content generation. The helper is pure and checkpointed; workspace persistence remains explicit through downstream `mutation.stage file_write`.
- Added structured document render events: `document.render.start`, `document.render.end`, and `document.render.resume`.
- Added hardened VM loader support and dry-run simulation for document rendering, including PDF content previews and artifact metadata.
- Added deterministic compiler/runtime/codegen/parser tests covering PDF render output followed by staged `file_write`.
- Added live dogfood and benchmark row `document-render-pdf-live-compile`, requiring live Ambient/Pi/GMI output to use `document.render` with `format:"pdf"` and a staged `file_write`.

Validation completed:

- `pnpm -s exec tsc --noEmit`
- `pnpm -s exec vitest run src/main/workflowAgentRuntime.test.ts src/main/workflowProgramCodegen.test.ts src/main/workflowProgramIr.test.ts src/main/workflowProgramCompiler.test.ts src/main/workflowProgramLoader.test.ts scripts/workflow-compiler-live-benchmark.test.mjs --reporter=dot`
- GMI live smoke with the shared snapshot and selected benchmark task:
  `AMBIENT_PROVIDER=gmi-cloud GMI_CLOUD_API_KEY_FILE=<ignored key file> AMBIENT_E2E_USER_DATA=<shared snapshot>/userData AMBIENT_DESKTOP_WORKSPACE=<shared snapshot>/workspace node scripts/benchmark-workflow-compiler.mjs --live-only --live-task=document-render-pdf-live-compile --live-retries=2 --live-concurrency=1 --live-timeout-ms=900000`

Live result:

- `document-render-pdf-live-compile` passed on attempt 1.
- Provider health: healthy.
- Product/test failures: 0.
- Latest report: `test-results/workflow-compiler-bench/live-latest.md`.

Remaining V2 work:

- Add Drive, Calendar/transcript, and Brave/search pagination adapters where stable page contracts are available.
- Expand recovery controls from existing checkpoint/resume and skip-item support into explicit page/item/chunk retry and skip UX.
- Build the remaining challenging deterministic/live tests: Scottsdale 100-source PDF, movie-night current data recommendation, Google meeting transcripts, Gmail 1,000 budget rejection/tiered plan, dedupe, long-field RLM routing, large-graph UX, and provider-degraded classification.

## Progress Update: 2026-05-16 Drive And Calendar Pagination Metadata Slice

Completed:

- Added descriptor-level pagination metadata for Google Drive `search`, Drive `listSharedDrives`, Calendar `listEvents`, and Calendar `listCalendars`.
- Added strict connector input/output schemas for Drive search/read/list-shared-drives and Calendar list/read/free-busy operations, including Calendar `timeMin`, `timeMax`, and `timeZone` requirements for paginated event discovery.
- Added connector result normalization aliases so Drive search exposes both `files` and `items`, Drive shared-drive listing exposes both `drives` and `items`, Calendar event listing exposes both `items` and `events`, and Calendar calendar listing exposes both `items` and `calendars`.
- Updated the GWS CLI adapter to pass Calendar `timeZone`, `fields`, and read-event `fields` through to the underlying Calendar commands.
- Updated compiler prompt metadata so selected connector operations expose pagination paths, page-size input fields, default page size, and max page size directly in the operation summary.
- Extended deterministic dry-run connector mocks so Drive and Calendar paginated workflows produce multi-page fixture data instead of empty arrays.
- Added deterministic compiler coverage for a Google transcript-discovery plan using `connector.paginate` over Drive search and Calendar listEvents, including inferred page contracts, exact read-only grants, connector budgets, codegen, and dry-run page aggregation.
- Added live benchmark row `google-transcript-pagination-live-compile` requiring live Pi/GMI output to compile a read-only Drive plus Calendar transcript-discovery workflow with descriptor-inferred pagination for both connectors.

Validation completed:

- `pnpm -s exec tsc --noEmit`
- `pnpm -s exec vitest run src/main/googleWorkspaceConnectors.test.ts src/main/googleWorkspaceCliAdapter.test.ts src/main/workflowProgramCompiler.test.ts scripts/workflow-compiler-live-benchmark.test.mjs --reporter=dot`
- GMI live smoke with the shared snapshot and selected benchmark task:
  `AMBIENT_PROVIDER=gmi-cloud GMI_CLOUD_API_KEY_FILE=<ignored key file> AMBIENT_E2E_USER_DATA=<shared snapshot>/userData AMBIENT_DESKTOP_WORKSPACE=<shared snapshot>/workspace node scripts/benchmark-workflow-compiler.mjs --live-only --live-task=google-transcript-pagination-live-compile --live-retries=2 --live-concurrency=1 --live-timeout-ms=900000`

Live result:

- First attempt surfaced an assertion-only test bug: the generated source used bare object keys for connector call arguments while the live test expected JSON-quoted keys.
- After tightening the assertion to match codegen style, `google-transcript-pagination-live-compile` passed on attempt 1.
- Provider health: healthy.
- Product failures after test fix: 0.
- Latest report: `test-results/workflow-compiler-bench/live-latest.md`.

Remaining V2 work:

- Add a dedicated Brave adapter only if/when a stable Brave capability exposes a page contract distinct from `browser_search`; generic read-only tool pagination now covers browser/search-style source collection through descriptor metadata.
- Expand recovery controls from existing checkpoint/resume and skip-item support into explicit page/item/chunk retry and skip UX.
- Build the remaining challenging deterministic/live tests: Scottsdale 100-source PDF, movie-night current data recommendation, Google meeting transcript action-item extraction across real files, Gmail 1,000 budget rejection/tiered plan, dedupe, long-field RLM routing, large-graph UX, and provider-degraded classification.

## Progress Update: 2026-05-16 Long-Field RLM Routing Slice

Completed:

- Added static validation that rejects a single `model.call` directly consuming large collection outputs when `long_context_process` is selected. The guard covers large `connector.map.items`, connector/tool pagination `items`, mapped/deduped collection `items`, and chunk collections.
- Added an actionable diagnostic, `model.long_context_preprocessor_required`, that directs Pi/compiler repair toward `long_context_process` preprocessing or `collection.chunk -> model.map -> model.reduce` instead of relying on generated model-input compaction.
- Kept generated `compactAmbientInputObject` as a last-resort fallback by preserving coverage for environments where `long_context_process` is not selected.
- Strengthened compiler prompt guidance so long-field enforcement is explicit in the stable IR contract.
- Added deterministic compiler coverage for:
  - Rejection of direct large connector fan-out into one `model.call` when `long_context_process` is available.
  - Last-resort model-input compaction when `long_context_process` is unavailable.
  - Existing explicit `long_context_process -> model.call` preprocessing.
- Added live dogfood and benchmark row `long-context-routing-live-compile`, requiring live Pi/GMI output to route long fixture transcript evidence through `long_context_process` before final schema shaping.

Validation completed:

- `pnpm -s exec tsc --noEmit`
- `pnpm -s exec vitest run src/main/workflowProgramCompiler.test.ts src/main/workflowProgramTypecheck.test.ts scripts/workflow-compiler-live-benchmark.test.mjs --reporter=dot`
- `pnpm -s exec vitest run src/main/workflowCompilerService.test.ts src/main/workflowProgramDryRun.test.ts src/main/workflowProgramCodegen.test.ts src/main/workflowProgramLowering.test.ts --reporter=dot`
- `bash scripts/test-node-native.sh src/main/workflowDogfood.test.ts -t "long-field connector workflow through long_context_process with live Ambient"` without live env, confirming the opt-in test remains skipped by default.
- GMI live smoke with the shared snapshot and selected benchmark task:
  `AMBIENT_PROVIDER=gmi-cloud GMI_CLOUD_API_KEY_FILE=<ignored key file> AMBIENT_E2E_USER_DATA=<shared snapshot>/userData AMBIENT_DESKTOP_WORKSPACE=<shared snapshot>/workspace node scripts/benchmark-workflow-compiler.mjs --live-only --live-task=long-context-routing-live-compile --live-retries=2 --live-concurrency=1 --live-timeout-ms=900000`

Live result:

- `long-context-routing-live-compile` passed on attempt 1.
- Provider health: healthy.
- Product/test failures: 0.
- Latest report: `test-results/workflow-compiler-bench/live-latest.md`.

Remaining V2 work:

- Add deeper deterministic/live Scottsdale 100-source PDF coverage at the larger target scale, using `collection.dedupe` as the source-quality gate.
- Build movie-night current-data recommendation and Google meeting transcript action-item extraction tests.
- Add large-graph UX grouping for page/item/chunk-heavy workflows.
- Keep provider-degraded live classification coverage current as GMI/Ambient provider health changes.

## Progress Update: 2026-05-16 Gmail 1,000 Budget Guard And Metadata-First Tiering Slice

Completed:

- Added a static single-workflow call ceiling diagnostic for inferred tool, model, and connector call budgets. The compiler now rejects IR that would exceed 1,000 static calls even when the IR omits explicit budgets.
- Added actionable oversized-budget diagnostics that name the largest contributing nodes and recommend a tiered plan, lower fan-out, metadata-first collection, or a follow-up detail batch.
- Updated compiler prompt guidance so 1,000-message Gmail categorization avoids same-run `readThread` fan-out and prefers a metadata-first tier: `connector.paginate -> collection.map -> collection.chunk -> model.map -> tree model.reduce`.
- Extended Gmail dry-run search fixtures beyond the old 300-result mock so deterministic dry-run can exercise a 1,000-message metadata workflow across 10 pages.
- Added deterministic compiler coverage for both sides of the Gmail 1,000 behavior:
  - Same-run 1,000 `readThread` fan-out is rejected with `budget.max_connector_calls_ceiling_exceeded`.
  - Metadata-first 1,000-message categorization compiles under the connector ceiling with Gmail search only, chunked model map, and tree reduce.
- Added live dogfood and benchmark row `gmail-1000-metadata-live-compile`, requiring live Pi/GMI output to produce the metadata-first plan without `readThread`.

Validation completed:

- `pnpm -s exec tsc --noEmit`
- `pnpm -s exec vitest run src/main/workflowProgramCompiler.test.ts src/main/workflowProgramDryRun.test.ts scripts/workflow-compiler-live-benchmark.test.mjs --reporter=dot`
- `pnpm -s exec vitest run src/main/workflowCompilerService.test.ts src/main/workflowCompilerPlanCoverage.test.ts src/main/workflowProgramTypecheck.test.ts src/main/workflowProgramCodegen.test.ts src/main/workflowProgramLowering.test.ts --reporter=dot`
- `bash scripts/test-node-native.sh src/main/workflowDogfood.test.ts -t "Gmail 1000-message metadata-first categorization workflow with live Ambient"` without live env, confirming the opt-in test remains skipped by default.
- GMI live smoke with the shared snapshot and selected benchmark task:
  `AMBIENT_PROVIDER=gmi-cloud GMI_CLOUD_API_KEY_FILE=<ignored key file> AMBIENT_E2E_USER_DATA=<shared snapshot>/userData AMBIENT_DESKTOP_WORKSPACE=<shared snapshot>/workspace node scripts/benchmark-workflow-compiler.mjs --live-only --live-task=gmail-1000-metadata-live-compile --live-retries=2 --live-concurrency=1 --live-timeout-ms=900000`

Live result:

- `gmail-1000-metadata-live-compile` passed on attempt 1.
- Provider health: healthy.
- Product/test failures: 0.
- Latest report: `test-results/workflow-compiler-bench/live-latest.md`.

Remaining V2 work:

- Add deeper deterministic/live Scottsdale 100-source PDF coverage at the larger target scale, using `collection.dedupe` as the source-quality gate.
- Build movie-night current-data recommendation and Google meeting transcript action-item extraction tests.
- Add long-field RLM routing tests and large-graph UX grouping for page/item/chunk-heavy workflows.
- Keep provider-degraded live classification coverage current as GMI/Ambient provider health changes.

## Progress Update: 2026-05-16 Collection Dedupe And Canonicalization Slice

Completed:

- Added first-class `collection.dedupe` IR, shared type, parser schema, normalization aliases (`collection.unique`, `dedupe`, `unique`), prompt guidance, graph labeling, known output paths, dependency inference, static capacity warnings, and lowering operation kind `runtime.collection_dedupe`.
- Added `workflow.dedupeCollection` runtime helper with checkpoint/resume support, deterministic first-item retention, exact-key dedupe, canonical URL dedupe, duplicate/truncation counts, and structured `collection.dedupe.*` events.
- Added URL canonicalization that normalizes protocol/host, drops hashes/default ports, removes common tracking parameters, sorts query parameters, and normalizes trailing slashes.
- Added generated-source, dry-run, and hardened VM loader support for `workflow.dedupeCollection`.
- Updated browser/search source-collection prompt guidance so live Pi/GMI plans insert `collection.dedupe` after broad multi-query source collection instead of relying only on pagination-level dedupe.
- Updated the browser-search live dogfood row to require `tool.paginate -> collection.dedupe -> collection.map -> collection.chunk -> model.map -> tree model.reduce -> document.render pdf`.

Validation completed:

- `pnpm -s exec tsc --noEmit`
- `pnpm -s exec vitest run src/main/workflowProgramIr.test.ts src/main/workflowProgramCodegen.test.ts src/main/workflowAgentRuntime.test.ts src/main/workflowProgramLoader.test.ts --reporter=dot`
- `pnpm -s exec vitest run src/main/workflowProgramCompiler.test.ts src/main/workflowProgramDryRun.test.ts src/main/workflowProgramTypecheck.test.ts src/main/workflowProgramLowering.test.ts --reporter=dot`
- `pnpm -s exec vitest run src/main/workflowCompiler.test.ts src/main/workflowCompilerService.test.ts src/main/workflowCompilerMetrics.test.ts src/main/workflowCompilerPlanCoverage.test.ts scripts/workflow-compiler-live-benchmark.test.mjs --reporter=dot`
- `git diff --check`
- GMI live smoke with the shared snapshot and selected benchmark task:
  `AMBIENT_PROVIDER=gmi-cloud GMI_CLOUD_API_KEY_FILE=<ignored key file> AMBIENT_E2E_USER_DATA=<shared snapshot>/userData AMBIENT_DESKTOP_WORKSPACE=<shared snapshot>/workspace node scripts/benchmark-workflow-compiler.mjs --live-only --live-task=browser-search-pagination-live-compile --live-retries=2 --live-concurrency=1 --live-timeout-ms=900000`

Live result:

- `browser-search-pagination-live-compile` passed on attempt 1 with the new required `collection.dedupe` path.
- Provider health: healthy.
- Product/test failures: 0.
- Latest report: `test-results/workflow-compiler-bench/live-latest.md`.

Remaining V2 work:

- Add deeper deterministic/live Scottsdale 100-source PDF coverage at the larger target scale, now using `collection.dedupe` as the source-quality gate.
- Build movie-night current-data recommendation and Google meeting transcript action-item extraction tests.
- Add Gmail 1,000 budget rejection or tiered-plan diagnostics.
- Add long-field RLM routing tests and large-graph UX grouping for page/item/chunk-heavy workflows.
- Keep provider-degraded live classification coverage current as GMI/Ambient provider health changes.

## Progress Update: 2026-05-16 Large-Collection Recovery Controls Slice

Completed:

- Added typed recovery target coordinates to workflow recovery context: `targetKind`, `targetIndex`, and `targetCheckpointKey`.
- Runtime pagination now emits targeted `collection.page.error` events with graph node, page key, page index, checkpoint key, and error detail.
- Runtime pagination checkpoints now persist `nextPageIndex`, so retry resumes at the failed page rather than inferring progress only from retained page count.
- `workflow.paginateTool` can skip an independent failed query page during recovery and continue with later page queries while marking results as partial/truncated.
- `workflow.paginateConnector` can continue with retained partial results when a cursor page is skipped and the next cursor cannot be known safely.
- `workflow.mapCollection` and shared batch/model-map execution now emit targeted item/chunk failure events before the terminal run failure.
- `workflow.mapModel` now preserves chunk/item recovery coordinates, so failed chunks can be retried from checkpoints or skipped with explicit partial-coverage events.
- Graph recovery labels now distinguish pages, chunks, and items: retry failed page, continue without failed page, retry failed chunk, skip failed chunk, retry failed item, and skip item.
- Generated graph retry policies now advertise checkpointed page retry, partial continuation, and failed item/chunk skip eligibility for collection primitives.

Validation completed:

- `pnpm -s exec tsc --noEmit`
- `pnpm -s exec vitest run src/main/workflowAgentRuntime.test.ts src/shared/workflowRetryEligibility.test.ts src/renderer/src/workflowAgentGraphUiModel.test.ts src/renderer/src/workflowRuntimeDecisionUiModel.test.ts --reporter=dot`
- `AMBIENT_TEST_NATIVE=1 bash scripts/test-node-native.sh src/main/workflowRecovery.test.ts`
- `pnpm -s exec vitest run src/main/workflowProgramCompiler.test.ts src/main/workflowProgramDryRun.test.ts src/main/workflowProgramLoader.test.ts src/main/workflowProgramCodegen.test.ts scripts/workflow-compiler-live-benchmark.test.mjs --reporter=dot`
- GMI live smoke with the shared snapshot and selected benchmark task:
  `AMBIENT_PROVIDER=gmi-cloud GMI_CLOUD_API_KEY_FILE=<ignored key file> AMBIENT_E2E_USER_DATA=<shared snapshot>/userData AMBIENT_DESKTOP_WORKSPACE=<shared snapshot>/workspace node scripts/benchmark-workflow-compiler.mjs --live-only --live-task=browser-search-pagination-live-compile --live-retries=2 --live-concurrency=1 --live-timeout-ms=900000`

Live result:

- `browser-search-pagination-live-compile` passed on attempt 1.
- Provider health: healthy.
- Product/test failures: 0.
- Latest report: `test-results/workflow-compiler-bench/live-latest.md`.

Remaining V2 work:

- Add a dedicated Brave adapter only if/when a stable Brave capability exposes a page contract distinct from `browser_search`; generic read-only tool pagination now covers browser/search-style source collection through descriptor metadata.
- Build the remaining challenging deterministic/live tests: Scottsdale 100-source PDF, movie-night current data recommendation, Google meeting transcript action-item extraction across real files, Gmail 1,000 budget rejection/tiered plan, dedupe, long-field RLM routing, large-graph UX, and provider-degraded classification.

## Progress Update: 2026-05-16 Tool Pagination Slice

Completed:

- Added first-class `tool.paginate` IR, shared type, parser schema, normalization aliases, static validation, type/dataflow support, graph labeling, manifest inference, tool-call budget inference, run-time inference, lowering operation kind `runtime.tool_paginate`, codegen, dry-run, and hardened VM loader support.
- Added descriptor-level tool pagination metadata and output schema for `browser_search`: root-array results, query fan-out through `query`, page-size injection through `maxResults`, default/max page size 10, and read-only side-effect enforcement.
- Added `workflow.paginateTool` runtime helper with bounded `maxItems`/`maxPages`, query fan-out, optional token propagation, page-size injection, root-array extraction, dedupe by item path, per-page events, checkpoints after every page, complete-checkpoint resume, and public paginated collection output.
- Updated compiler prompt guidance and selected tool metadata so Pi can choose `tool.paginate` for large browser/search source collection rather than inventing repeated `tool.call` loops.
- Added deterministic runtime/compiler tests covering browser_search query fan-out, root-array extraction, dedupe, budget inference, dry-run page aggregation, tree reduce/PDF composition, and rejection when multi-page non-cursor tool pagination omits `pageQueries`.
- Added live dogfood and benchmark row `browser-search-pagination-live-compile`, requiring live Pi/GMI output to compile a read-only browser_search source collection workflow with `tool.paginate -> collection.map -> collection.chunk -> model.map -> model.reduce strategy:"tree" -> document.render pdf`.

Validation completed:

- `pnpm -s exec tsc --noEmit`
- `pnpm -s exec vitest run src/main/workflowProgramLoader.test.ts src/main/workflowAgentRuntime.test.ts src/main/workflowProgramCompiler.test.ts scripts/workflow-compiler-live-benchmark.test.mjs --reporter=dot`
- GMI live smoke with the shared snapshot and selected benchmark task:
  `AMBIENT_PROVIDER=gmi-cloud GMI_CLOUD_API_KEY_FILE=<ignored key file> AMBIENT_E2E_USER_DATA=<shared snapshot>/userData AMBIENT_DESKTOP_WORKSPACE=<shared snapshot>/workspace node scripts/benchmark-workflow-compiler.mjs --live-only --live-task=browser-search-pagination-live-compile --live-retries=2 --live-concurrency=1 --live-timeout-ms=900000`

Live result:

- `browser-search-pagination-live-compile` passed on attempt 1; a final post-rebase rerun also passed on attempt 1.
- Provider health: healthy.
- Product/test failures: 0.
- Latest report: `test-results/workflow-compiler-bench/live-latest.md`.

Remaining V2 work:

- Add a dedicated Brave adapter only if/when a stable Brave capability exposes a page contract distinct from `browser_search`; the generic tool pagination path now covers read-only search tools that declare metadata.
- Expand recovery controls from existing checkpoint/resume and skip-item support into explicit page/item/chunk retry and skip UX.
- Build the remaining challenging deterministic/live tests: Scottsdale 100-source PDF at larger scale, movie-night current data recommendation, Google meeting transcript action-item extraction across real files, Gmail 1,000 budget rejection/tiered plan, dedupe/canonicalization, long-field RLM routing, large-graph UX, and provider-degraded classification.

## Progress Update: 2026-05-16 Tree Model Reduce Slice

Completed:

- Added first-class tree reduce controls to `model.reduce`: `strategy:"tree"`, `maxFanIn`, and `maxLevels`, including parser schema, normalization aliases, shared IR type, prompt guidance, graph labeling, and generated-source options.
- Implemented runtime tree reduction in `workflow.reduceModel` using deterministic fan-in levels, bounded concurrency, per-level/group/final progress events, checkpointed partial/final state, and final coverage metadata.
- Updated dry-run to execute the same tree shape, so generated workflows consume the inferred number of model calls during compile validation instead of pretending the reduce is one call.
- Updated static model-call budget inference and inferred max runtime estimates so tree reduce budgets reflect level/group calls.
- Added static validation that rejects a tree reduce whose `maxFanIn` and `maxLevels` cannot converge within the declared `maxInputItems`.
- Added fixture connector pagination metadata (`records`, `nextCursor`, `cursor`, `limit`) after live dogfood exposed that the descriptor lacked a stable page contract.
- Added deterministic runtime/compiler tests for tree reduction, budget inference, dry-run model call counts, graph policy labels, and invalid tree-depth rejection.
- Added live dogfood and benchmark row `tree-reduce-live-compile`, requiring live Pi/GMI output to compile a connector-paginated, chunked, model-mapped workflow with `model.reduce strategy:"tree"`.

Validation completed:

- `pnpm -s exec tsc --noEmit`
- `pnpm -s exec vitest run src/main/workflowAgentRuntime.test.ts src/main/workflowProgramCompiler.test.ts scripts/workflow-compiler-live-benchmark.test.mjs --reporter=dot`
- GMI live smoke with the shared snapshot and selected benchmark task:
  `AMBIENT_PROVIDER=gmi-cloud GMI_CLOUD_API_KEY_FILE=<ignored key file> AMBIENT_E2E_USER_DATA=<shared snapshot>/userData AMBIENT_DESKTOP_WORKSPACE=<shared snapshot>/workspace node scripts/benchmark-workflow-compiler.mjs --live-only --live-task=tree-reduce-live-compile --live-retries=2 --live-concurrency=1 --live-timeout-ms=900000`

Live result:

- First attempt surfaced a product/test contract gap: fixture pagination advertised only `cursorField`, so live Pi omitted `itemsPath` and dry-run looked for `items` instead of `records`.
- After adding descriptor-level fixture pagination paths, `tree-reduce-live-compile` passed on attempt 1; a final post-rebase rerun also passed on attempt 1.
- Provider health: healthy.
- Product failures after descriptor fix: 0.
- Latest report: `test-results/workflow-compiler-bench/live-latest.md`.

Remaining V2 work:

- Add a dedicated Brave adapter only if/when a stable Brave capability exposes a page contract distinct from `browser_search`; generic read-only tool pagination now covers browser/search-style source collection through descriptor metadata.
- Expand recovery controls from existing checkpoint/resume and skip-item support into explicit page/item/chunk retry and skip UX.
- Build the remaining challenging deterministic/live tests: Scottsdale 100-source PDF, movie-night current data recommendation, Google meeting transcript action-item extraction across real files, Gmail 1,000 budget rejection/tiered plan, dedupe, long-field RLM routing, large-graph UX, and provider-degraded classification.

## Progress Update: 2026-05-16 Scottsdale 100-Source PDF Challenge Slice

Completed:

- Promoted the compiler prompt's browser/search research example from a 30-result direct model-call pattern to the target large-collection pattern: `tool.paginate -> collection.dedupe -> collection.map -> collection.chunk -> model.map -> tree model.reduce -> document.render -> mutation.stage file_write`.
- Added deterministic compiler coverage for the Scottsdale deep-research challenge at the required scale:
  - 10 explicit browser_search page queries.
  - 100 source candidates with root-array `tool.paginate`.
  - URL canonicalization via `collection.dedupe`.
  - 10 deterministic chunks.
  - 10 chunk extraction model calls plus a 3-call tree reduce.
  - PDF rendering and staged `Documents/scottsdale-real-estate-research-report.pdf` output.
- Added live dogfood coverage requiring Pi/GMI to compile the same 100-source PDF workflow with staged local file output.
- Added benchmark row `scottsdale-100-source-pdf-live-compile` so this challenge can be run independently from the operator benchmark harness.
- Updated the older Gmail plan-coverage fixture that still sent 100 connector fan-out thread records into one `model.call`; it now uses `collection.chunk -> model.map -> model.reduce`, matching the current long-context policy.

Validation completed:

- `pnpm -s exec tsc --noEmit`
- `pnpm -s exec vitest run src/main/workflowProgramCompiler.test.ts src/main/workflowProgramDryRun.test.ts src/main/workflowProgramCodegen.test.ts src/main/workflowProgramLowering.test.ts scripts/workflow-compiler-live-benchmark.test.mjs --reporter=dot`
- `pnpm -s exec vitest run src/main/workflowCompilerPlanCoverage.test.ts src/main/workflowCompilerService.test.ts --reporter=dot`
- `bash scripts/test-node-native.sh src/main/workflowDogfood.test.ts -t "Scottsdale 100-source PDF workflow with live Ambient"` without live env, confirming the opt-in test remains skipped by default.
- GMI live smoke with the shared snapshot and selected benchmark task:
  `AMBIENT_PROVIDER=gmi-cloud GMI_CLOUD_API_KEY_FILE=<ignored key file> AMBIENT_E2E_USER_DATA=<shared snapshot>/userData AMBIENT_DESKTOP_WORKSPACE=<shared snapshot>/workspace node scripts/benchmark-workflow-compiler.mjs --live-only --live-task=scottsdale-100-source-pdf-live-compile --live-retries=2 --live-concurrency=1 --live-timeout-ms=900000`

Live result:

- `scottsdale-100-source-pdf-live-compile` passed on attempt 1.
- Provider health: healthy.
- Product/test failures: 0.
- Latest report: `test-results/workflow-compiler-bench/live-latest.md`.

Remaining V2 work:

- Build movie-night current-data recommendation coverage.
- Build Google meeting transcript action-item extraction across real files.
- Add large-graph UX grouping for page/item/chunk-heavy workflows.
- Keep provider-degraded live classification coverage current as GMI/Ambient provider health changes.

## Progress Update: 2026-05-16 Google Transcript Action-Item Slice

Completed:

- Added Drive `readFile` output schema fields for supported extracted/exported text aliases: `text`, `content`, `contentText`, and `truncated`.
- Added deterministic Drive `readFile` dry-run content so transcript-style workflows exercise real evidence flow instead of metadata-only placeholders.
- Strengthened compiler guidance for Google transcript action-item workflows:
  - Use Calendar `connector.paginate` with explicit `timeMin`, `timeMax`, and `timeZone`.
  - Use Drive `connector.paginate` for transcript-like files.
  - Use bounded Drive `connector.map readFile` for candidate transcript files.
  - Route transcript-sized evidence through `long_context_process`.
  - Feed only the long-context response and counts into the final `model.call`.
- Added deterministic compiler coverage for the full Google meeting transcript action-item workflow:
  - Calendar event pagination over the exact two-week window `2026-05-02T00:00:00-07:00` through `2026-05-16T23:59:59-07:00`.
  - Drive transcript search pagination.
  - Candidate transcript mapping capped at 40 files.
  - Drive `readFile` connector fan-out capped at 40 with concurrency 4.
  - `long_context_process` extraction over transcript reads plus Calendar provenance.
  - Final Ambient schema shaping for action items, decisions, unresolved questions, skipped meetings, and coverage.
- Added live dogfood coverage and benchmark row `google-transcript-action-items-live-compile`.

Validation completed:

- `pnpm -s exec tsc --noEmit`
- `pnpm -s exec vitest run src/main/workflowProgramCompiler.test.ts src/main/googleWorkspaceConnectors.test.ts src/main/workflowCompilerService.test.ts scripts/workflow-compiler-live-benchmark.test.mjs --reporter=dot`
- `pnpm -s exec vitest run src/main/workflowProgramCompiler.test.ts src/main/workflowDogfood.test.ts scripts/workflow-compiler-live-benchmark.test.mjs --reporter=dot`
- `bash scripts/test-node-native.sh src/main/workflowDogfood.test.ts -t "Google meeting transcript action-item extraction workflow with live Ambient"` without live env, confirming the opt-in test remains skipped by default.
- GMI live smoke with the shared snapshot and selected benchmark task:
  `AMBIENT_PROVIDER=gmi-cloud GMI_CLOUD_API_KEY_FILE=<ignored key file> AMBIENT_E2E_USER_DATA=<shared snapshot>/userData AMBIENT_DESKTOP_WORKSPACE=<shared snapshot>/workspace node scripts/benchmark-workflow-compiler.mjs --live-only --live-task=google-transcript-action-items-live-compile --live-retries=2 --live-concurrency=1 --live-timeout-ms=900000`

Live result:

- `google-transcript-action-items-live-compile` passed on attempt 1.
- Provider health: healthy.
- Product/test failures after assertion cleanup: 0.
- Latest report: `test-results/workflow-compiler-bench/live-latest.md`.

Remaining V2 work:

- Build movie-night current-data recommendation coverage.
- Add large-graph UX grouping for page/item/chunk-heavy workflows.
- Keep provider-degraded live classification coverage current as GMI/Ambient provider health changes.

## Progress Update: 2026-05-16 Movie-Night Current-Data Slice

Completed:

- Added compiler guidance for time-sensitive workflows so "today", "tonight", "current", schedules, showtimes, availability, and similar requests must collect read-only current evidence before Ambient synthesis.
- Added a dedicated movie-night recommendation pattern:
  - `tool.paginate` over `browser_search` for showtimes/currently playing movies, reviews/ratings, runtime/genre, and venue/travel friction.
  - URL canonical dedupe before downstream synthesis.
  - Source shaping and chunking before model fan-out.
  - `model.map` extraction for candidate options, evidence freshness, and travel notes.
  - `review.input` for the couple's preference profile before final recommendation.
  - Tree `model.reduce` for the final go/no-go recommendation, confidence, alternatives, tradeoffs, and freshness.
- Added deterministic compiler coverage for a Scottsdale, Arizona movie-night workflow on `2026-05-16` in `America/Phoenix`, capped at 40 source candidates and 5 model calls.
- Added live dogfood coverage requiring Pi/GMI to compile the same current-data workflow using the selected Ambient Desktop model instead of asking the user to choose an unrelated cloud/local LLM.
- Added benchmark row `movie-night-current-data-live-compile` so this challenge can be run independently from the operator benchmark harness.

Validation completed:

- `pnpm -s exec tsc --noEmit`
- `pnpm -s exec vitest run src/main/workflowProgramCompiler.test.ts -t "current-data movie-night" --reporter=dot`
- `pnpm -s exec vitest run scripts/workflow-compiler-live-benchmark.test.mjs --reporter=dot`
- `bash scripts/test-node-native.sh src/main/workflowDogfood.test.ts -t "movie-night current-data recommendation workflow with live Ambient"` without live env, confirming the opt-in test remains skipped by default.
- GMI live smoke with the shared snapshot and selected benchmark task:
  `AMBIENT_PROVIDER=gmi-cloud GMI_CLOUD_API_KEY_FILE=<ignored key file> AMBIENT_E2E_USER_DATA=<shared snapshot>/userData AMBIENT_DESKTOP_WORKSPACE=<shared snapshot>/workspace node scripts/benchmark-workflow-compiler.mjs --live-only --live-task=movie-night-current-data-live-compile --live-retries=2 --live-concurrency=1 --live-timeout-ms=900000`

Live result:

- `movie-night-current-data-live-compile` passed on attempt 1.
- Provider health: healthy.
- Product/test failures: 0.
- Latest report: `test-results/workflow-compiler-bench/live-latest.md`.

Remaining V2 work:

- Add end-to-end execution dogfood for the major challenge workflows; current live rows are primarily live compiler smoke tests.
- Add product-quality gates for final artifacts, evidence provenance/freshness, skipped/partial coverage, and unintended mutation checks.
- Add performance/scale benchmarks that separate compiler cost, runtime/tool cost, provider wait, and graph/UI cost.
- Add large-graph UX grouping for page/item/chunk-heavy workflows.
- Keep provider-degraded live classification coverage current as GMI/Ambient provider health changes.
