export type WorkflowCompilerPromptRuleOwner = "core" | "runtime" | "capability" | "policy" | "recipe" | "validator" | "retire";
export type WorkflowCompilerPromptRuleRisk = "low" | "medium" | "high";
export type WorkflowCompilerPromptRuleSource =
  | "stable_prefix"
  | "policy_rules"
  | "capability_section"
  | "connector_section"
  | "ambient_cli_section"
  | "dynamic_context"
  | "discovery_prompt"
  | "repair_prompt";

export interface WorkflowCompilerPromptRule {
  id: string;
  owner: WorkflowCompilerPromptRuleOwner;
  source: WorkflowCompilerPromptRuleSource;
  risk: WorkflowCompilerPromptRuleRisk;
  summary: string;
  text: string;
  duplicatedIn: string[];
  validatorRefs: string[];
  migrationBlockers: string[];
}

export interface WorkflowCompilerPolicyPromptRuleInput {
  selectedToolNames: ReadonlySet<string>;
  selectedConnectorIds?: ReadonlySet<string>;
  userRequest?: string;
}

interface WorkflowCompilerPromptRuleDefinition extends Omit<WorkflowCompilerPromptRule, "text"> {
  exemplarText: string;
  render?: (input: WorkflowCompilerPolicyPromptRuleInput) => string | undefined;
}

const staticPromptRuleInventory: WorkflowCompilerPromptRule[] = [
  inventoryRule({
    id: "core-json-only-workflow-program-ir",
    owner: "core",
    source: "stable_prefix",
    risk: "high",
    summary: "The compiler returns typed WorkflowProgramIR JSON, not generated source or prose.",
    text: "You are planning an Ambient Desktop workflow as typed WorkflowProgramIR JSON.",
    duplicatedIn: ["src/main/workflow-compiler/workflowCompilerService.test.ts"],
    validatorRefs: ["parseWorkflowProgramIr", "validateWorkflowProgramStatic"],
    migrationBlockers: [],
  }),
  inventoryRule({
    id: "core-node-kind-catalog",
    owner: "core",
    source: "stable_prefix",
    risk: "high",
    summary: "The prompt defines the allowed WorkflowProgramIR node language.",
    text: "Allowed node kinds.",
    duplicatedIn: ["src/shared/workflowProgramIr.ts", "src/main/workflow-program/workflowProgramTypecheck.ts"],
    validatorRefs: ["parseWorkflowProgramIr", "validateWorkflowProgramStatic"],
    migrationBlockers: [],
  }),
  inventoryRule({
    id: "core-reference-path-contract",
    owner: "core",
    source: "stable_prefix",
    risk: "high",
    summary: "Prior node outputs and map item references use the typed data-reference contract.",
    text:
      'Reference prior outputs with {"fromNode":"node-id","path":"optional.field.path"} and map items with {"fromItem":"itemName","path":"field.path"}. In collection.map, connector.map, model.map, and loop.map, never use bare field-name strings like {"id":"id"} when you mean to copy a value from the current item; that is a literal string.',
    duplicatedIn: ["src/shared/workflowProgramIr.ts", "src/main/workflow-program/workflowProgramTypecheck.ts"],
    validatorRefs: ["validateWorkflowProgramStatic"],
    migrationBlockers: [],
  }),
  inventoryRule({
    id: "runtime-review-approval-mutation-contract",
    owner: "runtime",
    source: "stable_prefix",
    risk: "high",
    summary: "Review, approval, and staged mutation nodes map to runtime pause and approval semantics.",
    text: "review.input, approval.required, and mutation.stage runtime semantics.",
    duplicatedIn: ["src/main/workflow-program/workflowProgramLowering.ts", "src/main/workflow-program/workflowProgramCodegen.ts"],
    validatorRefs: ["validateWorkflowCompilerOutput", "dryRunWorkflowProgramOutput"],
    migrationBlockers: [],
  }),
  inventoryRule({
    id: "runtime-graph-source-mapping",
    owner: "validator",
    source: "stable_prefix",
    risk: "high",
    summary: "Generated graph nodes must map back to source calls for review, mutation, model, and connector events.",
    text: "Graph and source mappings must stay auditable.",
    duplicatedIn: ["src/main/workflow-compiler/workflowCompiler.test.ts"],
    validatorRefs: ["validateWorkflowSourceGraphMappings"],
    migrationBlockers: [],
  }),
  inventoryRule({
    id: "recipe-large-collection-pattern",
    owner: "retire",
    source: "stable_prefix",
    risk: "high",
    summary: "Retired global large-collection prose; the typed large_collection_summarization recipe owns this shape.",
    text: "Large collection pattern: use connector.paginate for connector pages or tool.paginate for paginated/read-only tool collection.",
    duplicatedIn: ["src/main/workflow-program/workflowProgramCompiler.test.ts", "src/main/workflow-compiler/workflowCompilerPlanCoverage.test.ts"],
    validatorRefs: ["workflowCompilerRecipes:large_collection_summarization", "validateWorkflowProgramStatic", "dryRunWorkflowProgramOutput"],
    migrationBlockers: [],
  }),
  inventoryRule({
    id: "runtime-recovery-fanout-contract",
    owner: "retire",
    source: "stable_prefix",
    risk: "high",
    summary: "Retired global recovery prose; selected recovery recipes and dry-run checks own this behavior.",
    text: "Recovery fan-out rule: for workflows that must demonstrate retry/skip/partial coverage, use loop.map or connector.map over item records with stable id/key fields.",
    duplicatedIn: ["src/main/workflow/workflowDogfood.test.ts"],
    validatorRefs: ["workflowCompilerRecipes:browser_item_recovery", "dryRunWorkflowProgramOutput", "validateWorkflowProgramStatic"],
    migrationBlockers: [],
  }),
  inventoryRule({
    id: "capability-selected-desktop-tools-section",
    owner: "capability",
    source: "capability_section",
    risk: "medium",
    summary: "Only selected desktop tools are serialized into the compiler prompt.",
    text: "Selected Desktop workflow capabilities.",
    duplicatedIn: ["src/main/workflow-compiler/workflowCompiler.test.ts", "src/main/workflow-compiler/workflowCompilerService.test.ts"],
    validatorRefs: ["validateWorkflowCompilerOutput"],
    migrationBlockers: [],
  }),
  inventoryRule({
    id: "capability-selected-connectors-section",
    owner: "capability",
    source: "connector_section",
    risk: "medium",
    summary: "Only selected workflow connectors and operations are serialized into the compiler prompt.",
    text: "Workflow connector capabilities.",
    duplicatedIn: ["src/main/workflow-compiler/workflowCompiler.test.ts", "src/main/workflow-compiler/workflowCompilerService.test.ts"],
    validatorRefs: ["validateWorkflowConnectorManifest", "validateWorkflowCompilerOutput"],
    migrationBlockers: [],
  }),
  inventoryRule({
    id: "runtime-dynamic-context-section",
    owner: "runtime",
    source: "dynamic_context",
    risk: "medium",
    summary: "Discovery answers, exploration traces, graph state, and debug rewrite context form the mutable prompt suffix.",
    text: "Workspace summary, discovery answers, exploration traces, current graph, debug rewrite context, and user request.",
    duplicatedIn: ["src/main/workflow-compiler/workflowCompilerService.test.ts"],
    validatorRefs: ["workflowPromptParts"],
    migrationBlockers: [],
  }),
];

const activePolicyPromptRuleDefinitions: WorkflowCompilerPromptRuleDefinition[] = [];

const retiredPolicyPromptRuleDefinitions: WorkflowCompilerPromptRuleDefinition[] = [
  policyRule({
    id: "policy-google-workspace-read-only-methods",
    owner: "retire",
    risk: "high",
    summary: "Retired Google Workspace read-only method prose; Google tool workflow guidance and static validation own this behavior.",
    exemplarText:
      "Google Workspace methods in this compiler path must be read-only: use list/get/search/export/freeBusy-style methods only. Do not create, update, delete, send, share, patch, or mutate Google resources.",
    duplicatedIn: ["src/main/workflow-compiler/workflowCompiler.test.ts", "src/main/workflow-program/workflowProgramTypecheck.ts"],
    validatorRefs: [
      "google_workspace_call.workflowGuidance",
      "google_workspace_search_methods.workflowGuidance",
      "validateWorkflowCompilerOutput",
      "validateWorkflowProgramStatic",
      "google.write_method_rejected",
      "google.search_methods_read_only_required",
    ],
    migrationBlockers: [],
  }),
  policyRule({
    id: "policy-google-workspace-account-time-window",
    owner: "retire",
    risk: "high",
    summary: "Retired Google account and Calendar window prose; Google tool workflow guidance and static validation own this behavior.",
    exemplarText:
      "Every google_workspace_call must carry accountHint from an explicit user-provided account handle or google_workspace_status; Calendar list/freebusy calls must include explicit timeMin, timeMax, and timeZone.",
    duplicatedIn: ["src/main/workflow-program/workflowProgramTypecheck.ts"],
    validatorRefs: [
      "google_workspace_call.workflowGuidance",
      "google_workspace_search_methods.workflowGuidance",
      "validateWorkflowProgramStatic",
      "google.account_hint_required",
      "google.calendar_time_range_required",
    ],
    migrationBlockers: [],
  }),
  policyRule({
    id: "validator-google-workspace-read-payload-ban",
    owner: "retire",
    risk: "high",
    summary: "Retired Google read-payload prompt prose; static validation rejects write-shaped payload fields.",
    exemplarText:
      "Read-only google_workspace_call nodes must not include write payload fields such as body, upload, or gmailDraft, except calendar.freebusy.query may use body for its time-bounded read request.",
    duplicatedIn: ["src/main/workflow-program/workflowProgramTypecheck.ts"],
    validatorRefs: [
      "google_workspace_call.workflowGuidance",
      "validateWorkflowProgramStatic",
      "google.read_only_payload_rejected",
    ],
    migrationBlockers: [],
  }),
  policyRule({
    id: "runtime-local-file-output-as-mutation-stage",
    owner: "retire",
    risk: "high",
    summary: "Retired local file staging prompt; file_write workflow guidance, staged export recipe, and static validation own this behavior.",
    exemplarText: "If local file output is needed, represent file_write as mutation.stage nodes for local workspace artifacts.",
    duplicatedIn: ["src/main/workflow-program/workflowProgramCompiler.test.ts"],
    validatorRefs: [
      "file_write.workflowGuidance",
      "workflowCompilerRecipes:staged_document_export",
      "validateWorkflowProgramStatic",
      "dryRunWorkflowProgramOutput",
      "ir.mutation_stage_required",
      "ir.redundant_stage_approval",
    ],
    migrationBlockers: [],
  }),
  policyRule({
    id: "validator-file-write-availability",
    owner: "retire",
    risk: "high",
    summary: "Retired file_write availability prompt; selected capabilities and unavailable-tool validation own this behavior.",
    exemplarText:
      "If file_write is not listed in Selected Desktop workflow capabilities, do not use file_write; use checkpoint.write plus output.final for read-only audit trails and in-app report cards.",
    duplicatedIn: ["src/main/workflow-compiler/workflowCompiler.test.ts", "src/main/workflow-program/workflowProgramTypecheck.ts"],
    validatorRefs: ["validateWorkflowCompilerOutput", "validateWorkflowProgramStatic", "ir.unavailable_tool", "file_write.workflowGuidance"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "capability-local-directory-skipped-metadata",
    owner: "retire",
    risk: "high",
    summary: "Retired local-directory skipped-metadata policy; local_directory_list workflow guidance and static validation own this behavior.",
    exemplarText:
      'Local directory skipped-metadata rule: local_directory_list returns entries plus skipped metadata for hidden, secret-like, and unreadable paths. For any directory inventory, categorization, or report workflow, preserve {fromNode:"<list-node>", path:"skipped"} plus truncated/totalKnownEntries in checkpoint.write, model.call input, document.render input, and output.final; report skipped counts/reasons as metadata only and never read skipped file contents.',
    duplicatedIn: ["scripts/workflow-agent-thread-ui-dogfood.mjs", "src/main/workflow/workflowDogfood.test.ts"],
    validatorRefs: ["local_directory_list.workflowGuidance", "validateWorkflowProgramStatic", "audit.local_directory_skipped_metadata_required"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "recipe-source-quality-dedupe",
    owner: "retire",
    risk: "high",
    summary: "Retired source-quality dedupe policy; selected current-web and large-collection recipes own this behavior.",
    exemplarText:
      'Source-quality rule: after multi-query web search or other broad source collection, add collection.dedupe with strategy:"url_canonical" and keyPath:"url" before fetching, chunking, or model synthesis. Do not rely only on tool pagination dedupe for research-quality source sets.',
    duplicatedIn: ["src/main/workflow-program/workflowProgramCompiler.test.ts", "src/main/workflow-compiler/workflowCompilerPlanCoverage.test.ts"],
    validatorRefs: [
      "workflowCompilerRecipes:current_web_research",
      "workflowCompilerRecipes:large_collection_summarization",
      "validateWorkflowProgramStatic",
    ],
    migrationBlockers: [],
  }),
  policyRule({
    id: "policy-current-data-evidence",
    owner: "retire",
    risk: "high",
    summary: "Retired current-data prompt rule; selected current-data recipes own freshness and evidence requirements.",
    exemplarText:
      "Current-data rule: for requests about today, tonight, latest, current, currently playing, schedules, showtimes, prices, availability, weather, sports, or other time-sensitive facts, use selected read-only current evidence tools/connectors before Ambient synthesis. Include the explicit run date, local time zone, location when location-specific, and evidence freshness in model input and final output; do not rely on model knowledge for current facts.",
    duplicatedIn: ["src/main/workflow-compiler/workflowCompilerPlanCoverage.test.ts"],
    validatorRefs: [
      "workflowCompilerRecipes:current_web_research",
      "workflowCompilerRecipes:movie_night_current_showtimes",
      "validateWorkflowProgramStatic",
      "workflow current-data dogfood gates",
    ],
    migrationBlockers: [],
  }),
  policyRule({
    id: "recipe-movie-night-current-showtimes",
    owner: "retire",
    risk: "medium",
    summary: "Retired movie-night recommendation prompt pattern; selected movie_night_current_showtimes recipe owns this behavior.",
    exemplarText:
      "Movie-night recommendation pattern: for current movie/showtime recommendations, use bounded browser_search/tool.paginate pageQueries for showtimes/currently playing, reviews/ratings, runtime/genre, and venue/travel friction; add collection.dedupe, collection.map, collection.chunk, model.map for option extraction, optional review.input for missing couple preferences, and model.reduce/model.call for the final go/no-go recommendation.",
    duplicatedIn: ["src/main/workflow-compiler/workflowCompilerPlanCoverage.test.ts"],
    validatorRefs: ["workflowCompilerRecipes:movie_night_current_showtimes", "validateWorkflowProgramStatic", "workflow movie-night current-data dogfood gate"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "capability-long-context-static-enforcement",
    owner: "retire",
    risk: "high",
    summary: "Retired long-context direct-large-evidence policy; selected capability guidance and static validation own this behavior.",
    exemplarText:
      "Long-field enforcement: when long_context_process is selected, a single model.call must not directly consume large collection outputs such as connector.map.items, connector.paginate.items, tool.paginate.items, collection.map.items, collection.dedupe.items, or collection.chunk.chunks. Use long_context_process first, or use collection.chunk plus model.map/model.reduce.",
    duplicatedIn: ["src/main/workflow-program/workflowProgramTypecheck.ts"],
    validatorRefs: ["long_context_process.workflowGuidance", "validateWorkflowProgramStatic"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "capability-long-context-preprocess",
    owner: "retire",
    risk: "high",
    summary: "Retired long-context preprocess policy; selected long_context_process capability guidance owns this behavior.",
    exemplarText:
      "Long-context rule: when connector/tool evidence has many records, exceptionally long fields, or deeply nested JSON, insert a tool.call to long_context_process before model.call. Pass bounded instructions plus the structured evidence in text, then feed the long-context response and source counts into model.call for final schema shaping.",
    duplicatedIn: ["src/main/workflow-program/workflowProgramTypecheck.ts"],
    validatorRefs: ["long_context_process.workflowGuidance", "validateWorkflowProgramStatic"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "capability-visual-loop-map-tool-call-shape",
    owner: "retire",
    risk: "high",
    summary: "Retired visual loop-map prompt; selected ambient_visual_analyze capability guidance owns this behavior.",
    exemplarText:
      'Nested loop.map tool-call shape: {"kind":"loop.map","items":{"fromNode":"list-images","path":"entries"},"itemName":"item","maxItems":10,"maxConcurrency":4,"map":{"kind":"tool.call","tool":"ambient_visual_analyze","args":{"image":{"path":{"fromItem":"item","path":"absolutePath"},"absolute":true,"source":"external_file","label":{"fromItem":"item","path":"name"}},"task":"image_description","allowExternalMediaPaths":true}}}.',
    duplicatedIn: ["src/main/workflow-program/workflowProgramCompiler.test.ts", "src/main/workflow/workflowDogfood.test.ts"],
    validatorRefs: ["ambient_visual_analyze.workflowGuidance", "validateWorkflowProgramStatic"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "policy-long-context-preserve-source-outputs",
    owner: "retire",
    risk: "high",
    summary: "Retired long-context audit preservation prompt; static validation now requires checkpoint-backed source inputs.",
    exemplarText:
      "Long-context preservation rule: do not replace full connector/tool outputs with summaries in checkpoints or audit outputs. Use long_context_process only as a model-input preprocessing node.",
    duplicatedIn: ["src/main/workflow-program/workflowProgramTypecheck.ts"],
    validatorRefs: ["audit.long_context_source_not_checkpointed", "validateWorkflowProgramStatic"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "recipe-google-transcript-action-items",
    owner: "retire",
    risk: "medium",
    summary:
      "Retired Google transcript action-item prompt pattern; selected google_meeting_transcript_action_items recipe owns this behavior.",
    exemplarText:
      "Google transcript action-item pattern: use connector.paginate for google.calendar listEvents over an explicit timeMin/timeMax/timeZone window, connector.paginate for google.drive search, bounded connector.map google.drive readFile for candidate transcript files, long_context_process over the readFile results plus event provenance, and a final model.call over the long_context_process response and counts only.",
    duplicatedIn: ["src/main/workflow/workflowDogfood.test.ts"],
    validatorRefs: [
      "workflowCompilerRecipes:google_meeting_transcript_action_items",
      "validateWorkflowConnectorManifest",
      "validateWorkflowProgramStatic",
      "dryRunWorkflowProgramOutput",
    ],
    migrationBlockers: [],
  }),
  policyRule({
    id: "capability-ambient-cli-describe-before-run",
    owner: "retire",
    risk: "high",
    summary: "Retired Ambient CLI describe-before-run prompt; selected Ambient CLI workflow guidance and static validation own this behavior.",
    exemplarText: "Ambient CLI execution must depend on a matching ambient_cli_describe node for the exact packageName/packageId and command before the first ambient_cli run.",
    duplicatedIn: ["src/main/workflow-program/workflowProgramCompiler.test.ts", "src/main/workflow-compiler/workflowCompiler.test.ts"],
    validatorRefs: ["ambient_cli.workflowGuidance", "validateWorkflowCompilerOutput", "validateWorkflowProgramStatic", "ambient_cli.describe_required"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "policy-ambient-cli-missing-env-setup",
    owner: "retire",
    risk: "high",
    summary: "Retired Ambient CLI missing-env prompt; selected Ambient CLI workflow guidance and static validation own this behavior.",
    exemplarText:
      "Ambient CLI missing-env rule: if selected capability metadata lists missingEnv, do not emit an ambient_cli execution node for that package yet. Emit a setup workflow using ambient_cli_secret_request as tool.call or ambient_cli_env_bind as mutation.stage, then output.final instructions to retry/recompile after Desktop reports the env configured.",
    duplicatedIn: ["src/main/workflow-program/workflowProgramCompiler.test.ts"],
    validatorRefs: ["ambient_cli.workflowGuidance", "validateWorkflowProgramStatic", "ambient_cli.capability_missing_env", "ambient_cli.secret_env_not_declared"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "policy-ambient-cli-secret-redaction",
    owner: "retire",
    risk: "high",
    summary: "Retired Ambient CLI secret-redaction prompt; selected Ambient CLI workflow guidance and static validation own this behavior.",
    exemplarText:
      "Ambient CLI secret rule: never include secret values in IR args, model input, checkpoints, logs, or file contents. ambient_cli_env_bind may include only a workspace-relative filePath; ambient_cli_secret_request may include only packageName/packageId and envName.",
    duplicatedIn: ["src/main/workflow-program/workflowProgramCompiler.test.ts"],
    validatorRefs: ["ambient_cli.workflowGuidance", "validateWorkflowProgramStatic", "ambient_cli.secret_value_rejected", "ambient_cli.env_bind_file_path_invalid"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "capability-browser-user-action-intervention",
    owner: "retire",
    risk: "high",
    summary: "Retired browser user-action prompt; browser capability guidance and browser.intervention validation own this behavior.",
    exemplarText:
      "Browser user-action rule: when a browser_search/browser_nav/browser_content/browser_login step may hit CAPTCHA/login/MFA/consent, use browser.intervention instead of raw tool.call plus hand-written retry logic.",
    duplicatedIn: ["src/main/desktopToolRegistry.ts", "src/main/workflow-program/workflowProgramCapabilityResolver.ts"],
    validatorRefs: ["browserSharedWorkflowGuidance", "validateWorkflowProgramStatic", "browser.intervention_review_required"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "capability-browser-login-intervention",
    owner: "retire",
    risk: "high",
    summary: "Retired browser login prompt; browser_login descriptor guidance and login intervention validation own this behavior.",
    exemplarText:
      "Browser login intervention rule: for browser_login, default to retry.maxAttempts:0 after the user handoff and verify progress with a dependent browser_content/browser_nav step, because refilling credentials after MFA/passkey completion can be unsafe or fail if the login form is gone.",
    duplicatedIn: ["src/main/desktopToolRegistry.ts", "src/main/workflow-program/workflowProgramCapabilityResolver.ts"],
    validatorRefs: ["browserLoginWorkflowGuidance", "validateWorkflowProgramStatic", "browser.login_intervention_retry_unsupported", "browser.login_review_required"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "runtime-browser-lower-level-handoff",
    owner: "retire",
    risk: "high",
    summary: "Retired low-level browser handoff prompt; browser workflow guidance and review validation own this behavior.",
    exemplarText:
      "Lower-level browser rule: if you use tool.call with waitForUserAction:false, the same IR must add a review.input handoff, put bounded metadata in options.data.browserIntervention, and route downstream work through it.",
    duplicatedIn: ["src/main/desktopToolRegistry.ts", "src/main/workflow-program/workflowProgramCapabilityResolver.ts"],
    validatorRefs: ["browserSharedWorkflowGuidance", "validateWorkflowProgramStatic", "browser.intervention_review_required"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "capability-browser-default-wait-behavior",
    owner: "retire",
    risk: "medium",
    summary: "Retired browser wait behavior prompt; browser descriptors and static validation own this behavior.",
    exemplarText: "Default browser behavior: omit waitForUserAction unless using browser.intervention or an explicit review.input handoff.",
    duplicatedIn: ["src/main/desktopToolRegistry.ts", "src/main/workflow-program/workflowProgramCapabilityResolver.ts"],
    validatorRefs: ["browserSharedWorkflowGuidance", "validateWorkflowProgramStatic", "browser.intervention_review_required"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "runtime-browser-user-action-resume",
    owner: "retire",
    risk: "high",
    summary: "Retired browser user-action resume prompt; browser workflow guidance and resume validation own this behavior.",
    exemplarText:
      "Use waitForUserAction:false only when the following node graph hands that BrowserUserActionState to review.input; browser userActionId resumes must depend on that review gate.",
    duplicatedIn: ["src/main/desktopToolRegistry.ts", "src/main/workflow-program/workflowProgramCapabilityResolver.ts"],
    validatorRefs: ["browserSharedWorkflowGuidance", "validateWorkflowProgramStatic", "browser.user_action_resume_requires_review"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "capability-browser-recovery-provenance",
    owner: "retire",
    risk: "high",
    summary: "Retired browser recovery provenance prompt; browser capability guidance and recovery recipe gates own this behavior.",
    exemplarText:
      "Browser recovery provenance rule: browser_nav returns compact page text and links and can be the evidence-producing item read. For browser item fan-out, feed the browser fan-out items/results directly into checkpoints and the final model.call input. Do not create empty evidence checkpoints or model calls that contain only instructions. Do not run a later browser_content loop over the active page after navigating multiple items; active-page reads are not item-stable. If browser_content is needed for each item, pass the item URL inside the same item-scoped fan-out and preserve the source id/item key.",
    duplicatedIn: ["src/main/desktopToolRegistry.ts", "src/main/workflow-compiler/workflowCompilerRecipes.ts", "src/main/workflow-compiler/workflowCompilerAbstractionRegression.test.ts"],
    validatorRefs: ["browserSharedWorkflowGuidance", "workflowCompilerRecipes:browser_item_recovery", "validateWorkflowProgramStatic"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "capability-visual-analysis-required",
    owner: "retire",
    risk: "high",
    summary: "Retired visual-evidence prompt; selected ambient_visual_analyze capability guidance owns this behavior.",
    exemplarText:
      "Visual-analysis rule: when the user asks to inspect, categorize, classify, compare, OCR, or summarize images/screenshots/video frames, use ambient_visual_analyze for visual evidence. Do not substitute a model.call over filenames or metadata for actual visual inspection.",
    duplicatedIn: ["src/main/workflow/workflowDogfood.test.ts", "scripts/workflow-agent-thread-ui-dogfood.mjs"],
    validatorRefs: ["ambient_visual_analyze.workflowGuidance", "workflow visual dogfood gates"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "capability-visual-fanout",
    owner: "retire",
    risk: "high",
    summary: "Retired visual fan-out prompt; selected ambient_visual_analyze capability guidance owns this behavior.",
    exemplarText:
      'Visual fan-out rule: for multiple local images, list the folder with local_directory_list, select the bounded image entries, then use loop.map with map.kind:"tool.call" and tool:"ambient_visual_analyze". Keep maxItems explicit and maxConcurrency at 4 unless a lower value is needed.',
    duplicatedIn: ["src/main/workflow-program/workflowProgramCompiler.test.ts", "src/main/workflow/workflowDogfood.test.ts"],
    validatorRefs: ["ambient_visual_analyze.workflowGuidance", "validateWorkflowProgramStatic"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "capability-visual-model-role",
    owner: "retire",
    risk: "medium",
    summary: "Retired visual synthesis prompt; selected ambient_visual_analyze capability guidance owns this behavior.",
    exemplarText:
      "Model-role rule: after visual evidence is collected, use model.call for the selected Ambient Desktop model to categorize or synthesize that evidence. Do not ask the user to choose a random cloud/local LLM provider in the workflow.",
    duplicatedIn: ["src/main/workflow/workflowDogfood.test.ts"],
    validatorRefs: ["ambient_visual_analyze.workflowGuidance"],
    migrationBlockers: [],
  }),
  policyRule({
    id: "validator-budget-static-minimum",
    owner: "retire",
    risk: "high",
    summary: "Retired static budget prompt; deterministic budget inference and validation own this behavior.",
    exemplarText:
      "Budget rule: if budgets are present, maxToolCalls, maxModelCalls, and maxConnectorCalls must be at least the static node counts. If omitted, Desktop infers the minimum static call budgets from the IR.",
    duplicatedIn: ["src/main/workflow-program/workflowProgramTypecheck.ts"],
    validatorRefs: [
      "validateWorkflowProgramStatic",
      "budget.max_tool_calls_too_low",
      "budget.max_model_calls_too_low",
      "budget.max_connector_calls_too_low",
    ],
    migrationBlockers: [],
  }),
  policyRule({
    id: "validator-large-budget-ceiling",
    owner: "retire",
    risk: "high",
    summary: "Retired large-budget ceiling prompt; deterministic budget ceiling validation owns this behavior.",
    exemplarText:
      "Large-budget ceiling rule: one workflow must not exceed 1000 static tool, model, or connector calls. For requests like categorizing 1000 Gmail messages, avoid a same-run 1000-thread readThread fan-out unless the resulting connector budget still fits. Prefer a tierable metadata-first plan: connector.paginate Gmail search metadata, collection.map, collection.chunk, model.map, tree model.reduce, and a bounded follow-up detail-read recommendation.",
    duplicatedIn: ["src/main/workflow-program/workflowProgramTypecheck.ts"],
    validatorRefs: [
      "validateWorkflowProgramStatic",
      "budget.max_tool_calls_ceiling_exceeded",
      "budget.max_model_calls_ceiling_exceeded",
      "budget.max_connector_calls_ceiling_exceeded",
    ],
    migrationBlockers: [],
  }),
  policyRule({
    id: "recipe-gmail-metadata-first-detail-gate",
    owner: "retire",
    risk: "high",
    summary: "Retired Gmail metadata-first detail-gate prompt; selected metadata-first recipe and Gmail descriptor own this behavior.",
    exemplarText:
      "Gmail metadata-first detail gate rule: when a large Gmail request asks to use metadata first or to ask before reading full bodies, the first workflow should stay metadata-only with google.gmail search pagination, then add a review.input gate or final follow-up recommendation for any bounded future detail-read batch. Do not include google.gmail readThread/readAttachment before that explicit review gate, and never include Gmail write operations for read-only categorization.",
    duplicatedIn: ["src/main/workflow/workflowStressTest.md", "src/main/workflow/workflowDogfood.test.ts"],
    validatorRefs: [
      "workflowCompilerRecipes:metadata_first_personal_data_review",
      "google.gmail.search descriptor metadata",
      "validateWorkflowConnectorManifest",
      "validateWorkflowProgramStatic",
      "workflow Gmail metadata-first dogfood gate",
    ],
    migrationBlockers: [],
  }),
];

export function buildWorkflowCompilerPolicyPromptRules(input: WorkflowCompilerPolicyPromptRuleInput): WorkflowCompilerPromptRule[] {
  return activePolicyPromptRuleDefinitions
    .filter((definition) => definition.owner !== "retire")
    .map((definition) => {
      const text = definition.render ? definition.render(input) : definition.exemplarText;
      if (!text) return undefined;
      return materializePromptRule(definition, text);
    })
    .filter((rule): rule is WorkflowCompilerPromptRule => Boolean(rule));
}

export function workflowCompilerPromptRuleInventory(): WorkflowCompilerPromptRule[] {
  return [
    ...staticPromptRuleInventory,
    ...activePolicyPromptRuleDefinitions.map((definition) => materializePromptRule(definition, definition.exemplarText)),
    ...retiredPolicyPromptRuleDefinitions.map((definition) => materializePromptRule(definition, definition.exemplarText)),
  ];
}

function policyRule(input: Omit<WorkflowCompilerPromptRuleDefinition, "source">): WorkflowCompilerPromptRuleDefinition {
  return { ...input, source: "policy_rules" };
}

function materializePromptRule(definition: WorkflowCompilerPromptRuleDefinition, text: string): WorkflowCompilerPromptRule {
  return {
    id: definition.id,
    owner: definition.owner,
    source: definition.source,
    risk: definition.risk,
    summary: definition.summary,
    text,
    duplicatedIn: definition.duplicatedIn,
    validatorRefs: definition.validatorRefs,
    migrationBlockers: definition.migrationBlockers,
  };
}

function inventoryRule(input: Omit<WorkflowCompilerPromptRule, "duplicatedIn" | "validatorRefs" | "migrationBlockers"> & Partial<Pick<WorkflowCompilerPromptRule, "duplicatedIn" | "validatorRefs" | "migrationBlockers">>): WorkflowCompilerPromptRule {
  return {
    duplicatedIn: [],
    validatorRefs: [],
    migrationBlockers: [],
    ...input,
  };
}
