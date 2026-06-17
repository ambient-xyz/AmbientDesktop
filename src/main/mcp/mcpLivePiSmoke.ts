import type { Tool } from "@mariozechner/pi-ai";
import type { AgentToolResult, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { aggressiveAmbientRetryPolicy } from "../aggressiveRetries";
import {
  callWorkflowPiText,
  type WorkflowPiProgress,
  type WorkflowPiTextCallInput,
  type WorkflowPiToolProgress,
} from "../workflow/workflowPiTransport";

export interface McpLivePiSmokeInput {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  prompt: string;
  tools: ToolDefinition<any, any, any>[];
  requiredToolNames: string[];
  successText?: string;
  maxToolRounds?: number;
  maxTokens?: number;
  idleTimeoutMs?: number;
  absoluteTimeoutMs?: number;
  signal?: AbortSignal;
  streamFactory?: WorkflowPiTextCallInput["streamFactory"];
  waitForRetry?: WorkflowPiTextCallInput["waitForRetry"];
  retryPolicy?: WorkflowPiTextCallInput["retryPolicy"];
  onProgress?: (progress: WorkflowPiProgress) => void;
  onToolProgress?: (progress: WorkflowPiToolProgress) => void;
}

export interface McpLivePiSmokeReport {
  schemaVersion: "ambient-mcp-live-pi-smoke-v1";
  providerLabel: string;
  finalText: string;
  requiredToolNames: string[];
  observedToolNames: string[];
  missingRequiredToolNames: string[];
  toolProgress: WorkflowPiToolProgress[];
  progress: WorkflowPiProgress[];
  diagnostics: string[];
}

export type McpLivePiSmokeInstallPlan =
  | {
    kind: "registry";
    serverQuery: string;
    serverId: string;
  }
  | {
    kind: "standard-mcp-import";
    candidate?: Record<string, unknown>;
    candidateRef?: string;
    serverId?: string;
    label?: string;
  };

export type McpLivePiSmokePromptInput = {
  install: McpLivePiSmokeInstallPlan;
  successText: string;
} & (
  | {
    expectedOutcome?: "ready";
    toolQuery: string;
    toolName: string;
    toolArguments: Record<string, unknown>;
  }
  | {
    expectedOutcome: "validation-failed";
    diagnosticsServerId: string;
    expectedDiagnosticText?: string;
    logLines?: number;
  }
);

export async function runMcpLivePiSmoke(input: McpLivePiSmokeInput): Promise<McpLivePiSmokeReport> {
  const toolProgress: WorkflowPiToolProgress[] = [];
  const progress: WorkflowPiProgress[] = [];
  const toolDefinitions = new Map(input.tools.map((tool) => [tool.name, tool]));
  const finalText = await callWorkflowPiText({
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    model: input.model ?? AMBIENT_DEFAULT_MODEL,
    prompt: input.prompt,
    tools: input.tools.map(piToolFromDefinition),
    initialToolChoice: "required",
    maxToolRounds: input.maxToolRounds ?? 8,
    maxTokens: input.maxTokens ?? 2_000,
    reasoning: false,
    idleTimeoutMs: input.idleTimeoutMs ?? 120_000,
    absoluteTimeoutMs: input.absoluteTimeoutMs,
    enforceAbsoluteTimeout: input.absoluteTimeoutMs !== undefined,
    signal: input.signal,
    streamFactory: input.streamFactory,
    waitForRetry: input.waitForRetry,
    retryPolicy: input.retryPolicy ?? aggressiveAmbientRetryPolicy(),
    onProgress: (event) => {
      progress.push(event);
      input.onProgress?.(event);
    },
    onToolProgress: (event) => {
      toolProgress.push(event);
      input.onToolProgress?.(event);
    },
    executeTool: async (toolCall, validatedArgs) => {
      const definition = toolDefinitions.get(toolCall.name);
      if (!definition?.execute) throw new Error(`No executable MCP smoke tool named ${toolCall.name}.`);
      const result = await definition.execute(toolCall.id, validatedArgs, input.signal, undefined, undefined as never);
      return workflowResultFromAgentToolResult(result);
    },
  });
  const observedToolNames = uniqueToolNames(toolProgress.filter((event) => event.status === "done").map((event) => event.toolName));
  const missingRequiredToolNames = input.requiredToolNames.filter((toolName) => !observedToolNames.includes(toolName));
  const report: McpLivePiSmokeReport = {
    schemaVersion: "ambient-mcp-live-pi-smoke-v1",
    providerLabel: input.baseUrl ? "Ambient-compatible" : "Ambient",
    finalText,
    requiredToolNames: input.requiredToolNames,
    observedToolNames,
    missingRequiredToolNames,
    toolProgress,
    progress,
    diagnostics: [],
  };
  report.diagnostics = mcpLivePiSmokeDiagnostics(report, { successText: input.successText });
  return report;
}

export function mcpLivePiSmokeDiagnostics(
  report: Pick<McpLivePiSmokeReport, "finalText" | "missingRequiredToolNames" | "toolProgress">,
  input: { successText?: string } = {},
): string[] {
  const diagnostics: string[] = [];
  if (report.missingRequiredToolNames.length) {
    diagnostics.push(`Missing required MCP smoke tools: ${report.missingRequiredToolNames.join(", ")}.`);
  }
  const toolErrors = report.toolProgress.filter((event) => event.status === "error");
  for (const error of toolErrors) {
    diagnostics.push(`Tool ${error.toolName || "(unknown)"} failed: ${error.error ?? error.resultSummary ?? "unknown error"}.`);
  }
  if (input.successText && !report.finalText.includes(input.successText)) {
    diagnostics.push(`Final response did not include required success text ${input.successText}.`);
  }
  return diagnostics;
}

export function mcpLivePiSmokePrompt(input: McpLivePiSmokePromptInput): string {
  const installSteps = mcpLivePiSmokeInstallSteps(input.install);
  const listStep = installSteps.length + 1;
  if (input.expectedOutcome === "validation-failed") {
    const diagnosticsStep = installSteps.length + 2;
    const confirmationStep = installSteps.length + 3;
    const diagnosticsArgs = {
      serverId: input.diagnosticsServerId,
      logLines: input.logLines ?? 40,
    };
    return [
      "You are validating Ambient Desktop's compact MCP interface.",
      "Use the available Ambient MCP tools, not shell commands.",
      "Do not use autowire planning or review tools in this fixture; the server or candidate has already been selected.",
      "This is a validation-failure smoke: if install reports validation_failed, keep the workload inside ToolHive and inspect Ambient diagnostics.",
      "Do not try npm, npx, Docker, Podman, supergateway, local bridge, or host shell fallbacks.",
      "Complete these steps in order:",
      ...installSteps,
      `${listStep}. List installed MCP servers.`,
      `${diagnosticsStep}. Call ambient_mcp_server_diagnostics with JSON arguments ${JSON.stringify(diagnosticsArgs)}.`,
      input.expectedDiagnosticText
        ? `${confirmationStep}. Confirm the diagnostics mention ${JSON.stringify(input.expectedDiagnosticText)}.`
        : `${confirmationStep}. Confirm diagnostics were captured for ${input.diagnosticsServerId}.`,
      `After diagnostics are captured, reply with exactly ${input.successText}.`,
    ].join("\n");
  }
  const toolSearchStep = installSteps.length + 2;
  const toolDescribeStep = installSteps.length + 3;
  const toolCallStep = installSteps.length + 4;
  return [
    "You are validating Ambient Desktop's compact MCP interface.",
    "Use the available Ambient MCP tools, not shell commands.",
    "Do not use autowire planning or review tools in this fixture; the server or candidate has already been selected.",
    "Complete these steps in order:",
    ...installSteps,
    `${listStep}. List installed MCP servers.`,
    `${toolSearchStep}. Search installed MCP tools for ${input.toolQuery}.`,
    `${toolDescribeStep}. Describe installed MCP tool ${input.toolName}.`,
    `${toolCallStep}. Call installed MCP tool ${input.toolName} with these JSON arguments: ${JSON.stringify(input.toolArguments)}.`,
    `After all steps succeed, reply with exactly ${input.successText}.`,
  ].join("\n");
}

function mcpLivePiSmokeInstallSteps(install: McpLivePiSmokeInstallPlan): string[] {
  if (install.kind === "registry") {
    return [
      `1. Call ambient_mcp_server_search with JSON arguments ${JSON.stringify({ query: install.serverQuery })}.`,
      `2. Call ambient_mcp_server_describe with JSON arguments ${JSON.stringify({ serverId: install.serverId })}.`,
      `3. Call ambient_mcp_server_install with JSON arguments ${JSON.stringify({ serverId: install.serverId })}.`,
    ];
  }
  const label = install.label ?? install.serverId ?? "the Standard MCP candidate";
  if (!install.candidateRef && !install.candidate) throw new Error("Standard MCP smoke install requires candidate or candidateRef.");
  const toolArgs = install.candidateRef
    ? { candidateRef: install.candidateRef }
    : { candidate: install.candidate };
  return [
    `1. Describe Standard MCP candidate ${label} by calling ambient_mcp_standard_import_describe with JSON arguments ${JSON.stringify(toolArgs)}.`,
    `2. Install Standard MCP candidate ${label} by calling ambient_mcp_standard_import_install with JSON arguments ${JSON.stringify(toolArgs)}.`,
  ];
}

function piToolFromDefinition(tool: ToolDefinition<any, any, any>): Tool {
  return {
    name: tool.name,
    description: tool.description ?? tool.name,
    parameters: tool.parameters as never,
  };
}

function workflowResultFromAgentToolResult(result: AgentToolResult<unknown>): { text: string; isError?: boolean; details?: unknown } {
  return {
    text: (result.content ?? []).map((item) => item.type === "text" ? item.text ?? "" : "").join("\n"),
    ...(result.details === undefined ? {} : { details: result.details }),
  };
}

function uniqueToolNames(names: string[]): string[] {
  return [...new Set(names.filter(Boolean))];
}
