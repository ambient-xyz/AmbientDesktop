import { describe, expect, it } from "vitest";

import {
  ambientCapabilityBuilderApplyRepairInput,
  ambientCapabilityBuilderHistoryInput,
  ambientCapabilityBuilderInstallDepsInput,
  ambientCapabilityBuilderPreviewInput,
  ambientCapabilityBuilderReadFileInput,
  ambientCapabilityBuilderScaffoldInput,
  ambientCapabilityBuilderUnregisterInput,
  ambientCapabilityBuilderValidateInput,
  ambientCapabilityBuilderWriteFileInput,
  suggestedCapabilityPackageName,
} from "./agentRuntimeCapabilityBuilderInput";

describe("AgentRuntime capability builder input helpers", () => {
  it("parses scaffold provider defaults outside AgentRuntime", () => {
    expect(ambientCapabilityBuilderScaffoldInput({
      goal: "Set up Brave Search as a provider.",
      provider: "Brave Search",
      kind: "connector/API",
    })).toMatchObject({
      name: "Brave Search",
      installerShape: "search-provider",
      locality: "network",
      responseFormats: ["JSON"],
      envNames: ["BRAVE_API_KEY"],
      networkHosts: ["api.search.brave.com"],
    });
  });

  it("keeps preview-like package selectors and exact file content intact", () => {
    expect(ambientCapabilityBuilderPreviewInput({ packageName: "ambient-demo" })).toEqual({ packageName: "ambient-demo" });
    expect(ambientCapabilityBuilderReadFileInput({
      path: ".ambient/capability-builder/packages/ambient-demo",
      filePath: "scripts/run.js",
      maxChars: 42,
    })).toEqual({
      path: ".ambient/capability-builder/packages/ambient-demo",
      filePath: "scripts/run.js",
      maxChars: 42,
    });
    expect(ambientCapabilityBuilderWriteFileInput({
      packageName: "ambient-demo",
      filePath: "SKILL.md",
      content: "Use exact text: don't normalize.",
      reason: "Update guidance",
    })).toEqual({
      packageName: "ambient-demo",
      filePath: "SKILL.md",
      content: "Use exact text: don't normalize.",
      reason: "Update guidance",
    });
  });

  it("parses mutation helper inputs with the same guardrails", () => {
    expect(ambientCapabilityBuilderApplyRepairInput({
      packageName: "ambient-demo",
      reason: "Apply approved repair",
      files: [{ path: "scripts/run.js", content: "console.log('ok');", rationale: "Fix wrapper" }],
    })).toEqual({
      packageName: "ambient-demo",
      reason: "Apply approved repair",
      files: [{ path: "scripts/run.js", content: "console.log('ok');", rationale: "Fix wrapper" }],
    });
    expect(ambientCapabilityBuilderInstallDepsInput({
      sourcePath: ".ambient/capability-builder/packages/ambient-demo",
      commands: [{ command: "pnpm", args: ["install"], cwd: ".", rationale: "Install locked deps" }],
    })).toEqual({
      sourcePath: ".ambient/capability-builder/packages/ambient-demo",
      commands: [{ command: "pnpm", args: ["install"], cwd: ".", rationale: "Install locked deps" }],
    });
    expect(() => ambientCapabilityBuilderUnregisterInput({
      packageName: "ambient-demo",
      preserveBuilderSource: false,
    })).toThrow("preserveBuilderSource=false is not supported");
  });

  it("parses read-only history and validate inputs", () => {
    expect(ambientCapabilityBuilderHistoryInput({
      packageName: "ambient-demo",
      includeRegistered: true,
      includeDrafts: false,
    })).toEqual({
      packageName: "ambient-demo",
      includeRegistered: true,
      includeDrafts: false,
    });
    expect(ambientCapabilityBuilderValidateInput({
      packageName: "ambient-demo",
      includeSmokeTests: false,
    })).toEqual({
      packageName: "ambient-demo",
      includeSmokeTests: false,
    });
    expect(suggestedCapabilityPackageName("Search the web", "Brave Search")).toBe("ambient-brave-search-search-the-web");
  });
});
