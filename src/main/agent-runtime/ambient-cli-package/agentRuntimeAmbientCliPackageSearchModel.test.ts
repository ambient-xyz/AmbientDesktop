import { describe, expect, it } from "vitest";

import { ambientCliSearchDetails, ambientCliSearchInput, ambientCliSearchText } from "./agentRuntimeAmbientCliPackageSearchModel";

describe("agentRuntimeAmbientCliPackageSearchModel", () => {
  it("parses Ambient CLI search params", () => {
    expect(ambientCliSearchInput({
      query: "voice",
      limit: 5,
      includeUnavailable: true,
      kind: "command",
      packageName: "ambient-demo",
      command: "speak",
    })).toEqual({
      query: "voice",
      limit: 5,
      includeUnavailable: true,
      kind: "command",
      packageName: "ambient-demo",
      command: "speak",
    });
  });

  it("omits blank, false, and non-finite optional fields", () => {
    expect(ambientCliSearchInput({
      query: "",
      limit: Number.NaN,
      includeUnavailable: false,
      packageName: " ",
      command: 42,
    })).toEqual({});
  });

  it("rejects unsupported search kinds", () => {
    expect(() => ambientCliSearchInput({ kind: "provider" })).toThrow("Unsupported Ambient CLI search kind: provider");
  });

  it("builds Ambient CLI search result details", () => {
    expect(ambientCliSearchDetails({
      searchInput: { query: "voice" },
      result: searchResponseFixture(),
    })).toEqual({
      runtime: "ambient-cli",
      toolName: "ambient_cli_search",
      query: "voice",
      resultCount: 1,
      truncated: false,
      packageIds: ["pkg-123"],
      catalogVersion: "catalog-v1",
    });
  });

  it("formats Ambient CLI search text", () => {
    expect(ambientCliSearchText(searchResponseFixture())).toBe([
      "Ambient CLI capability search",
      "Catalog: catalog-v1",
      "Results: 1",
      "Package: ambient-demo",
      "Package id: pkg-123",
      "Registry plugin id: registry-plugin",
      "Description: Demo package.",
      "Availability: available - ready",
      "Commands: speak [pkg-123:command:speak] (health not run; Speak text.)",
      "Skills: demo-skill [pkg-123:skill:demo] (Use demo.)",
      "Missing env: none",
      "Why matched: query matched command",
      "Next: call ambient_cli_describe with the exact packageName and command before execution. If you call ambient_cli first, Ambient Desktop will return a no-execute preflight description; read it and retry ambient_cli only if execution is still appropriate.",
    ].join("\n"));

    expect(ambientCliSearchText({
      catalogVersion: "catalog-v1",
      truncated: false,
      results: [],
    } as any)).toBe([
      "Ambient CLI capability search",
      "Catalog: catalog-v1",
      "Results: 0",
      "No installed Ambient CLI packages matched. This search does not inspect uninstalled marketplaces.",
    ].join("\n"));
  });
});

function searchResponseFixture(): any {
  return {
    catalogVersion: "catalog-v1",
    truncated: false,
    results: [
      {
        packageId: "pkg-123",
        registryPluginId: "registry-plugin",
        packageName: "ambient-demo",
        description: "Demo package.",
        availability: "available",
        availabilityReason: "ready",
        commands: [
          {
            capabilityId: "pkg-123:command:speak",
            name: "speak",
            description: "Speak text.",
          },
        ],
        skills: [
          {
            capabilityId: "pkg-123:skill:demo",
            name: "demo-skill",
            description: "Use demo.",
          },
        ],
        missingEnv: [],
        whyMatched: ["query matched command"],
      },
    ],
  };
}
