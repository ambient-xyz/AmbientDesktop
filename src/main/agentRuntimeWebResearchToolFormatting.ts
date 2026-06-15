import type { AgentToolResult } from "@mariozechner/pi-coding-agent";

import type { WebResearchProviderConfig } from "../shared/types";
import { webResearchToolResult } from "./agentRuntimeWebResearchStatusTools";
import { materializeTextOutput, materializedTextNotice, type MaterializedTextOutput } from "./toolOutputArtifacts";
import type { WebResearchProviderAttempt } from "./webResearchBroker";

export function isWebResearchMcpProvider(
  provider: WebResearchProviderConfig | undefined,
  role: "search" | "fetch",
): provider is WebResearchProviderConfig & { mcp: NonNullable<WebResearchProviderConfig["mcp"]> } {
  return Boolean(
    provider?.mcp?.toolName &&
      provider.roles.includes(role) &&
      (provider.kind === "toolhive-mcp" || provider.kind === "remote-mcp"),
  );
}

export function webResearchToolUpdate(toolName: string, text: string): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-web-research",
      toolName,
      status: "running",
    },
  };
}

export async function webResearchMaterializedToolResult(
  workspacePath: string,
  label: string,
  noticeLabel: string,
  text: string,
  details: Record<string, unknown>,
): Promise<{ content: { type: "text"; text: string }[]; details: Record<string, unknown> }> {
  const output = await materializeTextOutput(workspacePath, {
    label,
    text,
    maxPreviewChars: 12_000,
    extension: "txt",
  });
  const rendered = output.truncated
    ? `${output.text}\n\n${materializedTextNotice(noticeLabel, output)}`
    : output.text;
  return webResearchToolResult(rendered, {
    ...details,
    ...(output.truncated || output.redacted ? { textOutput: output } : {}),
  });
}

export function webResearchResultText(
  text: string,
  role: "search" | "fetch",
  selectedProvider: string,
  attempts: WebResearchProviderAttempt[],
  output?: MaterializedTextOutput,
): string {
  const notice = output ? materializedTextNotice(`${role} output`, output) : undefined;
  return [
    `Web research ${role} completed with ${selectedProvider}.`,
    webResearchAttemptsText(attempts),
    "",
    text,
    notice ? `\n${notice}` : "",
  ].filter((line) => line !== undefined).join("\n");
}

export function webResearchNoProviderText(role: "search" | "fetch", attempts: WebResearchProviderAttempt[]): string {
  return [
    `No configured web research ${role} provider completed successfully.`,
    webResearchAttemptsText(attempts),
    "Check Web Research settings, provider health, or use the Ambient Browser directly for interactive/authenticated pages.",
  ].join("\n\n");
}

function webResearchAttemptsText(attempts: WebResearchProviderAttempt[]): string {
  if (attempts.length === 0) return "Routing attempts: none.";
  return [
    "Routing attempts:",
    ...attempts.map((attempt, index) => {
      const details = [
        attempt.tool ? `tool=${attempt.tool}` : undefined,
        attempt.durationMs !== undefined ? `${attempt.durationMs}ms` : undefined,
        attempt.reason ? attempt.reason : undefined,
      ].filter(Boolean).join("; ");
      return `${index + 1}. ${attempt.providerId}: ${attempt.status}${details ? ` (${details})` : ""}`;
    }),
  ].join("\n");
}
