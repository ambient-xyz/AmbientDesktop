import { describe, expect, it } from "vitest";

import {
  ambientCliLazySkillsEnabled,
  resolveAmbientCliSkillMount,
} from "./agentRuntimeAmbientCliSkillMount";

describe("Ambient CLI skill mount policy", () => {
  it("excludes Ambient CLI skill paths by default", () => {
    expect(ambientCliLazySkillsEnabled({})).toBe(true);
    expect(resolveAmbientCliSkillMount({
      cliSkillPaths: ["/workspace/.ambient/cli-packages/imported/json/skills/json-cli"],
      installedCliPackageCount: 1,
      lazyModeEnabled: true,
    })).toEqual({
      lazyModeEnabled: true,
      installedCliPackageCount: 1,
      eagerCliSkillCount: 1,
      mountedCliSkillCount: 0,
      mountedCliSkillPaths: [],
    });
  });

  it("keeps the temporary eager mounting escape hatch", () => {
    expect(ambientCliLazySkillsEnabled({ AMBIENT_CLI_EAGER_SKILLS: "1" })).toBe(false);
    expect(resolveAmbientCliSkillMount({
      cliSkillPaths: ["/workspace/.ambient/cli-packages/imported/json/skills/json-cli"],
      installedCliPackageCount: 2,
      lazyModeEnabled: false,
    })).toEqual({
      lazyModeEnabled: false,
      installedCliPackageCount: 2,
      eagerCliSkillCount: 1,
      mountedCliSkillCount: 1,
      mountedCliSkillPaths: ["/workspace/.ambient/cli-packages/imported/json/skills/json-cli"],
    });
  });
});
