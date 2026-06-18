import type { BrowserCapabilityState, BrowserCredentialSummary } from "../../shared/browserTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  googleWorkspaceJsonObjectInput,
  googleWorkspaceJsonValueInput,
} from "../google-workspace/agentRuntimeGoogleWorkspaceSetupTools";
import { localDeepResearchSetupToolInput } from "../local-deep-research/agentRuntimeLocalDeepResearchInput";

export interface PermissionToolInputLocalDeepResearchReadiness {
  contract: {
    status: unknown;
    installerShape: unknown;
  };
}

export interface PermissionToolInputGoogleWorkspace {
  describeMethod(input: { methodId: string }): Promise<unknown> | unknown;
  resolveAccountHint?(accountHint?: string): string;
}

export interface PermissionToolInputBrowserCredentials {
  get(id: string): BrowserCredentialSummary | undefined;
}

export interface AgentRuntimePermissionToolInputDependencies {
  readLocalDeepResearchReadiness(
    workspace: WorkspaceState,
    input: { q8Override?: boolean },
  ): Promise<PermissionToolInputLocalDeepResearchReadiness> | PermissionToolInputLocalDeepResearchReadiness;
  googleWorkspace?: PermissionToolInputGoogleWorkspace;
  browserCredentials: PermissionToolInputBrowserCredentials;
  readBrowserState(): Promise<BrowserCapabilityState | undefined> | BrowserCapabilityState | undefined;
}

export async function permissionToolInput(
  toolName: string,
  toolInput: unknown,
  workspace: WorkspaceState,
  dependencies: AgentRuntimePermissionToolInputDependencies,
): Promise<unknown> {
  if (toolName === "ambient_local_deep_research_setup" && isRecord(toolInput)) {
    const record = { ...toolInput };
    const input = localDeepResearchSetupToolInput(record);
    if (input.action === "install" || input.action === "repair" || input.action === "smoke") {
      const readiness = await dependencies.readLocalDeepResearchReadiness(workspace, { q8Override: input.q8Override });
      record.action = input.action;
      if (input.q8Override) record.q8Override = true;
      record.setupStatus = readiness.contract.status;
      record.installerShape = readiness.contract.installerShape;
    }
    return record;
  }

  if (toolName === "google_workspace_call" && isRecord(toolInput)) {
    const record = { ...toolInput };
    const params = googleWorkspaceJsonObjectInput(record.params);
    const body = googleWorkspaceJsonValueInput(record.body);
    if (params) record.params = params;
    if (body !== undefined) record.body = body;
    const methodId = typeof record.methodId === "string" ? record.methodId : undefined;
    if (methodId && dependencies.googleWorkspace) {
      record.method = await Promise.resolve(dependencies.googleWorkspace.describeMethod({ methodId })).catch((error) => ({
        error: error instanceof Error ? error.message : String(error),
      }));
    }
    if (dependencies.googleWorkspace?.resolveAccountHint) {
      const accountHint = typeof record.accountHint === "string" ? record.accountHint : undefined;
      const resolvedAccountHint = await Promise.resolve(dependencies.googleWorkspace.resolveAccountHint(accountHint)).catch((error) => {
        record.accountHintResolutionError = error instanceof Error ? error.message : String(error);
        return undefined;
      });
      if (resolvedAccountHint) record.resolvedAccountHint = resolvedAccountHint;
    }
    return record;
  }

  if (toolName !== "browser_login" || !isRecord(toolInput)) {
    return toolInput;
  }

  const record = { ...toolInput };
  const credentialId = typeof record.credentialId === "string" ? record.credentialId : undefined;
  if (credentialId) {
    const credential = dependencies.browserCredentials.get(credentialId);
    if (credential) {
      record.credentialLabel = credential.label;
      record.username = credential.username;
      record.expectedOrigin = typeof record.expectedOrigin === "string" ? record.expectedOrigin : credential.origin;
    }
  }
  const state = await Promise.resolve(dependencies.readBrowserState()).catch(() => undefined);
  if (state?.activeTab?.url) record.currentUrl = state.activeTab.url;
  if (!record.profileMode && state?.profileMode) record.profileMode = state.profileMode;
  return record;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
