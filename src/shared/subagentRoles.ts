import { AMBIENT_DEFAULT_MODEL } from "./ambientModels";
import type { SubagentForkMode, SubagentPromptMode } from "./subagentProtocol";

export type SubagentRoleId = "explorer" | "drafter" | "reviewer" | "summarizer" | "worker";

export type SubagentMemoryPolicy = "none" | "run_snapshot_only" | "explicit_persistent";

export type SubagentMutationPolicy = "read_only" | "requires_isolated_worktree" | "forbidden";

export type SubagentSchedulingPolicy = "live_parent_only" | "automation_deferred";

export interface SubagentGuardPolicy {
  maxTurns: number;
  maxRuntimeMs: number;
  allowPartialResult: boolean;
  structuredOutputRequired: boolean;
  implementationEvidenceRequired: boolean;
}

export interface SubagentRoleProfile {
  schemaVersion: "ambient-subagent-role-profile-v1";
  id: SubagentRoleId;
  label: string;
  description: string;
  developerInstructions: string;
  promptMode: SubagentPromptMode;
  inheritParentTurns: boolean;
  inheritProjectContext: boolean;
  inheritSkills: boolean;
  nicknameCandidates: string[];
  defaultModelId: string;
  allowedForkModes: SubagentForkMode[];
  defaultForkMode: SubagentForkMode;
  allowedToolCategories: string[];
  defaultToolCategories?: string[];
  deniedToolCategories: string[];
  nestedFanout: "disabled" | "role_gated";
  mutationPolicy: SubagentMutationPolicy;
  memoryPolicy: SubagentMemoryPolicy;
  schedulingPolicy: SubagentSchedulingPolicy;
  guardPolicy: SubagentGuardPolicy;
  retentionDefault: "transient" | "keep_until_parent_pruned" | "pinned";
}

export const DEFAULT_SUBAGENT_ROLE_PROFILES: SubagentRoleProfile[] = [
  {
    schemaVersion: "ambient-subagent-role-profile-v1",
    id: "explorer",
    label: "Explorer",
    description: "Researches and maps unfamiliar context without modifying the workspace.",
    developerInstructions: "Gather relevant evidence, keep provenance, and return a compact result artifact.",
    promptMode: "append",
    inheritParentTurns: true,
    inheritProjectContext: true,
    inheritSkills: true,
    nicknameCandidates: ["Explorer", "Scout", "Research"],
    defaultModelId: AMBIENT_DEFAULT_MODEL,
    allowedForkModes: ["full_history", "recent_turns"],
    defaultForkMode: "recent_turns",
    allowedToolCategories: ["workspace.read", "browser.read", "artifact.read", "long-context.read", "connector.read"],
    defaultToolCategories: ["workspace.read", "artifact.read", "long-context.read", "connector.read"],
    deniedToolCategories: ["workspace.write", "secrets.read", "workflow.call", "subagent.spawn"],
    nestedFanout: "disabled",
    mutationPolicy: "read_only",
    memoryPolicy: "run_snapshot_only",
    schedulingPolicy: "live_parent_only",
    guardPolicy: {
      maxTurns: 8,
      maxRuntimeMs: 10 * 60_000,
      allowPartialResult: true,
      structuredOutputRequired: true,
      implementationEvidenceRequired: false,
    },
    retentionDefault: "keep_until_parent_pruned",
  },
  {
    schemaVersion: "ambient-subagent-role-profile-v1",
    id: "drafter",
    label: "Drafter",
    description: "Produces bounded copy, proposals, plans, or other non-mutating content for parent review.",
    developerInstructions: "Draft the requested content, preserve constraints, and return acceptance notes without modifying the workspace.",
    promptMode: "replace",
    inheritParentTurns: false,
    inheritProjectContext: true,
    inheritSkills: false,
    nicknameCandidates: ["Drafter", "Writer", "Composer"],
    defaultModelId: AMBIENT_DEFAULT_MODEL,
    allowedForkModes: ["recent_turns", "no_history"],
    defaultForkMode: "no_history",
    allowedToolCategories: ["workspace.read", "artifact.read", "long-context.read"],
    deniedToolCategories: ["workspace.write", "browser.interactive", "secrets.read", "workflow.call", "subagent.spawn"],
    nestedFanout: "disabled",
    mutationPolicy: "read_only",
    memoryPolicy: "run_snapshot_only",
    schedulingPolicy: "live_parent_only",
    guardPolicy: {
      maxTurns: 6,
      maxRuntimeMs: 8 * 60_000,
      allowPartialResult: false,
      structuredOutputRequired: true,
      implementationEvidenceRequired: false,
    },
    retentionDefault: "keep_until_parent_pruned",
  },
  {
    schemaVersion: "ambient-subagent-role-profile-v1",
    id: "reviewer",
    label: "Reviewer",
    description: "Checks a bounded artifact, diff, plan, or result and reports risks first.",
    developerInstructions: "Prioritize correctness issues, missing evidence, and unsafe assumptions.",
    promptMode: "replace",
    inheritParentTurns: false,
    inheritProjectContext: true,
    inheritSkills: false,
    nicknameCandidates: ["Reviewer", "Critic", "Audit"],
    defaultModelId: AMBIENT_DEFAULT_MODEL,
    allowedForkModes: ["recent_turns", "no_history"],
    defaultForkMode: "no_history",
    allowedToolCategories: ["workspace.read", "artifact.read", "test.run", "connector.read"],
    deniedToolCategories: ["workspace.write", "browser.interactive", "secrets.read", "workflow.call", "subagent.spawn"],
    nestedFanout: "disabled",
    mutationPolicy: "read_only",
    memoryPolicy: "run_snapshot_only",
    schedulingPolicy: "live_parent_only",
    guardPolicy: {
      maxTurns: 6,
      maxRuntimeMs: 8 * 60_000,
      allowPartialResult: false,
      structuredOutputRequired: true,
      implementationEvidenceRequired: false,
    },
    retentionDefault: "keep_until_parent_pruned",
  },
  {
    schemaVersion: "ambient-subagent-role-profile-v1",
    id: "summarizer",
    label: "Summarizer",
    description: "Condenses long transcripts, tool outputs, or artifacts into bounded summaries.",
    developerInstructions: "Preserve decisions, unresolved questions, exact artifact handles, and stated uncertainty.",
    promptMode: "fresh",
    inheritParentTurns: false,
    inheritProjectContext: false,
    inheritSkills: false,
    nicknameCandidates: ["Summary", "Digest", "Notes"],
    defaultModelId: AMBIENT_DEFAULT_MODEL,
    allowedForkModes: ["no_history"],
    defaultForkMode: "no_history",
    allowedToolCategories: ["artifact.read", "long-context.read"],
    deniedToolCategories: ["workspace.write", "browser.interactive", "secrets.read", "workflow.call", "subagent.spawn"],
    nestedFanout: "disabled",
    mutationPolicy: "forbidden",
    memoryPolicy: "none",
    schedulingPolicy: "live_parent_only",
    guardPolicy: {
      maxTurns: 4,
      maxRuntimeMs: 5 * 60_000,
      allowPartialResult: true,
      structuredOutputRequired: true,
      implementationEvidenceRequired: false,
    },
    retentionDefault: "transient",
  },
  {
    schemaVersion: "ambient-subagent-role-profile-v1",
    id: "worker",
    label: "Worker",
    description: "Implements scoped changes only after later phases add worktree isolation.",
    developerInstructions: "Do not mutate the parent workspace without an isolated worktree and approval evidence.",
    promptMode: "append",
    inheritParentTurns: true,
    inheritProjectContext: true,
    inheritSkills: true,
    nicknameCandidates: ["Worker", "Builder", "Implementer"],
    defaultModelId: AMBIENT_DEFAULT_MODEL,
    allowedForkModes: ["full_history", "recent_turns"],
    defaultForkMode: "recent_turns",
    allowedToolCategories: ["workspace.read", "workspace.write", "test.run", "artifact.write"],
    deniedToolCategories: ["secrets.read", "workflow.call", "subagent.spawn"],
    nestedFanout: "disabled",
    mutationPolicy: "requires_isolated_worktree",
    memoryPolicy: "run_snapshot_only",
    schedulingPolicy: "live_parent_only",
    guardPolicy: {
      maxTurns: 12,
      maxRuntimeMs: 20 * 60_000,
      allowPartialResult: false,
      structuredOutputRequired: true,
      implementationEvidenceRequired: true,
    },
    retentionDefault: "keep_until_parent_pruned",
  },
];

export function getDefaultSubagentRoleProfile(roleId: SubagentRoleId): SubagentRoleProfile {
  const profile = DEFAULT_SUBAGENT_ROLE_PROFILES.find((candidate) => candidate.id === roleId);
  if (!profile) throw new Error(`Unknown sub-agent role: ${roleId}`);
  return profile;
}
