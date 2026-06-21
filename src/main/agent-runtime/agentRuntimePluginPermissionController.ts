import type { DesktopEvent } from "../../shared/desktopTypes";
import type {
  PermissionAuditEntry,
  PermissionPromptResolution,
  PermissionRequest,
} from "../../shared/permissionTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  emitFirstPartyPluginPermissionAudit,
  resolveFirstPartyPluginPermission,
  type FirstPartyPluginPermissionAuditInput,
  type FirstPartyPluginPermissionWaitFinish,
  type FirstPartyPluginPermissionWaitStart,
  type ResolveFirstPartyPluginPermissionInput,
} from "./agentRuntimeFirstPartyPluginPermission";
import {
  revokeMcpPermissionGrantsForDescriptorDrift,
  revokePluginPermissionGrantsForLabelPrefixes,
} from "./agentRuntimePluginGrantRevocationFacade";
import { ensurePluginMcpToolTrusted, type PluginMcpToolRegistration } from "./agentRuntimePluginsFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";

export interface AgentRuntimePluginPermissionControllerOptions {
  store: ProjectStore;
  requestPermission: (
    request: Omit<PermissionRequest, "id">,
    options?: { onRequest?: (createdRequest: PermissionRequest) => void },
  ) => Promise<PermissionPromptResolution>;
  beginPermissionWait?: (
    threadId: string,
    wait: FirstPartyPluginPermissionWaitStart,
  ) => ((finish?: FirstPartyPluginPermissionWaitFinish) => void) | undefined;
  activeRunId: (threadId: string) => string | undefined;
  emit: (event: DesktopEvent) => void;
}

export interface AgentRuntimePluginMcpDescriptorDriftInput {
  serverId: string;
  workloadName: string;
  previousDescriptorHash?: string;
  descriptorHash?: string;
}

export class AgentRuntimePluginPermissionController {
  constructor(private readonly options: AgentRuntimePluginPermissionControllerOptions) {}

  revokePluginGrantsForLabels(labelPrefixes: string[]): number {
    return revokePluginPermissionGrantsForLabelPrefixes({
      labelPrefixes,
    }, {
      store: this.options.store,
    });
  }

  revokeMcpPermissionGrantsForDescriptorDrift(input: AgentRuntimePluginMcpDescriptorDriftInput): number {
    return revokeMcpPermissionGrantsForDescriptorDrift(input, {
      store: this.options.store,
      emitPermissionGrantRevoked: (grant) => this.options.emit({ type: "permission-grant-revoked", grant }),
    });
  }

  async resolveFirstPartyPluginPermission(input: ResolveFirstPartyPluginPermissionInput): Promise<boolean> {
    return resolveFirstPartyPluginPermission(input, {
      store: this.options.store,
      requestPermission: (request, options) => this.options.requestPermission(request, options),
      beginPermissionWait: (threadId, wait) => this.options.beginPermissionWait?.(threadId, wait),
      emitPermissionAudit: (audit) => this.emitPluginPermissionAudit(audit),
      emitPermissionGrantCreated: (grant) => this.options.emit({ type: "permission-grant-created", grant }),
    });
  }

  emitPluginPermissionAudit(input: Omit<FirstPartyPluginPermissionAuditInput, "runId">): PermissionAuditEntry {
    return emitFirstPartyPluginPermissionAudit(input, {
      activeRunIdForThread: (threadId) => this.options.activeRunId(threadId),
      addPermissionAudit: (audit) => this.options.store.addPermissionAudit(audit),
      emitPermissionAuditCreated: (entry) => this.options.emit({ type: "permission-audit-created", entry }),
    });
  }

  ensurePluginMcpToolTrusted(
    threadId: string,
    workspace: WorkspaceState,
    registration: PluginMcpToolRegistration,
  ): Promise<boolean> {
    return ensurePluginMcpToolTrusted({ threadId, workspace, registration }, {
      getThread: (id) => this.options.store.getThread(id),
      activeRunIdForThread: (id) => this.options.activeRunId(id),
      isPluginTrusted: (pluginId, pluginFingerprint) => this.options.store.isPluginTrusted(pluginId, pluginFingerprint),
      setPluginTrusted: (pluginId, trusted, pluginFingerprint) => {
        this.options.store.setPluginTrusted(pluginId, trusted, pluginFingerprint);
      },
      resolveFirstPartyPluginPermission: (input) => this.resolveFirstPartyPluginPermission(input),
      addPermissionAudit: (input) => this.options.store.addPermissionAudit(input),
      emitPermissionAuditCreated: (entry) => this.options.emit({ type: "permission-audit-created", entry }),
    });
  }
}
