import type { DesktopToolDescriptor } from "./workflowProgramDesktopToolFacade";
import { connectorOperationDescriptor } from "./workflowProgramCapabilityResolver";
import type { WorkflowConnectorDescriptor } from "./workflowProgramWorkflowFacade";
import { isWorkflowProgramLoopMapToolCall } from "../../shared/workflowProgramIr";
import type {
  WorkflowProgramApprovalRequiredNode,
  WorkflowProgramBranchIfNode,
  WorkflowProgramBrowserInterventionNode,
  WorkflowProgramCheckpointNode,
  WorkflowProgramCollectionChunkNode,
  WorkflowProgramCollectionDedupeNode,
  WorkflowProgramCollectionFilterNode,
  WorkflowProgramCollectionMapNode,
  WorkflowProgramConnectorCallNode,
  WorkflowProgramConnectorMapNode,
  WorkflowProgramConnectorPaginateNode,
  WorkflowProgramDocumentRenderNode,
  WorkflowProgramErrorHandleNode,
  WorkflowProgramFinalOutputNode,
  WorkflowProgramLoopMapNode,
  WorkflowProgramModelCallNode,
  WorkflowProgramModelMapNode,
  WorkflowProgramModelReduceNode,
  WorkflowProgramMutationStageNode,
  WorkflowProgramNode,
  WorkflowProgramReviewInputNode,
  WorkflowProgramToolCallNode,
  WorkflowProgramToolPaginateNode,
  WorkflowProgramValue,
} from "../../shared/workflowProgramIr";

const WORKFLOW_PROGRAM_RUNTIME_PARALLEL_CONCURRENCY = 4;

export interface GenerateWorkflowProgramSourceInput {
  nodes: WorkflowProgramNode[];
  toolDescriptors: DesktopToolDescriptor[];
  connectorDescriptors: WorkflowConnectorDescriptor[];
}

export function generateWorkflowProgramSource(input: GenerateWorkflowProgramSourceInput): string {
  const lines = [
    "export default async function run({ workflow, tools, ambient, connectors }) {",
    "  void connectors;",
    "  const outputs = {};",
    "  const readPath = (value, path) => {",
    "    if (!path) return value;",
    "    return String(path).split('.').filter(Boolean).reduce((current, key) => current == null ? undefined : current[key], value);",
    "  };",
    "  const renderTemplate = (template, vars) => {",
    "    const scopedVars = vars && typeof vars === 'object' && !Array.isArray(vars) ? vars : { value: vars };",
    "    const withEachBlocks = String(template).replace(/{{#each\\s+([@A-Za-z0-9_.:-]+)\\s*}}([\\s\\S]*?){{\\/each}}/g, (_match, key, block) => {",
    "      const items = readPath(scopedVars, key);",
    "      if (!Array.isArray(items)) return '';",
    "      return items.map((item, index) => {",
    "        const itemVars = item && typeof item === 'object' && !Array.isArray(item) ? item : { value: item };",
    "        return renderTemplate(block, { ...scopedVars, ...itemVars, this: item, '@index': index });",
    "      }).join('');",
    "    });",
    "    return withEachBlocks.replace(/{{\\s*([@A-Za-z0-9_.:-]+)\\s*}}/g, (_match, key) => {",
    "      const value = readPath(scopedVars, key);",
    "      return value == null ? '' : String(value);",
    "    });",
    "  };",
    "  const validateModelOutput = (value, contract) => {",
    "    if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return value;",
    "    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('model output must be a JSON object');",
    "    const result = {};",
    "    for (const [key, schema] of Object.entries(contract)) {",
    "      if (!(key in value)) throw new Error(`model output missing required field ${key}`);",
    "      validateModelField(value[key], schema, `$.${key}`);",
    "      result[key] = value[key];",
    "    }",
    "    return result;",
    "  };",
    "  const validateModelField = (value, schema, path) => {",
    "    const type = modelFieldType(schema);",
    "    if (!type) return;",
    "    if (type === 'array') { if (!Array.isArray(value)) throw new Error(`${path} must be an array`); return; }",
    "    if (type === 'object') { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`); return; }",
    "    if (type === 'number') { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a number`); return; }",
    "    if (type === 'integer') { if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`${path} must be an integer`); return; }",
    "    if (type === 'boolean') { if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`); return; }",
    "    if (type === 'string' && typeof value !== 'string') throw new Error(`${path} must be a string`);",
    "  };",
    "  const modelFieldType = (schema) => {",
    "    if (typeof schema === 'string') return schema.toLowerCase();",
    "    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return undefined;",
    "    const type = schema.type;",
    "    return typeof type === 'string' ? type.toLowerCase() : undefined;",
    "  };",
    "  const isBrowserUserAction = (value) => {",
    "    if (!value || typeof value !== 'object') return false;",
    "    const kind = String(value.kind ?? value.userAction?.kind ?? '');",
    "    return value.active === true || value.userActionRequired === true || value.status === 'waiting' || value.status === 'needs-user-action' || Boolean(value.userAction?.active) || ['captcha', 'login', 'mfa', 'bot-check', 'consent', 'unknown-user-action'].includes(kind);",
    "  };",
    "  const browserInterventionData = (result, source, action) => {",
    "    const userAction = result?.userAction && typeof result.userAction === 'object' ? result.userAction : result;",
    "    const screenshot = userAction?.screenshot;",
    "    return {",
    "      browserIntervention: {",
    "        title: String(userAction?.interventionTitle ?? userAction?.challengeTitle ?? source?.interventionTitle ?? 'Browser challenge'),",
    "        pageTitle: String(userAction?.title ?? source?.title ?? ''),",
    "        kind: String(userAction?.kind ?? 'unknown-user-action'),",
    "        provider: String(userAction?.provider ?? 'unknown'),",
    "        status: String(userAction?.status ?? 'waiting'),",
    "        toolName: String(userAction?.toolName ?? action),",
    "        runtime: String(userAction?.runtime ?? 'chrome'),",
    "        profileMode: String(userAction?.profileMode ?? 'isolated'),",
    "        browserUserActionId: String(userAction?.id ?? ''),",
    "        targetId: String(userAction?.targetId ?? ''),",
    "        url: String(userAction?.url ?? source?.url ?? ''),",
    "        message: String(userAction?.message ?? 'Browser needs user action before the workflow can continue.'),",
    "        pageExcerpt: String(userAction?.pageExcerpt ?? '').slice(0, 1200),",
    "        screenshot: screenshot ? {",
    "          path: String(screenshot.path ?? ''),",
    "          artifactPath: String(screenshot.artifactPath ?? ''),",
    "          bytes: Number(screenshot.bytes ?? 0),",
    "          width: Number(screenshot.width ?? 0),",
    "          height: Number(screenshot.height ?? 0),",
    "          title: String(screenshot.title ?? ''),",
    "          url: String(screenshot.url ?? '')",
    "        } : undefined",
    "      },",
    "      source: {",
    "        title: String(source?.title ?? 'Browser source'),",
    "        url: String(source?.url ?? userAction?.url ?? ''),",
    "        snippet: String(source?.snippet ?? '').slice(0, 600)",
    "      },",
    "      guidance: 'Open the managed browser, complete the challenge if possible, then return here and continue.'",
    "    };",
    "  };",
    "  const browserResultEvidence = (result, source, action, extra = {}) => ({",
    "    source,",
    "    skipped: false,",
    "    toolName: action,",
    "    openedTitle: String(result?.title ?? ''),",
    "    pageTitle: String(result?.title ?? source?.title ?? 'Browser source'),",
    "    pageUrl: String(result?.url ?? source?.url ?? ''),",
    "    url: String(result?.url ?? source?.url ?? ''),",
    "    text: String(result?.text ?? result?.content ?? '').slice(0, 6000),",
    "    content: String(result?.content ?? result?.text ?? '').slice(0, 6000),",
    "    textChars: String(result?.text ?? result?.content ?? '').slice(0, 6000).length,",
    "    textTruncated: Boolean(result?.textTruncated),",
    "    links: Array.isArray(result?.links) ? result.links.slice(0, 10) : [],",
    "    results: Array.isArray(result?.results) ? result.results.slice(0, 10) : [],",
    "    raw: result,",
    "    ...extra",
    "  });",
    "  const compactAmbientInputObject = (value) => {",
    "    const firstStats = ambientInputCompactionStats();",
    "    let compacted = compactAmbientValue(value, ambientInputCompactionLimits(600, 100, 12, 32), firstStats, new WeakSet(), 0);",
    "    let object = ambientInputObject(compacted);",
    "    let jsonChars = ambientJsonChars(object);",
    "    let stats = firstStats;",
    "    if (jsonChars > 60000) {",
    "      const secondStats = ambientInputCompactionStats();",
    "      compacted = compactAmbientValue(value, ambientInputCompactionLimits(280, 100, 6, 24), secondStats, new WeakSet(), 0);",
    "      object = ambientInputObject(compacted);",
    "      jsonChars = ambientJsonChars(object);",
    "      stats = secondStats;",
    "    }",
    "    if (jsonChars > 60000) {",
    "      const finalStats = ambientInputCompactionStats();",
    "      compacted = compactAmbientValue(value, ambientInputCompactionLimits(160, 100, 4, 16), finalStats, new WeakSet(), 0);",
    "      object = ambientInputObject(compacted);",
    "      jsonChars = ambientJsonChars(object);",
    "      stats = finalStats;",
    "    }",
    "    if (ambientInputWasCompacted(stats) || jsonChars > 60000) {",
    "      object = {",
    "        ...object,",
    "        _ambientInputCompacted: {",
    "          maxJsonChars: 60000,",
    "          recommendedPreprocessor: 'long_context_process',",
    "          compactedJsonChars: Number.isFinite(jsonChars) ? jsonChars : -1,",
    "          truncatedStrings: stats.truncatedStrings,",
    "          truncatedArrays: stats.truncatedArrays,",
    "          truncatedObjects: stats.truncatedObjects,",
    "          droppedFields: stats.droppedFields,",
    "          circularRefs: stats.circularRefs",
    "        }",
    "      };",
    "    }",
    "    return object;",
    "  };",
    "  const ambientInputCompactionStats = () => ({ truncatedStrings: 0, truncatedArrays: 0, truncatedObjects: 0, droppedFields: 0, circularRefs: 0 });",
    "  const ambientInputCompactionLimits = (maxStringChars, maxArrayItems, maxNestedArrayItems, maxObjectKeys) => ({ maxStringChars, maxArrayItems, maxNestedArrayItems, maxObjectKeys });",
    "  const ambientInputWasCompacted = (stats) => stats.truncatedStrings > 0 || stats.truncatedArrays > 0 || stats.truncatedObjects > 0 || stats.droppedFields > 0 || stats.circularRefs > 0;",
    "  const ambientInputObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : { value };",
    "  const ambientJsonChars = (value) => { try { return JSON.stringify(value).length; } catch { return Number.POSITIVE_INFINITY; } };",
    "  const compactAmbientValue = (value, limits, stats, seen, depth) => {",
    "    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;",
    "    if (typeof value === 'bigint') return String(value);",
    "    if (typeof value === 'string') {",
    "      if (value.length <= limits.maxStringChars) return value;",
    "      stats.truncatedStrings += 1;",
    "      return `${value.slice(0, limits.maxStringChars)}... [truncated ${value.length - limits.maxStringChars} chars]`;",
    "    }",
    "    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') return undefined;",
    "    if (typeof value !== 'object') return String(value);",
    "    if (seen.has(value)) { stats.circularRefs += 1; return '[Circular]'; }",
    "    seen.add(value);",
    "    if (Array.isArray(value)) {",
    "      const limit = depth <= 1 ? limits.maxArrayItems : limits.maxNestedArrayItems;",
    "      const selected = value.slice(0, limit).map((item) => compactAmbientValue(item, limits, stats, seen, depth + 1));",
    "      if (value.length > limit) {",
    "        stats.truncatedArrays += 1;",
    "        selected.push({ _ambientTruncatedItems: value.length - limit });",
    "      }",
    "      seen.delete(value);",
    "      return selected;",
    "    }",
    "    const output = {};",
    "    const entries = Object.entries(value).filter(([key]) => !ambientInputDropsField(key));",
    "    stats.droppedFields += Object.keys(value).length - entries.length;",
    "    for (const [key, nested] of entries.slice(0, limits.maxObjectKeys)) {",
    "      output[key] = compactAmbientValue(nested, limits, stats, seen, depth + 1);",
    "    }",
    "    if (entries.length > limits.maxObjectKeys) {",
    "      stats.truncatedObjects += 1;",
    "      output._ambientTruncatedKeys = entries.length - limits.maxObjectKeys;",
    "    }",
    "    seen.delete(value);",
    "    return output;",
    "  };",
    "  const ambientInputDropsField = (key) => {",
    "    const normalized = String(key).toLowerCase();",
    "    return normalized === 'raw' || normalized === 'rawresult' || normalized === 'rawresponse' || normalized === 'base64' || normalized === 'binary' || normalized === 'buffer';",
    "  };",
    "",
  ];
  for (const level of workflowProgramSourceDependencyLevels(input.nodes)) {
    for (const segment of workflowProgramRuntimeSegments(level, input.toolDescriptors, input.connectorDescriptors)) {
      lines.push(...sourceLinesForRuntimeSegment(segment), "");
    }
  }
  lines.push("  await workflow.emit({ type: 'workflow.completed', componentOutputs: outputs });");
  lines.push("  return outputs;");
  lines.push("}");
  return lines.join("\n");
}

function workflowProgramSourceDependencyLevels(nodes: WorkflowProgramNode[]): WorkflowProgramNode[][] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const remaining = new Set(nodes.map((node) => node.id));
  const completed = new Set<string>();
  const levels: WorkflowProgramNode[][] = [];
  while (remaining.size > 0) {
    const ready = nodes.filter(
      (node) =>
        remaining.has(node.id) &&
        (node.dependsOn ?? []).every((dependencyId) => !byId.has(dependencyId) || completed.has(dependencyId)),
    );
    if (ready.length === 0) {
      levels.push(nodes.filter((node) => remaining.has(node.id)));
      break;
    }
    levels.push(ready);
    for (const node of ready) {
      remaining.delete(node.id);
      completed.add(node.id);
    }
  }
  return levels;
}

function workflowProgramRuntimeSegments(
  nodes: WorkflowProgramNode[],
  toolDescriptors: DesktopToolDescriptor[],
  connectorDescriptors: WorkflowConnectorDescriptor[],
): WorkflowProgramNode[][] {
  const segments: WorkflowProgramNode[][] = [];
  let parallel: WorkflowProgramNode[] = [];
  const flush = () => {
    for (const batch of workflowProgramNodeArrayBatches(parallel, WORKFLOW_PROGRAM_RUNTIME_PARALLEL_CONCURRENCY)) segments.push(batch);
    parallel = [];
  };
  for (const node of nodes) {
    if (isRuntimeParallelEligibleNode(node, toolDescriptors, connectorDescriptors)) {
      parallel.push(node);
    } else {
      flush();
      segments.push([node]);
    }
  }
  flush();
  return segments;
}

function sourceLinesForRuntimeSegment(nodes: WorkflowProgramNode[]): string[] {
  if (nodes.length <= 1) return sourceLinesForNode(nodes[0]!);
  return [
    "  await Promise.all([",
    ...nodes.flatMap((node, index) => [
      "    (async () => {",
      ...sourceLinesForNode(node).map((line) => `      ${line.trimStart()}`),
      `    })()${index === nodes.length - 1 ? "" : ","}`,
    ]),
    "  ]);",
  ];
}

function isRuntimeParallelEligibleNode(
  node: WorkflowProgramNode,
  toolDescriptors: DesktopToolDescriptor[],
  connectorDescriptors: WorkflowConnectorDescriptor[],
): boolean {
  if (node.kind === "model.call" || node.kind === "model.map" || node.kind === "model.reduce") return true;
  if (node.kind === "collection.map" || node.kind === "collection.filter" || node.kind === "collection.dedupe" || node.kind === "collection.chunk" || node.kind === "document.render") return true;
  if (node.kind === "transform.template") return true;
  if (node.kind === "tool.call") {
    if (node.tool !== "browser_search" && node.tool.startsWith("browser_")) return false;
    const descriptor = toolDescriptors.find((tool) => tool.name === node.tool);
    return descriptor ? descriptor.sideEffects !== "write-workspace" && descriptor.sideEffects !== "write-external" && descriptor.sideEffects !== "control-browser" : false;
  }
  if (node.kind === "tool.paginate") {
    if (node.tool !== "browser_search" && node.tool.startsWith("browser_")) return false;
    const descriptor = toolDescriptors.find((tool) => tool.name === node.tool);
    return descriptor ? descriptor.sideEffects !== "write-workspace" && descriptor.sideEffects !== "write-external" && descriptor.sideEffects !== "control-browser" : false;
  }
  if (node.kind === "connector.call" || node.kind === "connector.map" || node.kind === "connector.paginate") {
    const descriptor = connectorDescriptors.find((connector) => connector.id === node.connectorId);
    const operation = descriptor ? connectorOperationDescriptor(descriptor, node.operation) : undefined;
    return operation ? operation.sideEffects !== "write_external" : false;
  }
  return false;
}

function workflowProgramNodeArrayBatches<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}

function sourceLinesForNode(node: WorkflowProgramNode): string[] {
  if (node.kind === "tool.call") return sourceLinesForToolCall(node);
  if (node.kind === "tool.paginate") return sourceLinesForToolPaginate(node);
  if (node.kind === "browser.intervention") return sourceLinesForBrowserIntervention(node);
  if (node.kind === "connector.call") return sourceLinesForConnectorCall(node);
  if (node.kind === "connector.paginate") return sourceLinesForConnectorPaginate(node);
  if (node.kind === "connector.map") return sourceLinesForConnectorMap(node);
  if (node.kind === "collection.map") return sourceLinesForCollectionMap(node);
  if (node.kind === "collection.filter") return sourceLinesForCollectionFilter(node);
  if (node.kind === "collection.dedupe") return sourceLinesForCollectionDedupe(node);
  if (node.kind === "collection.chunk") return sourceLinesForCollectionChunk(node);
  if (node.kind === "document.render") return sourceLinesForDocumentRender(node);
  if (node.kind === "model.call") return sourceLinesForModelCall(node);
  if (node.kind === "model.map") return sourceLinesForModelMap(node);
  if (node.kind === "model.reduce") return sourceLinesForModelReduce(node);
  if (node.kind === "mutation.stage") return sourceLinesForMutationStage(node);
  if (node.kind === "review.input") return sourceLinesForReviewInput(node);
  if (node.kind === "approval.required") return sourceLinesForApprovalRequired(node);
  if (node.kind === "branch.if") return sourceLinesForBranchIf(node);
  if (node.kind === "loop.map") return sourceLinesForLoopMap(node);
  if (node.kind === "error.handle") return sourceLinesForErrorHandle(node);
  if (node.kind === "checkpoint.write") return sourceLinesForCheckpointWrite(node);
  if (node.kind === "transform.template") {
    return [`  outputs[${json(node.id)}] = { value: renderTemplate(${json(node.template)}, ${valueExpression(node.vars ?? {})}) };`];
  }
  return sourceLinesForFinalOutput(node);
}

function sourceLinesForCheckpointWrite(node: WorkflowProgramCheckpointNode): string[] {
  const outputRef = `outputs[${json(node.id)}]`;
  const valueVar = localVariableName(node.id, "value");
  if (!node.resumeKey) {
    return [`  const ${valueVar} = ${valueExpression(node.value)};`, `  await workflow.checkpoint(${json(node.key)}, ${valueVar});`, `  ${outputRef} = ${valueVar};`];
  }
  const lines = [
    `  ${outputRef} = await workflow.resumePoint(${json(node.resumeKey)}, async () => {`,
    `    const ${valueVar} = ${valueExpression(node.value)};`,
    `    return ${valueVar};`,
    "  });",
  ];
  if (node.resumeKey !== node.key) lines.push(`  await workflow.checkpoint(${json(node.key)}, ${outputRef});`);
  return lines;
}

function sourceLinesForToolCall(node: WorkflowProgramToolCallNode): string[] {
  const call = `${toolReference(node.tool)}(${valueExpression(node.args ?? {})})`;
  const step = `workflow.step(${json(node.label ?? humanizeNodeId(node.id))}, { nodeId: ${json(node.id)} }, async () => ${call})`;
  const body = `workflow.resumePoint(${json(node.resumeKey ?? node.id)}, async () => ${step})`;
  const lines = [`  outputs[${json(node.id)}] = await ${body};`];
  if (node.tool === "file_read" || node.tool === "local_file_read") {
    lines.push(`  if (typeof outputs[${json(node.id)}]?.content !== "string") throw new Error(${json(`${node.tool} node ${node.id} did not return string content.`)});`);
  }
  return lines;
}

function sourceLinesForToolPaginate(node: WorkflowProgramToolPaginateNode): string[] {
  const paginationOptions = {
    name: node.label ?? humanizeNodeId(node.id),
    nodeId: node.id,
    input: node.input ?? {},
    ...(node.pageQueries !== undefined ? { pageQueries: node.pageQueries } : {}),
    ...(node.queryInputPath ? { queryInputPath: node.queryInputPath } : {}),
    ...(node.pageSize ? { pageSize: node.pageSize } : {}),
    maxItems: node.maxItems,
    maxPages: node.maxPages,
    ...(node.itemsPath !== undefined ? { itemsPath: node.itemsPath } : {}),
    ...(node.nextPageTokenPath ? { nextPageTokenPath: node.nextPageTokenPath } : {}),
    ...(node.pageTokenInputPath ? { pageTokenInputPath: node.pageTokenInputPath } : {}),
    ...(node.pageSizeInputPath ? { pageSizeInputPath: node.pageSizeInputPath } : {}),
    ...(node.dedupeKeyPath ? { dedupeKeyPath: node.dedupeKeyPath } : {}),
    checkpointKey: node.resumeKey ?? node.id,
  };
  return [
    `  outputs[${json(node.id)}] = await workflow.paginateTool(${valueExpression(paginationOptions)}, async (pageInput, pageIndex) => {`,
    `    return ${toolReference(node.tool)}(pageInput);`,
    "  });",
  ];
}

function sourceLinesForBrowserIntervention(node: WorkflowProgramBrowserInterventionNode): string[] {
  const argsVariable = localVariableName(node.id, "args");
  const sourceVariable = localVariableName(node.id, "source");
  const resultVariable = localVariableName(node.id, "result");
  const answerVariable = localVariableName(node.id, "answer");
  const screenshotVariable = localVariableName(node.id, "screenshot");
  const resumeKey = node.resumeKey ?? node.id;
  const tool = toolReference(node.tool);
  const argsExpression =
    node.tool === "browser_login"
      ? valueExpression(node.args ?? {})
      : `{ ...(${valueExpression(node.args ?? {})}), waitForUserAction: false }`;
  const maxAttempts = node.retry?.maxAttempts ?? (node.tool === "browser_login" ? 0 : 1);
  const onStillBlocked = node.retry?.onStillBlocked ?? "fail";
  const completedDescription =
    node.tool === "browser_login"
      ? "Continue after completing login verification in the preserved browser session."
      : "Retry the same browser operation in the preserved browser session.";
  const choices = node.choices ?? [
    { id: "completed", label: "I completed it", description: completedDescription },
    { id: "skip", label: "Skip source", description: "Continue without this source if verification cannot be completed." },
  ];
  const screenshotEnabled = Boolean(node.screenshot && node.screenshot.enabled !== false);
  const lines = [
    `  const ${argsVariable} = ${argsExpression};`,
    `  const ${sourceVariable} = ${valueExpression(node.source ?? {})};`,
  ];
  if (node.skipIf !== undefined) {
    lines.push(
      `  if (${valueExpression(node.skipIf)}) {`,
      `    outputs[${json(node.id)}] = { skipped: true, source: ${sourceVariable}, reason: "browser-intervention-prior-skipped", browserIntervention: ${sourceVariable}?.browserIntervention, text: "", content: "", textChars: 0 };`,
      "  }",
    );
  }
  lines.push(
    `  if (!outputs[${json(node.id)}]) {`,
    `    let ${resultVariable} = await workflow.resumePoint(${json(`${resumeKey}:initial`)}, async () => workflow.step(${json(node.label ?? humanizeNodeId(node.id))}, { nodeId: ${json(node.id)} }, async () => ${tool}(${argsVariable})));`,
    `    if (isBrowserUserAction(${resultVariable})) {`,
    `      const ${answerVariable} = await workflow.askUser(String(${valueExpression(node.prompt ?? `Browser needs user action before continuing ${node.label ?? humanizeNodeId(node.id)}.`)}), { choices: ${json(choices)}, allowFreeform: ${json(node.allowFreeform ?? true)}, data: browserInterventionData(${resultVariable}, ${sourceVariable}, ${json(node.tool)}) }, { nodeId: ${json(node.id)} });`,
    `      if (${answerVariable}?.choiceId === "skip") {`,
    `        outputs[${json(node.id)}] = { skipped: true, source: ${sourceVariable}, reason: "browser-intervention-skipped", browserIntervention: browserInterventionData(${resultVariable}, ${sourceVariable}, ${json(node.tool)}).browserIntervention, text: "", content: "", textChars: 0 };`,
    "      } else {",
    ...(maxAttempts > 0
      ? [
          `        if (${json(maxAttempts)} > 0) {`,
          `          ${resultVariable} = await workflow.resumePoint(${json(`${resumeKey}:retry`)}, async () => workflow.step(${json(`retry ${node.label ?? humanizeNodeId(node.id)}`)}, { nodeId: ${json(node.id)} }, async () => ${tool}({ ...${argsVariable}, userActionId: ${resultVariable}.id ?? ${resultVariable}.userAction?.id })));`,
          "        }",
        ]
      : []),
    `        if (isBrowserUserAction(${resultVariable}) && ${json(node.tool === "browser_login" && maxAttempts === 0)}) {`,
    `          outputs[${json(node.id)}] = browserResultEvidence(${resultVariable}, ${sourceVariable}, ${json(node.tool)}, { browserIntervention: browserInterventionData(${resultVariable}, ${sourceVariable}, ${json(node.tool)}).browserIntervention, interventionCompleted: true, reason: "browser-login-user-action-completed" });`,
    `        } else if (isBrowserUserAction(${resultVariable})) {`,
    onStillBlocked === "return_skipped"
      ? `          outputs[${json(node.id)}] = { skipped: true, source: ${sourceVariable}, reason: "browser-intervention-still-blocked", browserIntervention: browserInterventionData(${resultVariable}, ${sourceVariable}, ${json(node.tool)}).browserIntervention, text: "", content: "", textChars: 0 };`
      : `          throw new Error(${json(`${node.tool} still needs browser user action after intervention.`)});`,
    "        } else {",
    `          outputs[${json(node.id)}] = browserResultEvidence(${resultVariable}, ${sourceVariable}, ${json(node.tool)});`,
    "        }",
    "      }",
    "    } else {",
    `      outputs[${json(node.id)}] = browserResultEvidence(${resultVariable}, ${sourceVariable}, ${json(node.tool)});`,
    "    }",
    "  }",
  );
  if (screenshotEnabled) {
    lines.push(
      `  if (!outputs[${json(node.id)}]?.skipped) {`,
      `    const ${screenshotVariable} = await workflow.resumePoint(${json(`${resumeKey}:screenshot`)}, async () => workflow.step(${json(`capture ${node.label ?? humanizeNodeId(node.id)} screenshot`)}, { nodeId: ${json(node.id)} }, async () => tools.browser_screenshot(${valueExpression(node.screenshot?.args ?? {})})));`,
      `    outputs[${json(node.id)}].screenshot = { path: String(${screenshotVariable}?.path ?? ""), artifactPath: String(${screenshotVariable}?.artifactPath ?? ""), bytes: Number(${screenshotVariable}?.bytes ?? 0), width: Number(${screenshotVariable}?.width ?? 0), height: Number(${screenshotVariable}?.height ?? 0), title: String(${screenshotVariable}?.title ?? ""), url: String(${screenshotVariable}?.url ?? "") };`,
      "  }",
    );
  }
  return lines;
}

function sourceLinesForConnectorCall(node: WorkflowProgramConnectorCallNode): string[] {
  const callInput = {
    connectorId: node.connectorId,
    operation: node.operation,
    input: node.input ?? {},
    ...(node.accountId ? { accountId: node.accountId } : {}),
    ...(node.idempotencyKey ? { idempotencyKey: node.idempotencyKey } : {}),
    nodeId: node.id,
  };
  return [`  outputs[${json(node.id)}] = await workflow.resumePoint(${json(node.resumeKey ?? node.id)}, async () => connectors.call(${valueExpression(callInput)}));`];
}

function sourceLinesForConnectorPaginate(node: WorkflowProgramConnectorPaginateNode): string[] {
  const paginationOptions = {
    name: node.label ?? humanizeNodeId(node.id),
    nodeId: node.id,
    input: node.input ?? {},
    ...(node.pageSize ? { pageSize: node.pageSize } : {}),
    maxItems: node.maxItems,
    maxPages: node.maxPages,
    ...(node.itemsPath ? { itemsPath: node.itemsPath } : {}),
    ...(node.nextPageTokenPath ? { nextPageTokenPath: node.nextPageTokenPath } : {}),
    ...(node.pageTokenInputPath ? { pageTokenInputPath: node.pageTokenInputPath } : {}),
    ...(node.pageSizeInputPath ? { pageSizeInputPath: node.pageSizeInputPath } : {}),
    ...(node.dedupeKeyPath ? { dedupeKeyPath: node.dedupeKeyPath } : {}),
    checkpointKey: node.resumeKey ?? node.id,
  };
  const callInputPrefix = [
    `connectorId: ${json(node.connectorId)}`,
    `operation: ${json(node.operation)}`,
    "input: pageInput",
    ...(node.accountId ? [`accountId: ${json(node.accountId)}`] : []),
    ...(node.idempotencyKey ? [`idempotencyKey: ${json(node.idempotencyKey)}`] : []),
    `nodeId: ${json(node.id)}`,
    "itemKey: `page-${pageIndex + 1}`",
  ].join(", ");
  return [
    `  outputs[${json(node.id)}] = await workflow.paginateConnector(${valueExpression(paginationOptions)}, async (pageInput, pageIndex) => {`,
    `    return connectors.call({ ${callInputPrefix} });`,
    "  });",
  ];
}

function sourceLinesForConnectorMap(node: WorkflowProgramConnectorMapNode): string[] {
  const itemsVariable = localVariableName(node.id, "items");
  const selectedVariable = localVariableName(node.id, "selected");
  const mappedVariable = localVariableName(node.id, "mapped");
  const itemVariable = localVariableName(node.id, node.itemName ?? "item");
  const indexVariable = localVariableName(node.id, "index");
  const maxItems = node.maxItems ?? 1000;
  const maxConcurrency = node.maxConcurrency ?? 4;
  const scope = { itemRefs: new Map([[node.itemName ?? "item", itemVariable]]) };
  const callInputPrefix = [
    `connectorId: ${json(node.connectorId)}`,
    `operation: ${json(node.operation)}`,
    `input: ${valueExpression(node.input ?? {}, scope)}`,
    ...(node.accountId ? [`accountId: ${json(node.accountId)}`] : []),
    ...(node.idempotencyKey ? [`idempotencyKey: ${json(node.idempotencyKey)}`] : []),
    `nodeId: ${json(node.id)}`,
  ].join(", ");
  return [
    `  outputs[${json(node.id)}] = await workflow.resumePoint(${json(node.resumeKey ?? node.id)}, async () => {`,
    `    const ${itemsVariable} = ${valueExpression(node.items)};`,
    `    if (!Array.isArray(${itemsVariable})) throw new Error(${json(`connector.map node ${node.id} items must be an array.`)});`,
    `    const ${selectedVariable} = ${itemsVariable}.slice(0, ${json(maxItems)});`,
    `    const ${mappedVariable} = await workflow.batch(${selectedVariable}, { name: ${json(node.label ?? humanizeNodeId(node.id))}, nodeId: ${json(node.id)}, maxConcurrency: ${json(maxConcurrency)} }, async (${itemVariable}, ${indexVariable}) => {`,
    `        const result = await connectors.call({ ${callInputPrefix} });`,
    `        return { item: ${itemVariable}, result, index: ${indexVariable} };`,
    "    });",
    `    return { items: ${mappedVariable}, count: ${mappedVariable}.length, sourceCount: ${itemsVariable}.length, truncated: ${itemsVariable}.length > ${json(maxItems)} };`,
    "  });",
  ];
}

function sourceLinesForCollectionMap(node: WorkflowProgramCollectionMapNode): string[] {
  const itemsVariable = localVariableName(node.id, "items");
  const itemVariable = localVariableName(node.id, node.itemName ?? "item");
  const indexVariable = localVariableName(node.id, "index");
  const scope = { itemRefs: new Map([[node.itemName ?? "item", itemVariable]]) };
  const options = {
    name: node.label ?? humanizeNodeId(node.id),
    nodeId: node.id,
    maxItems: node.maxItems,
    checkpointKey: node.resumeKey ?? node.id,
  };
  return [
    `  const ${itemsVariable} = ${valueExpression(node.items)};`,
    `  if (!Array.isArray(${itemsVariable})) throw new Error(${json(`collection.map node ${node.id} items must be an array.`)});`,
    `  outputs[${json(node.id)}] = await workflow.mapCollection(${itemsVariable}, ${valueExpression(options)}, async (${itemVariable}, ${indexVariable}) => (${valueExpression(node.map, scope)}));`,
  ];
}

function sourceLinesForCollectionFilter(node: WorkflowProgramCollectionFilterNode): string[] {
  const itemsVariable = localVariableName(node.id, "items");
  const matchesVariable = localVariableName(node.id, "matches");
  const selectedVariable = localVariableName(node.id, "selected");
  const itemVariable = localVariableName(node.id, node.itemName ?? "item");
  const nameVariable = localVariableName(node.id, "name");
  const extensionVariable = localVariableName(node.id, "extension");
  const typeVariable = localVariableName(node.id, "type");
  const includeExtensions = normalizeFileExtensions(node.includeExtensions);
  const includeNamePrefixes = normalizeStringFilterValues(node.includeNamePrefixes, "case-sensitive");
  const excludeNamePrefixes = normalizeStringFilterValues(node.excludeNamePrefixes, "case-sensitive");
  const excludeNameIncludes = normalizeStringFilterValues(node.excludeNameIncludes, "lowercase");
  const requireFile = node.requireFile === true;
  const filterDescriptor = {
    includeExtensions,
    includeNamePrefixes,
    excludeNamePrefixes,
    excludeNameIncludes,
    requireFile,
  };
  return [
    `  outputs[${json(node.id)}] = await workflow.resumePoint(${json(node.resumeKey ?? node.id)}, async () => workflow.step(${json(node.label ?? humanizeNodeId(node.id))}, { nodeId: ${json(node.id)} }, async () => {`,
    `    const ${itemsVariable} = ${valueExpression(node.items)};`,
    `    if (!Array.isArray(${itemsVariable})) throw new Error(${json(`collection.filter node ${node.id} items must be an array.`)});`,
    `    const ${matchesVariable} = ${itemsVariable}.filter((${itemVariable}) => {`,
    `      const ${nameVariable} = String(${itemVariable}?.name ?? ${itemVariable}?.path ?? ${itemVariable}?.absolutePath ?? "");`,
    `      const ${extensionVariable} = String(${itemVariable}?.extension ?? (${nameVariable}.match(/\\.[^.]+$/)?.[0] ?? "")).toLowerCase();`,
    `      const ${typeVariable} = String(${itemVariable}?.type ?? ${itemVariable}?.kind ?? "").toLowerCase();`,
    requireFile ? `      if (${typeVariable} && ${typeVariable} !== "file") return false;` : "      void 0;",
    includeExtensions.length ? `      if (!${json(includeExtensions)}.includes(${extensionVariable})) return false;` : "      void 0;",
    includeNamePrefixes.length ? `      if (!${json(includeNamePrefixes)}.some((prefix) => ${nameVariable}.startsWith(prefix))) return false;` : "      void 0;",
    excludeNamePrefixes.length ? `      if (${json(excludeNamePrefixes)}.some((prefix) => ${nameVariable}.startsWith(prefix))) return false;` : "      void 0;",
    excludeNameIncludes.length ? `      if (${json(excludeNameIncludes)}.some((needle) => ${nameVariable}.toLowerCase().includes(needle))) return false;` : "      void 0;",
    "      return true;",
    "    });",
    `    const ${selectedVariable} = ${matchesVariable}.slice(0, ${json(node.maxItems)});`,
    `    return { items: ${selectedVariable}, count: ${selectedVariable}.length, sourceCount: ${itemsVariable}.length, matchedCount: ${matchesVariable}.length, maxItems: ${json(node.maxItems)}, truncated: ${matchesVariable}.length > ${json(node.maxItems)}, filter: ${json(filterDescriptor)} };`,
    "  }));",
  ];
}

function sourceLinesForCollectionDedupe(node: WorkflowProgramCollectionDedupeNode): string[] {
  const itemsVariable = localVariableName(node.id, "items");
  const options = {
    name: node.label ?? humanizeNodeId(node.id),
    nodeId: node.id,
    ...(node.keyPath ? { keyPath: node.keyPath } : {}),
    strategy: node.strategy ?? "url_canonical",
    maxItems: node.maxItems,
    checkpointKey: node.resumeKey ?? node.id,
  };
  return [
    `  const ${itemsVariable} = ${valueExpression(node.items)};`,
    `  if (!Array.isArray(${itemsVariable})) throw new Error(${json(`collection.dedupe node ${node.id} items must be an array.`)});`,
    `  outputs[${json(node.id)}] = await workflow.dedupeCollection(${itemsVariable}, ${valueExpression(options)});`,
  ];
}

function sourceLinesForCollectionChunk(node: WorkflowProgramCollectionChunkNode): string[] {
  const itemsVariable = localVariableName(node.id, "items");
  const options = {
    name: node.label ?? humanizeNodeId(node.id),
    nodeId: node.id,
    chunkSize: node.chunkSize,
    maxChunks: node.maxChunks,
    checkpointKey: node.resumeKey ?? node.id,
  };
  return [
    `  const ${itemsVariable} = ${valueExpression(node.items)};`,
    `  if (!Array.isArray(${itemsVariable})) throw new Error(${json(`collection.chunk node ${node.id} items must be an array.`)});`,
    `  outputs[${json(node.id)}] = await workflow.chunkCollection(${itemsVariable}, ${valueExpression(options)});`,
  ];
}

function sourceLinesForDocumentRender(node: WorkflowProgramDocumentRenderNode): string[] {
  const options = {
    name: node.label ?? humanizeNodeId(node.id),
    nodeId: node.id,
    title: node.title ?? node.label ?? humanizeNodeId(node.id),
    format: node.format,
    ...(node.path ? { path: node.path } : {}),
    ...(node.maxSourceChars ? { maxSourceChars: node.maxSourceChars } : {}),
    checkpointKey: node.resumeKey ?? node.id,
  };
  return [`  outputs[${json(node.id)}] = await workflow.renderDocument(${valueExpression(node.input)}, ${valueExpression(options)});`];
}

function sourceLinesForModelCall(node: WorkflowProgramModelCallNode): string[] {
  const inputExpression = valueExpression(node.input ?? {});
  const outputContract = json(node.output.schema);
  const retry = json({ maxAttempts: node.retry?.maxAttempts ?? 2, onInvalid: node.retry?.onInvalid ?? "retry" });
  return [
    `  outputs[${json(node.id)}] = await workflow.resumePoint(${json(node.id)}, async () => {`,
    `    const modelInput = compactAmbientInputObject(${inputExpression});`,
    `    return ambient.call({`,
    `      task: ${json(node.task)},`,
    `      nodeId: ${json(node.id)},`,
    `      input: { ...modelInput, outputContract: ${outputContract} },`,
    `      schema: { parse(value) { return validateModelOutput(value, ${outputContract}); } },`,
    `      retry: ${retry},`,
    "    });",
    "  });",
  ];
}

function sourceLinesForModelMap(node: WorkflowProgramModelMapNode): string[] {
  const itemsVariable = localVariableName(node.id, "items");
  const itemVariable = localVariableName(node.id, node.itemName ?? "item");
  const indexVariable = localVariableName(node.id, "index");
  const mapInput = node.input ?? { [node.itemName ?? "item"]: { fromItem: node.itemName ?? "item" } };
  const scope = { itemRefs: new Map([[node.itemName ?? "item", itemVariable]]) };
  const outputContract = json(node.output.schema);
  const retry = json({ maxAttempts: node.retry?.maxAttempts ?? 4, onInvalid: node.retry?.onInvalid ?? "retry" });
  const options = {
    name: node.label ?? humanizeNodeId(node.id),
    nodeId: node.id,
    maxItems: node.maxItems,
    maxConcurrency: node.maxConcurrency ?? WORKFLOW_PROGRAM_RUNTIME_PARALLEL_CONCURRENCY,
    checkpointKey: node.resumeKey ?? node.id,
  };
  return [
    `  const ${itemsVariable} = ${valueExpression(node.items)};`,
    `  if (!Array.isArray(${itemsVariable})) throw new Error(${json(`model.map node ${node.id} items must be an array.`)});`,
    `  outputs[${json(node.id)}] = await workflow.mapModel(${itemsVariable}, ${valueExpression(options)}, async (${itemVariable}, ${indexVariable}) => {`,
    `    const modelInput = compactAmbientInputObject(${valueExpression(mapInput, scope)});`,
    "    return ambient.call({",
    `      task: ${json(node.task)},`,
    `      nodeId: ${json(node.id)},`,
    `      input: { ...modelInput, itemIndex: ${indexVariable}, outputContract: ${outputContract} },`,
    `      schema: { parse(value) { return validateModelOutput(value, ${outputContract}); } },`,
    `      retry: ${retry},`,
    "    });",
    "  });",
  ];
}

function sourceLinesForModelReduce(node: WorkflowProgramModelReduceNode): string[] {
  const itemsVariable = localVariableName(node.id, "items");
  const reduceItemsVariable = localVariableName(node.id, "reduceItems");
  const reduceContextVariable = localVariableName(node.id, "reduceContext");
  const outputContract = json(node.output.schema);
  const retry = json({ maxAttempts: node.retry?.maxAttempts ?? 4, onInvalid: node.retry?.onInvalid ?? "retry" });
  const options = {
    name: node.label ?? humanizeNodeId(node.id),
    nodeId: node.id,
    maxInputItems: node.maxInputItems,
    strategy: node.strategy ?? "single_pass",
    maxFanIn: node.maxFanIn,
    maxLevels: node.maxLevels,
    checkpointKey: node.resumeKey ?? node.id,
  };
  return [
    `  const ${itemsVariable} = ${valueExpression(node.items)};`,
    `  if (!Array.isArray(${itemsVariable})) throw new Error(${json(`model.reduce node ${node.id} items must be an array.`)});`,
    `  outputs[${json(node.id)}] = await workflow.reduceModel(${itemsVariable}, ${valueExpression(options)}, async (${reduceItemsVariable}, ${reduceContextVariable}) => {`,
    `    const modelInput = compactAmbientInputObject({ ...ambientInputObject(${valueExpression(node.input ?? {})}), items: ${reduceItemsVariable}, coverage: ${reduceContextVariable} });`,
    "    return ambient.call({",
    `      task: ${json(node.task)},`,
    `      nodeId: ${json(node.id)},`,
    `      input: { ...modelInput, outputContract: ${outputContract} },`,
    `      schema: { parse(value) { return validateModelOutput(value, ${outputContract}); } },`,
    `      retry: ${retry},`,
    "    });",
    "  });",
  ];
}

function sourceLinesForMutationStage(node: WorkflowProgramMutationStageNode): string[] {
  const argsVariable = localVariableName(node.id, "args");
  const changeSetVariable = localVariableName(node.id, "changeSet");
  return [
    `  const ${argsVariable} = ${valueExpression(node.args ?? {})};`,
    `  const ${changeSetVariable} = ${valueExpression(node.changeSet ?? { tool: node.tool, args: node.args ?? {} })};`,
    `  outputs[${json(node.id)}] = await workflow.stageMutation(${changeSetVariable}, async () => ${toolReference(node.tool)}(${argsVariable}), { nodeId: ${json(node.id)} });`,
  ];
}

function sourceLinesForReviewInput(node: WorkflowProgramReviewInputNode): string[] {
  const promptVariable = localVariableName(node.id, "prompt");
  const optionsVariable = localVariableName(node.id, "options");
  return [
    `  const ${promptVariable} = String(${valueExpression(node.prompt)});`,
    `  const ${optionsVariable} = { choices: ${json(node.choices ?? [])}, allowFreeform: ${json(node.allowFreeform ?? true)}, data: ${valueExpression(node.data ?? {})} };`,
    `  outputs[${json(node.id)}] = await workflow.askUser(${promptVariable}, ${optionsVariable}, { nodeId: ${json(node.id)} });`,
  ];
}

function sourceLinesForApprovalRequired(node: WorkflowProgramApprovalRequiredNode): string[] {
  const changeSetVariable = localVariableName(node.id, "changeSet");
  return [
    `  const ${changeSetVariable} = ${valueExpression(node.changeSet)};`,
    `  outputs[${json(node.id)}] = await workflow.requireApproval(${changeSetVariable}, { nodeId: ${json(node.id)} });`,
  ];
}

function sourceLinesForBranchIf(node: WorkflowProgramBranchIfNode): string[] {
  return [
    `  outputs[${json(node.id)}] = await workflow.step(${json(node.label ?? humanizeNodeId(node.id))}, { nodeId: ${json(node.id)} }, async () => {`,
    `    const condition = Boolean(${valueExpression(node.condition)});`,
    `    return { condition, branch: condition ? "then" : "else", value: condition ? ${valueExpression(node.then)} : ${valueExpression(node.else ?? null)} };`,
    "  });",
  ];
}

function sourceLinesForLoopMap(node: WorkflowProgramLoopMapNode): string[] {
  const itemsVariable = localVariableName(node.id, "items");
  const selectedVariable = localVariableName(node.id, "selected");
  const mappedVariable = localVariableName(node.id, "mapped");
  const itemVariable = localVariableName(node.id, node.itemName ?? "item");
  const indexVariable = localVariableName(node.id, "index");
  const maxItems = node.maxItems ?? 1000;
  const scope = { itemRefs: new Map([[node.itemName ?? "item", itemVariable]]) };
  if (isWorkflowProgramLoopMapToolCall(node.map)) {
    const maxConcurrency = node.maxConcurrency ?? WORKFLOW_PROGRAM_RUNTIME_PARALLEL_CONCURRENCY;
    const call = `${toolReference(node.map.tool)}(${valueExpression(node.map.args ?? {}, scope)})`;
    return [
      `  outputs[${json(node.id)}] = await workflow.resumePoint(${json(node.resumeKey ?? node.id)}, async () => workflow.step(${json(node.label ?? humanizeNodeId(node.id))}, { nodeId: ${json(node.id)} }, async () => {`,
      `    const ${itemsVariable} = ${valueExpression(node.items)};`,
      `    if (!Array.isArray(${itemsVariable})) throw new Error(${json(`loop.map node ${node.id} items must be an array.`)});`,
      `    const ${selectedVariable} = ${itemsVariable}.slice(0, ${json(maxItems)});`,
      `    const ${mappedVariable} = await workflow.batch(${selectedVariable}, { name: ${json(node.label ?? humanizeNodeId(node.id))}, nodeId: ${json(node.id)}, maxConcurrency: ${json(maxConcurrency)} }, async (${itemVariable}, ${indexVariable}) => {`,
      `        const result = await ${call};`,
      `        return { item: ${itemVariable}, result, index: ${indexVariable} };`,
      "    });",
      `    return { items: ${mappedVariable}, count: ${mappedVariable}.length, sourceCount: ${itemsVariable}.length, truncated: ${itemsVariable}.length > ${json(maxItems)} };`,
      "  }));",
    ];
  }
  return [
    `  outputs[${json(node.id)}] = await workflow.step(${json(node.label ?? humanizeNodeId(node.id))}, { nodeId: ${json(node.id)} }, async () => {`,
    `    const ${itemsVariable} = ${valueExpression(node.items)};`,
    `    if (!Array.isArray(${itemsVariable})) throw new Error(${json(`loop.map node ${node.id} items must be an array.`)});`,
    `    const mapped = ${itemsVariable}.slice(0, ${json(maxItems)}).map((${itemVariable}, ${indexVariable}) => (${valueExpression(node.map, scope)}));`,
    `    return { items: mapped, count: mapped.length, truncated: ${itemsVariable}.length > ${json(maxItems)} };`,
    "  });",
  ];
}

function sourceLinesForErrorHandle(node: WorkflowProgramErrorHandleNode): string[] {
  return [
    `  outputs[${json(node.id)}] = await workflow.step(${json(node.label ?? humanizeNodeId(node.id))}, { nodeId: ${json(node.id)} }, async () => {`,
    "    try {",
    `      const value = ${valueExpression(node.try)};`,
    `      if (value === undefined || value === null) { const fallback = ${valueExpression(node.fallback)}; const fallbackFields = fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? fallback : {}; return { ...fallbackFields, ok: false, value: fallback, fallback, error: { message: ${json(node.errorMessage ?? "Handled value was empty.")} } }; }`,
    "      const valueFields = value && typeof value === 'object' && !Array.isArray(value) ? value : {};",
    "      return { ...valueFields, ok: true, value };",
    "    } catch (error) {",
    `      const fallback = ${valueExpression(node.fallback)}; const fallbackFields = fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? fallback : {}; return { ...fallbackFields, ok: false, value: fallback, fallback, error: { message: error instanceof Error ? error.message : String(error) } };`,
    "    }",
    "  });",
  ];
}

function sourceLinesForFinalOutput(node: WorkflowProgramFinalOutputNode): string[] {
  return [
    `  outputs[${json(node.id)}] = ${valueExpression(node.value)};`,
    `  await workflow.checkpoint(${json(node.id)}, outputs[${json(node.id)}]);`,
    `  await workflow.emit({ type: 'workflow.output.ready', message: ${json(node.label ?? "Workflow output ready.")}, graphNodeId: ${json(node.id)}, data: outputs[${json(node.id)}] });`,
  ];
}

function valueExpression(value: unknown, scope: { itemRefs?: Map<string, string> } = {}): string {
  if (isProgramRef(value)) {
    const base = `outputs[${json(value.fromNode)}]`;
    return value.path ? `readPath(${base}, ${json(value.path)})` : base;
  }
  if (isProgramItemRef(value)) {
    const base = scope.itemRefs?.get(value.fromItem);
    if (!base) return "undefined";
    return value.path ? `readPath(${base}, ${json(value.path)})` : base;
  }
  if (isProgramLiteral(value)) return json(value.literal);
  if (isProgramTemplate(value)) return `renderTemplate(${json(value.template)}, ${valueExpression(value.vars ?? {}, scope)})`;
  if (Array.isArray(value)) return `[${value.map((item) => valueExpression(item, scope)).join(", ")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => `${json(key)}: ${valueExpression(item, scope)}`);
    return `{ ${entries.join(", ")} }`;
  }
  return json(value);
}

function toolReference(tool: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(tool) ? `tools.${tool}` : `tools[${json(tool)}]`;
}

function isProgramRef(value: unknown): value is { fromNode: string; path?: string } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as { fromNode?: unknown }).fromNode === "string");
}

function isProgramItemRef(value: unknown): value is { fromItem: string; path?: string } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as { fromItem?: unknown }).fromItem === "string");
}

function isProgramLiteral(value: unknown): value is { literal: unknown } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 1 && "literal" in (value as Record<string, unknown>));
}

function isProgramTemplate(value: unknown): value is { template: string; vars?: Record<string, WorkflowProgramValue> } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as { template?: unknown }).template === "string");
}

function localVariableName(nodeId: string, suffix: string): string {
  const base = nodeId
    .replace(/[^A-Za-z0-9_$]+/g, "_")
    .replace(/^[^A-Za-z_$]+/, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${base || "node"}_${suffix}`;
}

function normalizeFileExtensions(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean).map((value) => (value.startsWith(".") ? value : `.${value}`)))];
}

function normalizeStringFilterValues(values: string[] | undefined, mode: "case-sensitive" | "lowercase"): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean).map((value) => (mode === "lowercase" ? value.toLowerCase() : value)))];
}

function humanizeNodeId(id: string): string {
  return id
    .replace(/[-_.:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function json(value: unknown): string {
  return JSON.stringify(value);
}
