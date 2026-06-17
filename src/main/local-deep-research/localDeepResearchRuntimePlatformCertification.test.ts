import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  localDeepResearchRuntimePlatformDecisions,
  runLocalDeepResearchRuntimePlatformCertification,
} from "./localDeepResearchRuntimePlatformCertification";

describe("Local Deep Research runtime platform certification", () => {
  it("records macOS, Linux, and Windows maturity decisions from the shared llama.cpp manifest", () => {
    const decisions = localDeepResearchRuntimePlatformDecisions();

    expect(decisions).toEqual([
      expect.objectContaining({
        id: "macos-arm64-metal",
        status: "passed",
        maturity: "certified",
        decision: "enable-default-managed-install",
        defaultDownloadEnabled: true,
      }),
      expect.objectContaining({
        id: "linux-x64-vulkan",
        status: "passed",
        maturity: "conditional",
        decision: "keep-conditional-managed-install",
        defaultDownloadEnabled: true,
      }),
      expect.objectContaining({
        id: "windows-x64-cpu",
        status: "passed",
        maturity: "experimental",
        decision: "pin-but-disable-default-install",
        defaultDownloadEnabled: false,
      }),
      expect.objectContaining({
        id: "windows-x64-gpu",
        status: "passed",
        maturity: "deferred",
        decision: "defer-managed-install",
        defaultDownloadEnabled: false,
      }),
    ]);
    expect(decisions.find((decision) => decision.id === "linux-x64-vulkan")?.requiredEvidence.join("\n")).toContain("Linux x64 Vulkan host");
    expect(decisions.find((decision) => decision.id === "windows-x64-cpu")?.requiredEvidence.join("\n")).toContain("llama-server.exe");
  });

  it("writes JSON and Markdown platform certification artifacts", async () => {
    const configuredWorkspace = process.env.AMBIENT_LOCAL_DEEP_RESEARCH_RUNTIME_PLATFORM_CERTIFICATION_WORKSPACE?.trim();
    const workspace = configuredWorkspace ? resolve(configuredWorkspace) : await mkdtemp(join(tmpdir(), "ambient-ldr-runtime-platforms-"));
    try {
      const result = await runLocalDeepResearchRuntimePlatformCertification({
        workspacePath: workspace,
        now: () => new Date("2026-05-28T16:00:00.000Z"),
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-local-deep-research-runtime-platform-certification-v1",
        status: "passed",
        artifactPath: ".ambient/local-deep-research/runtime-platform-certification/2026-05-28T16-00-00-000Z-passed.json",
        markdownPath: ".ambient/local-deep-research/runtime-platform-certification/2026-05-28T16-00-00-000Z-passed.md",
      });
      await expect(readFile(join(workspace, result.artifactPath), "utf8")).resolves.toContain("linux-x64-vulkan");
      await expect(readFile(join(workspace, result.markdownPath), "utf8")).resolves.toContain("Runtime Platform Certification");
    } finally {
      if (!configuredWorkspace) await rm(workspace, { recursive: true, force: true });
    }
  });
});
