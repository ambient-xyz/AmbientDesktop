import { createHash } from "node:crypto";
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AmbientDownloadService } from "./ambientDownloadService";

describe("AmbientDownloadService", () => {
  it("downloads a file into the workspace with checksum validation", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-download-service-"));
    try {
      const bytes = Buffer.from("managed download fixture");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const fetchImpl = vi.fn(async () => new Response(bytes, {
        status: 200,
        headers: { "content-length": String(bytes.length) },
      }));
      const service = new AmbientDownloadService();

      const started = service.start({
        workspacePath: workspace,
        url: "https://example.com/files/fixture.bin",
        destinationPath: "downloads/fixture.bin",
        expectedBytes: bytes.length,
        sha256,
        fetchImpl: fetchImpl as typeof fetch,
      });
      const completed = await service.wait(started.jobId, { heartbeatMs: 1 });

      expect(completed).toMatchObject({
        status: "completed",
        destinationPath: "downloads/fixture.bin",
        bytesReceived: bytes.length,
        totalBytes: bytes.length,
        percent: 100,
        computedSha256: sha256,
        integrityStatus: "sha256-verified",
      });
      expect(await readFile(join(workspace, "downloads/fixture.bin"), "utf8")).toBe("managed download fixture");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("requires checksums for managed-install destinations and quarantines unsigned assets explicitly", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-download-service-integrity-"));
    try {
      const service = new AmbientDownloadService();
      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/runtime.tar.gz",
          destinationKind: "managed-install",
          destinationPath: "runtimes/runtime.tar.gz",
        }),
      ).toThrow(/managed-install downloads require a trusted sha256/i);

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/runtime.tar.gz",
          destinationKind: "quarantine",
          destinationPath: ".ambient/download-quarantine/",
        }),
      ).toThrow(/download destination path cannot traverse outside the destination root/i);

      const managedBytes = Buffer.from("managed memory model");
      const managedSha256 = createHash("sha256").update(managedBytes).digest("hex");
      const managedFetchImpl = vi.fn(async () => new Response(managedBytes, {
        status: 200,
        headers: { "content-length": String(managedBytes.length) },
      }));
      const managedStarted = service.start({
        workspacePath: workspace,
        url: "https://example.com/model.bin",
        destinationKind: "managed-install",
        destinationPath: ".ambient/memory/tencentdb/embeddings/models/model.bin",
        sha256: managedSha256,
        fetchImpl: managedFetchImpl as typeof fetch,
      });
      const managedCompleted = await service.wait(managedStarted.jobId, { heartbeatMs: 1 });
      expect(managedCompleted).toMatchObject({
        status: "completed",
        destinationKind: "managed-install",
        integrityStatus: "sha256-verified",
      });
      expect(await readFile(join(workspace, ".ambient", "memory", "tencentdb", "embeddings", "models", "model.bin"), "utf8")).toBe(
        "managed memory model",
      );

      const bytes = Buffer.from("unsigned fixture");
      const fetchImpl = vi.fn(async () => new Response(bytes, { status: 200, headers: { "content-length": String(bytes.length) } }));
      const started = service.start({
        workspacePath: workspace,
        url: "https://example.com/runtime.tar.gz",
        destinationKind: "quarantine",
        destinationPath: "runtimes/runtime.tar.gz",
        fetchImpl: fetchImpl as typeof fetch,
      });
      const completed = await service.wait(started.jobId, { heartbeatMs: 1 });

      expect(completed).toMatchObject({
        status: "completed",
        destinationKind: "quarantine",
        destinationPath: ".ambient/download-quarantine/runtimes/runtime.tar.gz",
        integrityStatus: "unverified",
      });
      expect(completed).not.toHaveProperty("computedSha256");
      expect(await readFile(join(workspace, ".ambient", "download-quarantine", "runtimes", "runtime.tar.gz"), "utf8")).toBe(
        "unsigned fixture",
      );

      const roundTripBytes = Buffer.from("unsigned fixture replacement");
      const roundTripFetchImpl = vi.fn(async () => new Response(roundTripBytes, { status: 200, headers: { "content-length": String(roundTripBytes.length) } }));
      const roundTripStarted = service.start({
        workspacePath: workspace,
        url: "https://example.com/runtime.tar.gz",
        destinationKind: "quarantine",
        destinationPath: completed.destinationPath,
        overwrite: true,
        fetchImpl: roundTripFetchImpl as typeof fetch,
      });
      const roundTripCompleted = await service.wait(roundTripStarted.jobId, { heartbeatMs: 1 });

      expect(roundTripCompleted.destinationPath).toBe(completed.destinationPath);
      expect(await readFile(join(workspace, ".ambient", "download-quarantine", "runtimes", "runtime.tar.gz"), "utf8")).toBe(
        "unsigned fixture replacement",
      );
      await expect(
        readFile(join(workspace, ".ambient", "download-quarantine", ".ambient", "download-quarantine", "runtimes", "runtime.tar.gz")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("blocks unsafe URL egress before starting a managed download", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-download-service-egress-"));
    try {
      const service = new AmbientDownloadService();
      const fetchImpl = vi.fn();
      for (const url of [
        "http://example.com/runtime.tar.gz",
        "http://127.0.0.1:4123/runtime.tar.gz",
        "http://169.254.169.254/latest/meta-data",
        "https://192.168.1.10/runtime.tar.gz",
        "https://user:secret@example.com/runtime.tar.gz",
        "https://example.com:22/runtime.tar.gz",
      ]) {
        expect(() =>
          service.start({
            workspacePath: workspace,
            url,
            destinationKind: "quarantine",
            destinationPath: "runtime.tar.gz",
            fetchImpl: fetchImpl as typeof fetch,
          }),
        ).toThrow();
      }
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("blocks redirect targets before the redirected managed-download request", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-download-service-egress-redirect-"));
    try {
      const service = new AmbientDownloadService();
      const fetchImpl = vi.fn(async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data" },
        }),
      );
      const started = service.start({
        workspacePath: workspace,
        url: "https://downloads.example.test/runtime.tar.gz",
        destinationKind: "quarantine",
        destinationPath: "runtime.tar.gz",
        retryCount: 0,
        fetchImpl: fetchImpl as typeof fetch,
      });
      const completed = await service.wait(started.jobId, { heartbeatMs: 1 });

      expect(completed.status).toBe("failed");
      expect(completed.error).toMatch(/metadata|link-local|egress/i);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await expect(readFile(join(workspace, ".ambient", "download-quarantine", "runtime.tar.gz"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects quarantine downloads through symlinked workspace ancestors", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-download-service-quarantine-link-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-download-service-outside-"));
    try {
      await symlink(outside, join(workspace, ".ambient"), "dir");
      const service = new AmbientDownloadService();
      const fetchImpl = vi.fn(async () => new Response("unsigned fixture", { status: 200 }));

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/runtime.tar.gz",
          destinationKind: "quarantine",
          destinationPath: "runtime.tar.gz",
          fetchImpl: fetchImpl as typeof fetch,
        }),
      ).toThrow(/symlinked directories/i);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("revalidates quarantine destinations after the fetch starts before writing partial files", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-download-service-quarantine-race-"));
    try {
      const bytes = Buffer.from("unsigned fixture");
      const service = new AmbientDownloadService();
      const fetchImpl = vi.fn(async () => {
        await rm(join(workspace, ".ambient", "download-quarantine"), { recursive: true, force: true });
        await mkdir(join(workspace, ".ambient", "cli-packages"), { recursive: true });
        await symlink(join(workspace, ".ambient", "cli-packages"), join(workspace, ".ambient", "download-quarantine"), "dir");
        return new Response(bytes, { status: 200, headers: { "content-length": String(bytes.length) } });
      });

      const started = service.start({
        workspacePath: workspace,
        url: "https://example.com/runtime.tar.gz",
        destinationKind: "quarantine",
        destinationPath: "runtime.tar.gz",
        retryCount: 0,
        fetchImpl: fetchImpl as typeof fetch,
      });
      const completed = await service.wait(started.jobId, { heartbeatMs: 1 });

      expect(completed).toMatchObject({ status: "failed" });
      expect(completed.error).toMatch(/symlinked directories/i);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await expect(readFile(join(workspace, ".ambient", "cli-packages", "runtime.tar.gz"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("requires checksums for workspace destinations inside managed install state", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-download-service-managed-root-"));
    const managedRoot = await mkdtemp(join(tmpdir(), "ambient-download-service-managed-root-external-"));
    const previousManagedRoot = process.env.AMBIENT_MANAGED_INSTALL_ROOT;
    try {
      const service = new AmbientDownloadService();

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/package.tgz",
          destinationKind: "workspace",
          destinationPath: ".ambient/cli-packages/imported/package.tgz",
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/package.tgz",
          destinationKind: "workspace",
          destinationPath: ".Ambient/cli-packages/imported/package.tgz",
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/packages.json",
          destinationKind: "managed-install",
          destinationPath: ".ambient/cli-packages/packages.json",
          sha256: "0".repeat(64),
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/ambient-root",
          destinationKind: "managed-install",
          destinationPath: ".ambient",
          sha256: "0".repeat(64),
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/agents-root",
          destinationKind: "managed-install",
          destinationPath: ".agents",
          sha256: "0".repeat(64),
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/pi-packages.json",
          destinationKind: "managed-install",
          destinationPath: ".ambient/plugins/pi-packages.json",
          sha256: "0".repeat(64),
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/sandbox-package.json",
          destinationKind: "managed-install",
          destinationPath: ".ambient/pi-extension-sandboxes/packages.json",
          sha256: "0".repeat(64),
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/privileged-package.json",
          destinationKind: "managed-install",
          destinationPath: ".ambient/pi-privileged-installs/packages.json",
          sha256: "0".repeat(64),
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/ambient-cli.json",
          destinationKind: "managed-install",
          destinationPath: ".ambient/capability-builder/packages/ambient-demo/ambient-cli.json",
          sha256: "0".repeat(64),
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/env-bindings.json",
          destinationKind: "managed-install",
          destinationPath: ".ambient/capability-builder/env-bindings.json",
          sha256: "0".repeat(64),
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/api-key.secret",
          destinationKind: "managed-install",
          destinationPath: ".ambient/capability-builder/secrets/ambient-demo/API_KEY.secret",
          sha256: "0".repeat(64),
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);

      await mkdir(join(workspace, ".ambient", "cli-packages", "imported"), { recursive: true });
      await symlink(join(workspace, ".ambient", "cli-packages", "imported"), join(workspace, ".ambient", "downloads"), "dir");
      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/package.tgz",
          destinationKind: "workspace",
          destinationPath: ".ambient/downloads/package.tgz",
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);

      await symlink(join(workspace, ".ambient", "cli-packages"), join(workspace, ".ambient", "memory"), "dir");
      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/packages.json",
          destinationKind: "managed-install",
          destinationPath: ".ambient/memory/packages.json",
          sha256: "0".repeat(64),
        }),
      ).toThrow(/managed-install download destination cannot use symlinked directories/i);

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/plugin.zip",
          destinationKind: "workspace",
          destinationPath: ".ambient-codex/imported-plugins/plugin.zip",
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/marketplace.json",
          destinationKind: "workspace",
          destinationPath: ".agents/plugins/marketplace.json",
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/marketplace.json",
          destinationKind: "workspace",
          destinationPath: ".AGENTS/plugins/marketplace.json",
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/agents-root",
          destinationKind: "workspace",
          destinationPath: ".agents",
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/codex-root",
          destinationKind: "workspace",
          destinationPath: ".codex",
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/packages.json",
          destinationKind: "workspace",
          destinationPath: ".ambient/cli-packages/packages.json",
          sha256: "0".repeat(64),
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);

      process.env.AMBIENT_MANAGED_INSTALL_ROOT = managedRoot;
      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/packages.json",
          destinationKind: "workspace",
          destinationPath: ".ambient/cli-packages/packages.json",
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);
    } finally {
      if (previousManagedRoot === undefined) delete process.env.AMBIENT_MANAGED_INSTALL_ROOT;
      else process.env.AMBIENT_MANAGED_INSTALL_ROOT = previousManagedRoot;
      await rm(workspace, { recursive: true, force: true });
      await rm(managedRoot, { recursive: true, force: true });
    }
  });

  it("revalidates workspace download holding paths after the fetch starts before writing partial files", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-download-service-workspace-race-"));
    try {
      const bytes = Buffer.from("unsigned fixture");
      const service = new AmbientDownloadService();
      const fetchImpl = vi.fn(async () => {
        await rm(join(workspace, ".ambient", "downloads"), { recursive: true, force: true });
        await mkdir(join(workspace, ".ambient", "cli-packages", "imported"), { recursive: true });
        await symlink(join(workspace, ".ambient", "cli-packages", "imported"), join(workspace, ".ambient", "downloads"), "dir");
        return new Response(bytes, { status: 200, headers: { "content-length": String(bytes.length) } });
      });

      const started = service.start({
        workspacePath: workspace,
        url: "https://example.com/package.tgz",
        destinationKind: "workspace",
        destinationPath: ".ambient/downloads/package.tgz",
        retryCount: 0,
        fetchImpl: fetchImpl as typeof fetch,
      });
      const completed = await service.wait(started.jobId, { heartbeatMs: 1 });

      expect(completed).toMatchObject({ status: "failed" });
      expect(completed.error).toMatch(/downloads cannot target ambient-managed package, plugin, or skill state/i);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await expect(readFile(join(workspace, ".ambient", "cli-packages", "imported", "package.tgz"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects workspace downloads through symlinked ancestors", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-download-service-workspace-link-"));
    try {
      await mkdir(join(workspace, "real-downloads"), { recursive: true });
      await symlink(join(workspace, "real-downloads"), join(workspace, "linked-downloads"), "dir");
      const service = new AmbientDownloadService();

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/package.tgz",
          destinationKind: "workspace",
          destinationPath: "linked-downloads/package.tgz",
        }),
      ).toThrow(/workspace download destination cannot use symlinked directories/i);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects symlinked partial files in the workspace download holding area", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-download-service-part-link-"));
    try {
      await mkdir(join(workspace, ".ambient", "downloads"), { recursive: true });
      await mkdir(join(workspace, ".ambient", "cli-packages"), { recursive: true });
      await symlink(
        join(workspace, ".ambient", "cli-packages", "packages.json"),
        join(workspace, ".ambient", "downloads", "package.tgz.part"),
      );
      const service = new AmbientDownloadService();

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/package.tgz",
          destinationKind: "workspace",
          destinationPath: ".ambient/downloads/package.tgz",
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state/i);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects hard-linked partial files in the workspace download holding area", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-download-service-part-hardlink-"));
    try {
      await mkdir(join(workspace, ".ambient", "downloads"), { recursive: true });
      await mkdir(join(workspace, ".ambient", "cli-packages"), { recursive: true });
      await writeFile(join(workspace, ".ambient", "cli-packages", "packages.json"), "managed package state", "utf8");
      await link(
        join(workspace, ".ambient", "cli-packages", "packages.json"),
        join(workspace, ".ambient", "downloads", "package.tgz.part"),
      );
      const service = new AmbientDownloadService();

      expect(() =>
        service.start({
          workspacePath: workspace,
          url: "https://example.com/package.tgz",
          destinationKind: "workspace",
          destinationPath: ".ambient/downloads/package.tgz",
        }),
      ).toThrow(/downloads cannot target ambient-managed package, plugin, or skill state|hard-linked files/i);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("resumes a partial download with Range", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-download-service-resume-"));
    try {
      const bytes = Buffer.from("resumable managed download fixture");
      const partial = bytes.subarray(0, 11);
      const destination = join(workspace, "models", "fixture.gguf");
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(`${destination}.part`, partial);
      const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("range")).toBe(`bytes=${partial.length}-`);
        return new Response(bytes.subarray(partial.length), {
          status: 206,
          headers: {
            "content-length": String(bytes.length - partial.length),
            "content-range": `bytes ${partial.length}-${bytes.length - 1}/${bytes.length}`,
          },
        });
      });
      const service = new AmbientDownloadService();

      const started = service.start({
        workspacePath: workspace,
        url: "https://example.com/fixture.gguf",
        destinationPath: "models/fixture.gguf",
        expectedBytes: bytes.length,
        fetchImpl: fetchImpl as typeof fetch,
      });
      const completed = await service.wait(started.jobId, { heartbeatMs: 1 });

      expect(completed).toMatchObject({
        status: "completed",
        resumed: true,
        bytesReceived: bytes.length,
      });
      expect(await readFile(destination, "utf8")).toBe("resumable managed download fixture");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("removes partial files between retries when resume is disabled", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-download-service-no-resume-retry-"));
    try {
      const bytes = Buffer.from("non resumable retry fixture");
      const fetchImpl = vi.fn(async () => {
        if (fetchImpl.mock.calls.length === 1) {
          return new Response(new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(bytes.subarray(0, 8));
              controller.error(new Error("network reset"));
            },
          }), {
            status: 200,
            headers: { "content-length": String(bytes.length) },
          });
        }
        return new Response(bytes, {
          status: 200,
          headers: { "content-length": String(bytes.length) },
        });
      });
      const service = new AmbientDownloadService();

      const started = service.start({
        workspacePath: workspace,
        url: "https://example.com/no-resume.bin",
        destinationPath: "downloads/no-resume.bin",
        expectedBytes: bytes.length,
        resume: false,
        retryCount: 1,
        fetchImpl: fetchImpl as typeof fetch,
      });
      const completed = await service.wait(started.jobId, { heartbeatMs: 1 });

      expect(completed).toMatchObject({
        status: "completed",
        resumed: false,
        attempt: 2,
        bytesReceived: bytes.length,
      });
      expect(await readFile(join(workspace, "downloads", "no-resume.bin"), "utf8")).toBe("non resumable retry fixture");
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects destinations that escape the selected root", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-download-service-path-"));
    try {
      const service = new AmbientDownloadService();
      expect(() => service.start({
        workspacePath: workspace,
        url: "https://example.com/file.bin",
        destinationPath: "../file.bin",
      })).toThrow(/cannot traverse/i);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
