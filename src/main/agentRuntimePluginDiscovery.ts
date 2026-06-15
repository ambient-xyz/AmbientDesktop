import { dirname } from "node:path";

import type { CodexPluginSummary } from "../shared/types";
import { enabledAmbientCliSkillPaths as defaultEnabledAmbientCliSkillPaths } from "./ambientCliPackages";
import type { AmbientPluginHost, AmbientPluginStateReader } from "./plugins/pluginHost";

export interface AgentRuntimePluginDiscoveryStore {
  isPluginEnabled(pluginId: string): boolean;
  isPluginTrusted(pluginId: string, pluginFingerprint?: string): boolean;
  isPiPackageEnabled(packageId: string): boolean;
}

export interface AgentRuntimeSkillDiscoveryInput {
  workspacePath: string;
  pluginHost: Pick<AmbientPluginHost, "enabledCodexPlugins" | "enabledPiSkillPaths">;
  store: AgentRuntimePluginDiscoveryStore;
  enabledAmbientCliSkillPaths?: (workspacePath: string) => Promise<string[]>;
}

export interface AgentRuntimeSkillDiscoveryResult {
  enabledPlugins: CodexPluginSummary[];
  pluginSkillPaths: string[];
  piSkillPaths: string[];
  ambientCliSkillPaths: string[];
}

export function pluginStateReaderFromStore(
  store: Pick<AgentRuntimePluginDiscoveryStore, "isPluginEnabled" | "isPluginTrusted">,
): AmbientPluginStateReader {
  return {
    isPluginEnabled: (pluginId) => store.isPluginEnabled(pluginId),
    isPluginTrusted: (pluginId, pluginFingerprint) => store.isPluginTrusted(pluginId, pluginFingerprint),
  };
}

export function piSkillStateReaderFromStore(store: AgentRuntimePluginDiscoveryStore): AmbientPluginStateReader {
  return {
    ...pluginStateReaderFromStore(store),
    isPiPackageEnabled: (packageId) => store.isPiPackageEnabled(packageId),
  };
}

export function codexPluginSkillPaths(plugins: readonly Pick<CodexPluginSummary, "skills">[]): string[] {
  return plugins.flatMap((plugin) => plugin.skills.map((skill) => dirname(skill.path)));
}

export async function enabledCodexPluginsOrEmpty(input: {
  workspacePath: string;
  pluginHost: Pick<AmbientPluginHost, "enabledCodexPlugins">;
  store: AgentRuntimePluginDiscoveryStore;
}): Promise<CodexPluginSummary[]> {
  try {
    return await input.pluginHost.enabledCodexPlugins(input.workspacePath, pluginStateReaderFromStore(input.store));
  } catch {
    return [];
  }
}

export async function enabledPiSkillPathsOrEmpty(input: {
  workspacePath: string;
  pluginHost: Pick<AmbientPluginHost, "enabledPiSkillPaths">;
  store: AgentRuntimePluginDiscoveryStore;
}): Promise<string[]> {
  try {
    return await input.pluginHost.enabledPiSkillPaths(input.workspacePath, piSkillStateReaderFromStore(input.store));
  } catch {
    return [];
  }
}

export async function enabledAmbientCliSkillPathsOrEmpty(
  workspacePath: string,
  enabledAmbientCliSkillPaths: (workspacePath: string) => Promise<string[]> = defaultEnabledAmbientCliSkillPaths,
): Promise<string[]> {
  try {
    return await enabledAmbientCliSkillPaths(workspacePath);
  } catch {
    return [];
  }
}

export async function discoverAgentRuntimeSkillPaths(
  input: AgentRuntimeSkillDiscoveryInput,
): Promise<AgentRuntimeSkillDiscoveryResult> {
  const [enabledPlugins, piSkillPaths, ambientCliSkillPaths] = await Promise.all([
    enabledCodexPluginsOrEmpty(input),
    enabledPiSkillPathsOrEmpty(input),
    enabledAmbientCliSkillPathsOrEmpty(input.workspacePath, input.enabledAmbientCliSkillPaths),
  ]);
  return {
    enabledPlugins,
    pluginSkillPaths: codexPluginSkillPaths(enabledPlugins),
    piSkillPaths,
    ambientCliSkillPaths,
  };
}
