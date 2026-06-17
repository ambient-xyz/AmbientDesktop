import { estimateTokensFromText } from "../contextAccounting";
import type { WorkflowCompilerPromptRule } from "./workflowCompilerPromptInventory";

export type WorkflowCompilerPromptModuleLayer =
  | "core"
  | "runtime"
  | "capability"
  | "policy"
  | "recipe"
  | "validator"
  | "connector"
  | "ambient_cli"
  | "dynamic_context";

export type WorkflowCompilerPromptModuleScope = "stable_prefix" | "mutable_suffix";

export interface WorkflowCompilerPromptModule {
  id: string;
  version: string;
  layer: WorkflowCompilerPromptModuleLayer;
  scope: WorkflowCompilerPromptModuleScope;
  reason: string;
  content: string;
  ruleIds?: string[];
  selectedRecipeIds?: string[];
  selectedToolNames?: string[];
  selectedConnectorIds?: string[];
}

export interface WorkflowCompilerPromptModuleSummary {
  id: string;
  version: string;
  layer: WorkflowCompilerPromptModuleLayer;
  scope: WorkflowCompilerPromptModuleScope;
  reason: string;
  chars: number;
  estimatedTokens: number;
  ruleIds?: string[];
  selectedRecipeIds?: string[];
  selectedToolNames?: string[];
  selectedConnectorIds?: string[];
}

export interface WorkflowCompilerPromptAssemblyRecord {
  schemaVersion: 1;
  modules: WorkflowCompilerPromptModuleSummary[];
  stablePrefix: {
    moduleCount: number;
    chars: number;
    estimatedTokens: number;
  };
  mutableSuffix: {
    moduleCount: number;
    chars: number;
    estimatedTokens: number;
  };
  total: {
    moduleCount: number;
    chars: number;
    estimatedTokens: number;
  };
}

export function workflowCompilerPromptModule(input: {
  id: string;
  version?: string;
  layer: WorkflowCompilerPromptModuleLayer;
  scope: WorkflowCompilerPromptModuleScope;
  reason: string;
  content: string | string[];
  ruleIds?: string[];
  selectedRecipeIds?: string[];
  selectedToolNames?: string[];
  selectedConnectorIds?: string[];
}): WorkflowCompilerPromptModule {
  return {
    id: input.id,
    version: input.version ?? "1",
    layer: input.layer,
    scope: input.scope,
    reason: input.reason,
    content: Array.isArray(input.content) ? input.content.join("\n") : input.content,
    ruleIds: input.ruleIds,
    selectedRecipeIds: input.selectedRecipeIds,
    selectedToolNames: input.selectedToolNames,
    selectedConnectorIds: input.selectedConnectorIds,
  };
}

export function workflowCompilerPolicyPromptModule(rule: WorkflowCompilerPromptRule): WorkflowCompilerPromptModule {
  return workflowCompilerPromptModule({
    id: `policy-${rule.id}`,
    layer: promptRuleOwnerToModuleLayer(rule.owner),
    scope: "stable_prefix",
    reason: rule.summary,
    content: rule.text,
    ruleIds: [rule.id],
  });
}

export function assembleWorkflowCompilerPromptModules(input: {
  stableModules: WorkflowCompilerPromptModule[];
  mutableModules: WorkflowCompilerPromptModule[];
}): {
  stablePrefix: string;
  mutableSuffix: string;
  promptAssembly: WorkflowCompilerPromptAssemblyRecord;
} {
  const modules = [...input.stableModules, ...input.mutableModules].filter((module) => module.content.trim().length > 0);
  assertUniquePromptModuleIds(modules);
  const stableModules = modules.filter((module) => module.scope === "stable_prefix");
  const mutableModules = modules.filter((module) => module.scope === "mutable_suffix");
  const stablePrefix = stableModules.map((module) => module.content).join("\n");
  const mutableSuffix = mutableModules.map((module) => module.content).join("\n");
  const stablePrefixEstimatedTokens = estimateTokensFromText(stablePrefix);
  const mutableSuffixEstimatedTokens = estimateTokensFromText(mutableSuffix);
  return {
    stablePrefix,
    mutableSuffix,
    promptAssembly: {
      schemaVersion: 1,
      modules: modules.map(promptModuleSummary),
      stablePrefix: {
        moduleCount: stableModules.length,
        chars: stablePrefix.length,
        estimatedTokens: stablePrefixEstimatedTokens,
      },
      mutableSuffix: {
        moduleCount: mutableModules.length,
        chars: mutableSuffix.length,
        estimatedTokens: mutableSuffixEstimatedTokens,
      },
      total: {
        moduleCount: modules.length,
        chars: stablePrefix.length + mutableSuffix.length,
        estimatedTokens: stablePrefixEstimatedTokens + mutableSuffixEstimatedTokens,
      },
    },
  };
}

function promptModuleSummary(module: WorkflowCompilerPromptModule): WorkflowCompilerPromptModuleSummary {
  return {
    id: module.id,
    version: module.version,
    layer: module.layer,
    scope: module.scope,
    reason: module.reason,
    chars: module.content.length,
    estimatedTokens: estimateTokensFromText(module.content),
    ...(module.ruleIds?.length ? { ruleIds: module.ruleIds } : {}),
    ...(module.selectedRecipeIds?.length ? { selectedRecipeIds: module.selectedRecipeIds } : {}),
    ...(module.selectedToolNames?.length ? { selectedToolNames: module.selectedToolNames } : {}),
    ...(module.selectedConnectorIds?.length ? { selectedConnectorIds: module.selectedConnectorIds } : {}),
  };
}

function promptRuleOwnerToModuleLayer(owner: WorkflowCompilerPromptRule["owner"]): WorkflowCompilerPromptModuleLayer {
  return owner === "retire" ? "policy" : owner;
}

function assertUniquePromptModuleIds(modules: WorkflowCompilerPromptModule[]): void {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const module of modules) {
    if (seen.has(module.id)) duplicates.push(module.id);
    seen.add(module.id);
  }
  if (duplicates.length) throw new Error(`Duplicate workflow compiler prompt module ids: ${duplicates.join(", ")}`);
}
