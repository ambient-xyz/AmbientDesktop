# Fix Workflow Compiler Implementation Plan

## Problem

The current workflow compiler asks Pi to produce executable TypeScript source blocks. Even after splitting generation into components, Pi is still acting as a code generator and repair loop. This causes expensive failures:

- Pi can generate syntactically plausible but contract-invalid code.
- Validation failures require regenerating component source blocks or whole artifacts.
- Prompt context is repeated across component calls.
- Compile does not behave like a compiler: there is no typed intermediate representation, no deterministic lowering, and no sandbox dry-run before preview persistence.
- Parallel component rendering helps wall-clock only when the generated component graph exposes real independent branches; it does not fix invalid source generation.

The target fix is to make Pi produce a typed workflow program IR and make Ambient Desktop compile it deterministically.

## Goals

- Make the workflow IR, not generated TypeScript, the source of truth.
- Use deterministic compiler passes for validation, typechecking, grants, budgets, and code generation.
- Replace source regeneration repair with JSON Patch repair against IR.
- Add sandbox dry-run validation with mocked workflow/tools/ambient/connectors before preview persistence.
- Preserve graph-first UX and source mappings.
- Preserve progressive discovery and checkpoint/prefix-cache behavior.
- Cover first-party workflow tools currently available in the checkpoint build, including Google Workspace read-only paths.

## Non-Goals

- Do not let Pi run arbitrary code during compile.
- Do not use Google write APIs in tests.
- Do not remove the existing TypeScript compiler path until the IR path is live-tested.
- Do not introduce compatibility shims for old workflow artifacts unless required by stored local data.

## Progress Update (May 16, 2026)

Overall status: the highest-impact slice is substantially implemented. New compiler work now has an IR-first path with deterministic schema validation, normalization, capability resolution, grant inference, budget checks, dependency-level typechecking, byte-stable lowering, bounded runtime parallel source generation, sandbox dry-run, and bounded JSON Patch repair. IR parsing/schema/normalization now lives in a dedicated IR module, capability validation and manifest grant inference live in a dedicated resolver module, DAG/dataflow/budget/schema validation lives in a dedicated typecheck module, operation-plan lowering now lives in a dedicated lowering module, source generation now lives in a dedicated codegen module, and sandbox dry-run now lives in a dedicated runner module. Live Ambient/Pi dogfoods for Pi transport, browser QA compile, graph-first review, canonical Scottsdale compile, real managed-browser intervention, external managed-browser, Google Calendar read-only, and Google Drive read-only all passed through the live/provider-inclusive benchmark harness on May 16, 2026. The browser-intervention slice now adds a first-class IR node for conditional browser user-action handoff, same-session retry, and chained skip guards; fake-browser, real managed-browser, and external managed-browser dogfood providers now return WorkflowProgramIR, and the unreachable legacy generated-source literals for those providers have been deleted. WorkflowProgramIR artifacts now carry source provenance, treat the generated program as immutable audit output, reject direct source edits/revision proposals, and label diagnostics/review UI as IR-first program artifacts. The compiler now progressively selects compact first-party tool and connector capability surfaces before final IR planning, including connector operation subsets and browser companion tools. The original 12 required workflow compiler cases and the later local/Gmail/vision expansion cases now run in deterministic/mock mode through `src/main/workflowCompilerPlanCoverage.test.ts`.

Completed:

- [x] Added `WorkflowProgramIR` schema/types and deterministic compiler entry point.
- [x] Added source generation from validated IR for supported first-party nodes.
- [x] Added sandbox dry-run with mocked workflow/tool/Ambient behavior.
- [x] Added JSON Patch repair loop instead of source-block regeneration.
- [x] Added dataflow reference/path validation and cycle/dependency diagnostics.
- [x] Added workspace mutation staging for write-like tools.
- [x] Added Ambient CLI grant inference and missing environment diagnostics.
- [x] Added review and approval IR nodes.
- [x] Added static call budget validation and budget inference.
- [x] Added `connector.call` schema, connector capability validation, grant inference, source generation, graph mapping, dry-run mocks, and service prompt/repair prompt support.
- [x] Added workflow compiler phase timing metrics, deterministic benchmark fixtures, JSON/Markdown benchmark report generation, and `scripts/benchmark-workflow-compiler.mjs`.
- [x] Added opt-in live/provider-inclusive benchmark rows with per-attempt logs, bounded retries, provider-health classification, and native-test exclusive grouping.
- [x] Added phase-aware failed compile reports for WorkflowProgramIR errors, including failed compiler phase, diagnostic code, node id, repair attempt count, and per-phase timings in the compile activity UI.
- [x] Added deterministic `branch.if`, `loop.map`, and `error.handle` IR node support with schema/types, prompt guidance, graph lowering, generated source, sandbox dry-run, scoped loop item references, and focused compiler tests.
- [x] Added dependency-level incremental IR validation/cache with concurrency capped at 4 and compile activity metrics.
- [x] Added bounded runtime parallel code generation for safe independent DAG branches, capped at 4 concurrent branch nodes.
- [x] Hardened sandbox dry-run node attribution under parallel generated source with async-local node context.
- [x] Added complete generated-source mapping metadata for ordinary output assignments, workflow checkpoints, and output-ready emits so every generated IR graph node can be traced back to source ranges.
- [x] Added byte-stable lowered operation plans, persisted `lowered-plan.json` artifacts, and node/dependency-hash lowering cache metrics.
- [x] Disabled legacy TypeScript/source-block compiler routing for new workflow compiles; `compileWorkflowArtifact` now requires a `WorkflowProgramIR` provider.
- [x] Deleted the obsolete one-shot/component source-block compile service paths, provider methods, prompt builders, source-block repair prompts, and source-block unit tests.
- [x] Added workflow artifact source provenance for IR-generated artifacts and blocked direct generated-program source edits through dashboard and native revision tools.
- [x] Updated compiler, review, graph-node, and artifact-panel diagnostics to present IR-generated workflow programs as audit artifacts rather than editable source of truth.
- [x] Added a versioned `compile-context.json` schema and fail-closed WorkflowProgramIR artifact revalidation for missing or malformed compile context provenance.
- [x] Moved provider retry, transient retry, parse retry, and no-output-thinking watchdog behavior onto the WorkflowProgramIR JSON transport.
- [x] Migrated the native fixed-prompt browser QA, Scottsdale, and debug-rewrite dogfood fixtures to WorkflowProgramIR.
- [x] Added deterministic `output.final` emission of `workflow.output.ready` events so IR-generated workflows produce the same output-card surface as the old hand-written workflow source.
- [x] Upgraded sandbox dry-run model mocks to synthesize declared output-contract fields, so downstream IR nodes can validate references to model-produced `content`, `html`, `artifactPath`, arrays, counts, and summaries.
- [x] Migrated additional fixed-source dogfood fixtures to WorkflowProgramIR: local-file report, browser research, artifact-backed classification review, staged mutation review, plugin MCP summary, exploration-driven summary, retention trace, and Calendar brief.
- [x] Added first-class `browser.intervention` IR lowering for `browser_search`, `browser_nav`, `browser_content`, and `browser_login`, including deterministic manifest/grant inference, graph mapping, dataflow validation, dry-run support, a pre-prompt resume checkpoint, typed `workflow.askUser` handoff, same-session `userActionId` retry for search/nav/content, no-refill login verification handoff for `browser_login`, skip handling, and optional screenshot capture.
- [x] Migrated the fake-browser user-intervention pause/resume dogfood fixture to WorkflowProgramIR and added it to the native migrated-fixture smoke batch.
- [x] Added `browser.intervention.skipIf` so chained browser reads can deterministically avoid later browser calls after an earlier browser intervention is skipped.
- [x] Migrated the real managed-browser and external managed-browser dogfood providers to return WorkflowProgramIR and added both to the native migrated-fixture smoke batch.
- [x] Deleted the unreachable legacy generated-source literals behind the real managed-browser and external managed-browser IR providers.
- [x] Added deterministic/mock coverage for all 12 required workflow compiler scenarios, including explicit browser_content, browser_screenshot QA, CSV transform/write, Ambient CLI search/describe/run, missing-secret blocking, Google Drive/Calendar read-only calls, and Google Docs local materialization.
- [x] Extracted workflow capability validation and manifest grant inference into `src/main/workflowProgramCapabilityResolver.ts`, keeping the compiler focused on IR normalization, validation orchestration, lowering, codegen, and dry-run.
- [x] Validated the capability resolver extraction with `pnpm run typecheck`, focused resolver/compiler Vitest suites, workflow compiler benchmark generation, and native migrated dogfood fixture smoke tests.
- [x] Extracted DAG, dataflow, static input-schema, budget, and incremental node-validation cache checks into `src/main/workflowProgramTypecheck.ts`, giving the compiler a real typecheck pass boundary.
- [x] Extracted byte-stable operation-plan lowering and lowering cache behavior into `src/main/workflowProgramLowering.ts`, keeping lowering independent from codegen and dry-run orchestration.
- [x] Extracted deterministic source generation and runtime parallel grouping into `src/main/workflowProgramCodegen.ts`, keeping codegen independent from compiler orchestration and sandbox dry-run.
- [x] Extracted sandbox dry-run execution, mocked workflow/tool/Ambient/connector behavior, and structured dry-run diagnostics into `src/main/workflowProgramDryRun.ts`.
- [x] Extracted IR schema parsing, Pi-friendly input alias normalization, mutation-tool staging normalization, stable edge defaults, and parse diagnostics into `src/main/workflowProgramIr.ts`.
- [x] Added generated and runtime `model.call` output-contract enforcement so malformed top-level keys, including tokenizer-artifact variants such as `" summary "`, fail schema validation instead of being checkpointed as successful workflow output.
- [x] Split runtime Ambient retry accounting so transient provider failures do not consume structured-output repair attempts; retries now include explicit schema feedback telling Ambient to match output-contract keys exactly.
- [x] Routed workflow workspace artifact paths into managed-browser intervention screenshots so user-action cards can render workspace-relative screenshot evidence.
- [x] Added progressive connector capability selection for the IR compiler prompt and repair prompt, including exact `requiredConnectorIds`, graph/exploration hints, connector limits, operation subset limits, and selected connector metrics/audit input.
- [x] Added companion first-party tool selection so browser source workflows keep `browser_screenshot` available when browser navigation/content/search tools are selected.
- [x] Added secret-aware Ambient CLI companion selection so cloud-backed CLI workflows keep `ambient_cli_search`, `ambient_cli_describe`, `ambient_cli_secret_request`, and `ambient_cli_env_bind` available without dumping unrelated tool descriptors into the compiler prompt.
- [x] Hardened WorkflowProgramIR repair retries so malformed patch response shapes and deterministic patch-application failures are retried with explicit schema/application feedback instead of falling through as terminal compile failures.
- [x] Hardened Ambient CLI missing-env setup IR: `ambient_cli_secret_request` and `ambient_cli_env_bind` now fail closed unless they target selected package metadata with declared missing env requirements; env bindings must be approval-bound `mutation.stage` nodes with workspace-relative secret file paths.
- [x] Expanded Pi-friendly WorkflowProgramIR normalization for common nested planner wrappers and node-array aliases such as `workflowProgramIR`, `workflowPlan`, `workflowSteps`, `tasks`, `actions`, `components`, and `stages`.
- [x] Hardened sandbox dry-run model mocks to respect JSON-schema-style array/object hints and common shortlist/list/picks/candidates field names.
- [x] Updated live workflow compiler dogfood tests and benchmark classification to use the active Ambient-compatible provider contract, including GMI Cloud key-file, base URL, and model overrides, instead of hard-coded Ambient-only environment variables.
- [x] Validated with `pnpm run typecheck`, focused Vitest suites, native service tests, live Ambient/Pi transport smoke test, and live workflow compiler dogfoods.

Partially complete:

- [x] Google read-only compiler coverage now includes status/search/call/materialization flows, catalog-backed method metadata grants, account provenance, source/manifest grant enforcement, and timezone/date policy checks.
- [x] Browser intervention now has a first-class `browser.intervention` IR node for CAPTCHA/login/MFA/consent branching and guarded same-session resume behavior. The remaining browser-intervention work is fixture migration and real managed-browser coverage, not the core compiler primitive.
- [x] Ambient CLI exact package/command grants are inferred; `ambient_cli` requires matching `ambient_cli_describe`, and `ambient_cli_describe` now requires either selected compiler capability metadata or a dependency on `ambient_cli_search`.
- [x] Phase timing metrics, benchmark reports, failed-compile UI reports, and live/provider-inclusive benchmark rows are implemented.
- [x] Live Ambient validation has been rerun through the benchmark harness; all 8 live rows passed with provider health classified as healthy. Follow-up live testing found malformed model-output keys in Google read-only dogfoods, leaked tokenizer artifacts in managed-browser model output, and missing screenshot artifact paths in managed-browser intervention cards; all are now covered by runtime/compiler validation tests.
- [x] May 16 live runtime rerun passed 4/4 rows after the latest hardening: real managed-browser, external managed-browser, Google Calendar read-only, and Google Drive read-only. The external managed-browser row classified two pre-output stream stalls as provider-degraded, retried, and passed on attempt 3.
- [x] Added first-class `browser_login` support to `browser.intervention`, browser-login companion capability selection, late-bound first-party descriptor resolution for tools referenced by returned IR, and a connector-approval decision hook for live read-only Google dogfoods.
- [x] May 16 final full live benchmark after this slice completed with 8/9 rows passed and 0 product/test failures. Pi transport, browser QA compile, graph-first review, Scottsdale compile, browser intervention recovery, real managed-browser, external managed-browser, and Google Calendar read-only all passed. Google Drive read-only remained provider-degraded/inconclusive after a bounded live provider-backed test timeout; no deterministic compiler/runtime failure was observed.
- [x] Added opt-in elapsed absolute-timeout enforcement for workflow Ambient runtime calls and wired Google Workspace live dogfoods to a bounded per-provider-request timeout, with timeout metadata captured in dogfood artifacts. This prevents provider-backed Drive/Calendar/Gmail live tests from being killed by Vitest before the workflow runtime can write structured failure evidence.
- [x] Fixed the workflow VM loader to pump VM microtasks after exported async runs and async workflow callbacks that complete without calling a host primitive. Live Drive dogfood exposed this as a deterministic runtime hang immediately after `step.start` for an `error.handle` normalization node; focused loader tests now cover the pure-VM async run and callback cases while preserving the thenable-getter isolation guard.
- [x] May 16 live rerun after the VM-loader fix attempted all 9 provider-inclusive rows with bounded retries. Browser QA, graph-first review, Scottsdale compile, external managed-browser, Google Calendar read-only, and Google Drive read-only passed; Pi transport and real managed-browser were provider-degraded by Ambient 429/stream-idle failures; the browser-intervention row was rerun after log hardening and passed on the next targeted run.
- [x] May 16 full live compiler benchmark passed 8/8 rows after progressive capability selection and repair hardening. The final post-rebase run classified five Pi transport 429s and six graph-first 429s as provider-degraded, retried them within the bounded retry budget, and then passed all rows.
- [x] May 16 compile-context provenance validation slice passed deterministic gates and attempted all 9 provider-inclusive live rows in immutable report `2026-05-16T07-23-14.927Z`: 8 passed, 1 provider-degraded Google Calendar read-only row after five Ambient 429 rate-limit attempts, 0 skipped/environment rows, and 0 product/test failures. Google Drive read-only passed on the first attempt.
- [x] May 16 Ambient CLI secret-setup hardening slice passed deterministic gates and attempted all 9 provider-inclusive live rows in immutable report `2026-05-16T07-46-15.034Z`: 9 passed, 0 provider-degraded terminal rows, 0 skipped/environment rows, and 0 product/test failures. Google Calendar recovered from four Ambient 429 attempts and passed on attempt 5.
- [x] May 16 post-rebase live rerun for the Ambient CLI secret-setup hardening slice attempted all 9 provider-inclusive rows in immutable report `2026-05-16T08-00-02.491Z`: 8 passed, 1 provider-degraded Scottsdale row after five Ambient 429 rate-limit attempts, 0 skipped/environment rows, and 0 product/test failures. Browser intervention recovered from two Ambient 429 attempts and passed on attempt 3; Calendar and Drive read-only both passed on the first attempt.
- [x] May 16 GMI Cloud override hardening slice passed deterministic gates and targeted provider-inclusive live rows against the shared-secrets snapshot: Pi transport passed in immutable report `2026-05-16T10-02-17.276Z`, and browser QA live compile passed in immutable report `2026-05-16T10-02-52.836Z`, both on first attempt.
- [x] May 16 local filesystem workflow hardening slice added first-class `local_directory_list` and `local_file_read` compiler/runtime tools for user-approved non-workspace folders such as `~/Downloads`, plus deterministic coverage that compiles a Downloads classification workflow without routing through Google Drive or raw shell. Targeted GMI Cloud snapshot live smoke passed Pi transport and browser QA compile in immutable report `2026-05-16T10-21-37.389Z`, both on first attempt.
- [x] May 16 local filesystem live dogfood slice added a native fixed-provider local directory classification run, a provider-inclusive `local-downloads-live-compile-run` benchmark row, and a GMI Cloud snapshot live compile/run for a temporary Downloads fixture. Targeted immutable report `2026-05-16T10-37-15.525Z` passed on the first attempt with provider health classified as healthy.
- [x] May 16 model-role discovery hardening now treats Ambient Desktop's selected model as the default model-call provider through `model.call` / `ambient.responses`. Discovery prompts tell Pi not to ask for generic cloud/local LLM choices or API-key grants unless the user explicitly asks to configure an external model provider, and provider output normalization replaces that exact bad question shape with the canonical model-role question.
- [x] May 16 Gmail workflow hardening added read-only Gmail categorization coverage, a provider-inclusive `google-gmail-read-live` benchmark row, Gmail connector output schemas, account defaulting for single-account connectors, descriptor-authoritative connector output validation, Gmail search thread synthesis from message results, bounded Gmail readThread summaries, invalid-JSON provider retry classification, and per-item `connector.map` error collection so one unavailable Google item does not fail the whole workflow.
- [x] May 16 dataflow scheduling hardening now injects implicit `dependsOn` edges from `{ fromNode }` references before lowering/codegen, so Pi does not have to duplicate dataflow references in explicit dependency arrays for correct execution ordering.
- [x] May 16 Downloads image categorization coverage added a deterministic "categorize 10 images from my Downloads directory" case. Capability selection now prefers local filesystem inventory plus MiniCPM visual analysis (`ambient_visual_analyze`) rather than Drive or raw shell for local image categorization requests.
- [x] May 16 Downloads image live dogfood hardening added bounded `loop.map` tool fan-out for nested first-party tool calls, manifest/tool-budget accounting for nested fan-out tools, generated-source parse protection for object-valued maps, MiniCPM visual tool bridge coverage, and explicit compiler prompt guidance that image categorization must use `ambient_visual_analyze` before Ambient model synthesis. Targeted GMI Cloud snapshot live report `2026-05-16T12-54-05.757Z` passed on the first attempt with provider health classified as healthy: 1 local directory inventory call, 10 MiniCPM visual-analysis calls, and 1 Ambient categorization model call.
- [x] May 16 targeted Gmail live benchmark against the GMI Cloud snapshot ended provider-degraded/inconclusive in immutable report `2026-05-16T12-05-42.836Z`: 4/4 attempts were stream-idle provider degradation, with 0 product/test failures after the deterministic Gmail/compiler fixes above. Earlier live iterations exposed and drove fixes for connector output contracts, account binding, connector fan-out budgets, message-only Gmail search normalization, huge Gmail model-input payloads, invalid JSON retry classification, and per-item connector fan-out resilience.
- [x] May 16 workflow long-context hardening exposed `long_context_process` as a first-party workflow-capable read-only tool, added compiler guidance to insert it before `model.call` for large/deep connector evidence, and added generated-source model-input compaction as a fallback safety boundary. Full connector/tool outputs remain available in workflow state, checkpoints, and audit outputs; only model-call inputs are bounded. Targeted GMI Cloud Gmail live report `2026-05-16T18-37-06.546Z` remained provider-degraded after 2 stream-idle attempts, with 0 product/test failures.

Remaining major gaps:

- [x] Parallel incremental IR validation/cache by dependency level.
- [x] Lowered operation plan artifact/cache for deterministic downstream reuse.
- [x] Finish live validation of the latest real managed-browser and external managed-browser IR dogfoods. Scheduled local timeout recovery, Drive dynamic search/read-file selection, fake-browser intervention recovery, real managed-browser intervention, and external managed-browser source flows are now IR-migrated.
- [x] Add typed local filesystem directory inventory/read support for explicit user folders outside the active workspace, with permission prompts, dry-run mocks, source validation, and compiler capability selection.
- [x] Add typed MiniCPM image-categorization workflow support for explicit local image folders, including bounded visual-analysis fan-out and provider-inclusive live validation.

## Target Architecture

### 1. Pi Produces Workflow Program IR

Pi returns JSON matching a `WorkflowProgramIR` schema. It describes intent and operations, not JavaScript.

Example:

```json
{
  "version": 1,
  "title": "Scottsdale Music Report",
  "goal": "Find upcoming folk music performances and write a report.",
  "inputs": [],
  "nodes": [
    {
      "id": "search-web",
      "kind": "tool.call",
      "tool": "browser_search",
      "args": { "query": "Scottsdale upcoming folk music performances", "maxResults": 8 },
      "output": { "type": "browserSearchResults" }
    },
    {
      "id": "write-report",
      "kind": "tool.call",
      "tool": "file_write",
      "dependsOn": ["search-web"],
      "args": {
        "path": "reports/scottsdale-music.md",
        "contentFrom": { "node": "render-report", "path": "markdown" }
      },
      "output": { "type": "fileWriteResult" }
    }
  ],
  "edges": [
    { "source": "search-web", "target": "write-report", "type": "data_flow" }
  ],
  "budgets": {
    "maxToolCalls": 6,
    "maxModelCalls": 1,
    "maxConnectorCalls": 0,
    "maxRunMs": 120000
  }
}
```

### 2. Compiler Passes

Implement deterministic compiler passes in order:

1. **Parse and schema validate**: validate the raw IR with Zod.
2. **Normalize**: assign missing labels, normalize node ids, sort stable arrays.
3. **Resolve capabilities**: map `tool.call`, `connector.call`, and `model.call` nodes to known descriptors.
4. **Build dependency DAG**: validate acyclic dependencies and reachable outputs.
5. **Typecheck dataflow**: ensure `args` references read outputs that exist and satisfy expected input types.
6. **Grant inference**: infer manifest tools/connectors/Google method grants/Ambient CLI grants from IR.
7. **Policy validation**: enforce read/write/mutation policy, Google read-only test constraints, secret handling, browser intervention handling, and approval gates.
8. **Budget validation**: compute max tool/model/connector calls and reject impossible budgets.
9. **Lower to runtime plan**: convert high-level nodes to runtime operations.
10. **Generate source or interpret**: initially generate `main.ts`; later consider direct IR interpreter.
11. **Sandbox dry-run**: load generated JS/TS in a restricted runner with mocked tools.
12. **Persist artifact**: write manifest/spec/source/graph/compile context only after all validations pass.

### 3. JSON Patch Repair

On failure, Pi receives only:

- the current IR,
- structured diagnostics,
- allowed patch operations,
- the relevant schema excerpt,
- selected capability metadata for the failing node.

Pi returns RFC 6902-style JSON Patch:

```json
[
  {
    "op": "add",
    "path": "/nodes/2/output/schema",
    "value": { "summary": "string", "risks": "array" }
  }
]
```

The compiler applies patches, reruns passes, and stops after a small bounded retry limit. Pi should not return regenerated source or a regenerated full artifact in the normal path.

### 4. Deterministic Lowering and Codegen

Generate code from validated IR using local templates:

- `tool.call` lowers to `workflow.step(... tools.toolName(args) ...)`.
- `model.call` lowers to `ambient.call({ task, nodeId, input: { ...data, outputContract }, schema, retry })`.
- `checkpoint.write` lowers to `workflow.checkpoint`.
- `review.input` lowers to `workflow.askUser`.
- `approval.required` lowers to `workflow.requireApproval`.
- `mutation.stage` lowers to `workflow.stageMutation`.
- `connector.call` lowers to `connectors.call`.

Pi never has to remember exact JavaScript call shape for `ambient.call`, Google tool wrappers, file reads, browser intervention handling, or checkpoint syntax.

### 5. Sandbox Dry-Run

Before preview persistence:

- Compile generated source to executable JS.
- Load it in a restricted VM-like module runner.
- Provide mocked `workflow`, `tools`, `ambient`, and `connectors`.
- Execute with dry-run semantics.
- Capture exact diagnostics:
  - missing tool names,
  - invalid argument shape,
  - missing output references,
  - unawaited promise-like calls where detectable,
  - forbidden global access,
  - runtime exceptions,
  - incorrect `ambient.call` payload shape.

The dry-run should not perform real network, filesystem, Google, shell, or browser operations. It should validate structure and mocked call flow only.

## Proposed IR Node Kinds

- [x] `tool.call` - implemented for first-party workflow tools currently covered by the IR compiler.
- [x] `model.call` - implemented with deterministic `ambient.call` payload generation.
- [x] `connector.call` - implemented for selected workflow connectors with inferred manifest grants.
- [x] `connector.map` - implemented for bounded parallel connector fan-out over prior-node arrays.
- [x] `checkpoint.write` - implemented.
- [x] `review.input` - implemented.
- [x] `approval.required` - implemented.
- [x] `mutation.stage` - implemented for workspace-writing and materialization operations.
- [x] `branch.if` - implemented for deterministic conditional value selection.
- [x] `loop.map` - implemented for deterministic bounded item mapping and bounded nested tool-call fan-out with scoped `{ "fromItem": ... }` references.
- [x] `transform.template` - implemented.
- [x] `output.final` - implemented.
- [x] `error.handle` - implemented for deterministic value-level fallback handling.

## Tool Coverage In Scope

The checkpoint build currently includes these workflow-relevant tools that the IR/compiler must understand:

- `bash`
- `file_read`
- `file_write`
- `browser_search`
- `browser_nav`
- `browser_content`
- `browser_eval`
- `browser_keypress`
- `browser_login`
- `browser_screenshot`
- `browser_pick`
- `ambient_cli_search`
- `ambient_cli_describe`
- `ambient_cli`
- `local_directory_list`
- `local_file_read`
- `ambient_visual_minicpm_setup`
- `ambient_visual_analyze`
- `google_workspace_status`
- `google_workspace_search_methods`
- `google_workspace_call`
- `google_workspace_materialize_file`

Google test coverage must use read-only Google API methods only. `google_workspace_materialize_file` may be tested only as a local materialization of a read-only Google file handle; it must not mutate Google Workspace state.

## Implementation Phases

### Phase 1: Define WorkflowProgramIR - Substantially Complete

Progress:

- [x] Added shared IR schema/types and Zod validation.
- [x] Added supported operation schemas for first-party tool/model/checkpoint/review/approval/mutation/transform/output nodes.
- [x] Added common data reference forms and deterministic normalization.
- [x] Added structured diagnostics for invalid node kinds, bad ids, missing dependencies, malformed references, and unsupported aliases.
- [x] Added `connector.call` schema and common planner aliases.
- [x] Added schemas and common aliases for `branch.if`, `loop.map`, and `error.handle`.
- [x] Extended `loop.map` with optional `maxConcurrency` and nested `tool.call` map expressions for bounded first-party tool fan-out.
- [x] Split IR parsing/schema/normalization into the originally proposed dedicated `workflowProgramIr.ts` main module.
- [x] Add schemas for `branch.if`, `loop.map`, and `error.handle`.

Files:

- `src/shared/workflowProgramIr.ts`
- `src/main/workflowProgramIr.ts`
- `src/main/workflowProgramCompiler.test.ts`

Work:

- Add Zod schemas and TypeScript types.
- Add operation schemas for first-party tools.
- Add common data reference syntax:
  - `{ "literal": value }`
  - `{ "fromNode": "node-id", "path": "field.path" }`
  - `{ "template": "Report: {{node.field}}", "vars": { ... } }`
- Add stable JSON normalization for deterministic snapshots.

Acceptance:

- Invalid node kinds, bad ids, missing dependencies, and malformed references produce structured diagnostics.

### Phase 2: Capability and Grant Resolution - Complete For Deterministic Compiler Path

Progress:

- [x] Resolve supported `tool.call` nodes against the known first-party workflow tool registry.
- [x] Infer manifest tools from validated IR.
- [x] Infer manifest tools and tool-call budgets from nested `loop.map` tool fan-out.
- [x] Infer Ambient CLI grants from declared package/command/capability.
- [x] Enforce Ambient CLI progressive discovery: describe nodes must be grounded by selected capability metadata or depend on a prior `ambient_cli_search`, and execution must depend on a matching describe node.
- [x] Reject unavailable tools and unsupported tool aliases.
- [x] Reject write-like Google Workspace methods in read-only paths.
- [x] Enforce Google read-only payload, account hint, Calendar time-range/timezone, and read-only method-search policy checks.
- [x] Infer connector grants for `connector.call`.
- [x] Reject unavailable connectors, unavailable connector operations, missing required idempotency keys, and invalid connector accounts.
- [x] Infer richer Google Workspace method grants from selected method metadata, including exact method id, account provenance, service/resource/method shape, HTTP method/path, least-privilege read scopes, side-effect class, retention policy, dry-run support, catalog version, Calendar time-range requirements, and file-materialization capability.
- [x] Surface Google Workspace method grant additions, removals, and changes in workflow graph manifest diffs.
- [x] Move capability resolution into the originally proposed dedicated resolver module.

Files:

- `src/main/workflowProgramCapabilityResolver.ts`
- `src/main/workflowProgramCapabilityResolver.test.ts`

Work:

- Resolve each `tool.call` to `DesktopToolDescriptor`.
- Infer manifest `tools`.
- Infer connector grants.
- Infer Ambient CLI grants from declared package/command/capability.
- Infer Google Workspace read grants from selected method metadata.
- Reject undeclared or unavailable tools.
- Enforce Google write-method rejection when test mode requires read-only.

Acceptance:

- IR can produce a complete manifest without Pi writing manifest JSON manually.

### Phase 3: DAG and Typechecking - Complete For Deterministic Compiler Path

Progress:

- [x] Validate acyclic graph dependencies.
- [x] Validate all `fromNode` references and common path availability.
- [x] Reject primitive values where data references are required.
- [x] Validate node output contracts for supported nodes.
- [x] Validate static tool/model/connector call budgets and infer missing static budget caps.
- [x] Validate nested `loop.map` tool-call availability, safe side-effect class, input references, and bounded static tool-call budgets.
- [x] Route write-like operations through `mutation.stage`.
- [x] Add `connector.call` input/dataflow validation and output-path validation when an output schema is declared.
- [x] Enforce browser intervention policy for nonblocking user-action states, login handoffs, and guarded resume ids.
- [x] Enforce richer Google account/date/timezone policy constraints.
- [x] Move DAG, dataflow, static input-schema, budget, and node-validation cache checks into the originally proposed dedicated typecheck module.

Files:

- `src/main/workflowProgramTypecheck.ts`
- `src/main/workflowProgramTypecheck.test.ts`

Work:

- Validate acyclic graph.
- Validate all `fromNode` references.
- Validate path availability using declared output types.
- Validate node output contracts.
- Validate required review gates before mutation nodes.
- Validate browser intervention handling for browser nodes.
- Preserve dependency-level validation concurrency and cache metrics through the dedicated typecheck module.

Acceptance:

- Diagnostics include `code`, `message`, `path`, `nodeId`, and suggested repair scope.

### Phase 4: Deterministic Lowering - Complete For Deterministic Compiler Path

Progress:

- [x] Deterministically lower supported IR nodes directly to generated workflow source.
- [x] Insert `workflow.resumePoint` around nondeterministic tool/model calls.
- [x] Lower review, approval, checkpoint, mutation, transform, and final output nodes.
- [x] Preserve node ids in generated source and diagnostics.
- [x] Add a separate byte-stable lowered operation plan artifact persisted as `lowered-plan.json`.
- [x] Add node/dependency-hash based lowered operation cache for incremental repair/successive recompiles.
- [x] Move lowering, operation hashing, topological ordering, template selection, and lowering cache writes into the originally proposed dedicated lowering module.

Files:

- `src/main/workflowProgramLowering.ts`
- `src/main/workflowProgramLowering.test.ts`

Work:

- Lower IR to a runtime operation plan.
- Normalize resume/checkpoint boundaries.
- Insert `workflow.resumePoint` around nondeterministic reads before review/approval/mutation.
- Insert node id source mapping metadata.
- Preserve operation-plan hash stability and changed-node/downstream cache invalidation in direct lowering tests.

Acceptance:

- The same IR always produces byte-stable lowered operation JSON.
- Compiler artifacts now include the deterministic lowered operation plan with stable operation hashes.

### Phase 5: Source Generator - Complete For Deterministic Compiler Path

Progress:

- [x] Generate TypeScript from validated IR for supported node kinds.
- [x] Generate `ambient.call` with `outputContract` inside `input`.
- [x] Generate `file_read` handling through `.content` references.
- [x] Generate Google calls through `tools.google_workspace_call`.
- [x] Generate Ambient CLI calls through `tools.ambient_cli`.
- [x] Generate connector calls through `connectors.call` with literal `connectorId`, `operation`, and `nodeId` metadata.
- [x] Generate bounded connector fan-out through `workflow.batch` and `connectors.call`.
- [x] Generate bounded `Promise.all` runtime groups for safe independent DAG nodes while preserving deterministic source order and serializing review, browser-control, mutation, checkpoint, and output boundaries.
- [x] Generate staged local mutations instead of direct write execution.
- [x] Generate source for `branch.if`, `loop.map`, and `error.handle`.
- [x] Generate bounded `workflow.batch` source for nested `loop.map` tool calls and wrap object-valued deterministic maps so generated JavaScript remains parse-safe.
- [x] Add complete graph source mapping metadata for generated IR nodes, including output assignments, workflow checkpoints, and output-ready emits in addition to model, connector, review, mutation, step, and batch calls.
- [x] Move source generation and runtime grouping into the originally proposed dedicated codegen module with focused deterministic tests.

Files:

- `src/main/workflowProgramCodegen.ts`
- `src/main/workflowProgramCodegen.test.ts`

Work:

- Generate TypeScript from lowered operations.
- Generate `ambient.call` with `outputContract` inside `input`.
- Generate `file_read` handling using `.content`.
- Generate Google calls through `tools.google_workspace_call`.
- Generate Ambient CLI calls through `tools.ambient_cli`.
- Generate graph source mappings.

Acceptance:

- Pi-authored TypeScript is no longer used in the IR path.

### Phase 6: Sandbox Dry-Run - Complete For Deterministic Compiler Path

Progress:

- [x] Dry-run generated source before preview persistence for supported IR programs.
- [x] Mock workflow primitives, first-party tools, Ambient calls, review/approval, checkpoints, and staged mutations.
- [x] Mock connector calls, connector fan-out batches, and validate connector input schemas during dry-run.
- [x] Validate key runtime shapes for mocked calls and generated source execution.
- [x] Prevent raw `process`/environment access in generated source through static validation and generated templates.
- [x] Add dry-run coverage for branch/loop/error nodes.
- [x] Add dry-run coverage for nested `loop.map` MiniCPM visual-analysis fan-out.
- [x] Move the runner into the originally proposed dedicated dry-run module with focused tests.
- [x] Harden the dry-run factory by shadowing raw process/global code-generation/network globals during generated-source evaluation.

Files:

- `src/main/workflowProgramDryRun.ts`
- `src/main/workflowProgramDryRun.test.ts`

Work:

- Load generated source with restricted globals.
- Mock workflow primitives.
- Mock tool descriptors and validate input schemas.
- Mock `ambient.call` and validate required shape.
- Mock Google calls as read-only only in tests.
- Return structured diagnostics and call trace.

Acceptance:

- Generated source must pass dry-run before preview artifact persistence.

### Phase 7: Pi IR Planner and Patch Repair - Substantially Complete

Progress:

- [x] Added IR planner prompts for the new path.
- [x] Added bounded JSON Patch repair loop.
- [x] Persist repair diagnostics and patch history in compile context.
- [x] Persist repair diagnostics and patch history as a first-class `repair-history.json` workflow artifact, link it from the compile event, and expose it through generated-program source provenance.
- [x] Validate `repair-history.json` as part of WorkflowProgramIR artifact revalidation and include it in workflow version commits/restores.
- [x] Add a versioned `compile-context.json` schema and validate it as part of WorkflowProgramIR artifact revalidation, so generated-program provenance cannot rely on malformed or shape-less audit context.
- [x] Include selected capability metadata, including Ambient CLI capabilities, in repair prompts.
- [x] Include selected connector metadata in IR planning and repair prompts.
- [x] Live-tested Ambient/Pi IR planning and repair-compatible compile behavior.
- [x] Prompt and compiler policy now require Ambient CLI describe-before-run, browser review handoffs, and Google read-only account/date constraints.
- [x] Prompt and compiler policy now require first-party MiniCPM visual evidence for image categorization/classification workflows when `ambient_visual_analyze` is selected, then Ambient model synthesis through `model.call`.
- [x] Added policy-specific JSON Patch repair guidance for browser intervention, Ambient CLI describe, and Google account/date diagnostics.
- [x] Keep reducing prompt size through progressive capability discovery: the compiler now selects compact first-party tool descriptors plus connector/operation subsets before final IR planning and repair.
- [x] Remove the old TypeScript compiler path after IR dogfoods and benchmark coverage are stable.

Files:

- `src/main/workflowCompilerService.ts`
- `src/main/workflowCompilerIrPrompts.ts`
- `src/main/workflowCompilerIrRepair.ts`
- `src/main/workflowCompilerIrRepair.test.ts`

Work:

- Replace component `sourceBlock` prompts with IR prompts.
- Add JSON Patch repair loop.
- Persist repair diagnostics and patch history as durable compiler artifacts.
- Keep old TypeScript compiler path disabled for new workflow compiles.

Acceptance:

- Pi repairs only IR patches, not source blocks or whole scripts.

### Phase 8: Parallel Incremental Compile - Partially Complete For IR Path

Progress:

- [x] Earlier work explored parallel component compilation, but that still operated above the old source-block pattern.
- [x] Keep skeleton/IR planning single-call.
- [x] Validate IR nodes by dependency level with validation batching capped at `4`.
- [x] Cache node-local deterministic validation results by stable node/dependency/policy hash.
- [x] Reuse cached validation across JSON Patch repair attempts and revalidate changed/downstream nodes.
- [x] Preserve stable topological source order after incremental validation.
- [x] Surface IR validation cache/level/concurrency metrics in compile progress and UI summaries.
- [x] Split codegen and dry-run entry points onto a reusable lowered operation plan artifact.
- [x] Surface lowered operation count and lowering cache metrics in compile progress and UI summaries.
- [x] Generate bounded parallel runtime groups for safe same-level nodes, capped at `4`, and verify with a timed generated-source test that independent branches overlap.
- [x] Preserve dry-run node attribution for parallel generated source with async-local node context.

Files:

- `src/main/workflowCompilerService.ts`
- `src/main/workflowCompilerService.test.ts`

Work:

- Keep skeleton/IR planning single-call.
- Compile independent IR nodes/components by dependency level.
- Cap parallelism at `4`.
- Cache deterministic pass results by node hash.
- Revalidate only downstream nodes after patch repair.

Acceptance:

- Independent branches validate concurrently and execute concurrently when they are runtime-safe; final source remains stable and topologically ordered across dependency levels.

### Phase 9: Instrumentation and Benchmarks - Complete

Progress:

- [x] Existing compile activity UI displays useful prompt/response/tool/retry state.
- [x] Manual live timings have been captured during dogfood runs.
- [x] Add dedicated per-phase IR compiler timing metrics.
- [x] Add benchmark script and fixtures for browser QA, parallel multi-source research, file/report, Ambient CLI, and Google Drive read-only flows.
- [x] Persist JSON and Markdown benchmark reports under `test-results/workflow-compiler-bench/`.
- [x] Preserve live benchmark evidence with immutable timestamped JSON/Markdown reports under `test-results/workflow-compiler-bench/live-runs/` and an append-only `live-history.jsonl` index, while still refreshing `live-latest.*`.
- [x] Scope live benchmark attempt logs by immutable run id under `test-results/workflow-compiler-bench/live-logs/<run-id>/`, and include that log directory in the live history index, so later targeted reruns cannot overwrite the logs referenced by older summaries.
- [x] Classify failed benchmark diagnostics by compiler phase.
- [x] Add failed-compile UI report that explains exact time spent by phase.
- [x] Updated deterministic benchmark fixtures to satisfy browser user-action policy and Ambient CLI describe-before-run sequencing.
- [x] Add opt-in live/provider-inclusive benchmark rows for Pi transport, workflow live compiles/runs, managed-browser flows, and read-only Google Calendar/Drive dogfoods.
- [x] Classify live rows as passed, provider-degraded/inconclusive, skipped/environment, or product/test failure, with retry counts and full attempt logs.
- [x] Bound live Google Workspace provider requests independently from Vitest test timeouts, so stream-thinking stalls surface as workflow/runtime evidence and provider-degraded benchmark classifications instead of opaque harness timeouts.
- [x] Prevent native wrapper cleanup rebuild failures from masking a passing live workflow test, and classify native dependency rebuild failures as environment/harness issues instead of product defects.
- [x] May 16, 2026 checkpoint: a full 9-row live attempt produced immutable evidence with 3 passed rows, 5 provider-degraded rows, and 1 native-wrapper cleanup false failure; after the cleanup/classifier fix, the targeted live Calendar row passed on the first attempt.
- [x] May 16, 2026 checkpoint after run-scoped logging: the full 9-row live benchmark produced immutable report `2026-05-16T06-28-52.973Z` with 7 passed rows, 2 provider-degraded Google rows caused by Ambient 429s, 0 skipped rows, and 0 product/test failures; all attempt logs were preserved under the matching run id.
- [x] May 16, 2026 checkpoint after repair-history persistence: the full 9-row live benchmark produced immutable report `2026-05-16T06-48-16.464Z` with 9 passed rows, 0 provider-degraded rows, 0 skipped rows, and 0 product/test failures; Pi transport recovered from one Ambient 429 on retry.
- [x] May 16, 2026 checkpoint after repair-history validation/versioning: the full 9-row live benchmark produced immutable report `2026-05-16T07-07-25.425Z` with 7 passed rows, 2 provider-degraded managed-browser rows caused by Ambient 429s, 0 skipped rows, and 0 product/test failures.
- [x] May 16, 2026 checkpoint after compile-context provenance validation: the full 9-row live benchmark produced immutable report `2026-05-16T07-23-14.927Z` with 8 passed rows, 1 provider-degraded Google Calendar read-only row caused by repeated Ambient 429 rate limits, 0 skipped rows, and 0 product/test failures.
- [x] May 16, 2026 checkpoint after Ambient CLI secret-setup compiler hardening: the full 9-row live benchmark produced immutable report `2026-05-16T07-46-15.034Z` with 9 passed rows, 0 terminal provider-degraded rows, 0 skipped rows, and 0 product/test failures; Calendar read-only recovered from four Ambient 429 provider-degraded attempts and passed on attempt 5.
- [x] May 16, 2026 post-rebase checkpoint after Ambient CLI secret-setup compiler hardening: the full 9-row live benchmark produced immutable report `2026-05-16T08-00-02.491Z` with 8 passed rows, 1 provider-degraded Scottsdale row caused by repeated Ambient 429 rate limits, 0 skipped rows, and 0 product/test failures; browser intervention recovered from two Ambient 429 provider-degraded attempts and passed on attempt 3, and both Google read-only rows passed on attempt 1.

Files:

- `src/main/workflowCompilerMetrics.ts`
- `src/renderer/src/workflowCompileActivityUiModel.ts`
- `scripts/benchmark-workflow-compiler.mjs`
- `scripts/workflow-compiler-live-benchmark-lib.mjs`

Work:

- Persist per-phase timings:
  - capability discovery,
  - IR planning,
  - patch repair,
  - static passes,
  - codegen,
  - sandbox dry-run,
  - artifact persistence.
- Persist prompt/response chars and retry counts.
- Add benchmark fixtures for linear and parallel workflows.

Acceptance:

- A failed compile report explains where time was spent and which pass failed.

### Phase 10: Remove Old TypeScript Generation Path - Complete

Progress:

- [x] IR path is implemented and live-tested for representative workflows.
- [x] Remove whole-artifact TypeScript/source-block generation from the default `compileWorkflowArtifact` path.
- [x] Add a fail-closed native test proving legacy skeleton/component and one-shot source providers are rejected for new compiles.
- [x] Delete obsolete source-block provider methods, service branches, prompt builders, repair prompts, and source-block unit tests.
- [x] Migrate native fixed-prompt dogfood fixtures to WorkflowProgramIR.
- [x] Migrate core non-intervention live dogfood fixtures to WorkflowProgramIR and add a native migration smoke that compiles the batch through the real compiler service.
- [x] Migrate scheduled local-file timeout recovery to WorkflowProgramIR using a recoverable `checkpoint.write.resumeKey`, and live-test pause/resume through Ambient/Pi.
- [x] Add `connector.map` for bounded parallel connector fan-out and migrate the Drive search/read-file dogfood fixture to WorkflowProgramIR.
- [x] Add a snapshot-aware live Google Workspace dogfood resolver that tries active Ambient Desktop gws state first, records sanitized auth failure classes, and falls back to the latest validated local hardening snapshot/account handle for read-only live validation.
- [x] Add first-class `browser.intervention` IR support and migrate the fake-browser pause/resume recovery fixture out of custom generated source.
- [x] Add chained `browser.intervention.skipIf` support and migrate the real managed-browser and external managed-browser dogfood providers to WorkflowProgramIR.
- [x] Extend `browser.intervention` to `browser_login` with a no-refill user verification handoff, `retry.maxAttempts:0` policy enforcement, and downstream browser verification guidance.
- [x] Add late-bound first-party descriptor resolution after IR generation so compact capability prompts can still validate referenced built-in tools such as `browser_screenshot` without dumping every descriptor into the prompt.
- [x] Add a live benchmark row for browser intervention recovery and classify long provider-backed live dogfood timeouts as provider-degraded/inconclusive without retry storms.
- [x] Add connector approval decision injection for live read-only Google dogfoods so read-only connector validation can proceed without Vitest unhandled-rejection noise from intentional connector-review pauses.
- [x] Delete unreachable legacy source literals from the specialized browser-intervention dogfood providers.
- [x] Re-run real managed-browser and external managed-browser live dogfoods through the provider-inclusive benchmark harness.
- [x] Keep only necessary legacy artifact loading by distinguishing `program_ir_generated` artifacts from `legacy_source` artifacts with explicit source provenance.
- [x] Update user-visible diagnostics to assume IR-first compilation, generated-program inspection, and Plan/Edit revisions instead of direct source repair.

Work:

- Remove whole-artifact TypeScript generation from default path.
- Keep legacy artifact loading only for existing legacy source artifacts.
- Delete obsolete sourceBlock repair prompts and tests after IR path is stable.
- Migrate the remaining live dogfood fixtures from fixed generated-source artifacts to WorkflowProgramIR, adding compiler features where the old source relied on dynamic loops, conditional browser intervention handling, or output-card emission.

Acceptance:

- [x] New workflow previews are always IR-first through `WorkflowProgramIR`.
- [x] Obsolete legacy compiler prompt/component code has been deleted rather than merely bypassed.
- [x] Remaining specialized browser-intervention dogfood provider return values are represented as WorkflowProgramIR without retaining unreachable generated-source fallback literals.
- [x] Scheduled recovery coverage is represented as WorkflowProgramIR and live-tested with pause/resume, Ambient classification, and HTML output-card validation.
- [x] Dynamic Drive read coverage is represented as WorkflowProgramIR with bounded `connector.map` fan-out. Deterministic compiler/native smoke passed; live Drive validation passed against the machine-local validated Google Workspace snapshot (`primary-mac-gws-validated-2026-05-13T22-09-12-0700`) using account handle `default`.
- [x] WorkflowProgramIR artifacts are immutable at the generated-program layer; dashboard source edits and native source revision proposals are rejected with deterministic provenance errors, while legacy source artifacts retain compatibility.

## Diagnostics Shape

All compiler diagnostics should follow:

```json
{
  "code": "ambient_call.output_contract_missing",
  "severity": "error",
  "message": "model.call node requires output.schema before code generation.",
  "path": "/nodes/3/output/schema",
  "nodeId": "diagnose-page",
  "repair": {
    "allowedOps": ["add", "replace"],
    "schemaPath": "/definitions/modelCallNode/output/schema"
  }
}
```

## Test Plan: 12 Required Cases

### 1. Browser Search To File Report

Status: covered for deterministic compiler validation. The IR path now supports browser search, browser_content, staged file output, tool grant inference, mocked dry-run, and live Scottsdale dogfood coverage.

Request:

> Search public web results for upcoming folk music performances in Scottsdale and save a markdown report.

Tools:

- `browser_search`
- `browser_content`
- `file_write`

Assertions:

- Pi returns IR only, no source.
- Compiler infers browser and file grants.
- Codegen emits browser calls through exact flat tool names.
- Sandbox dry-run validates mocked browser result flow.
- File write is behind mutation/stage policy or explicit approved output policy.

### 2. Browser Navigation Screenshot QA

Status: covered for deterministic compiler validation. Model output schemas, Ambient call codegen, screenshot capture, evidence checkpointing, and dry-run reference validation are covered.

Request:

> Open a local fixture page, inspect content, capture a screenshot, ask Ambient for a QA diagnosis, and checkpoint evidence.

Tools:

- `browser_nav`
- `browser_content`
- `browser_screenshot`
- `ambient.responses`

Assertions:

- IR includes explicit model output schema.
- Codegen places `outputContract` inside `ambient.call` input.
- Screenshot result is checkpointed before model diagnosis.
- Dry-run catches missing screenshot reference paths.

### 3. Browser Intervention Handling

Status: covered for the compiler/runtime contract. `review.input` lowers/dry-runs correctly, nonblocking browser user-action mode now requires a bounded review handoff, raw `browser_login` requires a review handoff, `browser.intervention` can broker `browser_login` without refilling credentials after the user completes MFA/CAPTCHA/passkey/device confirmation, and `userActionId` resumes require prior review-gate dependency. Live browser-intervention recovery, real managed-browser, and external managed-browser rows are now in the provider-inclusive benchmark and pass.

Request:

> Visit a site that may require login or CAPTCHA and collect page evidence if accessible.

Tools:

- `browser_nav`
- `browser_content`
- `browser_login`
- `browser_pick`

Assertions:

- Browser user-action state must branch to `review.input`.
- No retry loop is generated for CAPTCHA/login/MFA.
- Review gate includes bounded intervention metadata.
- Resuming does not repeat successful prior browser calls.

### 4. Local File Read Summarization

Status: covered for the core compiler contract. File reads are object outputs, `.content` references are validated, primitive misuse is rejected, and read-only flows do not require write grants.

Request:

> Read a workspace markdown file and create a summary checkpoint.

Tools:

- `file_read`
- `ambient.responses`

Assertions:

- IR models `file_read` result as object with `.content`.
- Typechecker rejects treating file read output as raw string.
- Codegen validates `typeof result.content === "string"` before use.
- No file writes are requested.

### 5. Local File Transform And Write

Status: covered for deterministic compiler validation. Deterministic CSV transforms, `.content` dataflow, staged mutation, file write grants, and dry-run write-shape validation are implemented.

Request:

> Read a CSV, create a cleaned markdown table, and write it to `reports/table.md`.

Tools:

- `file_read`
- `file_write`

Assertions:

- Dataflow references `file_read.content`.
- Transform node is deterministic and does not call Ambient.
- File write grant is inferred.
- Dry-run validates write args shape and staged mutation policy.

### 6. Bash Test Runner With Failure Classification

Status: covered for the compiler contract. Bash is represented as a bounded `tool.call`, Ambient classification uses schemas, and generated source avoids raw process access.

Request:

> Run the local test command and classify failures.

Tools:

- `bash`
- `ambient.responses`

Assertions:

- Shell command is represented as `tool.call`.
- Bash call is bounded with timeout/budget.
- Ambient classification has output schema.
- No raw `process`, `child_process`, or environment access appears in generated source.

### 7. Ambient CLI Search Describe Run

Status: covered for deterministic compiler validation. Ambient CLI execution grants, selected capability metadata, generated `tools.ambient_cli` calls, prompt guidance, compiler-enforced describe-before-run sequencing, and compiler-enforced search-before-describe for unknown packages are implemented.

Request:

> Use an installed Ambient CLI package to search arXiv and summarize the result.

Tools:

- `ambient_cli_search`
- `ambient_cli_describe`
- `ambient_cli`
- `ambient.responses`

Assertions:

- IR includes discovery nodes for search/describe when exact package is unknown.
- Compiler enforces describe before first execution.
- Manifest includes exact Ambient CLI capability grant.
- No raw package SKILL.md text is injected into generated source.

### 8. Ambient CLI Missing Secret Blocker

Status: covered for deterministic workflow compiler validation. Missing environment requirements block execution, diagnostics avoid secret values, the deterministic fixture includes explicit `ambient_cli_secret_request` plus approval-bound `ambient_cli_env_bind` setup nodes, and the compiler now validates setup nodes against selected package metadata with declared missing env requirements. Runtime Desktop secret-dialog behavior is covered by the Ambient CLI package dogfood path; a dedicated workflow benchmark row with a disposable installed secret-backed CLI fixture remains optional future live coverage.

Request:

> Use an installed cloud-backed CLI package that requires an API key.

Tools:

- `ambient_cli_describe`
- `ambient_cli_secret_request`
- `ambient_cli_env_bind`

Assertions:

- Compiler rejects passing secret values in IR args.
- IR may include secret request/bind setup nodes only as approval-bound setup actions.
- `ambient_cli` execution is blocked until declared env requirements are satisfied.
- Diagnostics never include secret values.

### 9. Google Workspace Status And Readiness

Status: covered for read-only readiness. `google_workspace_status` is supported without Google method calls or setup mutations.

Request:

> Check whether Google Workspace is connected and summarize available accounts.

Tools:

- `google_workspace_status`

Assertions:

- Google interaction is read-only.
- No Google API method call is generated.
- No setup/install/login mutation is generated unless explicitly requested.
- Result can be checkpointed as setup/readiness evidence.

### 10. Google Drive Read-Only Search

Status: covered for deterministic compiler validation. Read-only method validation, write-like method rejection, account-hint provenance, read-only payload rejection, read-only method-search side-effect checks, catalog-backed method metadata grants, source/manifest method-grant enforcement, IR connector fan-out, and live read-only Drive dogfood through the validated local Google Workspace snapshot are implemented.

Request:

> Find recent Google Drive files matching "quarterly planning" and summarize their names and modified times.

Tools:

- `google_workspace_search_methods`
- `google_workspace_call`

Assertions:

- Method selection is constrained to read-only Drive methods.
- No create/update/delete/copy/share method ids are allowed.
- Compiler rejects write-like Google method ids even if Pi proposes them.
- Account hint must come from status or explicit user-provided handle.

### 11. Google Calendar Read-Only Agenda

Status: covered for deterministic compiler validation and live dogfood. Write-like Google method rejection, status-derived account provenance, Calendar date-range/timezone policy checks, catalog-backed method grants, and Calendar-specific compiler fixtures are implemented. The May 16, 2026 live Calendar dogfood passed through the real Google wrapper; provider-degraded rows remain classified separately when Ambient is unstable.

Request:

> Read tomorrow's Google Calendar events and summarize schedule conflicts.

Tools:

- `google_workspace_search_methods`
- `google_workspace_call`

Assertions:

- Method selection is constrained to read-only Calendar list/get/freebusy-style methods.
- No event insert/update/delete methods are allowed.
- Date range is explicit and timezone-aware.
- Dry-run validates method id and params shape without calling Google.

### 12. Google Docs Read And Local Materialization

Status: covered for deterministic compiler validation. Local materialization from read-only Google handles, local workspace artifact staging, read-only Google method guards, manifest separation, source/manifest method-grant enforcement, and richer Google grant metadata tests are implemented.

Request:

> Read a Google Doc by handle, extract its text, and save a local workspace copy for review.

Tools:

- `google_workspace_call`
- `google_workspace_materialize_file`
- `file_read`

Assertions:

- Google API operation is read-only.
- `google_workspace_materialize_file` may write only a local workspace artifact from a read-only Google file handle.
- No Google document update/write method is allowed.
- Local `file_read` can inspect the materialized copy.
- Generated manifest separates Google read grant from local file access.

### 13. Local Downloads Inventory And Classification

Status: covered for deterministic compiler/runtime validation and targeted provider-inclusive GMI Cloud dogfood. Explicit local folders now use typed first-party local filesystem tools instead of Google Drive or shell fallback.

Request:

> Review the documents and folders in my Downloads directory and classify them into up to 7 categories.

Tools:

- `local_directory_list`
- `local_file_read`
- `ambient.responses`

Assertions:

- Capability selection chooses local filesystem tools for `Downloads`, `Desktop`, and `Documents` folder requests.
- Directory inventory is bounded, metadata-first, skips hidden/secret-like names by default, and does not read file contents.
- Optional local file reads are explicit and limited to text or supported Office documents.
- Generated graph marks local directory inventory as a data source.
- The deterministic plan coverage rejects accidental Google Drive or raw shell routing for this local request shape.
- The live benchmark suite includes `local-downloads-live-compile-run`, which compiles and runs a temp Downloads fixture through the Ambient-compatible provider.

### 14. Gmail Read-Only Categorization

Status: covered for deterministic compiler/runtime validation and provider-inclusive live attempts. Gmail now has a workflow-native long-context preprocessing path via `long_context_process`, plus a generated-source compaction guard before `model.call` so huge connector-map payloads cannot be sent raw to Ambient. The latest live Gmail row still ends provider-degraded under GMI Cloud stream-idle conditions, with no remaining product/test failure in the latest report.

Request:

> Review the last 100 emails in Gmail and write a concise report categorizing them by action required, urgency, sender/domain, and recurring themes.

Tools and connectors:

- `google.gmail.search`
- `google.gmail.readThread`
- `long_context_process` for large/deep evidence preprocessing
- `ambient.responses`
- optional staged `file_write`

Assertions:

- Gmail operations are read-only and do not include draft/send/delete operations.
- Single available Gmail accounts are deterministically bound into connector nodes, manifests, and generated source.
- Gmail search exposes `messages`, `threads`, `resultSizeEstimate`, and `nextPageToken` in the connector contract.
- Message-only Gmail search results synthesize `threads` only when a real `threadId` exists; message ids are not treated as thread ids.
- Gmail readThread results are normalized to bounded metadata summaries before they can reach Ambient model calls.
- Large or deeply structured Gmail evidence can be routed through `long_context_process` before final Ambient model shaping.
- Generated workflow source compacts model-call inputs as a last-resort guard while preserving full connector outputs in runtime state/checkpoints.
- Connector-map fan-out budgets account for `maxItems`, and run-time budgets account for operation timeout and concurrency.
- Bounded connector maps collect per-item connector errors so one unavailable thread does not fail the whole workflow.
- Invalid JSON returned by the provider during workflow model calls is retryable with structured-output feedback.

### 15. Local Downloads Image Categorization With MiniCPM

Status: covered for deterministic compiler/runtime validation, capability discovery selection, and targeted provider-inclusive GMI Cloud live dogfood.

Request:

> Categorize 10 images from my Downloads directory.

Tools:

- `local_directory_list`
- `local_file_read`
- `ambient_visual_analyze`
- optional `ambient_visual_minicpm_setup`
- `ambient.responses`

Assertions:

- Capability selection chooses local filesystem access for `Downloads` and does not route through Google Drive or raw shell.
- Visual requests select MiniCPM-compatible visual analysis metadata when available.
- The deterministic plan analyzes exactly 10 bounded image paths from the Downloads inventory.
- The live compiler can emit a compact `loop.map` fan-out whose nested `map` is `{"kind":"tool.call","tool":"ambient_visual_analyze"}` instead of unrolling 10 separate tool nodes.
- Generated graph marks MiniCPM visual analysis nodes as data sources.
- Sandbox dry-run returns bounded visual analysis artifacts and verifies the downstream Ambient categorization model call.
- Targeted GMI Cloud snapshot live report `2026-05-16T12-54-05.757Z` passed on attempt 1 with 10 visual tool calls and no provider-degraded or product/test failures.

## Benchmark Requirements

Status: complete for the current checkpoint. The deterministic benchmark script, stable fixtures, JSON/Markdown reports, failed-compile UI report, and opt-in live/provider-inclusive benchmark rows are implemented.

Add a benchmark script that runs:

- Linear browser QA workflow.
- Parallel multi-source research workflow.
- File-read/report workflow.
- Ambient CLI workflow.
- Google read-only Drive workflow with mocked Google adapter.

Metrics:

- total wall-clock,
- Pi call count,
- Pi prompt chars,
- Pi response chars,
- retry count,
- patch count,
- static pass time,
- dry-run time,
- generated source bytes,
- graph node count,
- IR node count.

Required reports:

- JSON summary in `test-results/workflow-compiler-bench/latest.json`.
- Markdown summary in `test-results/workflow-compiler-bench/latest.md`.
- Live JSON summary in `test-results/workflow-compiler-bench/live-latest.json`.
- Live Markdown summary in `test-results/workflow-compiler-bench/live-latest.md`.
- Immutable live JSON/Markdown reports in `test-results/workflow-compiler-bench/live-runs/`.
- Append-only live run index in `test-results/workflow-compiler-bench/live-history.jsonl`.
- Run-scoped live attempt logs in `test-results/workflow-compiler-bench/live-logs/<run-id>/`.

## Acceptance Criteria

- [x] New workflow compiles do not ask Pi for executable TypeScript; the legacy prompt/component code is no longer reachable from the default compile path.
- [x] Existing live browser/Scottsdale dogfoods pass without whole-script regeneration.
- [x] Google tests only use read-only Google methods; compiler rejection, catalog-backed method grants, account provenance, Calendar time policy, and source/manifest grant enforcement are covered deterministically.
- [x] Connector workflows compile from IR with inferred grants and source mappings.
- [x] `ambient.call` contract failures become structurally impossible in generated source for supported `model.call` nodes.
- [x] Invalid IR is repaired through bounded JSON Patch, not full artifact regeneration.
- [x] Dry-run catches runtime shape errors before preview artifacts are persisted for supported nodes.
- [x] Parallel workflows show lower wall-clock than equivalent sequential runs when the DAG has independent safe branches; covered by a timed generated-source test and deterministic benchmark run.
- [x] Compile failure UI reports exact phase, diagnostic code, node id, and repair attempts.
- [x] Live/provider-inclusive benchmark rows distinguish provider-degraded/inconclusive failures from product/test failures, and the May 15 and May 16, 2026 runs passed the default live rows.
- [x] The May 16, 2026 full live benchmark passed the default rows after retrying provider-degraded upstream/stream-idle failures; the default live suite now includes 10 rows after adding browser-intervention recovery and local Downloads compile/run coverage. The new local Downloads row passed targeted GMI Cloud snapshot validation in immutable report `2026-05-16T10-37-15.525Z`.
- [x] The Gmail read-only live row now records provider-degraded stream-idle conditions separately from product/test failures. The latest targeted GMI Cloud snapshot report `2026-05-16T18-37-06.546Z` had 0 product/test failures after Gmail connector normalization, data minimization, dependency scheduling, connector-map resilience, workflow-native `long_context_process`, and model-input compaction fixes.

## Suggested Rollout

1. [x] Land IR schema and deterministic validation behind a feature flag.
2. [x] Add codegen and dry-run for browser/file/bash/model calls.
3. [x] Add initial Google read-only, Ambient CLI, and connector nodes.
4. [x] Run all 12 tests in deterministic/mock mode.
5. [x] Run live Ambient/Pi browser QA and Scottsdale report dogfoods.
6. [x] Switch representative/default live compile work to the IR path while retaining fallback/legacy code.
7. [x] Remove sourceBlock component generation from the default new-workflow compile path after live dogfoods and benchmarks are stable.
8. [x] Delete now-unreachable sourceBlock prompt/component helpers and migrate native fixed-prompt dogfood fixtures.
9. [x] Migrate core non-intervention live dogfood fixtures and add output-ready emission/dry-run contract mocks needed for IR-generated workflow parity.
10. [x] Migrate scheduled local timeout recovery to recoverable checkpoint IR and live-test the resumed scheduled run.
11. [x] Migrate Drive search/read-file selection using bounded connector fan-out.
12. [x] Migrate remaining custom dynamic source fixtures: fake-browser, real managed-browser, and external managed-browser intervention providers now return IR, no longer retain unreachable generated-source fallback literals, and passed live managed/external validation.
