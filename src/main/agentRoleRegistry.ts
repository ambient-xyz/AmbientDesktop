import type { AmbientModelRuntimeProfile } from "../shared/ambientModels";
import {
  DEFAULT_SUBAGENT_ROLE_PROFILES,
  type SubagentRoleId,
  type SubagentRoleProfile,
} from "../shared/subagentRoles";
import {
  SUBAGENT_TOOL_CATEGORIES,
  type SubagentToolCategoryId,
} from "../shared/subagentToolScope";
import type { SubagentForkMode } from "../shared/subagentProtocol";
import { subagentModelBlockingReasons } from "./modelScopeResolver";

export interface AgentRoleRegistryValidationIssue {
  roleId?: string;
  field: string;
  message: string;
}

export interface AgentRoleLaunchResolution {
  schemaVersion: "ambient-agent-role-launch-resolution-v1";
  requestedRoleId: string;
  roleId: SubagentRoleId;
  profile: SubagentRoleProfile;
  displayNickname: string;
  modelBlockingReasons: string[];
}

export interface AgentRoleRegistry {
  schemaVersion: "ambient-agent-role-registry-v1";
  roleIds(): readonly SubagentRoleId[];
  listRoleProfiles(): readonly SubagentRoleProfile[];
  getRoleProfile(roleId: string): SubagentRoleProfile;
  nicknameForRole(roleId: string): string;
  resolveRoleForLaunch(input?: {
    roleId?: string;
    model?: AmbientModelRuntimeProfile;
    forkMode?: SubagentForkMode;
  }): AgentRoleLaunchResolution;
  validate(): AgentRoleRegistryValidationIssue[];
}

export function createDefaultAgentRoleRegistry(): AgentRoleRegistry {
  return createAgentRoleRegistry(DEFAULT_SUBAGENT_ROLE_PROFILES);
}

export function createAgentRoleRegistry(
  profiles: readonly SubagentRoleProfile[],
): AgentRoleRegistry {
  const frozenProfiles = profiles.map((profile) => ({ ...profile, nicknameCandidates: [...profile.nicknameCandidates] }));
  const byId = new Map(frozenProfiles.map((profile) => [profile.id, profile]));
  const validationIssues = validateAgentRoleProfiles(frozenProfiles);
  if (validationIssues.length > 0) {
    throw new Error(`Invalid sub-agent role registry: ${validationIssues.map((issue) => issue.message).join(" ")}`);
  }

  return {
    schemaVersion: "ambient-agent-role-registry-v1",
    roleIds: () => frozenProfiles.map((profile) => profile.id),
    listRoleProfiles: () => frozenProfiles.map((profile) => ({ ...profile, nicknameCandidates: [...profile.nicknameCandidates] })),
    getRoleProfile: (roleId) => {
      const profile = byId.get(roleId as SubagentRoleId);
      if (!profile) throw new Error(`Unknown sub-agent role: ${roleId}`);
      return { ...profile, nicknameCandidates: [...profile.nicknameCandidates] };
    },
    nicknameForRole: (roleId) => {
      const profile = byId.get(roleId as SubagentRoleId);
      if (!profile) throw new Error(`Unknown sub-agent role: ${roleId}`);
      return firstNickname(profile);
    },
    resolveRoleForLaunch: (input = {}) => {
      const requestedRoleId = input.roleId?.trim() || "explorer";
      const profile = byId.get(requestedRoleId as SubagentRoleId);
      if (!profile) throw new Error(`Unknown sub-agent role: ${requestedRoleId}`);
      if (input.forkMode && !profile.allowedForkModes.includes(input.forkMode)) {
        throw new Error(`Sub-agent role ${profile.id} does not allow fork mode ${input.forkMode}.`);
      }
      return {
        schemaVersion: "ambient-agent-role-launch-resolution-v1",
        requestedRoleId,
        roleId: profile.id,
        profile: { ...profile, nicknameCandidates: [...profile.nicknameCandidates] },
        displayNickname: firstNickname(profile),
        modelBlockingReasons: input.model ? subagentModelBlockingReasons(input.model) : [],
      };
    },
    validate: () => validateAgentRoleProfiles(frozenProfiles),
  };
}

export function validateAgentRoleProfiles(
  profiles: readonly SubagentRoleProfile[],
): AgentRoleRegistryValidationIssue[] {
  const issues: AgentRoleRegistryValidationIssue[] = [];
  const seenIds = new Set<string>();
  const seenNicknames = new Map<string, string>();
  const categoryIds = new Set(SUBAGENT_TOOL_CATEGORIES.map((category) => category.id));
  const schedulingPolicies = new Set(["live_parent_only", "automation_deferred"]);

  for (const profile of profiles) {
    if (profile.schemaVersion !== "ambient-subagent-role-profile-v1") {
      issues.push(issue(profile.id, "schemaVersion", `Role ${profile.id} has unsupported schema version ${profile.schemaVersion}.`));
    }
    if (seenIds.has(profile.id)) {
      issues.push(issue(profile.id, "id", `Duplicate sub-agent role id: ${profile.id}.`));
    }
    seenIds.add(profile.id);
    if (!profile.label.trim()) issues.push(issue(profile.id, "label", `Role ${profile.id} must have a label.`));
    if (!profile.defaultModelId.trim()) issues.push(issue(profile.id, "defaultModelId", `Role ${profile.id} must have a default model.`));
    if (!schedulingPolicies.has(profile.schedulingPolicy)) {
      issues.push(issue(profile.id, "schedulingPolicy", `Role ${profile.id} has unsupported scheduling policy ${profile.schedulingPolicy}.`));
    }
    if (!profile.allowedForkModes.includes(profile.defaultForkMode)) {
      issues.push(issue(profile.id, "defaultForkMode", `Role ${profile.id} default fork mode must be allowed by the role.`));
    }
    for (const categoryId of [...profile.allowedToolCategories, ...profile.deniedToolCategories]) {
      if (!categoryIds.has(categoryId as SubagentToolCategoryId)) {
        issues.push(issue(profile.id, "toolCategories", `Role ${profile.id} references unknown tool category ${categoryId}.`));
      }
    }
    for (const nickname of profile.nicknameCandidates) {
      const normalized = normalizeNickname(nickname);
      if (!normalized) {
        issues.push(issue(profile.id, "nicknameCandidates", `Role ${profile.id} has an empty nickname candidate.`));
        continue;
      }
      const owner = seenNicknames.get(normalized);
      if (owner && owner !== profile.id) {
        issues.push(issue(profile.id, "nicknameCandidates", `Nickname ${nickname} is shared by roles ${owner} and ${profile.id}.`));
      }
      seenNicknames.set(normalized, profile.id);
    }
  }

  return issues;
}

function issue(roleId: string | undefined, field: string, message: string): AgentRoleRegistryValidationIssue {
  return { roleId, field, message };
}

function firstNickname(profile: SubagentRoleProfile): string {
  return profile.nicknameCandidates.map((nickname) => nickname.trim()).find(Boolean) ?? profile.label;
}

function normalizeNickname(nickname: string): string {
  return nickname.trim().toLowerCase();
}
