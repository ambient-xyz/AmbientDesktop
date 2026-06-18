import type { PermissionRequest } from "../../shared/permissionTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { SubagentToolScopeSnapshotSummary } from "../../shared/subagentTypes";
import { permissionGrantTargetHash } from "../permissions/permissionGrants";
import type { PermissionDecision } from "../permissions/permissionPolicy";

type BrowserDecision = "allow" | "ask_parent" | "deny";
type BrowserRisk = "browser-network" | "browser-control" | "browser-profile" | "browser-login";

const CHILD_BROWSER_TOOL_NAMES = new Set([
  "browser_search",
  "browser_nav",
  "browser_content",
  "browser_local_preview",
  "browser_eval",
  "browser_keypress",
  "browser_pick",
  "browser_screenshot",
  "browser_login",
]);

const BROWSER_CONTROL_TOOL_NAMES = new Set([
  "browser_eval",
  "browser_keypress",
  "browser_pick",
  "browser_screenshot",
]);

export interface SubagentBrowserAuthorityInput {
  thread: Pick<ThreadSummary, "id" | "kind" | "subagentRunId">;
  toolName: string;
  toolInput: unknown;
  snapshots: readonly SubagentToolScopeSnapshotSummary[];
}

export function classifySubagentBrowserToolAuthority(
  input: SubagentBrowserAuthorityInput,
): PermissionDecision | undefined {
  if (input.thread.kind !== "subagent_child") return undefined;
  if (!CHILD_BROWSER_TOOL_NAMES.has(input.toolName)) return undefined;

  const snapshot = input.snapshots.at(-1);
  const profile = childAuthorityProfile(snapshot);
  const approvalMode = stringField(recordValue(profile?.approvalRouting), "mode") ?? snapshot?.scope.approvalMode ?? "interactive";
  const context = browserToolAuthorityContext(input.toolName, input.toolInput);
  const childRunId = input.thread.subagentRunId ?? stringField(profile, "childRunId");
  const childThreadId = input.thread.id;

  if (!profile) {
    return denyChildBrowserTool({
      input,
      context,
      childRunId,
      childThreadId,
      reason: "Sub-agent browser tool is unavailable because no child authority profile was recorded for this run.",
    });
  }

  const resourceScopes = recordValue(profile.resourceScopes);
  const browser = recordValue(resourceScopes?.browser);
  const decision = browserDecision(browser);
  const allowedDomains = stringArrayField(browser, "domains").map(normalizeAuthorityDomain).filter(Boolean);

  if (context.profileMode === "copied") {
    return askOrDenyChildBrowserTool({
      input,
      context: { ...context, risk: "browser-profile" },
      childRunId,
      childThreadId,
      approvalMode,
      reason: "Child requested copied Chrome profile access outside its ordinary browser authority.",
      deniedReason: "Denied copied Chrome profile access by child browser authority profile.",
    });
  }

  if (decision === "deny") {
    return denyChildBrowserTool({
      input,
      context,
      childRunId,
      childThreadId,
      reason: "Denied by child browser authority profile.",
      allowedDomains,
    });
  }

  if (context.domain && allowedDomains.length && !domainAllowedByAuthority(context.domain, allowedDomains)) {
    return askOrDenyChildBrowserTool({
      input,
      context,
      childRunId,
      childThreadId,
      approvalMode,
      reason: `Child requested browser access to ${context.domain}, outside allowed browser domains: ${allowedDomains.join(", ")}.`,
      deniedReason: `Denied browser access to ${context.domain}; it is outside the child authority profile.`,
      allowedDomains,
    });
  }

  if (decision === "allow") return { action: "allow" };

  return askOrDenyChildBrowserTool({
    input,
    context,
    childRunId,
    childThreadId,
    approvalMode,
    reason: "Child browser authority requires parent approval before this browser action.",
    deniedReason: "Denied because this sub-agent launch is non-interactive and cannot ask the parent for browser authority.",
    allowedDomains,
  });
}

function askOrDenyChildBrowserTool(input: {
  input: SubagentBrowserAuthorityInput;
  context: BrowserToolAuthorityContext;
  childRunId?: string;
  childThreadId: string;
  approvalMode: string;
  reason: string;
  deniedReason: string;
  allowedDomains?: readonly string[];
}): PermissionDecision {
  if (input.approvalMode === "non_interactive") {
    return denyChildBrowserTool({
      input: input.input,
      context: input.context,
      childRunId: input.childRunId,
      childThreadId: input.childThreadId,
      reason: input.deniedReason,
      allowedDomains: input.allowedDomains,
    });
  }
  return {
    action: "prompt",
    request: childBrowserPermissionRequest({
      ...input,
      reason: input.reason,
    }),
  };
}

function denyChildBrowserTool(input: {
  input: SubagentBrowserAuthorityInput;
  context: BrowserToolAuthorityContext;
  childRunId?: string;
  childThreadId: string;
  reason: string;
  allowedDomains?: readonly string[];
}): PermissionDecision {
  return {
    action: "deny",
    request: childBrowserPermissionRequest(input),
    reason: input.reason,
  };
}

function childBrowserPermissionRequest(input: {
  input: SubagentBrowserAuthorityInput;
  context: BrowserToolAuthorityContext;
  childRunId?: string;
  childThreadId: string;
  reason: string;
  allowedDomains?: readonly string[];
}): Omit<PermissionRequest, "id"> {
  const { toolName } = input.input;
  const actionKind = browserGrantActionKind(input.context.risk);
  const targetKind = input.context.domain ? "browser_origin" : "tool";
  const targetLabel = input.context.domain ?? toolName;
  return {
    threadId: input.childThreadId,
    toolName,
    title: childBrowserPermissionTitle(input.context.risk),
    message: "A sub-agent needs browser authority outside its current child scope. Review this in the parent thread before the child continues.",
    detail: [
      input.childRunId ? `Child run: ${input.childRunId}` : undefined,
      `Child thread: ${input.childThreadId}`,
      `Tool: ${toolName}`,
      input.context.detail ? `Requested target: ${input.context.detail}` : undefined,
      input.allowedDomains?.length ? `Allowed domains: ${input.allowedDomains.join(", ")}` : undefined,
      `Reason: ${input.reason}`,
    ].filter(Boolean).join("\n"),
    risk: input.context.risk,
    reusableScopes: ["thread", "project", "workspace"],
    grantActionKind: actionKind,
    grantTargetKind: targetKind,
    grantTargetLabel: targetLabel,
    grantTargetHash: permissionGrantTargetHash(actionKind, targetKind, targetLabel),
    grantConditions: {
      provider: "ambient.desktop",
      operation: toolName,
      childThreadId: input.childThreadId,
      ...(input.childRunId ? { childRunId: input.childRunId } : {}),
      ...(input.context.domain ? { domain: input.context.domain } : {}),
      ...(input.context.detail ? { target: input.context.detail } : {}),
      source: "subagent-child-browser-authority",
    },
  };
}

interface BrowserToolAuthorityContext {
  risk: BrowserRisk;
  detail?: string;
  domain?: string;
  profileMode: "isolated" | "copied";
}

function browserToolAuthorityContext(toolName: string, toolInput: unknown): BrowserToolAuthorityContext {
  const detail = browserToolDetail(toolName, toolInput);
  const domain = normalizeBrowserTargetDomain(detail);
  const risk = browserToolRisk(toolName);
  return {
    risk,
    ...(detail ? { detail } : {}),
    ...(domain ? { domain } : {}),
    profileMode: stringField(recordValue(toolInput), "profileMode") === "copied" ? "copied" : "isolated",
  };
}

function browserToolRisk(toolName: string): BrowserRisk {
  if (toolName === "browser_login") return "browser-login";
  if (BROWSER_CONTROL_TOOL_NAMES.has(toolName)) return "browser-control";
  return "browser-network";
}

function browserGrantActionKind(risk: BrowserRisk): "browser_network" | "browser_control" | "browser_profile" | "browser_login" {
  if (risk === "browser-control") return "browser_control";
  if (risk === "browser-profile") return "browser_profile";
  if (risk === "browser-login") return "browser_login";
  return "browser_network";
}

function childBrowserPermissionTitle(risk: BrowserRisk): string {
  if (risk === "browser-profile") return "Allow child copied browser profile access?";
  if (risk === "browser-control") return "Allow child browser page control?";
  if (risk === "browser-login") return "Allow child browser login?";
  return "Allow child browser network access?";
}

function browserToolDetail(toolName: string, input: unknown): string | undefined {
  if (toolName === "browser_search") return stringField(recordValue(input), "query");
  if (toolName === "browser_nav" || toolName === "browser_content") return stringField(recordValue(input), "url");
  if (toolName === "browser_local_preview") return stringField(recordValue(input), "path");
  if (toolName === "browser_eval") return stringField(recordValue(input), "code");
  if (toolName === "browser_pick") return stringField(recordValue(input), "prompt");
  if (toolName === "browser_keypress") return JSON.stringify(recordValue(input)?.keys ?? input);
  return undefined;
}

function childAuthorityProfile(snapshot: SubagentToolScopeSnapshotSummary | undefined): Record<string, unknown> | undefined {
  const resolverInputs = recordValue(snapshot?.resolverInputs);
  return recordValue(resolverInputs?.childAuthorityProfile);
}

function browserDecision(browser: Record<string, unknown> | undefined): BrowserDecision {
  const decision = stringField(browser, "networkDecision");
  return decision === "allow" || decision === "deny" || decision === "ask_parent" ? decision : "ask_parent";
}

function normalizeBrowserTargetDomain(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return normalizeAuthorityDomain(url.hostname);
  } catch {
    return undefined;
  }
}

function normalizeAuthorityDomain(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/\.$/, "");
  } catch {
    return trimmed.replace(/^\.+|\.+$/g, "");
  }
}

function domainAllowedByAuthority(domain: string, allowedDomains: readonly string[]): boolean {
  const normalized = normalizeAuthorityDomain(domain);
  return allowedDomains.some((allowed) => normalized === allowed || normalized.endsWith(`.${allowed}`));
}

function stringArrayField(value: Record<string, unknown> | undefined, key: string): string[] {
  const raw = value?.[key];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringField(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const raw = value?.[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
