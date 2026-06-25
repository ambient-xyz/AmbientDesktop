import type {
  McpAggregationReadinessReport,
  McpToolCallResult,
  McpToolDescriptor,
  McpToolDescriptorReview,
  McpToolDescriptorReviewAcceptResult,
  McpToolPolicySummary,
  McpToolPolicyUpdatePreview,
  McpToolPolicyUpdateResult,
  McpToolTimeoutHint,
} from "./mcpToolBridge";

const defaultMcpHttpTimeoutMs = 60_000;
const mcpToolSearchDescriptionPreviewChars = 240;
const publicWebMcpIdleTimeoutMs = 120_000;
const publicWebMcpMaxRunMs = 10 * 60_000;
const heavyAnalysisMcpIdleTimeoutMs = 180_000;
const heavyAnalysisMcpMaxRunMs = 15 * 60_000;
const mutatingMcpIdleTimeoutMs = 120_000;
const mutatingMcpMaxRunMs = 10 * 60_000;
const quickMcpMaxRunMs = 120_000;

export function mcpToolSearchResultsText(tools: McpToolDescriptor[]): string {
  if (!tools.length) return "No Ambient MCP tools matched. Install and start an Ambient-managed ToolHive MCP server, then search again.";
  return [
    `Found ${tools.length} Ambient MCP tool${tools.length === 1 ? "" : "s"}.`,
    ...tools.map((tool) => {
      const status = [tool.workloadStatus ? `status=${tool.workloadStatus}` : undefined, `review=${tool.reviewStatus}`]
        .filter(Boolean)
        .join(", ");
      const policy = toolPolicyText(tool.policy);
      const description = toolDescriptionPreview(tool.description);
      return `- ${tool.toolRef}: serverId=${tool.serverId}; toolName=${tool.name}; workload=${tool.workloadName}; ${status}${policy ? `; ${policy}` : ""}.${description ? ` descriptionPreview=${JSON.stringify(description)}` : ""}`;
    }),
    "",
    "Search rows intentionally include only description previews. Use ambient_mcp_tool_describe with the exact toolName plus serverId/workloadName from the selected result for the full description and input schema. The displayed toolRef is also accepted as toolName when carrying one copyable identifier is easier.",
  ].join("\n");
}

export function mcpToolDescribeText(tool: McpToolDescriptor): string {
  const timeoutHint = mcpToolTimeoutHintForDescriptor(tool);
  const fileInputHints = mcpToolFileInputHints(tool.inputSchema);
  const outputPathHints = mcpToolOutputPathHints(tool.inputSchema);
  return [
    `${tool.toolRef}: ${tool.description ?? "MCP tool."}`,
    `Tool ref: ${tool.toolRef}`,
    `Tool name: ${tool.name}`,
    `Server id: ${tool.serverId}`,
    `Workload: ${tool.workloadName}`,
    tool.workloadStatus ? `Status: ${tool.workloadStatus}` : undefined,
    tool.endpoint ? `Endpoint: ${tool.endpoint}` : undefined,
    `Descriptor review: ${tool.reviewStatus}`,
    `Timeout hint: idle=${timeoutHint.idleTimeoutMs}ms; maxRun=${formatMcpTimeoutMs(timeoutHint.maxRunMs)}; ${timeoutHint.reason}`,
    tool.reviewReason ? `Review reason: ${tool.reviewReason}` : undefined,
    tool.policy ? `Tool policy: ${toolPolicyText(tool.policy)}` : undefined,
    tool.policy?.reason ? `Policy reason: ${tool.policy.reason}` : undefined,
    tool.lastDiscoveredAt ? `Last discovery: ${tool.lastDiscoveredAt}` : undefined,
    "",
    "Input schema:",
    JSON.stringify(tool.inputSchema ?? emptyObjectSchema(), null, 2),
    fileInputHints.length ? "" : undefined,
    fileInputHints.length ? "Managed file input hints:" : undefined,
    ...fileInputHints,
    outputPathHints.length ? "" : undefined,
    outputPathHints.length ? "Managed output path hints:" : undefined,
    ...outputPathHints,
    "",
    'Call this tool with ambient_mcp_tool_call using this exact toolName plus serverId/workloadName, or use the toolRef as toolName. Put the MCP tool input object under the top-level arguments field, for example: {"toolName":"' +
      tool.toolRef +
      '","arguments":{...}}. Do not use toolInput.',
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

function mcpToolFileInputHints(inputSchema: unknown): string[] {
  const argumentPaths = mcpToolFileArgumentPaths(inputSchema);
  if (!argumentPaths.length) return [];
  return [
    ...argumentPaths
      .slice(0, 6)
      .map(
        (argumentPath) =>
          `- ${argumentPath}: if the user provides inline file-like content, call ambient_mcp_tool_call with fileInputs:[{"argumentPath":"${argumentPath}","filename":"input","content":"..."}]; Ambient stages it into the managed ToolHive exchange and rewrites arguments.${argumentPath} to the container path.`,
      ),
    argumentPaths.length > 6 ? `- ... ${argumentPaths.length - 6} more file-like schema fields omitted from hints.` : undefined,
  ].filter((line): line is string => Boolean(line));
}

function mcpToolFileArgumentPaths(inputSchema: unknown, prefix = "", seen = new Set<unknown>()): string[] {
  if (!inputSchema || typeof inputSchema !== "object" || seen.has(inputSchema)) return [];
  seen.add(inputSchema);
  const schema = inputSchema as Record<string, unknown>;
  const paths: string[] = [];
  const properties = schema.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    for (const [key, value] of Object.entries(properties as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (mcpSchemaFieldLooksLikeFileArgument(key, value)) paths.push(path);
      paths.push(...mcpToolFileArgumentPaths(value, path, seen));
    }
  }
  for (const key of ["oneOf", "anyOf", "allOf"] as const) {
    const variants = schema[key];
    if (Array.isArray(variants)) {
      for (const variant of variants) paths.push(...mcpToolFileArgumentPaths(variant, prefix, seen));
    }
  }
  return [...new Set(paths)];
}

function mcpSchemaFieldLooksLikeFileArgument(key: string, schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const record = schema as Record<string, unknown>;
  if (!mcpSchemaAllowsString(record)) return false;
  if (mcpSchemaFieldLooksLikeOutputArgument(key, schema)) return false;
  const haystack = [
    key,
    typeof record.title === "string" ? record.title : "",
    typeof record.description === "string" ? record.description : "",
  ].join(" ");
  return /\b(?:file|file[_\s-]*path|filepath|file[_\s-]*name|filename|path|csv|tsv|xlsx?|jsonl?|yaml|dataset|input[_\s-]*file)\b/i.test(
    haystack,
  );
}

function mcpToolOutputPathHints(inputSchema: unknown): string[] {
  const argumentPaths = mcpToolOutputArgumentPaths(inputSchema);
  if (!argumentPaths.length) return [];
  return [
    ...argumentPaths
      .slice(0, 6)
      .map(
        (argumentPath) =>
          `- ${argumentPath}: if the MCP tool writes a file, provide a workspace-relative filename such as "result.html"; Ambient pre-creates a writable managed ToolHive exchange file, rewrites arguments.${argumentPath} to the container path, and surfaces the generated artifact. Prefer this over relying on default sibling output paths.`,
      ),
    argumentPaths.length > 6 ? `- ... ${argumentPaths.length - 6} more output-like schema fields omitted from hints.` : undefined,
  ].filter((line): line is string => Boolean(line));
}

function mcpToolOutputArgumentPaths(inputSchema: unknown, prefix = "", seen = new Set<unknown>()): string[] {
  if (!inputSchema || typeof inputSchema !== "object" || seen.has(inputSchema)) return [];
  seen.add(inputSchema);
  const schema = inputSchema as Record<string, unknown>;
  const paths: string[] = [];
  const properties = schema.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    for (const [key, value] of Object.entries(properties as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (mcpSchemaFieldLooksLikeOutputArgument(key, value)) paths.push(path);
      paths.push(...mcpToolOutputArgumentPaths(value, path, seen));
    }
  }
  for (const key of ["oneOf", "anyOf", "allOf"] as const) {
    const variants = schema[key];
    if (Array.isArray(variants)) {
      for (const variant of variants) paths.push(...mcpToolOutputArgumentPaths(variant, prefix, seen));
    }
  }
  return [...new Set(paths)];
}

function mcpSchemaFieldLooksLikeOutputArgument(key: string, schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const record = schema as Record<string, unknown>;
  if (!mcpSchemaAllowsString(record)) return false;
  const haystack = [
    key,
    typeof record.title === "string" ? record.title : "",
    typeof record.description === "string" ? record.description : "",
  ].join(" ");
  return /\b(?:output|output[_\s-]*path|out[_\s-]*path|output[_\s-]*file|outfile|destination|dest|save[_\s-]*(?:as|path|file)?|write[_\s-]*(?:to|path|file)?|target[_\s-]*(?:path|file)?)\b/i.test(
    haystack,
  );
}

function mcpSchemaAllowsString(schema: unknown, seen = new Set<unknown>()): boolean {
  if (!schema || typeof schema !== "object" || seen.has(schema)) return false;
  seen.add(schema);
  const record = schema as Record<string, unknown>;
  const type = record.type;
  if (type === "string" || (Array.isArray(type) && type.includes("string"))) return true;
  for (const key of ["oneOf", "anyOf", "allOf"] as const) {
    const variants = record[key];
    if (Array.isArray(variants) && variants.some((variant) => mcpSchemaAllowsString(variant, seen))) return true;
  }
  return false;
}

export function mcpToolCallResultText(result: McpToolCallResult): string {
  return [
    `MCP tool ${result.descriptor.serverId}/${result.descriptor.name} completed.`,
    mcpToolCallOutputWarning(result),
    mcpToolManagedFileArtifactsText(result),
    result.text,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function mcpToolManagedFileArtifactsText(result: McpToolCallResult): string | undefined {
  if (!result.managedFileArtifacts?.length) return undefined;
  return [
    "Managed MCP file artifacts:",
    ...result.managedFileArtifacts.map((artifact) => {
      const location = artifact.workspacePath
        ? artifact.workspacePath
        : artifact.copySkippedReason
          ? `${artifact.hostPath} (${artifact.copySkippedReason})`
          : artifact.hostPath;
      return `- ${artifact.filename} (${artifact.bytes} bytes): ${location} (container: ${artifact.containerPath})`;
    }),
  ].join("\n");
}

export function mcpToolArgumentValidationErrorText(
  tool: Pick<McpToolDescriptor, "toolRef" | "inputSchema">,
  toolArguments: Record<string, unknown>,
): string | undefined {
  const validationErrors = validateMcpToolArguments(tool.inputSchema, toolArguments);
  if (!validationErrors.length) return undefined;
  return [
    `MCP tool arguments failed schema validation for ${tool.toolRef}: ${validationErrors.join("; ")}.`,
    mcpToolArgumentRepairHint(tool.inputSchema, toolArguments),
  ]
    .filter(Boolean)
    .join(" ");
}

function mcpToolCallOutputWarning(result: McpToolCallResult): string | undefined {
  if (!mcpToolCallOutputLooksLikeHtmlError(result)) return undefined;
  return "Warning: MCP transport completed, but the tool output looks like an HTML error page. Treat this as an installed-server/tool behavior failure until a non-error smoke result is observed.";
}

export function mcpToolCallOutputLooksLikeHtmlError(result: McpToolCallResult): boolean {
  const text = (result.output.text || result.text || "").slice(0, 16_000);
  return (
    looksLikeHtmlDocument(text) &&
    /\b(?:40[034]|50[0234]|not found|forbidden|unauthorized|access denied|error page|temporarily unavailable)\b/i.test(text)
  );
}

function looksLikeHtmlDocument(text: string): boolean {
  return /<(?:!doctype\s+html|html|head|title|body|meta)\b/i.test(text.slice(0, 4_000));
}

export function mcpToolDescriptorReviewText(review: McpToolDescriptorReview): string {
  return [
    `MCP tool descriptor review for ${review.server.serverId}.`,
    `Workload: ${review.server.workloadName}`,
    `Status: ${review.reviewStatus}`,
    review.reviewReason ? `Reason: ${review.reviewReason}` : undefined,
    review.descriptorHash ? `Descriptor hash: ${review.descriptorHash}` : undefined,
    review.lastDiscoveredAt ? `Last discovery: ${review.lastDiscoveredAt}` : undefined,
    `Tools: ${review.tools.length}`,
    ...review.tools
      .slice(0, 20)
      .map(
        (tool) =>
          `- ${tool.name}${tool.policy ? ` (${toolPolicyText(tool.policy)})` : ""}${tool.description ? `: ${tool.description}` : ""}`,
      ),
    review.tools.length > 20 ? `- ... ${review.tools.length - 20} more` : undefined,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

export function mcpToolDescriptorReviewAcceptText(result: McpToolDescriptorReviewAcceptResult): string {
  return [
    result.status === "trusted"
      ? `Trusted current MCP tool descriptors for ${result.review.server.serverId}.`
      : `MCP tool descriptors for ${result.review.server.serverId} were already trusted.`,
    mcpToolDescriptorReviewText(result.review),
  ].join("\n\n");
}

export function mcpToolPolicyUpdatePreviewText(preview: McpToolPolicyUpdatePreview): string {
  return [
    `MCP tool policy update preview for ${preview.descriptor.toolRef}.`,
    `Status: ${preview.status}`,
    `Server id: ${preview.descriptor.serverId}`,
    `Workload: ${preview.descriptor.workloadName}`,
    `Tool name: ${preview.descriptor.name}`,
    preview.descriptor.descriptorHash ? `Descriptor hash: ${preview.descriptor.descriptorHash}` : undefined,
    `Previous policy: ${toolPolicyText(preview.previousPolicy) || "default"}`,
    `Next policy: ${toolPolicyText(preview.nextPolicy) || "default"}`,
    "",
    preview.status === "would-clear"
      ? "This will restore the tool to the default visible/default-call policy."
      : "This will update Ambient's app-global per-tool policy for this installed MCP server.",
    "This does not trust descriptor drift, reinstall servers, stop workloads, or call the downstream MCP tool.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

export function mcpToolPolicyUpdateResultText(result: McpToolPolicyUpdateResult): string {
  return [
    result.status === "cleared"
      ? `Cleared Ambient MCP tool policy for ${result.descriptor.toolRef}.`
      : `Updated Ambient MCP tool policy for ${result.descriptor.toolRef}.`,
    `Previous policy: ${toolPolicyText(result.previousPolicy) || "default"}`,
    `Current policy: ${toolPolicyText(result.policy) || "default"}`,
  ].join("\n");
}

export function mcpAggregationReadinessText(report: McpAggregationReadinessReport): string {
  return [
    "MCP aggregation readiness.",
    `Status: ${report.status}`,
    `Recommended action: ${report.recommendedAction}`,
    `Installed servers: ${report.serverCount} (minimum for aggregation experiment: ${report.minServerCount})`,
    `Tools: visible=${report.visibleToolCount}; callable=${report.callableToolCount}; hidden=${report.hiddenToolCount}; blocked=${report.blockedToolCount}; approvalRequired=${report.approvalRequiredToolCount}`,
    `Namespace strategy: ${report.namespaceStrategy}`,
    report.duplicateToolNames.length ? `Duplicate tool names: ${report.duplicateToolNames.join(", ")}` : "Duplicate tool names: none",
    "",
    "Checks:",
    ...report.checks.map((check) => `- ${check.status}: ${check.label} - ${check.detail}`),
    "",
    "Servers:",
    ...report.servers.map((server) => {
      const issueText = server.issues.length ? ` issues=${server.issues.join("; ")}` : "";
      return `- ${server.serverId}: workload=${server.workloadName}; review=${server.reviewStatus}; profileHash=${server.profileSha256Verified === undefined ? "unknown" : server.profileSha256Verified ? "verified" : "mismatch"}; callableTools=${server.callableToolCount}; hidden=${server.hiddenToolCount}; blocked=${server.blockedToolCount}${issueText}`;
    }),
    "",
    "Namespace preview:",
    ...(report.namespacePlan.length
      ? report.namespacePlan
          .slice(0, 25)
          .map((item) => `- ${item.aggregateName} -> ${item.toolRef}${item.duplicateName ? " (duplicate source name)" : ""}`)
      : ["- none"]),
    report.namespacePlan.length > 25 ? `- ... ${report.namespacePlan.length - 25} more` : undefined,
    "",
    "Aggregation remains disabled in this build; keep using ambient_mcp_tool_search, ambient_mcp_tool_describe, and ambient_mcp_tool_call as the stable compact bridge.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

export function validateMcpToolArguments(schema: unknown, value: unknown, path = "$"): string[] {
  if (!schema || typeof schema !== "object") return [];
  const record = schema as Record<string, unknown>;
  if (Array.isArray(record.anyOf)) {
    return record.anyOf.some((candidate) => validateMcpToolArguments(candidate, value, path).length === 0)
      ? []
      : [`${path} did not match any allowed schema`];
  }
  if (Array.isArray(record.oneOf)) {
    const matches = record.oneOf.filter((candidate) => validateMcpToolArguments(candidate, value, path).length === 0).length;
    return matches === 1 ? [] : [`${path} must match exactly one allowed schema`];
  }
  if (Array.isArray(record.enum) && !record.enum.includes(value)) return [`${path} must be one of ${record.enum.map(String).join(", ")}`];
  const type = record.type;
  if (Array.isArray(type) && !type.some((candidate) => typeof candidate === "string" && !validateType(candidate, value, path))) {
    return [`${path} must match one of types ${type.filter((entry) => typeof entry === "string").join(", ")}`];
  }
  if (typeof type === "string") {
    const typeError = validateType(type, value, path);
    if (typeError) return [typeError];
  }
  if (record.type === "object" || (record.properties && value && typeof value === "object" && !Array.isArray(value))) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [`${path} must be an object`];
    const objectValue = value as Record<string, unknown>;
    const properties = (record.properties && typeof record.properties === "object" ? record.properties : {}) as Record<string, unknown>;
    const errors: string[] = [];
    for (const required of Array.isArray(record.required) ? record.required : []) {
      if (typeof required === "string" && objectValue[required] === undefined) errors.push(`${path}.${required} is required`);
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (objectValue[key] !== undefined) errors.push(...validateMcpToolArguments(childSchema, objectValue[key], `${path}.${key}`));
    }
    if (record.additionalProperties === false) {
      for (const key of Object.keys(objectValue)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) errors.push(`${path}.${key} is not allowed`);
      }
    }
    return errors;
  }
  if (record.type === "array" && Array.isArray(value) && record.items) {
    return value.flatMap((item, index) => validateMcpToolArguments(record.items, item, `${path}[${index}]`));
  }
  return [];
}

function mcpToolArgumentRepairHint(schema: unknown, value: Record<string, unknown>): string | undefined {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
  const record = schema as Record<string, unknown>;
  const properties = (record.properties && typeof record.properties === "object" ? record.properties : {}) as Record<string, unknown>;
  const propertyNames = Object.keys(properties);
  const required = Array.isArray(record.required) ? record.required.filter((entry): entry is string => typeof entry === "string") : [];
  if (!propertyNames.length && !required.length) return undefined;
  const supplied = Object.keys(value);
  const missing = required.filter((field) => value[field] === undefined);
  const unexpected = supplied.filter((field) => !Object.prototype.hasOwnProperty.call(properties, field));
  const hints: string[] = [];
  if (required.length) hints.push(`expected top-level required field${required.length === 1 ? "" : "s"}: ${required.join(", ")}`);
  if (propertyNames.length) hints.push(`allowed top-level field${propertyNames.length === 1 ? "" : "s"}: ${propertyNames.join(", ")}`);
  if (unexpected.length) hints.push(`unexpected top-level field${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}`);
  for (const field of unexpected) {
    const nested = value[field];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    const nestedRecord = nested as Record<string, unknown>;
    const nestedMatches = [...new Set([...required, ...missing])].filter((candidate) => nestedRecord[candidate] !== undefined);
    if (nestedMatches.length) {
      hints.push(`move ${nestedMatches.join(", ")} out of ${field} and pass them directly under arguments`);
      break;
    }
  }
  return hints.length ? `Repair hint: ${hints.join("; ")}.` : undefined;
}

function toolDescriptionPreview(description: string | undefined): string | undefined {
  const normalized = description?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length <= mcpToolSearchDescriptionPreviewChars
    ? normalized
    : `${normalized.slice(0, mcpToolSearchDescriptionPreviewChars - 1)}…`;
}

export function mcpToolTimeoutHintForDescriptor(
  descriptor: Pick<McpToolDescriptor, "serverId" | "name" | "description" | "inputSchema" | "timeoutHint">,
  defaultIdleTimeoutMs = defaultMcpHttpTimeoutMs,
): McpToolTimeoutHint {
  if (descriptor.timeoutHint) return descriptor.timeoutHint;
  const idleDefault = Math.max(1, Math.floor(defaultIdleTimeoutMs));
  const text = mcpToolTimeoutHaystack(descriptor);
  const matchedSignals: string[] = [];
  const matches = (signal: string, pattern: RegExp): boolean => {
    if (!pattern.test(text)) return false;
    matchedSignals.push(signal);
    return true;
  };
  if (
    matches(
      "heavy-analysis",
      /\b(?:ghidra|decompile|disassemble|xref|binary|reverse|analysis|analyze|index|list[_ -]?functions?|function[_ -]?graph)\b/i,
    )
  ) {
    return {
      descriptorClass: "mcp",
      idleTimeoutMs: heavyAnalysisMcpIdleTimeoutMs,
      maxRunMs: heavyAnalysisMcpMaxRunMs,
      source: "descriptor",
      reason:
        "Descriptor looks like a local analysis or reverse-engineering tool, so Ambient allows longer MCP idle gaps while keeping a hard cap.",
      matchedSignals,
    };
  }
  if (matches("public-web", /\b(?:scrapling|scrape|scraping|fetch|crawl|browser|web|url|urls|html|page|pages|search|extract|render)\b/i)) {
    return {
      descriptorClass: "mcp",
      idleTimeoutMs: publicWebMcpIdleTimeoutMs,
      maxRunMs: publicWebMcpMaxRunMs,
      source: "descriptor",
      reason: "Descriptor looks like public web retrieval or extraction, so Ambient allows slower page fetches while keeping a hard cap.",
      matchedSignals,
    };
  }
  if (
    matches(
      "mutating-or-generation",
      /\b(?:write|create|update|delete|remove|upload|download|generate|compile|build|install|execute|run)\b/i,
    )
  ) {
    return {
      descriptorClass: "mcp",
      idleTimeoutMs: mutatingMcpIdleTimeoutMs,
      maxRunMs: mutatingMcpMaxRunMs,
      source: "descriptor",
      reason: "Descriptor looks mutating, generative, or execution-heavy, so Ambient allows a longer MCP idle window with a hard cap.",
      matchedSignals,
    };
  }
  if (
    matches("quick-read", /\b(?:list|status|ping|health|version|whoami|schema|capabilities)\b/i) &&
    mcpToolRequiredPropertyCount(descriptor.inputSchema) === 0
  ) {
    return {
      descriptorClass: "mcp",
      idleTimeoutMs: idleDefault,
      maxRunMs: quickMcpMaxRunMs,
      source: "descriptor",
      reason:
        "Descriptor looks like a quick read-only metadata probe, so Ambient keeps the default MCP idle window and adds a short hard cap.",
      matchedSignals,
    };
  }
  return {
    descriptorClass: "mcp",
    idleTimeoutMs: idleDefault,
    maxRunMs: null,
    source: "default",
    reason: "No per-tool timeout signal matched; Ambient uses the default MCP idle timeout without a hard cap.",
    matchedSignals,
  };
}

function mcpToolTimeoutHaystack(descriptor: Pick<McpToolDescriptor, "serverId" | "name" | "description" | "inputSchema">): string {
  return [descriptor.serverId, descriptor.name, descriptor.description, ...mcpToolSchemaTerms(descriptor.inputSchema)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function mcpToolSchemaTerms(schema: unknown): string[] {
  if (!schema || typeof schema !== "object") return [];
  const record = schema as Record<string, unknown>;
  const terms: string[] = [];
  if (record.title && typeof record.title === "string") terms.push(record.title);
  if (record.description && typeof record.description === "string") terms.push(record.description);
  if (record.properties && typeof record.properties === "object" && !Array.isArray(record.properties)) {
    for (const [key, value] of Object.entries(record.properties as Record<string, unknown>)) {
      terms.push(key);
      terms.push(...mcpToolSchemaTerms(value));
    }
  }
  if (record.items) terms.push(...mcpToolSchemaTerms(record.items));
  for (const key of ["anyOf", "oneOf", "allOf"] as const) {
    if (Array.isArray(record[key])) {
      for (const child of record[key]) terms.push(...mcpToolSchemaTerms(child));
    }
  }
  return terms;
}

function mcpToolRequiredPropertyCount(schema: unknown): number {
  if (!schema || typeof schema !== "object") return 0;
  const required = (schema as Record<string, unknown>).required;
  return Array.isArray(required) ? required.filter((value) => typeof value === "string").length : 0;
}

function toolPolicyText(policy: McpToolPolicySummary | undefined): string {
  if (!policy) return "";
  const parts = [
    policy.visibility !== "visible" ? `visibility=${policy.visibility}` : undefined,
    policy.callPolicy !== "default" ? `callPolicy=${policy.callPolicy}` : undefined,
    policy.reason ? `reason=${policy.reason}` : undefined,
  ].filter(Boolean);
  return parts.length ? `policy ${parts.join(", ")}` : "";
}

function formatMcpTimeoutMs(value: number | null): string {
  return value === null ? "none" : `${value}ms`;
}

function validateType(type: string, value: unknown, path: string): string | undefined {
  if (type === "object" && (!value || typeof value !== "object" || Array.isArray(value))) return `${path} must be an object`;
  if (type === "array" && !Array.isArray(value)) return `${path} must be an array`;
  if (type === "string" && typeof value !== "string") return `${path} must be a string`;
  if ((type === "number" || type === "integer") && (typeof value !== "number" || !Number.isFinite(value)))
    return `${path} must be a number`;
  if (type === "integer" && typeof value === "number" && !Number.isInteger(value)) return `${path} must be an integer`;
  if (type === "boolean" && typeof value !== "boolean") return `${path} must be a boolean`;
  if (type === "null" && value !== null) return `${path} must be null`;
  return undefined;
}

function emptyObjectSchema(): Record<string, unknown> {
  return { type: "object", properties: {}, additionalProperties: true };
}
