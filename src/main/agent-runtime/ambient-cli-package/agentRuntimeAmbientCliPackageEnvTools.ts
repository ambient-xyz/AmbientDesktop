import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { PermissionGrantScopeKind, PermissionRisk } from "../../../shared/permissionTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import {
  discoverAmbientCliPackages,
  setAmbientCliPackageEnvBinding,
  type AmbientCliPackageCatalog,
  type AmbientCliPackageEnvBindingInput,
  type AmbientCliPackageEnvStatus,
} from "../agentRuntimeAmbientCliFacade";
import {
  ambientCliEnvBindApprovalDetail,
  ambientCliEnvBindGrantIdentity,
  ambientCliEnvBindInput,
  ambientCliEnvBindingSavedText,
  ambientCliSecretRequestInput,
  ambientCliSecretRequestText,
} from "./agentRuntimeAmbientCliPackageEnvModel";
import { selectAmbientCliPackageForRuntime } from "./agentRuntimeAmbientCliPackageSelection";
import { pluginInstallToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface AmbientCliPackageEnvPermissionRequest {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  toolName: string;
  title: string;
  message: string;
  detail: string;
  risk?: PermissionRisk;
  reusableScopes?: PermissionGrantScopeKind[];
  grantTargetLabel: string;
  grantTargetIdentity?: string;
  grantConditions?: Record<string, unknown>;
  requireFreshPrompt?: boolean;
  allowedReason: string;
  deniedReason: string;
}

export interface AmbientCliPackageEnvBindToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  discoverAmbientCliPackages?: (workspacePath: string) => Promise<AmbientCliPackageCatalog> | AmbientCliPackageCatalog;
  setAmbientCliPackageEnvBinding?: (
    workspacePath: string,
    input: AmbientCliPackageEnvBindingInput,
  ) => Promise<AmbientCliPackageEnvStatus> | AmbientCliPackageEnvStatus;
  resolveFirstPartyPluginPermission: (input: AmbientCliPackageEnvPermissionRequest) => Promise<boolean> | boolean;
}

export interface AmbientCliSecretRequestEvent {
  packageId: string;
  packageName: string;
  envName: string;
}

export interface AmbientCliPackageSecretRequestToolRegistrationOptions {
  workspace: WorkspaceState;
  discoverAmbientCliPackages?: (workspacePath: string) => Promise<AmbientCliPackageCatalog> | AmbientCliPackageCatalog;
  emitAmbientCliSecretRequested: (event: AmbientCliSecretRequestEvent) => void;
}

export function registerAmbientCliPackageEnvBindTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AmbientCliPackageEnvBindToolRegistrationOptions,
): void {
  const { workspace } = options;
  const discoverPackages = options.discoverAmbientCliPackages ?? discoverAmbientCliPackages;
  const bindEnv = options.setAmbientCliPackageEnvBinding ?? setAmbientCliPackageEnvBinding;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_cli_env_bind"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      const input = ambientCliEnvBindInput(params as Record<string, unknown>);
      const catalog = await discoverPackages(workspace.path);
      const pkg = selectAmbientCliPackageForRuntime(catalog.packages, input);
      const requirement = pkg.envRequirements.find((item) => item.name === input.envName);
      if (!requirement) throw new Error(`Ambient CLI package "${pkg.name}" does not declare env requirement "${input.envName}".`);
      const detail = ambientCliEnvBindApprovalDetail({ workspace, pkg, envName: input.envName, filePath: input.filePath });
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace,
        toolName: "ambient_cli_env_bind",
        title: `Bind Ambient CLI secret "${pkg.name}:${input.envName}"?`,
        message: "Ambient wants to bind a workspace-local secret file to an installed CLI package env requirement.",
        detail,
        grantTargetLabel: `Bind Ambient CLI secret ${pkg.name}:${input.envName}`,
        grantTargetIdentity: ambientCliEnvBindGrantIdentity({ pkg, envName: input.envName, filePath: input.filePath }),
        allowedReason: "Ambient CLI env binding approved by Ambient permission grant policy.",
        deniedReason: "Ambient CLI env binding prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Ambient CLI env binding blocked by approval prompt.");
      onUpdate?.({
        content: [{ type: "text", text: `Binding Ambient CLI env "${pkg.name}:${input.envName}" to a workspace-local secret file.` }],
        details: { runtime: "ambient-cli", toolName: "ambient_cli_env_bind", packageId: pkg.id, packageName: pkg.name, envName: input.envName, filePath: input.filePath, status: "binding" },
      });
      const status = await bindEnv(workspace.path, { packageName: pkg.name, envName: input.envName, filePath: input.filePath });
      return {
        content: [{ type: "text" as const, text: ambientCliEnvBindingSavedText({ pkg, status }) }],
        details: {
          runtime: "ambient-cli",
          toolName: "ambient_cli_env_bind",
          packageId: pkg.id,
          packageName: pkg.name,
          envName: status.name,
          source: status.source,
          filePath: status.filePath,
          configured: status.configured,
        },
      };
    },
  });
}

export function registerAmbientCliPackageSecretRequestTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AmbientCliPackageSecretRequestToolRegistrationOptions,
): void {
  const { workspace } = options;
  const discoverPackages = options.discoverAmbientCliPackages ?? discoverAmbientCliPackages;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_cli_secret_request"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = ambientCliSecretRequestInput(params as Record<string, unknown>);
      const catalog = await discoverPackages(workspace.path);
      const pkg = selectAmbientCliPackageForRuntime(catalog.packages, input);
      const requirement = pkg.envRequirements.find((item) => item.name === input.envName);
      if (!requirement) throw new Error(`Ambient CLI package "${pkg.name}" does not declare env requirement "${input.envName}".`);
      options.emitAmbientCliSecretRequested({ packageId: pkg.id, packageName: pkg.name, envName: input.envName });
      return {
        content: [
          {
            type: "text" as const,
            text: ambientCliSecretRequestText({ pkg, envName: input.envName }),
          },
        ],
        details: {
          runtime: "ambient-cli",
          toolName: "ambient_cli_secret_request",
          packageId: pkg.id,
          packageName: pkg.name,
          envName: input.envName,
        },
      };
    },
  });
}
