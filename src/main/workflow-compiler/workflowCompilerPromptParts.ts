import type { WorkflowDiscoveryQuestion, WorkflowExplorationTraceSummary, WorkflowGraphSnapshot } from "../../shared/workflowTypes";
import type { DesktopToolDescriptor } from "./workflowCompilerDesktopToolFacade";
import type { WorkflowCompilerAmbientCliCapability } from "./workflowCompiler";
import { buildWorkflowCompilerPolicyPromptRules } from "./workflowCompilerPromptInventory";
import {
  assembleWorkflowCompilerPromptModules,
  workflowCompilerPolicyPromptModule,
  workflowCompilerPromptModule,
  type WorkflowCompilerPromptAssemblyRecord,
} from "./workflowCompilerPromptModules";
import {
  workflowCompilerCallableInvocationPromptModules,
  type WorkflowCompilerCallableInvocationContext,
} from "./workflowCompilerCallableInvocationPrompt";
import {
  selectWorkflowCompilerRecipes,
  workflowCompilerRecipeDefinitions,
  type WorkflowCompilerSelectedRecipe,
} from "./workflowCompilerRecipes";
import {
  workflowPlanDslPromptSchemaExample,
  workflowPromptParts,
  type WorkflowConnectorDescriptor,
  type WorkflowPromptParts,
} from "./workflowCompilerWorkflowFacade";

interface WorkflowCompilerPromptPartsInput {
  userRequest: string;
  workspaceSummary?: string;
  toolDescriptors: DesktopToolDescriptor[];
  ambientCliCapabilities?: WorkflowCompilerAmbientCliCapability[];
  connectorDescriptors?: WorkflowConnectorDescriptor[];
  selectedRecipes?: WorkflowCompilerSelectedRecipe[];
  discoveryQuestions?: WorkflowDiscoveryQuestion[];
  explorationTraces?: WorkflowExplorationTraceSummary[];
  graphSnapshot?: WorkflowGraphSnapshot;
  debugRewriteContext?: string;
  callableWorkflowInvocation?: WorkflowCompilerCallableInvocationContext;
  workflowThreadId?: string;
  revisionId?: string;
}

export type WorkflowCompilerPromptParts = WorkflowPromptParts & {
  promptAssembly: WorkflowCompilerPromptAssemblyRecord;
  selectedRecipes: WorkflowCompilerSelectedRecipe[];
};

export function buildWorkflowPlanDslPromptParts(input: WorkflowCompilerPromptPartsInput): WorkflowCompilerPromptParts {
  const selectedToolNames = new Set(input.toolDescriptors.map((tool) => tool.name));
  const selectedConnectorIds = new Set((input.connectorDescriptors ?? []).map((connector) => connector.id));
  const selectedRecipes =
    input.selectedRecipes ??
    selectWorkflowCompilerRecipes({
      userRequest: input.userRequest,
      workspaceSummary: input.workspaceSummary,
      selectedToolNames,
      selectedConnectorIds,
      discoveryQuestions: input.discoveryQuestions,
      explorationTraces: input.explorationTraces,
      graphSnapshot: input.graphSnapshot,
    });
  const stableModules = [
    workflowCompilerPromptModule({
      id: "core-workflow-plan-dsl-semantics",
      layer: "core",
      scope: "stable_prefix",
      reason: "Plan DSL is the high-level compiler contract before deterministic kernel lowering.",
      content: [
        "You are drafting an Ambient Desktop Workflow Plan DSL document.",
        "Return only JSON for the Workflow Plan DSL. Do not return WorkflowProgramIR, TypeScript, JavaScript, Markdown, JSON Patch, source code, or prose.",
        "The Plan DSL is high-level intent only. Ambient Desktop owns executable nodes, edges, dataflow paths, handles, tool call shapes, mutation gates, retries, and code generation.",
        "Never include raw IR keys or internals: no nodes, edges, dependsOn, fromNode, fromHandle, tool, connectorId, output.final, model.call, browser.intervention, collection.map, collection.filter, or other WorkflowProgramIR node kinds.",
        "",
        "Allowed stage kinds:",
        "- model_interaction: ask at most one user question, then synthesize a final output with Ambient.",
        "- browser_fixed_sources: read exact user-provided URLs with browser recovery, retain source evidence, optionally ask one user preference question, then synthesize.",
        "- current_web_research: collect bounded current public evidence with browser search, dedupe/map/chunk, synthesize with citations, and optionally stage a local report write.",
        "- gmail_readonly_categorization: use only for bounded read-only Gmail categorization when the user explicitly asks to search Gmail and read thread/message detail with readThread under budget. Put maxMessages/maxItems, pageSize/maxResults, maxPages, maxConcurrency, maxCategories, query, and accountId in stage.inputs when known.",
        "- gmail_metadata_review: use for metadata-only Gmail search/categorization. Do not readThread or attachments. Put maxMessages/maxItems, pageSize/maxResults, maxPages, maxCategories, query, and accountId in stage.inputs when known.",
        "- local_file_classification: classify explicitly named local files or one bounded local directory. Use stage.inputs.paths/files/filePaths for exact workspace files, or stage.inputs.directory plus maxEntries/maxDepth/metadataOnly for metadata-only directory inventory.",
        "- visual_batch_classification: list one local directory, deterministically select visible image entries by extension/name prefix, run bounded ambient_visual_analyze with task image_description, then synthesize categories from visual observations and skipped metadata.",
        "- metadata_first_review: use for metadata-only local directory review when the user explicitly requests local_directory_list, or as an alias for metadata-only Gmail review when Gmail is the source.",
        "- staged_document_export: render and stage a local file write from a prior synthesis; prefer current_web_research inputs.outputPath for current web report export.",
        "- unsupported: use when the request cannot be represented by available high-level kernels without unsafe guessing.",
        "",
        "Output and mutation semantics:",
        "- For a simple in-app HTML page, report, card, preview, or final answer, use model_interaction and an outputContract format such as html, markdown, or text.",
        "- Use staged_document_export only when the user explicitly asks to save, write, export to a local path, or otherwise mutate workspace files.",
        "- Do not infer a local file write merely from words like artifact, report, HTML, card, preview, or output.",
        "",
        "Workflow Plan DSL JSON shape:",
        JSON.stringify(workflowPlanDslPromptSchemaExample(), null, 2),
      ],
    }),
    workflowCompilerPromptModule({
      id: "workflow-plan-dsl-selected-recipes",
      layer: "recipe",
      scope: "stable_prefix",
      reason: "Selected recipes map request intent to high-level Plan DSL kernels without exposing executable IR internals.",
      selectedRecipeIds: selectedRecipes.map((recipe) => recipe.id),
      content: [
        "Selected workflow recipe hints:",
        selectedRecipes.length
          ? selectedRecipes
              .map(
                (recipe) =>
                  `- ${recipe.id}: ${recipe.summary} Required shape: ${recipe.requiredNodeKinds.join(", ") || "none"}. Use a high-level stage kind, not raw nodes.`,
              )
              .join("\n")
          : "No typed recipes were selected. Prefer model_interaction for a simple model/user workflow.",
      ],
    }),
    workflowCompilerPromptModule({
      id: "workflow-plan-dsl-selected-capabilities",
      layer: "capability",
      scope: "stable_prefix",
      reason: "Plan DSL can use capability availability for kernel selection without seeing executable call skeletons.",
      selectedToolNames: [...selectedToolNames].sort(),
      selectedConnectorIds: [...selectedConnectorIds].sort(),
      content: [
        "Selected capability summary:",
        workflowPlanDslToolPromptSection(input.toolDescriptors),
        "",
        workflowPlanDslConnectorPromptSection(input.connectorDescriptors),
      ],
    }),
  ];
  const mutableModules = [
    workflowCompilerPromptModule({
      id: "dynamic-workspace-summary",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Request-specific project context changes between compiles.",
      content: ["Workspace summary:", input.workspaceSummary?.trim() || "No workspace summary provided."],
    }),
    workflowCompilerPromptModule({
      id: "dynamic-discovery-answers",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Workflow discovery answers are mutable user context.",
      content: ["", "Workflow discovery answers:", workflowProgramDiscoveryPromptSection(input.discoveryQuestions)],
    }),
    workflowCompilerPromptModule({
      id: "dynamic-exploration-traces",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Exploration traces are request-specific capability and observation context.",
      content: ["", "Workflow exploration traces:", workflowProgramExplorationPromptSection(input.explorationTraces)],
    }),
    workflowCompilerPromptModule({
      id: "dynamic-current-graph-plan-dsl",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Revision compiles may depend on the current graph snapshot, but the plan must stay high-level.",
      content: [
        "",
        "Current workflow graph summary:",
        input.graphSnapshot
          ? JSON.stringify(
              {
                summary: input.graphSnapshot.summary,
                nodeCount: input.graphSnapshot.nodes.length,
                edgeCount: input.graphSnapshot.edges.length,
              },
              null,
              2,
            )
          : "No workflow graph snapshot was provided.",
      ],
    }),
    workflowCompilerPromptModule({
      id: "dynamic-debug-rewrite-context",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Failed-run rewrite context is only included for targeted debug compiles.",
      content: [
        "",
        "Workflow debug rewrite context:",
        input.debugRewriteContext?.trim() || "No failed-run debug rewrite context was provided.",
      ],
    }),
    ...workflowCompilerCallableInvocationPromptModules(input.callableWorkflowInvocation),
    workflowCompilerPromptModule({
      id: "dynamic-user-request",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "The user's current workflow request is the mutable task definition.",
      content: ["", "User request:", input.userRequest],
    }),
  ];
  const { stablePrefix, mutableSuffix, promptAssembly } = assembleWorkflowCompilerPromptModules({
    stableModules,
    mutableModules,
  });
  const promptParts = workflowPromptParts({
    stage: input.revisionId ? "revision_compile" : "compile",
    workflowThreadId: input.workflowThreadId,
    revisionId: input.revisionId,
    graphSnapshotId: input.graphSnapshot?.id,
    stablePrefix,
    mutableSuffix,
    boundaryLabel: "Workflow Plan DSL compiler cache checkpoint",
  });
  return { ...promptParts, promptAssembly, selectedRecipes };
}

export function buildWorkflowProgramIrPromptParts(input: WorkflowCompilerPromptPartsInput): WorkflowCompilerPromptParts {
  const selectedToolNames = new Set(input.toolDescriptors.map((tool) => tool.name));
  const selectedConnectorIds = new Set((input.connectorDescriptors ?? []).map((connector) => connector.id));
  const selectedRecipes =
    input.selectedRecipes ??
    selectWorkflowCompilerRecipes({
      userRequest: input.userRequest,
      workspaceSummary: input.workspaceSummary,
      selectedToolNames,
      selectedConnectorIds,
      discoveryQuestions: input.discoveryQuestions,
      explorationTraces: input.explorationTraces,
      graphSnapshot: input.graphSnapshot,
    });
  const hasGoogleWorkspaceTools = [
    "google_workspace_status",
    "google_workspace_call",
    "google_workspace_materialize_file",
    "google_workspace_search_methods",
  ].some((toolName) => selectedToolNames.has(toolName));
  const mutationStageToolExamples = [
    selectedToolNames.has("file_write") ? "file_write" : undefined,
    hasGoogleWorkspaceTools && selectedToolNames.has("google_workspace_materialize_file") ? "google_workspace_materialize_file" : undefined,
  ].filter((toolName): toolName is string => Boolean(toolName));
  const policyRules = buildWorkflowCompilerPolicyPromptRules({
    selectedToolNames,
    selectedConnectorIds,
    userRequest: input.userRequest,
  });
  const stableModules = [
    workflowCompilerPromptModule({
      id: "core-workflow-program-ir-semantics",
      layer: "core",
      scope: "stable_prefix",
      reason: "Always include the WorkflowProgramIR role, JSON-only contract, and supported node catalog.",
      content: [
        "You are planning an Ambient Desktop workflow as typed WorkflowProgramIR JSON.",
        "Return only JSON. Do not generate TypeScript, JavaScript, Markdown, patches, or prose.",
        "Ambient Desktop will compile, typecheck, code-generate, dry-run, and persist the workflow deterministically.",
        "",
        "Allowed node kinds:",
        "- tool.call: use for tools.* calls with literal tool names from the selected capabilities.",
        '- tool.paginate: use for bounded fan-out over a read-only tool that declares pagination metadata. Include tool, input, pageQueries for non-cursor query fan-out, maxItems, maxPages, optional pageSize, optional itemsPath, optional queryInputPath/pageSizeInputPath, and optional dedupeKeyPath. browser_search returns a root array, so use itemsPath:"" plus queryInputPath:"query" and pageSizeInputPath:"maxResults".',
        "- browser.intervention: use for browser_search/browser_nav/browser_content/browser_login calls that may hit CAPTCHA/login/MFA/consent. Desktop will call the browser tool with waitForUserAction:false, pause only if browser user-action state is returned, and offer completed/skip choices. Search/nav/content retries the same operation with userActionId; browser_login should normally use retry.maxAttempts:0 and let a downstream browser_content step verify the logged-in page. Use skipIf to avoid a later browser read when an earlier browser.intervention was skipped.",
        "- connector.call: use for connectors.call with literal connectorId and operation from selected connector capabilities. Include input, optional accountId, optional idempotencyKey, and optional output schema.",
        "- connector.paginate: use for bounded cursor/page-token retrieval from a connector operation that declares pagination metadata. Include connectorId, operation, input, maxItems, maxPages, optional pageSize, and optional dedupeKeyPath. Use this for requests like 300 Gmail messages rather than inventing loop logic.",
        '- connector.map: use for bounded parallel connector fan-out over an array from a prior node. Include connectorId, operation, items, itemName, input using {"fromItem":"item","path":"field"}, maxItems, and optional maxConcurrency capped at 4 unless there is a specific reason.',
        "- collection.map: use for deterministic bounded reshaping of an array from a prior node. Include items, itemName, map, and maxItems. Use this to strip large connector records down to the fields needed before chunking or model calls.",
        "- collection.filter: use for deterministic bounded selection of an array from a prior node by file extension or file-name rules before downstream fan-out. Include items, maxItems, optional includeExtensions, includeNamePrefixes, excludeNamePrefixes, excludeNameIncludes, and requireFile.",
        '- collection.dedupe: use for deterministic source-quality deduplication before downstream fan-out. Include items, optional keyPath, strategy:"exact"|"url_canonical", and maxItems. It outputs items/count/sourceCount/duplicateCount/truncated/maxItems/keyPath/strategy.',
        "- collection.chunk: use for deterministic chunking before repeated model reasoning. Include items, chunkSize, and maxChunks. It outputs chunks with {id,index,start,end,count,items}.",
        '- document.render: use for deterministic Markdown, HTML, or PDF report artifacts. Include input, optional title, format:"markdown"|"html"|"pdf", and optional path. It outputs artifactPath/path/content/bytes/mimeType; follow it with mutation.stage file_write when the user asked to store a local file.',
        "- model.call: use for Ambient reasoning. Include output.schema; Desktop will generate ambient.call with outputContract inside input.",
        '- model.map: use for bounded parallel Ambient reasoning over chunks/items. Include items, itemName, task, input using {"fromItem":"item","path":"field"}, output.schema, maxItems, and maxConcurrency capped at 4.',
        '- model.reduce: use for final Ambient synthesis over model.map outputs. Include items, task, input, output.schema, and maxInputItems. For more than one bounded fan-in worth of summaries, set strategy:"tree" with maxFanIn 4-16 and maxLevels high enough to converge. Do not feed hundreds of raw connector records into one model.call.',
        "- checkpoint.write: persist named intermediate values.",
        `- mutation.stage: use for workspace-writing selected tools${mutationStageToolExamples.length ? ` such as ${mutationStageToolExamples.join(" or ")}` : ""}. Include tool, args, and optional changeSet; Desktop will generate workflow.stageMutation. Do not add approval.required after mutation.stage; the staged mutation itself is the approval gate.`,
        "- review.input: pause for structured user input with prompt, choices, allowFreeform, and optional bounded data; Desktop will generate workflow.askUser.",
        "- approval.required: pause for approval of a proposed changeSet without applying it; mutation.stage already includes approval for workspace writes, so never chain approval.required to approve a staged mutation output.",
        "- branch.if: select a deterministic value from condition, then, and optional else expressions. Use for conditional data shaping, not arbitrary code.",
        '- loop.map: map deterministic item data through a value/template expression, or perform bounded fan-out over a selected read-only/run-process tool by setting map to a nested tool.call. Use {"fromItem":"item","path":"field"} inside map.args; keep maxItems bounded and maxConcurrency capped at 4.',
        "- transform.template: render deterministic text from prior node outputs.",
        "- error.handle: wrap a risky value reference with a deterministic fallback object for recoverable missing/invalid intermediate data.",
        "- output.final: declare final workflow output.",
        "",
      ],
    }),
    workflowCompilerPromptModule({
      id: "runtime-reference-contracts",
      layer: "runtime",
      scope: "stable_prefix",
      reason: "Always include data-reference and known runtime output path semantics.",
      content: [
        'Prefer compiler-owned output handles for prior outputs: use {"fromHandle":"producerAlias.outputField"}. The compiler lowers handles deterministically before validation. Producer aliases use camelCase node ids such as askUser.choiceId, searchRecords.items, renderReport.artifactPath, and stageWrite.path; the exact node id is also accepted as a fallback. Add path or subPath only for nested indexing below the declared output field. Use raw {"fromNode":"node-id","path":"optional.field.path"} only for whole-node output or when no declared handle is available; do not invent raw paths.',
        "Known reference path contract: review.input outputs requestId, choiceId, text, and prompt; use choiceId, never choice or selectedChoice. approval.required outputs id, changeSet, and status. document.render outputs artifactPath, path, content, bytes, and mimeType. mutation.stage/file_write outputs path and bytes after the staged write is approved; do not reference mutation.stage changeSet/status or feed a mutation.stage output into approval.required.",
        'Inside loop.map.map, collection.map.map, connector.map.input, and model.map.input only, reference the current item with {"fromItem":"item","path":"optional.field.path"}.',
        'In collection.map, connector.map, model.map, and loop.map, never use bare field-name strings like {"id":"id"} when you mean to copy a current item value; that emits a literal string. Use {"id":{"fromItem":"item","path":"id"}} or wrap intentional constants with {"literal": value}.',
        'Use {"literal": value} only when an object must be treated as a literal value instead of a data-reference expression.',
      ],
    }),
    ...workflowProgramRecipePromptModules(selectedRecipes),
    workflowCompilerPromptModule({
      id: "core-workflow-program-ir-example",
      layer: "core",
      scope: "stable_prefix",
      reason: "Include only a compact neutral JSON shape; selected capabilities and recipes own concrete tool examples.",
      content: [
        "WorkflowProgramIR JSON shape:",
        JSON.stringify(
          {
            version: 1,
            title: "Short workflow title",
            goal: "Concrete user-facing workflow goal.",
            summary: "One paragraph summary.",
            successCriteria: ["Observable success condition."],
            nodes: [
              {
                id: "ask-user",
                kind: "review.input",
                prompt: "Ask for one bounded user decision before synthesis.",
                choices: [
                  { id: "continue", label: "Continue" },
                  { id: "revise", label: "Revise" },
                ],
                allowFreeform: true,
              },
              {
                id: "synthesize",
                kind: "model.call",
                dependsOn: ["ask-user"],
                task: "synthesize.workflow.result",
                input: { userDecision: { fromHandle: "askUser.choiceId" } },
                output: { schema: { title: "string", summary: "string", nextSteps: "array" } },
              },
              {
                id: "final",
                kind: "output.final",
                dependsOn: ["synthesize"],
                value: { summary: { fromHandle: "synthesize.summary" }, nextSteps: { fromHandle: "synthesize.nextSteps" } },
              },
            ],
            budgets: { maxModelCalls: 1, maxRunMs: 300000 },
            openQuestions: [],
          },
          null,
          2,
        ),
      ],
    }),
    ...policyRules.map(workflowCompilerPolicyPromptModule),
    ...workflowProgramToolGuidancePromptModules(input.toolDescriptors),
    workflowCompilerPromptModule({
      id: "capability-selected-desktop-tools",
      layer: "capability",
      scope: "stable_prefix",
      reason: "Include only the selected desktop workflow tools for this compile.",
      selectedToolNames: [...selectedToolNames].sort(),
      content: ["", "Selected Desktop workflow capabilities:", workflowProgramToolPromptSection(input.toolDescriptors)],
    }),
    ...(input.ambientCliCapabilities?.length
      ? [
          workflowCompilerPromptModule({
            id: "ambient-cli-selected-capabilities",
            layer: "ambient_cli",
            scope: "stable_prefix",
            reason: "Include installed Ambient CLI commands selected by request and exploration context.",
            selectedToolNames: input.ambientCliCapabilities.map((capability) => capability.capabilityId).sort(),
            content: ["", "Ambient CLI workflow capabilities:", workflowProgramAmbientCliPromptSection(input.ambientCliCapabilities)],
          }),
        ]
      : []),
    workflowCompilerPromptModule({
      id: "connector-selected-workflow-connectors",
      layer: "connector",
      scope: "stable_prefix",
      reason: "Include only selected workflow connector descriptors and operations.",
      selectedConnectorIds: [...selectedConnectorIds].sort(),
      content: ["", workflowProgramConnectorPromptSection(input.connectorDescriptors)],
    }),
  ];
  const mutableModules = [
    workflowCompilerPromptModule({
      id: "dynamic-workspace-summary",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Request-specific project context changes between compiles.",
      content: ["Workspace summary:", input.workspaceSummary?.trim() || "No workspace summary provided."],
    }),
    workflowCompilerPromptModule({
      id: "dynamic-discovery-answers",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Workflow discovery answers are mutable user context.",
      content: ["", "Workflow discovery answers:", workflowProgramDiscoveryPromptSection(input.discoveryQuestions)],
    }),
    workflowCompilerPromptModule({
      id: "dynamic-exploration-traces",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Exploration traces are request-specific capability and observation context.",
      content: ["", "Workflow exploration traces:", workflowProgramExplorationPromptSection(input.explorationTraces)],
    }),
    workflowCompilerPromptModule({
      id: "dynamic-current-graph-ir",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Revision compiles may depend on the current graph snapshot.",
      content: [
        "",
        "Current workflow graph IR:",
        input.graphSnapshot
          ? JSON.stringify(
              { summary: input.graphSnapshot.summary, nodes: input.graphSnapshot.nodes, edges: input.graphSnapshot.edges },
              null,
              2,
            )
          : "No workflow graph snapshot was provided.",
      ],
    }),
    workflowCompilerPromptModule({
      id: "dynamic-debug-rewrite-context",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Failed-run rewrite context is only included for targeted debug compiles.",
      content: [
        "",
        "Workflow debug rewrite context:",
        input.debugRewriteContext?.trim() || "No failed-run debug rewrite context was provided.",
      ],
    }),
    ...workflowCompilerCallableInvocationPromptModules(input.callableWorkflowInvocation),
    workflowCompilerPromptModule({
      id: "dynamic-user-request",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "The user's current workflow request is the mutable task definition.",
      content: ["", "User request:", input.userRequest],
    }),
  ];
  const { stablePrefix, mutableSuffix, promptAssembly } = assembleWorkflowCompilerPromptModules({
    stableModules,
    mutableModules,
  });
  const promptParts = workflowPromptParts({
    stage: input.revisionId ? "revision_compile" : "compile",
    workflowThreadId: input.workflowThreadId,
    revisionId: input.revisionId,
    graphSnapshotId: input.graphSnapshot?.id,
    stablePrefix,
    mutableSuffix,
    boundaryLabel: "WorkflowProgramIR compiler cache checkpoint",
  });
  return { ...promptParts, promptAssembly, selectedRecipes };
}

function workflowProgramToolPromptSection(tools: DesktopToolDescriptor[]): string {
  if (tools.length === 0) return "- none";
  return tools
    .map((tool) =>
      [
        `- ${tool.name}: ${tool.description}`,
        `  scope: ${tool.permissionScope}; sideEffects: ${tool.sideEffects}; dryRun: ${tool.supportsDryRun}`,
        tool.pagination
          ? `  pagination: {itemsPath:${tool.pagination.itemsPath ?? "items"},nextPageTokenPath:${tool.pagination.nextPageTokenPath ?? "none"},pageTokenInputPath:${tool.pagination.pageTokenInputPath ?? "none"},queryInputPath:${tool.pagination.queryInputPath ?? "none"},pageSizeInputPath:${tool.pagination.pageSizeInputPath ?? "none"},defaultPageSize:${tool.pagination.defaultPageSize},maxPageSize:${tool.pagination.maxPageSize},queryFanOut:${tool.pagination.queryFanOut === true}}`
          : undefined,
        `  inputSchema: ${JSON.stringify(tool.inputSchema)}`,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
    )
    .join("\n");
}

function workflowPlanDslToolPromptSection(tools: DesktopToolDescriptor[]): string {
  if (tools.length === 0) return "- none";
  return tools
    .map((tool) => {
      const policy = ` sideEffects=${tool.sideEffects}; scope=${tool.permissionScope}`;
      const outputFields =
        tool.outputSchema && typeof tool.outputSchema === "object"
          ? ` outputs=${Object.keys(tool.outputSchema as Record<string, unknown>)
              .slice(0, 8)
              .join(",")}`
          : "";
      return `- ${tool.name}: ${tool.label || tool.description || "workflow tool"}.${policy}${outputFields}`;
    })
    .join("\n");
}

function workflowPlanDslConnectorPromptSection(connectors: WorkflowConnectorDescriptor[] | undefined): string {
  if (!connectors?.length) return "No workflow connectors were selected.";
  return connectors
    .map((connector) => {
      const operations = connector.operations.map((operation) => `${operation.name}(${operation.sideEffects})`).join(", ");
      return `- ${connector.id}: ${connector.description}; auth=${connector.auth.status}; operations=${operations || "none"}`;
    })
    .join("\n");
}

function workflowProgramRecipePromptModules(selectedRecipes: WorkflowCompilerSelectedRecipe[]) {
  if (selectedRecipes.length === 0) return [];
  const definitionsById = new Map(workflowCompilerRecipeDefinitions().map((recipe) => [recipe.id, recipe]));
  return selectedRecipes.map((selectedRecipe) => {
    const definition = definitionsById.get(selectedRecipe.id);
    return workflowCompilerPromptModule({
      id: `recipe-${selectedRecipe.id}`,
      layer: "recipe",
      scope: "stable_prefix",
      reason: selectedRecipe.reason,
      selectedRecipeIds: [selectedRecipe.id],
      selectedToolNames: selectedRecipe.compatibleToolNames.filter((toolName) => selectedRecipe.matchedSignals.includes(toolName)),
      selectedConnectorIds: selectedRecipe.compatibleConnectorIds.filter((connectorId) =>
        selectedRecipe.matchedSignals.includes(connectorId),
      ),
      content: [
        `Recipe ${selectedRecipe.id}: ${selectedRecipe.title}`,
        selectedRecipe.summary,
        `Why selected: ${selectedRecipe.reason}`,
        `Selection confidence: ${selectedRecipe.confidence}`,
        `Matched signals: ${selectedRecipe.matchedSignals.join(", ") || "none recorded"}`,
        `Applicability tags: ${selectedRecipe.applicabilityTags.join(", ")}`,
        `Required node kinds: ${selectedRecipe.requiredNodeKinds.join(", ") || "none"}`,
        `Preferred node kinds: ${selectedRecipe.preferredNodeKinds.join(", ") || "none"}`,
        `Budget effects: ${selectedRecipe.budgetEffects.join(" ") || "No special budget effects."}`,
        selectedRecipe.policyImplications.length
          ? `Policy implications: ${selectedRecipe.policyImplications.map((implication) => `${implication.id}(${implication.severity})`).join(", ")}`
          : "Policy implications: none",
        `Validators: ${selectedRecipe.validatorRefs.join(", ") || "none"}`,
        definition?.promptGuidance,
        definition ? `Short IR example: ${JSON.stringify(definition.irExample)}` : undefined,
      ].filter((line): line is string => Boolean(line)),
    });
  });
}

function workflowProgramToolGuidancePromptModules(tools: DesktopToolDescriptor[]) {
  const guidanceById = new Map<
    string,
    {
      guidance: NonNullable<DesktopToolDescriptor["workflowGuidance"]>[number];
      toolNames: Set<string>;
    }
  >();
  for (const tool of tools) {
    for (const guidance of tool.workflowGuidance ?? []) {
      const existing = guidanceById.get(guidance.id);
      if (existing) {
        existing.toolNames.add(tool.name);
      } else {
        guidanceById.set(guidance.id, { guidance, toolNames: new Set([tool.name]) });
      }
    }
  }
  return [...guidanceById.values()]
    .sort((left, right) => left.guidance.id.localeCompare(right.guidance.id))
    .map(({ guidance, toolNames }) =>
      workflowCompilerPromptModule({
        id: `capability-guidance-${guidance.id}`,
        layer: "capability",
        scope: "stable_prefix",
        reason: guidance.summary,
        ruleIds: [guidance.id],
        selectedToolNames: [...toolNames].sort(),
        content: [
          `Capability guidance ${guidance.id}: ${guidance.summary}`,
          `risk: ${guidance.risk}; appliesTo: ${guidance.applicabilityTags.join(", ") || "selected capability"}`,
          guidance.validatorRefs.length ? `validators: ${guidance.validatorRefs.join(", ")}` : undefined,
          guidance.text,
        ].filter((line): line is string => Boolean(line)),
      }),
    );
}

function workflowProgramAmbientCliPromptSection(capabilities: WorkflowCompilerAmbientCliCapability[] | undefined): string {
  if (!capabilities?.length) return "No installed Ambient CLI command capabilities were selected.";
  return capabilities
    .slice(0, 12)
    .map((capability) =>
      [
        `- ${capability.packageName}:${capability.command} [${capability.capabilityId}]`,
        capability.description ? `  description: ${capability.description}` : undefined,
        `  availability: ${capability.availability}; risk: ${capability.risk.join(", ") || "none"}`,
        capability.missingEnv.length ? `  missingEnv: ${capability.missingEnv.join(", ")}; setup only until configured` : undefined,
        `  IR describe node: {"kind":"tool.call","tool":"ambient_cli_describe","args":{"packageName":"${capability.packageName}","command":"${capability.command}"}}`,
        `  IR run node: {"kind":"tool.call","tool":"ambient_cli","dependsOn":["<describe-node-id>"],"args":{"packageName":"${capability.packageName}","command":"${capability.command}","args":[]}}`,
        capability.missingEnv.length
          ? `  IR secret setup node: {"kind":"tool.call","tool":"ambient_cli_secret_request","dependsOn":["<describe-node-id>"],"args":{"packageName":"${capability.packageName}","envName":"${capability.missingEnv[0]}"}}`
          : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
    )
    .join("\n");
}

function workflowProgramConnectorPromptSection(connectors: WorkflowConnectorDescriptor[] | undefined): string {
  if (!connectors?.length) return "No workflow connectors were selected. Prefer first-party tools when available.";
  return connectors
    .map((connector) =>
      [
        `- ${connector.id}: ${connector.description}`,
        `  auth: ${connector.auth.type}/${connector.auth.status}; accounts: ${connector.accounts.map((account) => account.id).join(", ") || "none"}`,
        `  operations: ${connector.operations.map((operation) => workflowProgramConnectorOperationPromptSummary(operation)).join("; ")}`,
        workflowProgramConnectorSpecificGuidance(connector),
        connector.operations.some((operation) => operation.pagination)
          ? `  IR connector.paginate skeleton: {"kind":"connector.paginate","connectorId":"${connector.id}","operation":"<paginated-operation-from-list-above>","input":{},"maxItems":100,"maxPages":2,"pageSize":50,"dedupeKeyPath":"id","output":{"schema":{"items":"array","pages":"array","count":"number","pageCount":"number","truncated":"boolean"}}}`
          : undefined,
        `  IR connector.call: {"kind":"connector.call","connectorId":"${connector.id}","operation":"${connector.operations[0]?.name ?? "operation"}","input":{},"output":{"schema":{}}}`,
        `  IR connector.map skeleton: {"kind":"connector.map","connectorId":"${connector.id}","operation":"<detail-operation-from-list-above>","items":{"fromHandle":"<listNodeAlias>.items"},"itemName":"item","input":{"<id-field>":{"fromItem":"item","path":"id"}},"maxItems":4,"maxConcurrency":4,"output":{"schema":{"items":"array","count":"number","sourceCount":"number","truncated":"boolean"}}}`,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
    )
    .join("\n");
}

function workflowProgramConnectorSpecificGuidance(connector: WorkflowConnectorDescriptor): string | undefined {
  if (connector.id !== "google.gmail") return undefined;
  const hasSearch = connector.operations.some((operation) => operation.name === "search");
  const hasReadThread = connector.operations.some((operation) => operation.name === "readThread");
  if (!hasSearch || !hasReadThread) return undefined;
  return [
    "  Gmail detail rule: for bounded Gmail categorization/reporting that asks for message/thread detail, action required, urgency, sender/domain, or recurring themes, do not synthesize from search snippets alone.",
    "  Use google.gmail search or connector.paginate search first, then connector.map google.gmail readThread with threadId from each selected search/thread item before Ambient synthesis.",
    "  Use metadata-only search/chunk/reduce instead only when the request explicitly asks for metadata-first, asks to review before full-body reads, or is a very large mailbox batch where full thread reads would exceed the connector budget.",
  ].join("\n");
}

function workflowProgramConnectorOperationPromptSummary(operation: WorkflowConnectorDescriptor["operations"][number]): string {
  const pagination = operation.pagination
    ? `; pagination={itemsPath:${operation.pagination.itemsPath ?? "items"},nextPageTokenPath:${operation.pagination.nextPageTokenPath ?? "nextPageToken"},pageTokenInputPath:${operation.pagination.pageTokenInputPath ?? operation.pagination.cursorField},pageSizeInputPath:${operation.pagination.pageSizeInputPath ?? "none"},defaultPageSize:${operation.pagination.defaultPageSize},maxPageSize:${operation.pagination.maxPageSize}}`
    : "";
  return `${operation.name}(${operation.sideEffects}; scopes=${operation.requiredScopes.join("+") || "none"}${pagination}; inputSchema=${JSON.stringify(operation.inputSchema)})`;
}

function workflowProgramDiscoveryPromptSection(questions: WorkflowDiscoveryQuestion[] | undefined): string {
  if (!questions?.length) return "No workflow discovery answers were provided.";
  return questions
    .map((question) => {
      const selectedChoice = question.answer?.choiceId
        ? question.choices.find((choice) => choice.id === question.answer?.choiceId)
        : undefined;
      return [
        `- ${question.category}: ${question.question}`,
        selectedChoice ? `  selected: ${selectedChoice.label} - ${selectedChoice.description}` : undefined,
        question.answer?.freeform ? `  freeform: ${question.answer.freeform}` : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n");
    })
    .join("\n");
}

function workflowProgramExplorationPromptSection(traces: WorkflowExplorationTraceSummary[] | undefined): string {
  if (!traces?.length) return "No workflow exploration traces were provided.";
  return JSON.stringify(
    traces.slice(0, 3).map((trace) => ({
      id: trace.id,
      request: trace.request,
      observationCount: trace.observations.length,
      capabilityManifest: trace.capabilityManifest,
      distillation: trace.distillation,
    })),
    null,
    2,
  );
}
