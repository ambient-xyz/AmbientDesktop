import { describe, expect, it } from "vitest";
import { resolveAmbientModelRuntimeProfile } from "../shared/ambientModels";
import { getDefaultSubagentRoleProfile } from "../shared/subagentRoles";
import {
  createAgentRoleRegistry,
  createDefaultAgentRoleRegistry,
  validateAgentRoleProfiles,
} from "./agentRoleRegistry";

describe("agentRoleRegistry", () => {
  it("validates and lists default sub-agent role profiles", () => {
    const registry = createDefaultAgentRoleRegistry();

    expect(registry.schemaVersion).toBe("ambient-agent-role-registry-v1");
    expect(registry.roleIds()).toEqual(["explorer", "drafter", "reviewer", "summarizer", "worker"]);
    expect(registry.nicknameForRole("explorer")).toBe("Explorer");
    expect(registry.validate()).toEqual([]);
    expect(registry.resolveRoleForLaunch({ roleId: "summarizer" })).toMatchObject({
      schemaVersion: "ambient-agent-role-launch-resolution-v1",
      requestedRoleId: "summarizer",
      roleId: "summarizer",
      displayNickname: "Summary",
      profile: {
        schedulingPolicy: "live_parent_only",
      },
      modelBlockingReasons: [],
    });
  });

  it("reports invalid categories, scheduling policies, duplicate ids, and shared nicknames", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const reviewer = getDefaultSubagentRoleProfile("reviewer");

    const issues = validateAgentRoleProfiles([
      explorer,
      {
        ...explorer,
        allowedToolCategories: [...explorer.allowedToolCategories, "not-a-category"],
        schedulingPolicy: "calendar_magic" as any,
      },
      {
        ...reviewer,
        nicknameCandidates: ["Explorer"],
      },
    ]);

    expect(issues.map((issue) => issue.field)).toEqual(expect.arrayContaining([
      "id",
      "toolCategories",
      "schedulingPolicy",
      "nicknameCandidates",
    ]));
    expect(() => createAgentRoleRegistry([
      explorer,
      {
        ...reviewer,
        nicknameCandidates: ["Explorer"],
      },
    ])).toThrow(/Invalid sub-agent role registry/);
  });

  it("enforces role fork modes and preserves model eligibility feedback", () => {
    const registry = createDefaultAgentRoleRegistry();

    expect(() => registry.resolveRoleForLaunch({
      roleId: "summarizer",
      forkMode: "full_history",
    })).toThrow(/does not allow fork mode/);
    expect(registry.resolveRoleForLaunch({
      roleId: "explorer",
      model: resolveAmbientModelRuntimeProfile("custom/unregistered-model"),
    })).toMatchObject({
      roleId: "explorer",
      modelBlockingReasons: [
        "Model is not registered in this Ambient Desktop build.",
        "Model custom/unregistered-model is not selectable for sub-agent delegation.",
        "Model custom/unregistered-model does not support required sub-agent streaming.",
      ],
    });
  });

  it("rejects unknown launch roles through the registry boundary", () => {
    const registry = createDefaultAgentRoleRegistry();

    expect(() => registry.getRoleProfile("missing")).toThrow(/Unknown sub-agent role/);
    expect(() => registry.resolveRoleForLaunch({ roleId: "missing" })).toThrow(/Unknown sub-agent role/);
  });
});
