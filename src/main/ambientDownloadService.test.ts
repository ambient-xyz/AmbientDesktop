import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
      });
      expect(await readFile(join(workspace, "downloads/fixture.bin"), "utf8")).toBe("managed download fixture");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
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
