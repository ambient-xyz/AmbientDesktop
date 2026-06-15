import { describe, expect, it, vi } from "vitest";

import type { CodexPluginSummary } from "../shared/types";
import {
  codexPluginSkillPaths,
  discoverAgentRuntimeSkillPaths,
  piSkillStateReaderFromStore,
  pluginStateReaderFromStore,
} from "./agentRuntimePluginDiscovery";

describe("agentRuntimePluginDiscovery", () => {
  it("maps Codex plugin skills to skill directories", () => {
    expect(codexPluginSkillPaths([
      pluginWithSkills([
        "/workspace/.ambient/plugins/review/skills/review/SKILL.md",
        "/workspace/.ambient/plugins/review/skills/changelog/SKILL.md",
      ]),
      pluginWithSkills(["/workspace/.ambient/plugins/notes/skills/notes/SKILL.md"]),
    ])).toEqual([
      "/workspace/.ambient/plugins/review/skills/review",
      "/workspace/.ambient/plugins/review/skills/changelog",
      "/workspace/.ambient/plugins/notes/skills/notes",
    ]);
  });

  it("builds plugin state readers from the runtime store", () => {
    const store = {
      isPluginEnabled: vi.fn((pluginId: string) => pluginId === "plugin-enabled"),
      isPluginTrusted: vi.fn((pluginId: string, fingerprint?: string) => pluginId === "plugin-trusted" && fingerprint === "fp-1"),
      isPiPackageEnabled: vi.fn((packageId: string) => packageId === "pi-enabled"),
    };

    const pluginReader = pluginStateReaderFromStore(store);
    expect(pluginReader.isPluginEnabled("plugin-enabled")).toBe(true);
    expect(pluginReader.isPluginTrusted("plugin-trusted", "fp-1")).toBe(true);

    const piReader = piSkillStateReaderFromStore(store);
    expect(piReader.isPluginEnabled("plugin-disabled")).toBe(false);
    expect(piReader.isPiPackageEnabled?.("pi-enabled")).toBe(true);
    expect(store.isPluginTrusted).toHaveBeenCalledWith("plugin-trusted", "fp-1");
  });

  it("discovers plugin, Pi package, and Ambient CLI skill paths", async () => {
    const plugin = pluginWithSkills(["/workspace/.ambient/plugins/review/skills/review/SKILL.md"]);
    const store = {
      isPluginEnabled: vi.fn((pluginId: string) => pluginId === "plugin-1"),
      isPluginTrusted: vi.fn((pluginId: string, fingerprint?: string) => pluginId === "plugin-1" && fingerprint === "fp-1"),
      isPiPackageEnabled: vi.fn((packageId: string) => packageId === "pi-package-1"),
    };
    const pluginHost = {
      enabledCodexPlugins: vi.fn(async (workspacePath, state) => {
        expect(workspacePath).toBe("/workspace");
        expect(state.isPluginEnabled("plugin-1")).toBe(true);
        expect(state.isPluginTrusted("plugin-1", "fp-1")).toBe(true);
        return [plugin];
      }),
      enabledPiSkillPaths: vi.fn(async (workspacePath, state) => {
        expect(workspacePath).toBe("/workspace");
        expect(state.isPiPackageEnabled?.("pi-package-1")).toBe(true);
        return ["/workspace/.ambient/pi-packages/review/skills/review"];
      }),
    };
    const enabledAmbientCliSkillPaths = vi.fn(async () => ["/workspace/.ambient/cli-packages/imported/json/skills/json-cli"]);

    await expect(discoverAgentRuntimeSkillPaths({
      workspacePath: "/workspace",
      pluginHost,
      store,
      enabledAmbientCliSkillPaths,
    })).resolves.toEqual({
      enabledPlugins: [plugin],
      pluginSkillPaths: ["/workspace/.ambient/plugins/review/skills/review"],
      piSkillPaths: ["/workspace/.ambient/pi-packages/review/skills/review"],
      ambientCliSkillPaths: ["/workspace/.ambient/cli-packages/imported/json/skills/json-cli"],
    });
  });

  it("keeps startup tolerant of plugin and CLI discovery failures", async () => {
    const pluginHost = {
      enabledCodexPlugins: vi.fn(async () => {
        throw new Error("codex discovery failed");
      }),
      enabledPiSkillPaths: vi.fn(async () => {
        throw new Error("pi discovery failed");
      }),
    };
    const store = {
      isPluginEnabled: vi.fn(() => true),
      isPluginTrusted: vi.fn(() => true),
      isPiPackageEnabled: vi.fn(() => true),
    };

    await expect(discoverAgentRuntimeSkillPaths({
      workspacePath: "/workspace",
      pluginHost,
      store,
      enabledAmbientCliSkillPaths: async () => {
        throw new Error("cli discovery failed");
      },
    })).resolves.toEqual({
      enabledPlugins: [],
      pluginSkillPaths: [],
      piSkillPaths: [],
      ambientCliSkillPaths: [],
    });
  });
});

function pluginWithSkills(paths: string[]): CodexPluginSummary {
  return {
    skills: paths.map((path) => ({ path })),
  } as CodexPluginSummary;
}
