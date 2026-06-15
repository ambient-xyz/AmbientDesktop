import type { ExtensionAPI, ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { ThreadSummary, WorkspaceState } from "../shared/types";
import {
  registerPrivilegedActionRequestTools,
  type PrivilegedActionRequestToolPermissionRequest,
  type PrivilegedActionRequestToolRegistrationOptions,
} from "./agentRuntimePrivilegedActionRequestTools";
import {
  registerPrivilegedActionStatusTools,
} from "./agentRuntimePrivilegedActionStatusTools";
import type { PrivilegedActionAdapter } from "./privilegedActionAdapter";

export interface AgentRuntimePrivilegedActionToolOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  privilegedActionAdapter: () => PrivilegedActionAdapter;
  resolveFirstPartyPluginPermission: (
    input: PrivilegedActionRequestToolPermissionRequest,
  ) => Promise<boolean>;
  requestPrivilegedCredential?: PrivilegedActionRequestToolRegistrationOptions["requestPrivilegedCredential"];
  writePrivilegedActionRedactedLog?: PrivilegedActionRequestToolRegistrationOptions["writePrivilegedActionRedactedLog"];
  runCapabilityBuilderValidationWithPermission?: PrivilegedActionRequestToolRegistrationOptions["runCapabilityBuilderValidationWithPermission"];
}

export function createPrivilegedActionToolsExtension(
  options: AgentRuntimePrivilegedActionToolOptions,
): ExtensionFactory {
  return (pi) => registerAgentRuntimePrivilegedActionTools(pi, options);
}

export function registerAgentRuntimePrivilegedActionTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AgentRuntimePrivilegedActionToolOptions,
): void {
  registerPrivilegedActionStatusTools(pi, {
    adapterStatus: () => options.privilegedActionAdapter().status(),
  });

  registerPrivilegedActionRequestTools(pi, {
    threadId: options.threadId,
    workspace: options.workspace,
    getThread: options.getThread,
    privilegedActionAdapter: options.privilegedActionAdapter,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
    requestPrivilegedCredential: options.requestPrivilegedCredential,
    writePrivilegedActionRedactedLog: options.writePrivilegedActionRedactedLog,
    runCapabilityBuilderValidationWithPermission: options.runCapabilityBuilderValidationWithPermission,
  });
}
