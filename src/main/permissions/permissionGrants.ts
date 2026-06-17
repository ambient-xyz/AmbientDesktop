import { createHash } from "node:crypto";
import type {
  AmbientPermissionGrant,
  CreateAmbientPermissionGrantInput,
  PermissionGrantActionKind,
  PermissionGrantScopeKind,
  PermissionGrantTargetKind,
  PermissionMode,
  PermissionPromptResolution,
  PermissionPromptResponseMode,
  PermissionRequest,
} from "../../shared/types";
import type { ProjectStore } from "../projectStore/projectStore";

export interface PermissionGrantContext {
  permissionMode: PermissionMode;
  threadId: string;
  workflowThreadId?: string;
  projectPath?: string;
  workspacePath?: string;
}

export interface PermissionGrantResolution {
  allowed: boolean;
  decisionSource:
    | "prompt_allow_once"
    | "prompt_always_thread"
    | "prompt_always_workflow"
    | "prompt_always_project"
    | "prompt_always_workspace"
    | "persistent_grant"
    | "denied_by_user";
  grant?: AmbientPermissionGrant;
  response: PermissionPromptResponseMode;
}

export interface PermissionPromptRequester {
  request(input: Omit<PermissionRequest, "id">): Promise<PermissionPromptResolution>;
}

export async function resolvePermissionWithGrants(input: {
  store: ProjectStore;
  requester: PermissionPromptRequester;
  request: Omit<PermissionRequest, "id">;
  context: PermissionGrantContext;
  requireFreshPrompt?: boolean;
}): Promise<PermissionGrantResolution> {
  const request = input.requireFreshPrompt
    ? { ...enrichPermissionRequest(input.request, input.context), reusableScopes: [] }
    : enrichPermissionRequest(input.request, input.context);
  if (!input.requireFreshPrompt) {
    const existingGrant = findMatchingPermissionGrant(input.store.listPermissionGrants(), request, input.context);
    if (existingGrant) {
      return { allowed: true, decisionSource: "persistent_grant", grant: existingGrant, response: grantResponseMode(existingGrant.scopeKind) };
    }
  }

  const response = await input.requester.request(request);
  if (!response.allowed) {
    return { allowed: false, decisionSource: "denied_by_user", response: response.mode };
  }
  if (input.requireFreshPrompt) {
    return { allowed: true, decisionSource: "prompt_allow_once", response: response.mode };
  }

  const grantInput = grantInputFromPromptResponse(request, input.context, response.mode);
  if (!grantInput) {
    return { allowed: true, decisionSource: "prompt_allow_once", response: response.mode };
  }
  const grant = input.store.createPermissionGrant(grantInput);
  return { allowed: true, decisionSource: promptDecisionSource(response.mode), response: response.mode, grant };
}

export function enrichPermissionRequest(
  request: Omit<PermissionRequest, "id">,
  context: PermissionGrantContext,
): Omit<PermissionRequest, "id"> {
  const actionKind = request.grantActionKind ?? permissionGrantActionKind(request);
  const targetKind = request.grantTargetKind ?? permissionGrantTargetKind(request);
  const targetLabel = request.grantTargetLabel ?? permissionGrantTargetLabel(request);
  return {
    ...request,
    workspacePath: request.workspacePath ?? context.workspacePath,
    projectPath: request.projectPath ?? context.projectPath,
    workflowThreadId: request.workflowThreadId ?? context.workflowThreadId,
    reusableScopes: request.reusableScopes ?? reusableScopesForRequest(request, context),
    grantActionKind: actionKind,
    grantTargetKind: targetKind,
    grantTargetLabel: targetLabel,
    grantTargetHash: request.grantTargetHash ?? permissionGrantTargetHash(actionKind, targetKind, targetLabel),
  };
}

export function findMatchingPermissionGrant(
  grants: AmbientPermissionGrant[],
  request: Omit<PermissionRequest, "id">,
  context: PermissionGrantContext,
  now = new Date(),
): AmbientPermissionGrant | undefined {
  const enriched = enrichPermissionRequest(request, context);
  return grants.find((grant) => {
    if (grant.revokedAt) return false;
    if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= now.getTime()) return false;
    if (grant.actionKind !== enriched.grantActionKind || grant.targetKind !== enriched.grantTargetKind || grant.targetHash !== enriched.grantTargetHash) return false;
    if (grant.scopeKind === "thread") return Boolean(context.threadId && grant.threadId === context.threadId);
    if (grant.scopeKind === "workflow_thread") return Boolean(context.workflowThreadId && grant.workflowThreadId === context.workflowThreadId);
    if (grant.scopeKind === "project") return Boolean(context.projectPath && grant.projectPath === context.projectPath);
    if (grant.scopeKind === "workspace") return Boolean(context.workspacePath && grant.workspacePath === context.workspacePath);
    return grant.scopeKind === "global_plugin" && grant.targetKind === "plugin";
  });
}

export function grantInputFromPromptResponse(
  request: Omit<PermissionRequest, "id">,
  context: PermissionGrantContext,
  response: PermissionPromptResponseMode,
): CreateAmbientPermissionGrantInput | undefined {
  const enriched = enrichPermissionRequest(request, context);
  const scopeKind = scopeKindFromResponse(response);
  if (!scopeKind || !(enriched.reusableScopes ?? []).includes(scopeKind)) return undefined;
  return {
    permissionModeAtCreation: context.permissionMode,
    scopeKind,
    threadId: scopeKind === "thread" ? context.threadId : undefined,
    workflowThreadId: scopeKind === "workflow_thread" ? context.workflowThreadId : undefined,
    projectPath: scopeKind === "project" ? context.projectPath : undefined,
    workspacePath: scopeKind === "workspace" ? context.workspacePath : undefined,
    actionKind: enriched.grantActionKind ?? permissionGrantActionKind(enriched),
    targetKind: enriched.grantTargetKind ?? permissionGrantTargetKind(enriched),
    targetHash: enriched.grantTargetHash ?? permissionGrantTargetHash(permissionGrantActionKind(enriched), permissionGrantTargetKind(enriched), permissionGrantTargetLabel(enriched)),
    targetLabel: enriched.grantTargetLabel ?? permissionGrantTargetLabel(enriched),
    conditions: enriched.grantConditions,
    source: "permission_prompt",
    reason: `Allowed from permission prompt: ${enriched.title}`,
  };
}

export function permissionGrantTargetHash(actionKind: PermissionGrantActionKind, targetKind: PermissionGrantTargetKind, targetLabel: string): string {
  return createHash("sha256").update(`${actionKind}\0${targetKind}\0${targetLabel}`).digest("hex");
}

function permissionGrantActionKind(request: Omit<PermissionRequest, "id">): PermissionGrantActionKind {
  if (request.risk === "secret-path") return "secret_path_read";
  if (request.risk === "browser-network") return "browser_network";
  if (request.risk === "browser-control") return "browser_control";
  if (request.risk === "browser-profile") return "browser_profile";
  if (request.risk === "browser-login" || request.risk === "browser-credential") return "browser_login";
  if (request.risk === "plugin-tool" || request.risk === "privileged-action") return "plugin_tool_execute";
  if (request.risk === "network-command" || request.risk === "destructive-command" || request.risk === "workspace-command") return "shell_command";
  if (request.toolName.includes("write") || request.toolName.includes("edit")) return "local_file_write";
  return "file_content_read";
}

function permissionGrantTargetKind(request: Omit<PermissionRequest, "id">): PermissionGrantTargetKind {
  if (request.risk === "plugin-tool" || request.risk === "privileged-action") return "tool";
  if (request.risk === "browser-network") return "browser_origin";
  if (request.risk === "browser-control" || request.risk === "browser-profile") return "risk";
  if (request.risk === "browser-login" || request.risk === "browser-credential") return "browser_origin";
  if (request.risk === "network-command" || request.risk === "destructive-command" || request.risk === "workspace-command") return "shell_command_prefix";
  if (request.risk === "secret-path" || request.risk === "outside-workspace") return "path";
  return "risk";
}

function permissionGrantTargetLabel(request: Omit<PermissionRequest, "id">): string {
  if (request.risk === "browser-profile") return "copied-chrome-profile";
  if (request.risk === "browser-control") return "browser-page-control";
  if (request.risk === "network-command" && isLoopbackNetworkCommandDetail(request.detail)) return "loopback shell network commands";
  const detail = request.detail?.split("\n")[0]?.trim();
  return (detail || `${request.toolName}:${request.risk}`).slice(0, 240);
}

function isLoopbackNetworkCommandDetail(detail: string | undefined): boolean {
  const command = detail?.trim();
  if (!command) return false;
  const lower = command.toLowerCase();
  if (/\b(scp|sftp|ssh|rsync|rclone|nmap)\b/.test(lower)) return false;
  if (!/\b(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[?::1\]?)\b/.test(lower)) return false;

  const urlHosts = [...command.matchAll(/\bhttps?:\/\/(\[[^\]]+\]|[^/\s:?#"'`]+)/gi)].map((match) => match[1] ?? "");
  return urlHosts.every(isLoopbackHost);
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  return normalized === "localhost" || normalized === "::1" || normalized === "0.0.0.0" || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function reusableScopesForRequest(request: Omit<PermissionRequest, "id">, context: PermissionGrantContext): PermissionGrantScopeKind[] {
  if (request.risk === "browser-login" || request.risk === "browser-credential" || request.risk === "secret-path" || request.risk === "privileged-action") {
    return context.workflowThreadId ? ["thread", "workflow_thread"] : ["thread"];
  }
  const scopes: PermissionGrantScopeKind[] = ["thread"];
  if (context.workflowThreadId) scopes.push("workflow_thread");
  if (context.projectPath) scopes.push("project");
  if (context.workspacePath) scopes.push("workspace");
  return scopes;
}

function scopeKindFromResponse(response: PermissionPromptResponseMode): PermissionGrantScopeKind | undefined {
  if (response === "always_thread") return "thread";
  if (response === "always_workflow") return "workflow_thread";
  if (response === "always_project") return "project";
  if (response === "always_workspace") return "workspace";
  return undefined;
}

function grantResponseMode(scopeKind: PermissionGrantScopeKind): PermissionPromptResponseMode {
  if (scopeKind === "workflow_thread") return "always_workflow";
  if (scopeKind === "project") return "always_project";
  if (scopeKind === "workspace") return "always_workspace";
  return "always_thread";
}

function promptDecisionSource(response: PermissionPromptResponseMode): PermissionGrantResolution["decisionSource"] {
  if (response === "always_workflow") return "prompt_always_workflow";
  if (response === "always_project") return "prompt_always_project";
  if (response === "always_workspace") return "prompt_always_workspace";
  if (response === "always_thread") return "prompt_always_thread";
  return "prompt_allow_once";
}
