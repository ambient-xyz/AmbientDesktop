import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  installLocalDeepResearchModelProfile,
  installLocalDeepResearchManagedAssets,
  localDeepResearchInstallJobWarnings,
  readLocalDeepResearchInstallJob,
  reconcileLocalDeepResearchInstallJob,
  type LocalDeepResearchInstallServiceResult,
} from "./localDeepResearchInstallService";
import type { LocalDeepResearchInstallProgress } from "../../shared/localRuntimeTypes";
import { localDeepResearchModelCachePath } from "./localDeepResearchManagedAssets";
import type { LocalDeepResearchModelProfile } from "./localDeepResearchModelProfiles";
import { buildLocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import { managedInstallWorkspacePath } from "./localDeepResearchSetupFacade";

const gib = 1024 ** 3;

describe("Local Deep Research managed installer", () => {
  it("downloads a LiteResearcher profile into the Ambient-managed model cache and reuses it", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-model-install-"));
    try {
      const body = Buffer.from("small gguf fixture");
      const profile = fixtureProfile(body);
      const progress: LocalDeepResearchInstallProgress[] = [];
      const fetchImpl = vi.fn(async () => new Response(body, {
        status: 200,
        headers: { "content-length": String(body.length) },
      }));

      const first = await installLocalDeepResearchModelProfile(workspace, profile, {
        fetchImpl: fetchImpl as typeof fetch,
        now: () => new Date("2026-05-28T13:00:00.000Z"),
        onProgress: (event) => progress.push(event),
      });
      const second = await installLocalDeepResearchModelProfile(workspace, profile, {
        fetchImpl: fetchImpl as typeof fetch,
        now: () => new Date("2026-05-28T13:01:00.000Z"),
      });

      const cachePath = localDeepResearchModelCachePath(managedInstallWorkspacePath(workspace), profile);
      expect(first).toMatchObject({
        status: "installed",
        profileId: "literesearcher-4b-q4-k-m",
        bytes: body.length,
        sha256: profile.sha256,
        downloadStatus: "downloaded",
        missingHints: [],
      });
      expect(second).toMatchObject({
        status: "already-installed",
        bytes: body.length,
        sha256: profile.sha256,
        downloadStatus: "reused",
      });
      expect(await readFile(cachePath, "utf8")).toBe("small gguf fixture");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(progress.map((event) => event.phase)).toEqual([
        "model-cache-check",
        "model-download-started",
        "model-download-progress",
        "model-download-verified",
        "model-installed",
      ]);
      expect(progress.at(-1)).toMatchObject({
        schemaVersion: "ambient-local-deep-research-install-progress-v1",
        component: "model",
        phase: "model-installed",
        status: "completed",
        percent: 100,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("resumes a partial LiteResearcher model download", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-model-resume-"));
    try {
      const body = Buffer.from("resumable gguf fixture");
      const partial = body.subarray(0, 10);
      const profile = fixtureProfile(body);
      const cachePath = localDeepResearchModelCachePath(managedInstallWorkspacePath(workspace), profile);
      const progress: LocalDeepResearchInstallProgress[] = [];
      await mkdir(dirname(cachePath), { recursive: true });
      await writeFile(`${cachePath}.part`, partial);
      const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("range")).toBe(`bytes=${partial.length}-`);
        return new Response(body.subarray(partial.length), {
          status: 206,
          headers: {
            "content-length": String(body.length - partial.length),
            "content-range": `bytes ${partial.length}-${body.length - 1}/${body.length}`,
          },
        });
      });

      const result = await installLocalDeepResearchModelProfile(workspace, profile, {
        fetchImpl: fetchImpl as typeof fetch,
        now: () => new Date("2026-05-28T13:02:00.000Z"),
        onProgress: (event) => progress.push(event),
      });

      expect(result).toMatchObject({
        status: "installed",
        bytes: body.length,
        sha256: profile.sha256,
        downloadStatus: "resumed",
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(await readFile(cachePath, "utf8")).toBe("resumable gguf fixture");
      expect(progress.find((event) => event.phase === "model-download-started")).toMatchObject({
        message: "Resuming download for LiteResearcher-4B.Q4_K_M.gguf.",
        bytesReceived: partial.length,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("coordinates model and shared runtime install results", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-managed-install-"));
    try {
      const setup = buildLocalDeepResearchSetupContract({
        modelInstallState: "missing",
        runtimeInstalled: false,
        machineFacts: { platform: "darwin", arch: "arm64", memoryBytes: 32 * gib, memoryPressure: "normal" },
        now: () => new Date("2026-05-28T13:10:00.000Z"),
      });
      const runtimeInstaller = vi.fn(async (): Promise<LocalDeepResearchInstallServiceResult["runtimeInstall"]> => ({
        attempted: true,
        status: "installed",
        source: "managed-download",
        artifactId: setup.runtime.selectedArtifactId,
        binaryPath: join(workspace, ".ambient/vision/minicpm-v/runtime/b9122/macos-arm64-metal/llama-b9122/llama-server"),
          missingHints: [],
      }));
      const progress: LocalDeepResearchInstallProgress[] = [];

      const result = await installLocalDeepResearchManagedAssets({
        workspacePath: workspace,
        setup,
        action: "repair",
        installModel: false,
        runtimeInstaller: runtimeInstaller as any,
        now: () => new Date("2026-05-28T13:10:00.000Z"),
        onProgress: (event) => progress.push(event),
      });

      expect(runtimeInstaller).toHaveBeenCalledWith(expect.objectContaining({
        workspacePath: workspace,
        runtimeArtifactId: "llama-cpp-macos-arm64-metal",
        onProgress: expect.any(Function),
      }));
      expect(progress.map((event) => event.phase)).toEqual([
        "preflight",
        "runtime-install-started",
        "runtime-install-completed",
        "validation-ready",
      ]);
      expect(progress[0]).toMatchObject({ action: "repair", component: "setup" });
      expect(progress[2]).toMatchObject({ component: "runtime", status: "completed" });
      expect(progress.every((event) => typeof event.jobId === "string" && event.jobId.startsWith("ldr-install-"))).toBe(true);
      expect(result).toMatchObject({
        schemaVersion: "ambient-local-deep-research-install-result-v1",
        status: "installed",
        runtimeInstall: {
          status: "installed",
          artifactId: "llama-cpp-macos-arm64-metal",
        },
      });
      const job = await readLocalDeepResearchInstallJob(workspace);
      expect(job).toMatchObject({
        status: "completed",
        action: "repair",
        profileId: "literesearcher-4b-q4-k-m",
        progress: {
          phase: "validation-ready",
        },
        result: {
          status: "installed",
        },
      });
      expect(job?.jobId).toBe(progress[0].jobId);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("reconciles stale running install jobs to interrupted for retryable status", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-install-ledger-"));
    try {
      const latestPath = resolve(managedInstallWorkspacePath(workspace), ".ambient/local-deep-research/install-jobs/latest.json");
      await mkdir(dirname(latestPath), { recursive: true });
      await writeFile(latestPath, `${JSON.stringify({
        schemaVersion: "ambient-local-deep-research-install-job-v1",
        jobId: "ldr-install-stale",
        action: "install",
        status: "running",
        processId: -1,
        workspacePath: workspace,
        startedAt: "2026-05-28T13:20:00.000Z",
        updatedAt: "2026-05-28T13:21:00.000Z",
        profileId: "literesearcher-4b-q4-k-m",
        filename: "LiteResearcher-4B.Q4_K_M.gguf",
        progress: {
          schemaVersion: "ambient-local-deep-research-install-progress-v1",
          jobId: "ldr-install-stale",
          action: "install",
          component: "model",
          phase: "model-download-progress",
          status: "running",
          message: "Downloading LiteResearcher-4B.Q4_K_M.gguf.",
          recordedAt: "2026-05-28T13:21:00.000Z",
        },
        nextActions: ["Wait for install progress."],
      }, null, 2)}\n`, "utf8");

      const reconciled = await reconcileLocalDeepResearchInstallJob(workspace, {
        now: () => new Date("2026-05-28T13:30:00.000Z"),
      });

      expect(reconciled).toMatchObject({
        jobId: "ldr-install-stale",
        status: "interrupted",
        updatedAt: "2026-05-28T13:30:00.000Z",
      });
      expect(localDeepResearchInstallJobWarnings(reconciled)[0]).toContain("stopped before this Local Deep Research install completed");
      await expect(readFile(resolve(managedInstallWorkspacePath(workspace), ".ambient/local-deep-research/install-jobs/ldr-install-stale.json"), "utf8"))
        .resolves.toContain("\"status\": \"interrupted\"");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

function fixtureProfile(bytes: Buffer): LocalDeepResearchModelProfile {
  return {
    id: "literesearcher-4b-q4-k-m",
    displayName: "LiteResearcher-4B Q4_K_M Test",
    repoId: "mradermacher/LiteResearcher-4B-GGUF",
    revision: "f7ba7a7f6653ada3d9a83f85663d6579965bb4cd",
    filename: "LiteResearcher-4B.Q4_K_M.gguf",
    quantization: "Q4_K_M",
    role: "everyday",
    sourceUrl: "https://example.com/LiteResearcher-4B.Q4_K_M.gguf",
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    xetHash: "test-xet-hash",
    licenseNote: "Test fixture.",
    defaultContextTokens: 16384,
    safeContextTokens: 8192,
    minimumMemoryBytes: 16 * gib,
    recommendedMemoryBytes: 24 * gib,
    estimatedResidentMemoryBytes: {
      safe8k: 5 * gib,
      target16k: 7 * gib,
    },
    notes: ["Test profile."],
  };
}
