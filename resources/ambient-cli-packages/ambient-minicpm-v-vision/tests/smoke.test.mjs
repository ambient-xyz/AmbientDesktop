import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const runScript = join(packageRoot, "scripts", "run.mjs");

describe("ambient-minicpm-v-vision provider wrapper", () => {
  it("reports adapter-only install readiness without requiring a server", async () => {
    const { stdout } = await execFileAsync(process.execPath, [runScript, "status"], {
      cwd: packageRoot,
      env: {
        ...process.env,
        AMBIENT_MINICPM_V_LLAMA_SERVER: join(tmpdir(), "missing-llama-server"),
      },
    });

    expect(JSON.parse(stdout)).toMatchObject({
      providerId: "minicpm-v-4.5-llamacpp",
      available: false,
      status: "not_running",
      runtime: {
        defaultModel: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
        experimentalModel: "openbmb/MiniCPM-V-4.6-gguf:q4_k_m",
        contextTokens: 8192,
      },
      inputPolicy: {
        rejectedInputs: expect.arrayContaining(["arbitrary remote URLs"]),
      },
      installPlan: {
        packageType: "adapter-only",
        bundledRuntimeBinaries: false,
        bundledModelWeights: false,
        runtimeAcquisition: expect.stringContaining("default managed"),
      },
      runtimeContract: {
        mode: "user-managed-runtime",
        status: "active",
        runtimeCacheRoot: ".ambient/vision/minicpm-v/runtime",
        ambientManagedDownload: {
          status: "planned",
          manifestVerification: {
            status: expect.any(String),
            downloadEnabled: true,
            selectedArtifactId: expect.any(String),
            checks: expect.arrayContaining([
              expect.objectContaining({ id: "artifact-required-fields", status: "passed" }),
              expect.objectContaining({ id: "artifact-checksum-pin", status: "passed" }),
              expect.objectContaining({ id: "download-policy", status: "passed" }),
            ]),
          },
        },
        preflight: expect.arrayContaining([
          expect.objectContaining({ id: "runtime-binary-present", status: "failed" }),
          expect.objectContaining({ id: "model-cache-policy", status: "warning" }),
        ]),
      },
      missingHints: expect.arrayContaining([expect.stringContaining("llama-server")]),
    });
  });

  it("does not treat an unowned default-port endpoint as the managed server", async () => {
    const server = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/health") {
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }
      if (req.url === "/v1/models") {
        res.end(JSON.stringify({ object: "list", data: [{ id: "stale", meta: { n_ctx: 4096 } }] }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
    });
    await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    const port = typeof address === "object" && address ? String(address.port) : "";
    try {
      const { stdout } = await execFileAsync(process.execPath, [runScript, "status"], {
        cwd: packageRoot,
        env: {
          ...process.env,
          AMBIENT_MINICPM_V_LLAMA_SERVER: join(tmpdir(), "missing-llama-server"),
          AMBIENT_MINICPM_V_PORT: port,
        },
      });

      expect(JSON.parse(stdout)).toMatchObject({
        available: false,
        status: "not_running",
        server: { running: false },
      });
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose));
    }
  });

  it("preserves stopped daemon state for managed runtime inventory", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-v-stopped-state-"));
    const stateDir = join(workspace, ".ambient/vision/minicpm-v/state");
    const statePath = join(stateDir, "server-state.json");
    try {
      await mkdir(stateDir, { recursive: true });
      await writeFile(statePath, `${JSON.stringify({
        pid: 4242,
        endpoint: "http://127.0.0.1:39217",
        host: "127.0.0.1",
        port: 39217,
        model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
        startedAt: "2026-05-12T00:00:00.000Z",
        command: ["/runtime/llama-server", "--model", "openbmb/MiniCPM-V-4_5-gguf:q4_k_m"],
      }, null, 2)}\n`);

      const stop = await execFileAsync(process.execPath, [runScript, "stop"], {
        cwd: workspace,
        env: {
          ...process.env,
          AMBIENT_MINICPM_V_STATE_DIR: stateDir,
        },
      });
      expect(JSON.parse(stop.stdout)).toMatchObject({
        status: "not_running",
        previousPid: 4242,
        endpoint: "http://127.0.0.1:39217",
      });
      await expect(readFile(statePath, "utf8").then(JSON.parse)).resolves.toMatchObject({
        status: "stopped",
        previousPid: 4242,
        endpoint: "http://127.0.0.1:39217",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("does not kill a process referenced only by stopped daemon state", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-v-stopped-reused-pid-"));
    const stateDir = join(workspace, ".ambient/vision/minicpm-v/state");
    const statePath = join(stateDir, "server-state.json");
    const borrowedProcess = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
    try {
      expect(typeof borrowedProcess.pid).toBe("number");
      await mkdir(stateDir, { recursive: true });
      await writeFile(statePath, `${JSON.stringify({
        pid: borrowedProcess.pid,
        status: "stopped",
        previousPid: borrowedProcess.pid,
        endpoint: "http://127.0.0.1:39217",
        host: "127.0.0.1",
        port: 39217,
        model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
        startedAt: "2026-05-12T00:00:00.000Z",
        stoppedAt: "2026-05-12T00:03:00.000Z",
        command: ["/runtime/llama-server", "--model", "openbmb/MiniCPM-V-4_5-gguf:q4_k_m"],
      }, null, 2)}\n`);

      const stop = await execFileAsync(process.execPath, [runScript, "stop"], {
        cwd: workspace,
        env: {
          ...process.env,
          AMBIENT_MINICPM_V_STATE_DIR: stateDir,
        },
      });
      expect(JSON.parse(stop.stdout)).toMatchObject({
        status: "not_running",
        previousPid: borrowedProcess.pid,
        endpoint: "http://127.0.0.1:39217",
      });
      expect(processAlive(borrowedProcess.pid)).toBe(true);

      const status = await execFileAsync(process.execPath, [runScript, "status"], {
        cwd: workspace,
        env: {
          ...process.env,
          AMBIENT_MINICPM_V_LLAMA_SERVER: join(tmpdir(), "missing-llama-server"),
          AMBIENT_MINICPM_V_STATE_DIR: stateDir,
        },
      });
      expect(JSON.parse(status.stdout)).toMatchObject({
        status: "not_running",
        server: {
          running: false,
          previousPid: borrowedProcess.pid,
          stoppedAt: "2026-05-12T00:03:00.000Z",
        },
      });
      expect(processAlive(borrowedProcess.pid)).toBe(true);
    } finally {
      if (typeof borrowedProcess.pid === "number" && processAlive(borrowedProcess.pid)) {
        borrowedProcess.kill("SIGKILL");
      }
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("reports the managed runtime release manifest verifier without downloading artifacts", async () => {
    const { stdout } = await execFileAsync(process.execPath, [runScript, "verify-runtime-manifest", "--platform", "darwin", "--arch", "arm64"], {
      cwd: packageRoot,
    });

    expect(JSON.parse(stdout)).toMatchObject({
      schemaVersion: "ambient-minicpm-v-runtime-release-manifest-v1",
      status: "warning",
      downloadEnabled: true,
      selectedArtifactId: "llama-cpp-macos-arm64-metal",
      requiredArtifactFields: expect.arrayContaining(["sourceUrl", "archiveSha256", "binaryRelativePath", "defaultDownloadEnabled", "smokeRequirements"]),
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "artifact-required-fields", status: "passed" }),
        expect.objectContaining({ id: "artifact-checksum-pin", status: "passed" }),
        expect.objectContaining({ id: "download-policy", status: "passed" }),
        expect.objectContaining({ id: "local-binary-checksum", status: "not-run" }),
      ]),
      blockers: [],
    });
  });

  it("writes bounded analysis JSON with the deterministic fake analysis hook", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-v-vision-smoke-"));
    const imagePath = join(workspace, "screen.png");
    const outputJson = join(workspace, ".ambient", "vision", "screen-analysis.json");
    await mkdir(dirname(outputJson), { recursive: true });
    await writeFile(imagePath, tinyPng());

    const { stdout } = await execFileAsync(process.execPath, [runScript, "analyze", "--image", imagePath, "--output-json", outputJson], {
      cwd: workspace,
      env: {
        ...process.env,
        AMBIENT_MINICPM_V_FAKE_ANALYSIS: "fake Ambient screenshot analysis",
      },
    });

    const preview = JSON.parse(stdout);
    expect(preview).toMatchObject({
      providerId: "minicpm-v-4.5-llamacpp",
      status: "passed",
      model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
      summary: "fake Ambient screenshot analysis",
      observations: [expect.objectContaining({ kind: "visual_quality", confidence: "high" })],
      image: {
        basename: "screen.png",
      },
      artifacts: {
        jsonPath: ".ambient/vision/screen-analysis.json",
      },
    });
    expect(preview.image).not.toHaveProperty("path");
    const full = JSON.parse(await readFile(outputJson, "utf8"));
    expect(full).toMatchObject({
      parsedOutput: {
        summary: "fake Ambient screenshot analysis",
      },
      rawResponse: { mode: "fake" },
      schemaValidation: { valid: true },
    });
  });

  it("uses an approved local existing endpoint without requiring a llama-server binary", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-v-existing-endpoint-"));
    const imagePath = join(workspace, "screen.png");
    const outputJson = join(workspace, ".ambient", "vision", "endpoint-analysis.json");
    await mkdir(dirname(outputJson), { recursive: true });
    await writeFile(imagePath, tinyPng());
    const requests = [];
    const server = await localMiniCpmEndpoint(requests);
    try {
      const endpoint = `http://127.0.0.1:${server.port}`;
      const status = await execFileAsync(process.execPath, [runScript, "status", "--endpoint", endpoint], {
        cwd: workspace,
        env: {
          ...process.env,
          AMBIENT_MINICPM_V_LLAMA_SERVER: join(tmpdir(), "missing-llama-server"),
        },
      });
      expect(JSON.parse(status.stdout)).toMatchObject({
        available: true,
        status: "ready",
        endpoint,
        endpointMode: "existing-local-endpoint",
        runtime: {
          binaryAvailable: false,
        },
        runtimeContract: {
          mode: "existing-local-endpoint",
          endpoint,
          preflight: expect.arrayContaining([
            expect.objectContaining({ id: "endpoint-locality", status: "passed" }),
            expect.objectContaining({ id: "endpoint-health", status: "passed" }),
            expect.objectContaining({ id: "endpoint-lifecycle", status: "warning" }),
          ]),
        },
        models: {
          ok: true,
        },
      });

      const analyze = await execFileAsync(process.execPath, [
        runScript,
        "analyze",
        "--endpoint",
        endpoint,
        "--image",
        imagePath,
        "--output-json",
        outputJson,
        "--prompt",
        "Inspect this screenshot and return JSON.",
      ], { cwd: workspace });

      const preview = JSON.parse(analyze.stdout);
      expect(preview).toMatchObject({
        status: "passed",
        endpoint,
        summary: "local endpoint analyzed the supplied image",
      });
      expect(requests.some((request) => request.url === "/v1/models")).toBe(true);
      const chat = requests.find((request) => request.url === "/v1/chat/completions");
      expect(chat?.body.messages[0].content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
      const full = JSON.parse(await readFile(outputJson, "utf8"));
      expect(full.request.messages[0].content[1].image_url.url).toContain("<redacted sha256:");
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose));
    }
  });

  it("retries without strict JSON schema when llama-server rejects sampler initialization", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-v-sampler-fallback-"));
    const imagePath = join(workspace, "screen.png");
    const outputJson = join(workspace, ".ambient", "vision", "sampler-fallback.json");
    await mkdir(dirname(outputJson), { recursive: true });
    await writeFile(imagePath, tinyPng());
    const requests = [];
    const server = await samplerFallbackEndpoint(requests);
    try {
      const endpoint = `http://127.0.0.1:${server.port}`;
      const analyze = await execFileAsync(process.execPath, [
        runScript,
        "analyze",
        "--endpoint",
        endpoint,
        "--image",
        imagePath,
        "--output-json",
        outputJson,
        "--prompt",
        "Inspect this screenshot and return JSON.",
      ], { cwd: workspace });

      const preview = JSON.parse(analyze.stdout);
      expect(preview).toMatchObject({
        status: "passed",
        endpoint,
        summary: "sampler fallback analyzed the image",
      });
      const chatRequests = requests.filter((request) => request.url === "/v1/chat/completions");
      expect(chatRequests).toHaveLength(2);
      expect(chatRequests[0].body.response_format).toMatchObject({ type: "json_schema" });
      expect(chatRequests[1].body).not.toHaveProperty("response_format");
      const full = JSON.parse(await readFile(outputJson, "utf8"));
      expect(full.request.strictJsonSchemaFallback).toContain("strict JSON schema");
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose));
    }
  });

  it("retries malformed structured visual JSON before returning a valid observation payload", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-v-json-retry-"));
    const imagePath = join(workspace, "screen.png");
    const outputJson = join(workspace, ".ambient", "vision", "json-retry.json");
    await mkdir(dirname(outputJson), { recursive: true });
    await writeFile(imagePath, tinyPng());
    const requests = [];
    const server = await malformedJsonRetryEndpoint(requests);
    try {
      const endpoint = `http://127.0.0.1:${server.port}`;
      const analyze = await execFileAsync(process.execPath, [
        runScript,
        "analyze",
        "--endpoint",
        endpoint,
        "--image",
        imagePath,
        "--output-json",
        outputJson,
        "--prompt",
        "Inspect this screenshot and return JSON.",
      ], { cwd: workspace });

      const preview = JSON.parse(analyze.stdout);
      expect(preview).toMatchObject({
        status: "passed",
        endpoint,
        summary: "json retry analyzed the image",
      });
      const chatRequests = requests.filter((request) => request.url === "/v1/chat/completions");
      expect(chatRequests).toHaveLength(2);
      expect(chatRequests[0].body.response_format).toMatchObject({ type: "json_schema" });
      expect(chatRequests[1].body).not.toHaveProperty("response_format");
      expect(chatRequests[1].body.messages[0].content[0].text).toContain("previous response was not valid structured JSON");
      const full = JSON.parse(await readFile(outputJson, "utf8"));
      expect(full.request.strictJsonSchemaFallback).toContain("invalid structured visual output");
      expect(full.schemaValidation).toMatchObject({ valid: true, errors: [] });
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose));
    }
  });

  it("rejects remote image URLs before analysis", async () => {
    await expect(execFileAsync(process.execPath, [runScript, "analyze", "--image", "https://example.com/screen.png", "--output-json", "out.json"], {
      cwd: packageRoot,
      env: { ...process.env, AMBIENT_MINICPM_V_FAKE_ANALYSIS: "should not run" },
    })).rejects.toThrow(/local path/);
  });

  it("rejects remote existing endpoints before status checks", async () => {
    await expect(execFileAsync(process.execPath, [runScript, "status", "--endpoint", "https://example.com"], {
      cwd: packageRoot,
    })).rejects.toThrow(/allowed hosts/);
  });
});

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tinyPng() {
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ax8pWQAAAAASUVORK5CYII=", "base64");
}

async function localMiniCpmEndpoint(requests) {
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const body = rawBody ? JSON.parse(rawBody) : undefined;
    requests.push({ method: request.method, url: request.url, body });
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/health") {
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (request.url === "/v1/models") {
      response.end(JSON.stringify({ data: [{ id: "local-minicpm-v", object: "model", multimodal: true }] }));
      return;
    }
    if (request.url === "/v1/chat/completions") {
      response.end(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: "local endpoint analyzed the supplied image",
              observations: [{
                kind: "layout",
                description: "The request reached the existing local endpoint.",
                confidence: "high",
                evidence: "local endpoint fixture",
              }],
              limitations: ["Synthetic endpoint does not inspect pixels."],
            }),
          },
        }],
      }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  return Object.assign(server, { port: server.address().port });
}

async function samplerFallbackEndpoint(requests) {
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const body = rawBody ? JSON.parse(rawBody) : undefined;
    requests.push({ method: request.method, url: request.url, body });
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/health") {
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (request.url === "/v1/models") {
      response.end(JSON.stringify({ data: [{ id: "local-minicpm-v", object: "model", multimodal: true }] }));
      return;
    }
    if (request.url === "/v1/chat/completions") {
      if (body?.response_format) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: { code: 400, message: "Failed to initialize samplers: std::exception", type: "invalid_request_error" } }));
        return;
      }
      response.end(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: "sampler fallback analyzed the image",
              observations: [{
                kind: "layout",
                description: "The retry omitted strict JSON schema and returned valid JSON.",
                confidence: "high",
                evidence: "sampler fallback fixture",
              }],
              limitations: ["Synthetic endpoint does not inspect pixels."],
            }),
          },
        }],
      }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  return Object.assign(server, { port: server.address().port });
}

async function malformedJsonRetryEndpoint(requests) {
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const body = rawBody ? JSON.parse(rawBody) : undefined;
    requests.push({ method: request.method, url: request.url, body });
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/health") {
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (request.url === "/v1/models") {
      response.end(JSON.stringify({ data: [{ id: "local-minicpm-v", object: "model", multimodal: true }] }));
      return;
    }
    if (request.url === "/v1/chat/completions") {
      if (requests.filter((item) => item.url === "/v1/chat/completions").length === 1) {
        response.end(JSON.stringify({
          choices: [{ message: { content: "{\"summary\":\"broken\",\"observations\":[{\"kind\":\"layout\"" } }],
        }));
        return;
      }
      response.end(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: "json retry analyzed the image",
              observations: [{
                kind: "layout",
                description: "The retry returned a valid compact visual JSON object.",
                confidence: "high",
                evidence: "json retry fixture",
              }],
              limitations: ["Synthetic endpoint does not inspect pixels."],
            }),
          },
        }],
      }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  return Object.assign(server, { port: server.address().port });
}
