import type { DesktopToolDescriptor } from "./desktopToolRegistry";
import type { WorkflowConnectorDescriptor } from "./workflowConnectors";
import type { WorkflowProgramAmbientCliCapability, WorkflowProgramDiagnostic } from "./workflowProgramCompiler";

export type WorkflowProgramIrPatchOperation =
  | { op: "add"; path: string; value: unknown }
  | { op: "replace"; path: string; value: unknown }
  | { op: "remove"; path: string };

export type WorkflowProgramIrTypedRepairOperation =
  | {
      kind: "replace_with_alternative";
      path: string;
      value: unknown;
      alternatives?: unknown[];
      reason?: string;
    }
  | {
      kind: "add_semantic_slot";
      path: string;
      value: unknown;
      reason?: string;
    }
  | {
      kind: "remove_optional_node" | "remove_unsupported_optional_node";
      path?: string;
      nodeId?: string;
      reason?: string;
    }
  | {
      kind: "ask_user_for_missing_choice";
      question: string;
      reason?: string;
      choices?: string[];
    };

export type WorkflowProgramIrRepairFailureClass =
  | "malformed_response"
  | "unsupported_operation"
  | "unsafe_pointer"
  | "root_removal"
  | "too_many_operations"
  | "missing_parent"
  | "missing_target"
  | "invalid_array_index"
  | "non_traversable_path"
  | "user_choice_required"
  | "unknown";

export interface WorkflowProgramIrRepairValidationFailure {
  failureClass: WorkflowProgramIrRepairFailureClass;
  message: string;
  retryable: boolean;
  alternatives: string[];
}

export class WorkflowProgramIrRepairValidationError extends Error {
  readonly failureClass: WorkflowProgramIrRepairFailureClass;
  readonly retryable: boolean;
  readonly alternatives: string[];

  constructor(failure: WorkflowProgramIrRepairValidationFailure) {
    super(failure.message);
    this.name = "WorkflowProgramIrRepairValidationError";
    this.failureClass = failure.failureClass;
    this.retryable = failure.retryable;
    this.alternatives = failure.alternatives;
  }
}

export class WorkflowProgramIrRepairRejectedError extends Error {
  readonly failure: WorkflowProgramIrRepairValidationFailure;
  readonly rawPatch: unknown;
  readonly validationRetriesUsed: number;

  constructor(input: { failure: WorkflowProgramIrRepairValidationFailure; rawPatch: unknown; validationRetriesUsed: number }) {
    super(input.failure.message);
    this.name = "WorkflowProgramIrRepairRejectedError";
    this.failure = input.failure;
    this.rawPatch = input.rawPatch;
    this.validationRetriesUsed = input.validationRetriesUsed;
  }
}

export interface BuildWorkflowProgramIrRepairPromptInput {
  program: unknown;
  diagnostics: WorkflowProgramDiagnostic[];
  toolDescriptors: DesktopToolDescriptor[];
  connectorDescriptors?: WorkflowConnectorDescriptor[];
  ambientCliCapabilities?: WorkflowProgramAmbientCliCapability[];
  selectedRecipes?: Array<{
    id: string;
    title: string;
    summary: string;
    requiredNodeKinds: string[];
    preferredNodeKinds: string[];
    promptGuidance?: string;
    irExample?: unknown;
  }>;
  userRequest?: string;
  attempt: number;
  maxAttempts: number;
}

const DEFAULT_MAX_PATCH_OPERATIONS = 20;
const FORBIDDEN_POINTER_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

export function parseWorkflowProgramIrPatchResponse(raw: unknown, program?: unknown): WorkflowProgramIrPatchOperation[] {
  return parseWorkflowProgramIrRepairResponse(raw, program);
}

export function parseWorkflowProgramIrRepairResponse(raw: unknown, program?: unknown): WorkflowProgramIrPatchOperation[] {
  const candidate = Array.isArray(raw) ? repairOperationArrayCandidate(raw) : raw && typeof raw === "object" ? rawRepairOperationCandidate(raw as Record<string, unknown>) : undefined;
  if (!candidate) {
    throw new Error("WorkflowProgramIR repair response must be a JSON object with a repairOperations array.");
  }
  return candidate.kind === "typed"
    ? candidate.operations.map((operation, index) => normalizeTypedRepairOperation(operation, index, program))
    : candidate.operations.map((operation, index) => normalizePatchOperation(operation, index));
}

export function applyWorkflowProgramIrPatch(program: unknown, patch: WorkflowProgramIrPatchOperation[], maxOperations = DEFAULT_MAX_PATCH_OPERATIONS): unknown {
  if (patch.length > maxOperations) {
    throw new WorkflowProgramIrRepairValidationError({
      failureClass: "too_many_operations",
      message: `WorkflowProgramIR repair patch has ${patch.length} operations; maximum is ${maxOperations}.`,
      retryable: true,
      alternatives: ["Return a minimal patch that addresses only the reported diagnostics."],
    });
  }
  let document = jsonClone(program);
  for (const rawOperation of patch) {
    const operation = normalizePatchOperationForDocument(document, rawOperation);
    const pointer = parseJsonPointer(operation.path);
    if (pointer.length === 0) {
      if (operation.op === "remove") {
        throw new WorkflowProgramIrRepairValidationError({
          failureClass: "root_removal",
          message: "WorkflowProgramIR repair patch cannot remove the document root.",
          retryable: false,
          alternatives: ["Replace the root with a complete valid WorkflowProgramIR, or patch the specific invalid node/field."],
        });
      }
      document = jsonClone(operation.value);
      continue;
    }
    const { parent, key } = resolvePointerParent(document, pointer, operation.path);
    if (operation.op === "add") {
      addPatchValue(parent, key, operation.value, operation.path);
    } else if (operation.op === "replace") {
      if (!patchTargetExists(parent, key, operation.path)) {
        if (canTreatReplaceAsAdd(pointer, parent)) {
          setPatchValue(parent, key, operation.value, operation.path);
          continue;
        }
        assertPatchTargetExists(parent, key, operation.path);
      }
      setPatchValue(parent, key, operation.value, operation.path);
    } else {
      assertPatchTargetExists(parent, key, operation.path);
      removePatchValue(parent, key, operation.path);
    }
  }
  return document;
}

export function buildWorkflowProgramIrRepairPrompt(input: BuildWorkflowProgramIrRepairPromptInput): string {
  return [
    "Repair the current WorkflowProgramIR using compiler-owned typed repair operations.",
    "Return only one JSON object with this exact shape: {\"repairOperations\":[{\"kind\":\"replace_with_alternative|add_semantic_slot|remove_optional_node|ask_user_for_missing_choice\",...}]}",
    "Do not return source code, markdown, explanations, or a regenerated full program.",
    "Allowed operations:",
    "- replace_with_alternative: choose one valid existing alternative and include {\"path\":\"/json/pointer\",\"value\":...}. Use it for bad tool names, bad output paths, or other replaceable scalar/object fields.",
    "- add_semantic_slot: include {\"path\":\"/json/pointer\",\"value\":...}. Use it only when a required semantic slot is missing and the owner path is clear, such as model output schema fields.",
    "- remove_optional_node: include {\"nodeId\":\"...\"} or {\"path\":\"/nodes/<index>\"}. Use it only for unsupported optional nodes and patch any downstream references in separate operations.",
    "- ask_user_for_missing_choice: include {\"question\":\"...\"} only when diagnostics do not provide enough information to choose a safe repair.",
    "Keep the repair minimal and only address the diagnostics below.",
    "Use JSON Pointer escaping: ~1 for / and ~0 for ~.",
    "Path target rules: replace_with_alternative paths must already exist in the Current WorkflowProgramIR. add_semantic_slot paths require a clear semantic owner. remove_optional_node must target a current node by nodeId or /nodes/<index>.",
    "Diagnostic locator rule: diagnostics can point inside arbitrary reference values with numeric locator segments, e.g. /nodes/3/0/path. Do not repair that literally. Repair the owning node field, such as /nodes/3/items/path, /nodes/3/input/<field>/path, or /nodes/3/value/<field>/path.",
    `Repair attempt: ${input.attempt} of ${input.maxAttempts}.`,
    "",
    "Relevant tool capabilities:",
    repairToolDescriptorSummary(input.toolDescriptors),
    "",
    "Selected workflow recipes:",
    repairSelectedRecipeSummary(input.selectedRecipes ?? []),
    "",
    "Selected Ambient CLI command capabilities:",
    repairAmbientCliCapabilitySummary(input.ambientCliCapabilities ?? []),
    "",
    "Selected Workflow connector capabilities:",
    repairConnectorCapabilitySummary(input.connectorDescriptors ?? []),
    "",
    "Original user request:",
    input.userRequest?.trim() ? input.userRequest.trim() : "Not provided to repair prompt.",
    "",
    "Diagnostics:",
    JSON.stringify(input.diagnostics, null, 2),
    "",
    "Policy-specific repair guidance:",
    workflowProgramIrDiagnosticRepairGuidance(input.diagnostics, input.toolDescriptors),
    "",
    "Current WorkflowProgramIR:",
    JSON.stringify(input.program, null, 2),
  ].join("\n");
}

export function classifyWorkflowProgramIrRepairValidationError(error: unknown): WorkflowProgramIrRepairValidationFailure {
  if (error instanceof WorkflowProgramIrRepairValidationError) {
    return {
      failureClass: error.failureClass,
      message: error.message,
      retryable: error.retryable,
      alternatives: error.alternatives,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/must be a JSON object with a repairOperations array|response field .* must be an array|must be an object|must use an absolute JSON Pointer path|must include value|must include nodeId or path/i.test(message)) {
    return repairFailure("malformed_response", message, true, [
      'Return exactly {"repairOperations":[...]} with no markdown, prose, source code, or regenerated full WorkflowProgramIR.',
    ]);
  }
  if (/unsupported op|unsupported kind|remove_optional_node must target|selected a value outside its alternatives/i.test(message)) {
    return repairFailure("unsupported_operation", message, false, [
      "Use only replace_with_alternative, add_semantic_slot, remove_optional_node, or ask_user_for_missing_choice repair operations.",
    ]);
  }
  if (/repair requires user choice/i.test(message)) {
    return repairFailure("user_choice_required", message, false, ["Ask the user for the missing workflow choice before compiling again."]);
  }
  if (/Unsafe JSON Pointer/i.test(message)) {
    return repairFailure("unsafe_pointer", message, false, ["Use a normal WorkflowProgramIR field path; prototype-related path segments are never allowed."]);
  }
  if (/cannot remove the document root/i.test(message)) {
    return repairFailure("root_removal", message, false, ["Patch the specific invalid node/field, or replace the root with a complete valid WorkflowProgramIR."]);
  }
  if (/has \d+ operations; maximum is/i.test(message)) {
    return repairFailure("too_many_operations", message, true, ["Return a minimal patch that addresses only the reported diagnostics."]);
  }
  if (/path has invalid array index|array index is out of bounds/i.test(message)) {
    return repairFailure("invalid_array_index", message, false, [
      'Use add with "/-" only when appending to an array.',
      "Use a concrete existing array index for replace/remove.",
    ]);
  }
  if (/target does not exist/i.test(message)) {
    return repairFailure("missing_target", message, false, [
      "Use add for a missing semantic slot with an existing parent.",
      "Use replace/remove only for paths that already exist in the current WorkflowProgramIR.",
    ]);
  }
  if (/path does not exist/i.test(message)) {
    return repairFailure("missing_parent", message, false, [
      "Patch the owning WorkflowProgramIR field instead of applying diagnostic locator segments literally.",
      "Use add only when the parent path already exists, or add the missing semantic slot at its owner field.",
    ]);
  }
  if (/cannot traverse non-object value|path parent is not an object or array/i.test(message)) {
    return repairFailure("non_traversable_path", message, false, ["Patch an object or array owner field, not a scalar value or invented nested path."]);
  }
  return repairFailure("unknown", message, true, ["Return a smaller repair patch against fields that exist in the current WorkflowProgramIR."]);
}

function workflowProgramIrDiagnosticRepairGuidance(diagnostics: WorkflowProgramDiagnostic[], toolDescriptors: DesktopToolDescriptor[] = []): string {
  const guidance = new Set<string>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.code === "browser.intervention_review_required") {
      guidance.add(
        [
          "- For browser.intervention_review_required: prefer removing args.waitForUserAction when the workflow does not explicitly need a browser user-action branch.",
          "  If the workflow does need CAPTCHA/login/MFA/consent handling, add a review.input node that directly depends on the browser node, includes data.browserIntervention from that browser result, and route downstream nodes through the review gate.",
        ].join("\n"),
      );
    }
    if (diagnostic.code === "browser.user_action_resume_requires_review") {
      guidance.add("- For browser.user_action_resume_requires_review: make the resume node depend on the review.input that confirms the user completed the browser intervention.");
    }
    if (diagnostic.code === "browser.login_review_required") {
      guidance.add(
        [
          "- For browser.login_review_required: prefer replacing raw browser_login plus hand-written review with a browser.intervention node using tool:\"browser_login\" and retry.maxAttempts:0.",
          "  If keeping raw browser_login, add a review.input directly after browser_login for MFA/CAPTCHA/passkey/device confirmation and route downstream nodes through it.",
        ].join("\n"),
      );
    }
    if (diagnostic.code === "browser.login_intervention_retry_unsupported") {
      guidance.add("- For browser.login_intervention_retry_unsupported: set browser_login browser.intervention retry.maxAttempts to 0 and add a downstream browser_content/browser_nav node to verify the protected page after the user completes verification.");
    }
    if (diagnostic.code === "browser.intervention_skipif_requires_skipped_flag") {
      guidance.add(
        [
          "- For browser.intervention_skipif_requires_skipped_flag: skipIf is only for avoiding a later browser read after an earlier browser.intervention was skipped.",
          '  Replace skipIf references such as {"fromNode":"open-page","path":"text"} with {"fromNode":"open-page","path":"skipped"}, or remove skipIf when the downstream browser_content/browser_nav should run after a successful prior read.',
        ].join("\n"),
      );
    }
    if (diagnostic.code === "recipe.browser_item_recovery_tool_required") {
      guidance.add(
        [
          "- For recipe.browser_item_recovery_tool_required: the workflow must contain at least one selected browser read capability in the IR; a model-only summary is invalid.",
          "  If the user supplied explicit URLs, add one browser.intervention node per URL using browser_nav or browser_content, or add a bounded loop.map over a literal URL/source array whose nested map calls browser_content.",
          "  Feed the browser read outputs directly into checkpoint.write and then into the synthesis model.call/output.final, preserving url/title/text/skipped metadata.",
          "  Do not use browser_search when the user explicitly supplied URLs and forbade search. Do not add file_read/file_write or connector calls to satisfy browser source evidence.",
          "  Minimal valid shape for two provided URLs: browser.intervention(browser_content,{url:\"https://example.com\"}), browser.intervention(browser_content,{url:\"...\"}), checkpoint.write({sources:[...]}); model.call(input:{sources:{fromNode:\"checkpoint\",path:\"value.sources\"}}); output.final(...).",
        ].join("\n"),
      );
    }
    if (diagnostic.code === "tool.pagination_page_queries_required") {
      guidance.add(
        [
          "- For tool.pagination_page_queries_required: if the original request specified search angles, topics, URLs, source categories, dates, or required coverage, add pageQueries with at least maxPages distinct query strings derived from that request.",
          "  Keep queryInputPath/pageSizeInputPath/itemsPath aligned with the selected tool descriptor. For browser_search, pageQueries entries become args.query values and pageSizeInputPath should normally be maxResults.",
          "  If the request did not require multiple pages or distinct search angles, lower maxPages to 1 instead of inventing unrelated pageQueries.",
        ].join("\n"),
      );
    }
    if (diagnostic.code === "ambient_cli.capability_required" && /minicpm|vision/i.test(diagnostic.message) && hasRepairTool(toolDescriptors, "ambient_visual_analyze")) {
      guidance.add(
        [
          "- For MiniCPM ambient_cli capability_required diagnostics: do not add or keep ambient_cli nodes for minicpm_vision_status, minicpm_vision_start, minicpm_vision_analyze, minicpm_vision_stop, or ambient-minicpm package commands when they are not selected capabilities.",
          "  Replace the analysis branch with the selected desktop tool ambient_visual_analyze. Remove status/start/stop/describe MiniCPM nodes, then route the selected image list into a bounded loop.map whose map is {\"kind\":\"tool.call\",\"tool\":\"ambient_visual_analyze\",...}.",
          "  The ambient_visual_analyze tool owns MiniCPM provider startup, health checks, retries, and cleanup for ordinary visual analysis workflows.",
        ].join("\n"),
      );
    }
    if (diagnostic.code === "ambient_cli.describe_required") {
      if (/minicpm|vision/i.test(diagnostic.message) && hasRepairTool(toolDescriptors, "ambient_visual_analyze")) {
        guidance.add(
          [
            "- For MiniCPM ambient_cli describe_required diagnostics paired with missing capability diagnostics: remove the unavailable MiniCPM ambient_cli nodes instead of adding describe nodes.",
            "  Ordinary visual analysis must use ambient_visual_analyze directly; provider daemon lifecycle is internal to that tool.",
          ].join("\n"),
        );
      } else {
        guidance.add("- For ambient_cli.describe_required: add an ambient_cli_describe node for the same packageName/packageId and command, then add it to the ambient_cli node dependsOn.");
      }
    }
    if (diagnostic.code === "google.account_hint_required") {
      guidance.add("- For google.account_hint_required: add a literal accountHint only if the user provided one, or depend on google_workspace_status and reference a returned account handle.");
    }
    if (diagnostic.code === "google.calendar_time_range_required") {
      guidance.add("- For google.calendar_time_range_required: add explicit timeMin, timeMax, and timeZone to params or the allowed freebusy body.");
    }
    if (diagnostic.code === "connector.read_only_write_operation_rejected") {
      guidance.add(
        [
          "- For connector.read_only_write_operation_rejected: remove Gmail/Google connector draft/send/update/delete/create operations from read-only workflows.",
          "  Replace them with read-only search/list/get metadata operations and a review.input or final recommendation for any future write that needs user approval.",
        ].join("\n"),
      );
    }
    if (diagnostic.code === "ir.schema_invalid") {
      guidance.add(
        [
          "- For ir.schema_invalid: repair the document to the root WorkflowProgramIR object with version, title, goal, nodes, optional edges, and optional budgets.",
          "  Common wrappers must be removed unless the patch replaces the root with the wrapped WorkflowProgramIR.",
        ].join("\n"),
      );
    }
    if (diagnostic.code === "ir.unknown_output_path") {
      guidance.add(
        [
          "- For ir.unknown_output_path: use documented output field paths, not literal file names or desired artifact paths.",
          "  file_write and mutation.stage file outputs expose path and bytes; reference {\"fromNode\":\"write-node\",\"path\":\"path\"} for the written file path.",
          "  review.input outputs requestId, choiceId, text, and prompt; replace review/input aliases such as choice or selectedChoice with choiceId, or use text for freeform responses.",
          "  document.render outputs artifactPath, path, content, bytes, and mimeType; reference path/artifactPath for rendered report locations.",
        ].join("\n"),
      );
    }
    if (diagnostic.code === "ir.array_reference_path_required") {
      guidance.add(
        [
          "- For ir.array_reference_path_required: patch connector.map, tool.map, loop.map, collection.map, collection.filter, collection.dedupe, collection.chunk, model.map, or model.reduce collection inputs to a direct reference with a concrete array path.",
          '  Examples: {"fromNode":"list-records","path":"records"}, {"fromNode":"list-images","path":"entries"}, or {"fromNode":"select-visible-images","path":"items"}.',
          "  Do not omit path when referencing an object output from another node.",
        ].join("\n"),
      );
    }
    if (diagnostic.code === "ir.array_reference_wrapped") {
      guidance.add(
        [
          "- For ir.array_reference_wrapped: replace the one-element array wrapper with the direct collection reference object.",
          '  Example: change [{"fromNode":"list-images","path":"entries"}] to {"fromNode":"list-images","path":"entries"}.',
        ].join("\n"),
      );
    }
    if (diagnostic.code === "ir.redundant_stage_approval") {
      guidance.add(
        [
          "- For ir.redundant_stage_approval: remove the approval.required node that depends on mutation.stage.",
          "  Use a remove operation on the approval node path, for example {\"op\":\"remove\",\"path\":\"/nodes/3\"}; do not patch invented nested fields under that node.",
          "  mutation.stage already pauses until explicit approval before applying the write, so a second approval gate is redundant and invalid.",
          "  Replace downstream dependsOn arrays that mention the approval node with the mutation.stage or document.render node id.",
          "  Route downstream output.final fields from the mutation.stage result path/bytes, or from document.render artifactPath/path/content for rendered artifact metadata. If the final output only wanted approval status, replace it with a literal status string such as \"staged_until_approved\" or remove that field.",
        ].join("\n"),
      );
    }
    if (diagnostic.code === "ir.unavailable_tool" && /browser_screenshot/i.test(diagnostic.message)) {
      guidance.add("- For unavailable browser_screenshot: remove the browser.intervention screenshot field or set screenshot.enabled to false unless browser_screenshot is listed in selected capabilities.");
    }
    if (diagnostic.code === "ir.unavailable_tool" && /file_write/i.test(diagnostic.message)) {
      guidance.add("- For unavailable file_write: do not add file_write to the IR. For read-only audit/report workflows, replace the write node with checkpoint.write and route output.final to the checkpointed/model/template value.");
    }
  }
  return guidance.size ? [...guidance].join("\n") : "- No specialized guidance; make the smallest patch that addresses the diagnostics only.";
}

function hasRepairTool(toolDescriptors: DesktopToolDescriptor[], toolName: string): boolean {
  return toolDescriptors.some((tool) => tool.name === toolName);
}

function repairConnectorCapabilitySummary(connectors: WorkflowConnectorDescriptor[]): string {
  if (connectors.length === 0) return "- none";
  return connectors
    .map((connector) =>
      [
        `- ${connector.id}: ${connector.description}`,
        `  auth: ${connector.auth.type}/${connector.auth.status}; accounts: ${connector.accounts.map((account) => account.id).join(", ") || "none"}`,
        `  operations: ${connector.operations.map((operation) => `${operation.name}(${operation.sideEffects}; scopes=${operation.requiredScopes.join("+") || "none"})`).join(", ")}`,
      ].join("\n"),
    )
    .join("\n");
}

function repairAmbientCliCapabilitySummary(capabilities: WorkflowProgramAmbientCliCapability[]): string {
  if (capabilities.length === 0) return "- none";
  return capabilities
    .map((capability) =>
      [
        `- ${capability.packageName}:${capability.command} [${capability.capabilityId}]`,
        `  packageId: ${capability.packageId}; registryPluginId: ${capability.registryPluginId}; availability: ${capability.availability ?? "available"}`,
        `  missingEnv: ${capability.missingEnv?.join(", ") || "none"}`,
      ].join("\n"),
    )
    .join("\n");
}

function rawRepairOperationCandidate(record: Record<string, unknown>): { kind: "typed" | "patch"; operations: unknown[] } | undefined {
  if ("repairOperations" in record) return typedRepairOperationArrayCandidate(record.repairOperations, "repairOperations");
  if ("typedOperations" in record) return typedRepairOperationArrayCandidate(record.typedOperations, "typedOperations");
  if ("operations" in record) return repairOperationArrayCandidate(record.operations, "operations");
  if ("patch" in record) return patchOperationArrayCandidate(record.patch, "patch");
  if ("jsonPatch" in record) return patchOperationArrayCandidate(record.jsonPatch, "jsonPatch");
  return undefined;
}

function repairOperationArrayCandidate(value: unknown, label = "operations"): { kind: "typed" | "patch"; operations: unknown[] } {
  if (!Array.isArray(value)) throw new Error(`WorkflowProgramIR repair response field ${label} must be an array.`);
  return typedRepairOperationArray(value) ? { kind: "typed", operations: value } : { kind: "patch", operations: value };
}

function typedRepairOperationArrayCandidate(value: unknown, label: string): { kind: "typed"; operations: unknown[] } {
  if (!Array.isArray(value)) throw new Error(`WorkflowProgramIR repair response field ${label} must be an array.`);
  return { kind: "typed", operations: value };
}

function patchOperationArrayCandidate(value: unknown, label: string): { kind: "patch"; operations: unknown[] } {
  if (!Array.isArray(value)) throw new Error(`WorkflowProgramIR repair response field ${label} must be an array.`);
  return { kind: "patch", operations: value };
}

function typedRepairOperationArray(operations: unknown[]): boolean {
  return operations.some((operation) => isRecord(operation) && typeof operation.kind === "string");
}

function normalizeTypedRepairOperation(operation: unknown, index: number, program?: unknown): WorkflowProgramIrPatchOperation {
  if (!isRecord(operation)) {
    throw new Error(`WorkflowProgramIR typed repair operation ${index} must be an object.`);
  }
  const kind = operation.kind;
  if (kind === "replace_with_alternative") {
    const path = typedRepairPath(operation, index, kind);
    const value = typedRepairValue(operation, index, kind);
    const alternatives = operation.alternatives;
    if (Array.isArray(alternatives) && alternatives.length > 0 && !alternatives.some((alternative) => jsonEquivalent(alternative, value))) {
      throw new WorkflowProgramIrRepairValidationError({
        failureClass: "unsupported_operation",
        message: `WorkflowProgramIR typed repair operation ${index} selected a value outside its alternatives.`,
        retryable: true,
        alternatives: ["Choose one value from the provided alternatives, or ask_user_for_missing_choice when no safe value exists."],
      });
    }
    return normalizePatchOperation({ op: "replace", path, value }, index);
  }
  if (kind === "add_semantic_slot") {
    return normalizePatchOperation({ op: "add", path: typedRepairPath(operation, index, kind), value: typedRepairValue(operation, index, kind) }, index);
  }
  if (kind === "remove_optional_node" || kind === "remove_unsupported_optional_node") {
    const path = typedRemoveNodePath(operation, index, program);
    return normalizePatchOperation({ op: "remove", path }, index);
  }
  if (kind === "ask_user_for_missing_choice") {
    const question = typeof operation.question === "string" && operation.question.trim() ? operation.question.trim() : "A required workflow compile choice is missing.";
    const choices = Array.isArray(operation.choices)
      ? operation.choices.filter((choice): choice is string => typeof choice === "string" && choice.trim().length > 0).map((choice) => choice.trim())
      : [];
    throw new WorkflowProgramIrRepairValidationError({
      failureClass: "user_choice_required",
      message: `WorkflowProgramIR repair requires user choice: ${question}`,
      retryable: false,
      alternatives: choices.length > 0 ? choices : ["Ask the user to choose the missing workflow behavior before compiling again."],
    });
  }
  throw new Error(`WorkflowProgramIR typed repair operation ${index} has unsupported kind ${String(kind)}.`);
}

function typedRepairPath(operation: Record<string, unknown>, index: number, kind: string): string {
  const path = operation.path;
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error(`WorkflowProgramIR typed repair operation ${index} (${kind}) must use an absolute JSON Pointer path.`);
  }
  return path;
}

function typedRepairValue(operation: Record<string, unknown>, index: number, kind: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(operation, "value")) {
    throw new Error(`WorkflowProgramIR typed repair operation ${index} (${kind}) must include value.`);
  }
  return operation.value;
}

function typedRemoveNodePath(operation: Record<string, unknown>, index: number, program?: unknown): string {
  if (typeof operation.path === "string") {
    const pointer = parseJsonPointer(operation.path);
    if (pointer.length === 2 && pointer[0] === "nodes" && /^(0|[1-9]\d*)$/.test(pointer[1])) return operation.path;
    throw new WorkflowProgramIrRepairValidationError({
      failureClass: "unsupported_operation",
      message: `WorkflowProgramIR typed repair operation ${index} remove_optional_node must target /nodes/<index>.`,
      retryable: false,
      alternatives: ["Use nodeId for the unsupported optional node, or use a path like /nodes/3."],
    });
  }
  if (typeof operation.nodeId === "string" && operation.nodeId.trim()) {
    return workflowProgramIrNodePathForId(program, operation.nodeId.trim(), index);
  }
  throw new Error(`WorkflowProgramIR typed repair operation ${index} remove_optional_node must include nodeId or path.`);
}

function workflowProgramIrNodePathForId(program: unknown, nodeId: string, operationIndex: number): string {
  const root = isRecord(program) ? program : undefined;
  const nodes = root?.nodes;
  if (!Array.isArray(nodes)) {
    throw new WorkflowProgramIrRepairValidationError({
      failureClass: "missing_target",
      message: `WorkflowProgramIR typed repair operation ${operationIndex} cannot resolve nodeId ${nodeId}; current program has no nodes array.`,
      retryable: false,
      alternatives: ["Return a /nodes/<index> path from the current WorkflowProgramIR, or ask_user_for_missing_choice."],
    });
  }
  const nodeIndex = nodes.findIndex((node) => isRecord(node) && node.id === nodeId);
  if (nodeIndex < 0) {
    throw new WorkflowProgramIrRepairValidationError({
      failureClass: "missing_target",
      message: `WorkflowProgramIR typed repair operation ${operationIndex} cannot resolve nodeId ${nodeId}.`,
      retryable: false,
      alternatives: ["Target an existing nodeId from the current WorkflowProgramIR, or ask_user_for_missing_choice."],
    });
  }
  return `/nodes/${nodeIndex}`;
}

function jsonEquivalent(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function normalizePatchOperation(operation: unknown, index: number): WorkflowProgramIrPatchOperation {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
    throw new Error(`WorkflowProgramIR repair patch operation ${index} must be an object.`);
  }
  const record = operation as Record<string, unknown>;
  const op = record.op;
  const path = record.path;
  if (op !== "add" && op !== "replace" && op !== "remove") {
    throw new Error(`WorkflowProgramIR repair patch operation ${index} has unsupported op ${String(op)}.`);
  }
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error(`WorkflowProgramIR repair patch operation ${index} must use an absolute JSON Pointer path.`);
  }
  if ((op === "add" || op === "replace") && !("value" in record)) {
    throw new Error(`WorkflowProgramIR repair patch operation ${index} must include value.`);
  }
  return op === "remove" ? { op, path } : { op, path, value: record.value };
}

function normalizePatchOperationForDocument(document: unknown, operation: WorkflowProgramIrPatchOperation): WorkflowProgramIrPatchOperation {
  const pointer = normalizeWorkflowProgramIrPatchPointer(document, parseJsonPointer(operation.path));
  const normalizedPath = formatJsonPointer(pointer);
  const pathNormalizedOperation = normalizedPath === operation.path ? operation : { ...operation, path: normalizedPath };
  if (pathNormalizedOperation.op === "remove") return pathNormalizedOperation;
  return normalizeMissingSemanticSlotOperation(document, pathNormalizedOperation);
}

function normalizeWorkflowProgramIrPatchPointer(document: unknown, pointer: string[]): string[] {
  const context = workflowNodePointerContext(document, pointer);
  if (!context || pointer.length < 4) return pointer;
  const locatorSegment = pointer[2];
  if (!/^(0|[1-9]\d*)$/.test(locatorSegment)) return pointer;
  if (context.node && typeof context.node === "object" && !Array.isArray(context.node) && locatorSegment in context.node) return pointer;
  return ["nodes", context.nodeIndexSegment, ...workflowNodeLocatorTail(context.node, pointer.slice(3))];
}

function workflowNodePointerContext(document: unknown, pointer: string[]): { node: Record<string, unknown>; nodeIndexSegment: string } | undefined {
  if (pointer[0] !== "nodes" || !/^(0|[1-9]\d*)$/.test(pointer[1] ?? "")) return undefined;
  const root = document && typeof document === "object" && !Array.isArray(document) ? (document as Record<string, unknown>) : undefined;
  const nodes = root?.nodes;
  if (!Array.isArray(nodes)) return undefined;
  const nodeIndex = Number(pointer[1]);
  if (!Number.isSafeInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= nodes.length) return undefined;
  const node = nodes[nodeIndex];
  if (!node || typeof node !== "object" || Array.isArray(node)) return undefined;
  return { node: node as Record<string, unknown>, nodeIndexSegment: pointer[1] };
}

function workflowNodeLocatorTail(node: Record<string, unknown>, locatorTail: string[]): string[] {
  if (locatorTail.length === 1 && locatorTail[0] === "path") {
    if (isReferenceLikeObject(node.items)) return ["items", "path"];
    const referenceField = uniqueTopLevelReferenceField(node);
    if (referenceField) return [referenceField, "path"];
  }
  if (locatorTail.length >= 2) {
    const [candidateField, ...rest] = locatorTail;
    if (candidateField in node) return locatorTail;
    if (isRecord(node.input) && (candidateField in node.input || isModelWorkflowNode(node))) return ["input", candidateField, ...rest];
    if (isRecord(node.args) && candidateField in node.args) return ["args", candidateField, ...rest];
    if (isRecord(node.value) && candidateField in node.value) return ["value", candidateField, ...rest];
  }
  return locatorTail;
}

function uniqueTopLevelReferenceField(node: Record<string, unknown>): string | undefined {
  const referenceFields = Object.entries(node)
    .filter(([key, value]) => !["retry", "output", "screenshot"].includes(key) && isReferenceLikeObject(value))
    .map(([key]) => key);
  return referenceFields.length === 1 ? referenceFields[0] : undefined;
}

function isModelWorkflowNode(node: Record<string, unknown>): boolean {
  return typeof node.kind === "string" && node.kind.startsWith("model.");
}

function isReferenceLikeObject(value: unknown): boolean {
  return isRecord(value) && (typeof value.fromNode === "string" || typeof value.path === "string");
}

function normalizeMissingSemanticSlotOperation(document: unknown, operation: Exclude<WorkflowProgramIrPatchOperation, { op: "remove" }>): Exclude<WorkflowProgramIrPatchOperation, { op: "remove" }> {
  const pointer = parseJsonPointer(operation.path);
  const missing = firstMissingRepairObjectSegment(document, pointer);
  if (!missing) return operation;
  return {
    op: "add",
    path: formatJsonPointer(pointer.slice(0, missing.index + 1)),
    value: nestedObjectFromPointerTail(pointer.slice(missing.index + 1), operation.value),
  };
}

function firstMissingRepairObjectSegment(document: unknown, pointer: string[]): { index: number } | undefined {
  if (!isSafeRepairObjectPath(pointer)) return undefined;
  let current = document;
  for (let index = 0; index < pointer.length - 1; index += 1) {
    const segment = pointer[index];
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(segment)) return undefined;
      const arrayOffset = Number(segment);
      if (!Number.isSafeInteger(arrayOffset) || arrayOffset < 0 || arrayOffset >= current.length) return undefined;
      current = current[arrayOffset];
      continue;
    }
    if (!isRecord(current)) return undefined;
    if (!(segment in current)) return index >= 3 ? { index } : undefined;
    current = current[segment];
  }
  return undefined;
}

function nestedObjectFromPointerTail(tail: string[], value: unknown): unknown {
  return tail.reduceRight<unknown>((child, segment) => ({ [segment]: child }), jsonClone(value));
}

function formatJsonPointer(pointer: string[]): string {
  return `/${pointer.map((segment) => segment.replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}`;
}

function parseJsonPointer(path: string): string[] {
  if (path === "") return [];
  if (!path.startsWith("/")) throw new Error(`Invalid JSON Pointer path: ${path}`);
  return path
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
    .map((segment) => {
      if (FORBIDDEN_POINTER_SEGMENTS.has(segment)) {
        throw new WorkflowProgramIrRepairValidationError({
          failureClass: "unsafe_pointer",
          message: `Unsafe JSON Pointer segment in repair patch: ${segment}`,
          retryable: false,
          alternatives: ["Use ordinary WorkflowProgramIR field paths only."],
        });
      }
      return segment;
    });
}

function resolvePointerParent(document: unknown, pointer: string[], path: string): { parent: unknown[] | Record<string, unknown>; key: string } {
  let current = document;
  for (const segment of pointer.slice(0, -1)) {
    if (Array.isArray(current)) {
      const index = arrayIndex(segment, current.length - 1, path);
      current = current[index];
    } else if (current && typeof current === "object") {
      if (!(segment in (current as Record<string, unknown>))) throw new Error(`WorkflowProgramIR repair path does not exist: ${path}`);
      current = (current as Record<string, unknown>)[segment];
    } else {
      throw new Error(`WorkflowProgramIR repair path cannot traverse non-object value: ${path}`);
    }
  }
  if (!Array.isArray(current) && (!current || typeof current !== "object")) {
    throw new Error(`WorkflowProgramIR repair path parent is not an object or array: ${path}`);
  }
  return { parent: current as unknown[] | Record<string, unknown>, key: pointer[pointer.length - 1] };
}

function addPatchValue(parent: unknown[] | Record<string, unknown>, key: string, value: unknown, path: string): void {
  if (Array.isArray(parent)) {
    if (key === "-") {
      parent.push(jsonClone(value));
      return;
    }
    parent.splice(arrayIndex(key, parent.length, path), 0, jsonClone(value));
    return;
  }
  parent[key] = jsonClone(value);
}

function setPatchValue(parent: unknown[] | Record<string, unknown>, key: string, value: unknown, path: string): void {
  if (Array.isArray(parent)) {
    parent[arrayIndex(key, parent.length - 1, path)] = jsonClone(value);
    return;
  }
  parent[key] = jsonClone(value);
}

function removePatchValue(parent: unknown[] | Record<string, unknown>, key: string, path: string): void {
  if (Array.isArray(parent)) {
    parent.splice(arrayIndex(key, parent.length - 1, path), 1);
    return;
  }
  delete parent[key];
}

function assertPatchTargetExists(parent: unknown[] | Record<string, unknown>, key: string, path: string): void {
  if (Array.isArray(parent)) {
    arrayIndex(key, parent.length - 1, path);
    return;
  }
  if (!(key in parent)) throw new Error(`WorkflowProgramIR repair target does not exist: ${path}`);
}

function patchTargetExists(parent: unknown[] | Record<string, unknown>, key: string, path: string): boolean {
  if (Array.isArray(parent)) {
    arrayIndex(key, parent.length - 1, path);
    return true;
  }
  return key in parent;
}

function canTreatReplaceAsAdd(pointer: string[], parent: unknown[] | Record<string, unknown>): boolean {
  return !Array.isArray(parent) && isSafeRepairObjectPath(pointer);
}

function isSafeRepairObjectPath(pointer: string[]): boolean {
  return isSafeInputObjectPath(pointer) || isSafeOutputSchemaObjectPath(pointer);
}

function isSafeInputObjectPath(pointer: string[]): boolean {
  return (
    pointer.length >= 4 &&
    pointer[0] === "nodes" &&
    /^(0|[1-9]\d*)$/.test(pointer[1]) &&
    pointer[2] === "input" &&
    pointer.slice(3).every((segment) => segment !== "-" && !/^(0|[1-9]\d*)$/.test(segment) && !FORBIDDEN_POINTER_SEGMENTS.has(segment))
  );
}

function isSafeOutputSchemaObjectPath(pointer: string[]): boolean {
  return (
    pointer.length >= 4 &&
    pointer[0] === "nodes" &&
    /^(0|[1-9]\d*)$/.test(pointer[1]) &&
    pointer[2] === "output" &&
    pointer[3] === "schema" &&
    pointer.slice(4).every(isSafeObjectFieldSegment)
  );
}

function isSafeObjectFieldSegment(segment: string): boolean {
  return segment !== "-" && !/^(0|[1-9]\d*)$/.test(segment) && !FORBIDDEN_POINTER_SEGMENTS.has(segment);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function repairFailure(
  failureClass: WorkflowProgramIrRepairFailureClass,
  message: string,
  retryable: boolean,
  alternatives: string[],
): WorkflowProgramIrRepairValidationFailure {
  return { failureClass, message, retryable, alternatives };
}

function arrayIndex(segment: string, maxInclusive: number, path: string): number {
  if (!/^(0|[1-9]\d*)$/.test(segment)) throw new Error(`WorkflowProgramIR repair path has invalid array index: ${path}`);
  const index = Number(segment);
  if (!Number.isSafeInteger(index) || index < 0 || index > maxInclusive) throw new Error(`WorkflowProgramIR repair array index is out of bounds: ${path}`);
  return index;
}

function repairToolDescriptorSummary(toolDescriptors: DesktopToolDescriptor[]): string {
  if (toolDescriptors.length === 0) return "- none";
  return toolDescriptors
    .map((tool) => `- ${tool.name}: ${tool.description}; inputSchema: ${JSON.stringify(tool.inputSchema)}`)
    .join("\n");
}

function repairSelectedRecipeSummary(recipes: NonNullable<BuildWorkflowProgramIrRepairPromptInput["selectedRecipes"]>): string {
  if (recipes.length === 0) return "- none";
  return recipes
    .map((recipe) =>
      [
        `- ${recipe.id}: ${recipe.title}`,
        `  summary: ${recipe.summary}`,
        `  requiredNodeKinds: ${recipe.requiredNodeKinds.join(", ") || "none"}`,
        `  preferredNodeKinds: ${recipe.preferredNodeKinds.join(", ") || "none"}`,
        recipe.promptGuidance ? `  guidance: ${recipe.promptGuidance}` : undefined,
        recipe.irExample ? `  example: ${JSON.stringify(recipe.irExample)}` : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
    )
    .join("\n");
}

function jsonClone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}
