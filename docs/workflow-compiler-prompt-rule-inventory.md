# Workflow Compiler Prompt Rule Inventory

This is the Phase 0 inventory for the Workflow Agent abstraction work. The executable source of truth lives in `src/main/workflowCompilerPromptInventory.ts`; this document is the human review surface for deciding whether each rule should remain core prompt text, move into a capability descriptor, become a typed recipe, or be enforced by a validator.

## Owner Categories

- `core`: WorkflowProgramIR language semantics that every compile needs.
- `runtime`: checkpoint, review, resume, mutation staging, recovery, and audit semantics.
- `capability`: selected tool, connector, plugin, or Ambient CLI guidance.
- `policy`: safety, permission, freshness, or data-handling constraints.
- `recipe`: reusable workflow shapes broader than one tool.
- `validator`: deterministic checks that should own correctness.
- `retire`: obsolete or dogfood-only guidance that should not remain product prompt text.

## Current Inventory

| Rule id | Owner | Risk | Current home | Migration note |
| --- | --- | --- | --- | --- |
| `core-json-only-workflow-program-ir` | core | high | stable prefix | Keep global. |
| `core-node-kind-catalog` | core | high | stable prefix | Keep global until node docs are generated from schema. |
| `core-reference-path-contract` | core | high | stable prefix | Keep global with static validation. |
| `runtime-review-approval-mutation-contract` | runtime | high | stable prefix | Keep global; runtime contract. |
| `runtime-graph-source-mapping` | validator | high | stable prefix | Keep validator-owned; prompt text can shrink after audit UI exposes it. |
| `recipe-large-collection-pattern` | retire | high | retired stable prefix | Replaced by the typed `large_collection_summarization` recipe after Phase 8 cleanup. |
| `runtime-recovery-fanout-contract` | retire | high | retired stable prefix | Replaced by selected recovery recipe guidance plus dry-run/static validation after Phase 8 cleanup. |
| `capability-selected-desktop-tools-section` | capability | medium | capability section | Keep request-scoped. |
| `capability-selected-connectors-section` | capability | medium | connector section | Keep request-scoped. |
| `runtime-dynamic-context-section` | runtime | medium | dynamic suffix | Keep mutable suffix. |
| `policy-google-workspace-read-only-methods` | retire | high | retired policy rules | Replaced by Google Workspace tool workflow guidance plus read-only method/search validators. |
| `policy-google-workspace-account-time-window` | retire | high | retired policy rules | Replaced by Google Workspace tool workflow guidance plus account and Calendar time-window validators. |
| `validator-google-workspace-read-payload-ban` | retire | high | retired policy rules | Replaced by Google Workspace tool workflow guidance plus `google.read_only_payload_rejected` static validation. |
| `runtime-local-file-output-as-mutation-stage` | retire | high | retired policy rules | Replaced by `file_write` workflow guidance, the typed `staged_document_export` recipe, and staged-mutation/static validators. |
| `validator-file-write-availability` | retire | high | retired policy rules | Replaced by selected capability grants plus `ir.unavailable_tool` validation. |
| `capability-local-directory-skipped-metadata` | retire | high | retired policy rules | Replaced by `local_directory_list` workflow guidance plus `audit.local_directory_skipped_metadata_required` static validation after Phase 8 cleanup. |
| `capability-browser-user-action-intervention` | retire | high | retired policy rules | Archived in the executable inventory; replaced by browser tool workflow guidance plus browser intervention validators. |
| `capability-browser-login-intervention` | retire | high | retired policy rules | Archived in the executable inventory; replaced by `browser_login` workflow guidance plus login intervention validators. |
| `runtime-browser-lower-level-handoff` | retire | high | retired policy rules | Archived in the executable inventory; replaced by browser workflow guidance plus `browser.intervention_review_required` validation. |
| `capability-browser-default-wait-behavior` | retire | medium | retired policy rules | Archived in the executable inventory; replaced by browser workflow guidance and static validation for explicit waits. |
| `runtime-browser-user-action-resume` | retire | high | retired policy rules | Archived in the executable inventory; replaced by browser workflow guidance plus `browser.user_action_resume_requires_review` validation. |
| `capability-browser-recovery-provenance` | retire | high | retired policy rules | Archived in the executable inventory; replaced by browser source-provenance workflow guidance and browser recovery dogfood gates. |
| `recipe-source-quality-dedupe` | retire | high | retired policy rules | Replaced by selected `current_web_research` and `large_collection_summarization` recipe modules after Phase 8 cleanup. |
| `policy-current-data-evidence` | retire | high | retired policy rules | Replaced by selected `current_web_research` and `movie_night_current_showtimes` recipe modules after Phase 8 cleanup. |
| `recipe-movie-night-current-showtimes` | retire | medium | retired policy rules | Replaced by the typed `movie_night_current_showtimes` recipe after Phase 8 cleanup. |
| `capability-long-context-static-enforcement` | retire | high | retired policy rules | Replaced by selected `long_context_process` workflow guidance plus static validation after Phase 8 cleanup. |
| `capability-long-context-preprocess` | retire | high | retired policy rules | Replaced by selected `long_context_process` workflow guidance after Phase 8 cleanup. |
| `policy-long-context-preserve-source-outputs` | retire | high | retired policy rules | Replaced by `audit.long_context_source_not_checkpointed` static validation, which requires long-context preprocessing to read checkpoint-backed source evidence. |
| `recipe-google-transcript-action-items` | retire | medium | retired policy rules | Retired into selected `google_meeting_transcript_action_items` typed recipe. |
| `capability-ambient-cli-describe-before-run` | retire | high | retired policy rules | Replaced by selected Ambient CLI workflow guidance plus `ambient_cli.describe_required` static validation. |
| `policy-ambient-cli-missing-env-setup` | retire | high | retired policy rules | Replaced by selected Ambient CLI workflow guidance plus missing-env setup validators. |
| `policy-ambient-cli-secret-redaction` | retire | high | retired policy rules | Replaced by selected Ambient CLI workflow guidance plus literal secret-value and env-bind validators. |
| `capability-visual-loop-map-tool-call-shape` | retire | high | retired policy rules | Replaced by selected `ambient_visual_analyze` workflow guidance plus static validation after Phase 8 cleanup. |
| `capability-visual-analysis-required` | retire | high | retired policy rules | Replaced by selected `ambient_visual_analyze` workflow guidance and visual dogfood gates after Phase 8 cleanup. |
| `capability-visual-fanout` | retire | high | retired policy rules | Replaced by selected `ambient_visual_analyze` workflow guidance plus static validation after Phase 8 cleanup. |
| `capability-visual-model-role` | retire | medium | retired policy rules | Replaced by selected `ambient_visual_analyze` workflow guidance after Phase 8 cleanup. |
| `validator-budget-static-minimum` | retire | high | retired policy rules | Replaced by deterministic static budget inference and `budget.*_too_low` validators. |
| `validator-large-budget-ceiling` | retire | high | retired policy rules | Replaced by deterministic `budget.*_ceiling_exceeded` validators. |
| `recipe-gmail-metadata-first-detail-gate` | retire | high | retired policy rules | Replaced by Gmail search descriptor metadata plus the selected `metadata_first_personal_data_review` recipe after Phase 8 cleanup. |

## Phase 0 Notes

- High-risk rules stay in the prompt until a deterministic validator or request-scoped module demonstrably owns the behavior.
- Dogfood scenarios should point at these generic rule ids instead of adding fixture-specific compiler prompt instructions.
- New compiler prompt guidance must add an inventory entry before it ships.
