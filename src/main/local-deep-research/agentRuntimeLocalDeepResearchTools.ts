import type { ExtensionAPI, ExtensionFactory } from "@mariozechner/pi-coding-agent";

import {
  registerLocalDeepResearchProviderTools,
  type LocalDeepResearchProviderToolRegistrationOptions,
} from "./agentRuntimeLocalDeepResearchProviderTools";
import {
  registerLocalDeepResearchRunTools,
  type LocalDeepResearchRunToolRegistrationOptions,
} from "./agentRuntimeLocalDeepResearchRunTools";
import {
  registerLocalDeepResearchSetupTools,
  type LocalDeepResearchSetupToolRegistrationOptions,
} from "./agentRuntimeLocalDeepResearchSetupTools";

export interface AgentRuntimeLocalDeepResearchToolOptions {
  threadId: string;
  workspace: LocalDeepResearchSetupToolRegistrationOptions["workspace"];
  getThread: NonNullable<LocalDeepResearchProviderToolRegistrationOptions["getThread"]>;
  readSettings?: LocalDeepResearchProviderToolRegistrationOptions["readSettings"];
  updateSettings?: LocalDeepResearchProviderToolRegistrationOptions["updateSettings"];
  resolveFirstPartyPluginPermission?: LocalDeepResearchProviderToolRegistrationOptions["resolveFirstPartyPluginPermission"];
  readReadiness: LocalDeepResearchSetupToolRegistrationOptions["readReadiness"];
  emit: LocalDeepResearchSetupToolRegistrationOptions["emit"];
  install?: LocalDeepResearchSetupToolRegistrationOptions["install"];
  validate?: LocalDeepResearchSetupToolRegistrationOptions["validate"];
  smoke?: LocalDeepResearchSetupToolRegistrationOptions["smoke"];
  createBroker: LocalDeepResearchRunToolRegistrationOptions["createBroker"];
  run?: LocalDeepResearchRunToolRegistrationOptions["run"];
  approveResourceLimitExceed?: LocalDeepResearchSetupToolRegistrationOptions["approveResourceLimitExceed"];
}

export function createAgentRuntimeLocalDeepResearchToolExtension(
  options: AgentRuntimeLocalDeepResearchToolOptions,
): ExtensionFactory {
  return (pi) => {
    registerAgentRuntimeLocalDeepResearchTools(pi, options);
  };
}

export function registerAgentRuntimeLocalDeepResearchTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AgentRuntimeLocalDeepResearchToolOptions,
): void {
  registerLocalDeepResearchProviderTools(pi, {
    threadId: options.threadId,
    workspace: options.workspace,
    getThread: options.getThread,
    readSettings: options.readSettings,
    updateSettings: options.updateSettings,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
  });

  registerLocalDeepResearchSetupTools(pi, {
    threadId: options.threadId,
    workspace: options.workspace,
    readReadiness: options.readReadiness,
    emit: options.emit,
    install: options.install,
    validate: options.validate,
    smoke: options.smoke,
    approveResourceLimitExceed: options.approveResourceLimitExceed,
  });

  registerLocalDeepResearchRunTools(pi, {
    threadId: options.threadId,
    workspace: options.workspace,
    readReadiness: options.readReadiness,
    createBroker: options.createBroker,
    run: options.run,
    approveResourceLimitExceed: options.approveResourceLimitExceed,
  });
}
