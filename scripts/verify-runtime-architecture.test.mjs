import { describe, expect, it } from "vitest";
import {
  evaluateRuntimeArchitecture,
  expectedRuntimeFromOptions,
  extractRuntimeArchitectureProbe,
  formatRuntimeArchitectureReport,
  normalizeArch,
  normalizePlatform,
  parseRuntimeArchitectureArgs,
} from "./verify-runtime-architecture.mjs";

describe("runtime architecture verifier", () => {
  it("parses packaged app target and expected platform options", () => {
    expect(
      parseRuntimeArchitectureArgs([
        "--app",
        "/tmp/Ambient Desktop.app",
        "--resources",
        "/tmp/Ambient Desktop.app/Contents/Resources",
        "--expected-platform",
        "macos",
        "--expected-arch",
        "aarch64",
        "--json",
      ]),
    ).toMatchObject({
      packaged: true,
      app: "/tmp/Ambient Desktop.app",
      resources: "/tmp/Ambient Desktop.app/Contents/Resources",
      expectedPlatform: "macos",
      expectedArch: "aarch64",
      json: true,
    });
  });

  it("normalizes common platform and architecture aliases", () => {
    expect(normalizePlatform("mac")).toBe("darwin");
    expect(normalizePlatform("windows")).toBe("win32");
    expect(normalizeArch("aarch64")).toBe("arm64");
    expect(normalizeArch("amd64")).toBe("x64");
    expect(normalizeArch("0")).toBe("x64");
    expect(normalizeArch("3")).toBe("arm64");
  });

  it("accepts a packaged Electron runtime that matches the expected target", () => {
    const report = evaluateRuntimeArchitecture(
      probe({ platform: "darwin", arch: "arm64", electron: "35.0.0" }),
      { platform: "darwin", arch: "arm64", packaged: true },
    );

    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
    expect(formatRuntimeArchitectureReport(report)).toContain("verification passed");
  });

  it("rejects packaged architecture mismatches with an actionable issue", () => {
    const report = evaluateRuntimeArchitecture(
      probe({ platform: "darwin", arch: "x64", electron: "35.0.0" }),
      { platform: "darwin", arch: "arm64", packaged: true },
    );

    expect(report.ok).toBe(false);
    expect(report.issues).toContain("architecture mismatch: expected arm64, got x64");
    expect(formatRuntimeArchitectureReport(report)).toContain("Failures:");
  });

  it("rejects packaged probes that did not run under Electron", () => {
    const report = evaluateRuntimeArchitecture(
      probe({ platform: "linux", arch: "x64", electron: null }),
      { platform: "linux", arch: "x64", packaged: true },
    );

    expect(report.ok).toBe(false);
    expect(report.issues).toContain("packaged runtime probe did not report Electron; expected packaged Electron runtime");
  });

  it("allows universal expectations for arm64 and x64 runtimes", () => {
    expect(evaluateRuntimeArchitecture(probe({ arch: "arm64" }), { platform: "darwin", arch: "universal" }).ok).toBe(true);
    expect(evaluateRuntimeArchitecture(probe({ arch: "x64" }), { platform: "darwin", arch: "universal" }).ok).toBe(true);
  });

  it("extracts a child probe from marked stdout", () => {
    const stdout = [
      "some electron warning",
      "__AMBIENT_RUNTIME_ARCHITECTURE_JSON_START__",
      JSON.stringify(probe({ platform: "win32", arch: "x64" })),
      "__AMBIENT_RUNTIME_ARCHITECTURE_JSON_END__",
    ].join("\n");

    expect(extractRuntimeArchitectureProbe(stdout)).toMatchObject({
      platform: "win32",
      arch: "x64",
    });
  });

  it("builds expected runtime shape from aliases", () => {
    expect(expectedRuntimeFromOptions({
      expectedPlatform: "windows",
      expectedArch: "amd64",
      packaged: true,
    })).toEqual({
      platform: "win32",
      arch: "x64",
      packaged: true,
    });
  });
});

function probe(overrides = {}) {
  return {
    platform: overrides.platform || "darwin",
    arch: overrides.arch || "arm64",
    executable: "/Applications/Ambient Desktop.app/Contents/MacOS/Ambient Desktop",
    resourcesPath: "/Applications/Ambient Desktop.app/Contents/Resources",
    versions: {
      node: "22.0.0",
      electron: overrides.electron === undefined ? "35.0.0" : overrides.electron,
      modules: "132",
    },
    piRuntime: {
      mode: "in-process-library",
      separateHelperBinary: false,
      note: "Ambient imports Pi as an application dependency; no separate Pi helper binary is packaged in the current app.",
    },
  };
}
