export type AgentHarnessVariantId =
  | "baseline"
  | "bootstrap-min"
  | "bootstrap-scripts"
  | "bootstrap-tools"
  | "bootstrap-full";

export interface AgentBootstrapVariantConfig {
  maxChars: number;
  includeGitSummary: boolean;
  includePackageScripts: boolean;
  includeToolClasses: boolean;
  includeRuntimeVersions: boolean;
}

export interface AgentHarnessVariant {
  id: AgentHarnessVariantId;
  requestedId?: string;
  enabled: boolean;
  bootstrap?: AgentBootstrapVariantConfig;
  warning?: string;
}

const baselineVariant: AgentHarnessVariant = {
  id: "baseline",
  enabled: false,
};

const bootstrapVariants: Record<Exclude<AgentHarnessVariantId, "baseline">, AgentHarnessVariant> = {
  "bootstrap-min": {
    id: "bootstrap-min",
    enabled: true,
    bootstrap: {
      maxChars: 3_000,
      includeGitSummary: true,
      includePackageScripts: false,
      includeToolClasses: false,
      includeRuntimeVersions: false,
    },
  },
  "bootstrap-scripts": {
    id: "bootstrap-scripts",
    enabled: true,
    bootstrap: {
      maxChars: 4_500,
      includeGitSummary: true,
      includePackageScripts: true,
      includeToolClasses: false,
      includeRuntimeVersions: false,
    },
  },
  "bootstrap-tools": {
    id: "bootstrap-tools",
    enabled: true,
    bootstrap: {
      maxChars: 5_500,
      includeGitSummary: true,
      includePackageScripts: true,
      includeToolClasses: true,
      includeRuntimeVersions: false,
    },
  },
  "bootstrap-full": {
    id: "bootstrap-full",
    enabled: true,
    bootstrap: {
      maxChars: 6_500,
      includeGitSummary: true,
      includePackageScripts: true,
      includeToolClasses: true,
      includeRuntimeVersions: true,
    },
  },
};

const aliases: Record<string, AgentHarnessVariantId> = {
  "0": "baseline",
  "false": "baseline",
  "off": "baseline",
  "none": "baseline",
  "min": "bootstrap-min",
  "minimal": "bootstrap-min",
  "scripts": "bootstrap-scripts",
  "tools": "bootstrap-tools",
  "full": "bootstrap-full",
};

export function resolveAgentHarnessVariant(
  env: { AMBIENT_HARNESS_VARIANT?: string } = process.env,
): AgentHarnessVariant {
  const requested = (env.AMBIENT_HARNESS_VARIANT ?? "").trim().toLowerCase();
  if (!requested || requested === "baseline") return baselineVariant;
  const id = aliases[requested] ?? requested;
  if (id === "baseline") return baselineVariant;
  if (isBootstrapVariantId(id)) return bootstrapVariants[id];
  return {
    ...baselineVariant,
    requestedId: requested,
    warning: `Unknown Ambient harness variant "${requested}"; using baseline behavior.`,
  };
}

export function agentHarnessVariantForId(id: AgentHarnessVariantId): AgentHarnessVariant {
  return id === "baseline" ? baselineVariant : bootstrapVariants[id];
}

function isBootstrapVariantId(value: string): value is Exclude<AgentHarnessVariantId, "baseline"> {
  return Object.prototype.hasOwnProperty.call(bootstrapVariants, value);
}
