import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import type { McpToolBridgeActivity, McpToolDescriptor } from "./mcpToolBridge";

export function mcpToolActivityUpdate(
  onUpdate: ((update: AgentToolResult<Record<string, unknown>>) => void) | undefined,
  toolName: string,
): ((activity: McpToolBridgeActivity) => void) | undefined {
  if (!onUpdate) return undefined;
  return (activity) => {
    onUpdate({
      content: [{ type: "text", text: `MCP ${activity.operation} activity: ${activity.source}.` }],
      details: {
        runtime: "ambient-mcp",
        toolName,
        status: "activity",
        operation: activity.operation,
        activitySource: activity.source,
        endpointOrigin: activity.endpointOrigin,
        ...(activity.method ? { method: activity.method } : {}),
        ...(activity.requestId !== undefined ? { requestId: activity.requestId } : {}),
        ...(activity.bytes !== undefined ? { bytes: activity.bytes } : {}),
      },
    });
  };
}

export function toolResult(text: string, details: Record<string, unknown>): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

export function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function requiredString(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

export function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function optionalNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

export function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function optionalToolVisibility(value: unknown): "visible" | "hidden" | undefined {
  if (value === undefined) return undefined;
  if (value === "visible" || value === "hidden") return value;
  throw new Error("visibility must be visible or hidden.");
}

export function optionalToolCallPolicy(value: unknown): "default" | "blocked" | "approval-required" | undefined {
  if (value === undefined) return undefined;
  if (value === "default" || value === "blocked" || value === "approval-required") return value;
  throw new Error("callPolicy must be default, blocked, or approval-required.");
}

export function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}

export function compactText(value: string | undefined, maxChars: number): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, Math.max(1, maxChars - 1))}…`;
}

export function toolPolicyApprovalText(policy: McpToolDescriptor["policy"]): string {
  if (!policy) return "";
  return [`visibility=${policy.visibility}`, `callPolicy=${policy.callPolicy}`, policy.reason ? `reason=${policy.reason}` : undefined]
    .filter(Boolean)
    .join(", ");
}
