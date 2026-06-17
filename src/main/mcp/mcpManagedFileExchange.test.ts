import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MCP_MANAGED_FILE_EXCHANGE_CONTAINER_PATH,
  materializeMcpManagedFileExchangeArtifacts,
  mcpManagedFileExchangeForWorkload,
  prepareMcpManagedFileExchangeArguments,
} from "./mcpManagedFileExchange";
import type { ToolHiveInstalledServerState } from "../tool-runtime/toolHiveRuntimeService";

describe("MCP managed file exchange", () => {
  it("stages explicit inline content and workspace files into the managed ToolHive exchange", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-file-exchange-"));
    const workspace = join(root, "workspace");
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, "input.csv"), "name,score\nAlice,10\n", "utf8");
    const exchange = mcpManagedFileExchangeForWorkload(join(root, "state"), "ambient-csvglow-standard-mcp");
    const server: ToolHiveInstalledServerState = {
      serverId: "csvglow-standard-mcp",
      workloadName: "ambient-csvglow-standard-mcp",
      permissionProfilePath: join(root, "profile.json"),
      permissionProfileSha256: "abc",
      managedFileExchange: exchange,
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:00.000Z",
    };

    const prepared = await prepareMcpManagedFileExchangeArguments({
      arguments: {
        csv_path: "input.csv",
        output_path: "result.html",
      },
      fileInputs: [{
        argumentPath: "inline_csv_path",
        filename: "inline.csv",
        content: "name,score\nBob,12\n",
      }],
      workspacePath: workspace,
      server,
    });

    expect(prepared.arguments).toMatchObject({
      csv_path: expect.stringMatching(new RegExp(`^${MCP_MANAGED_FILE_EXCHANGE_CONTAINER_PATH}/input-[a-f0-9]{12}\\.csv$`)),
      inline_csv_path: expect.stringMatching(new RegExp(`^${MCP_MANAGED_FILE_EXCHANGE_CONTAINER_PATH}/inline-[a-f0-9]{12}\\.csv$`)),
      output_path: expect.stringMatching(new RegExp(`^${MCP_MANAGED_FILE_EXCHANGE_CONTAINER_PATH}/result-[a-f0-9]{12}\\.html$`)),
    });
    expect(prepared.stagedFiles.map((file) => file.source).sort()).toEqual(["explicit-inline", "output-path", "workspace-file"]);
    const workspaceStage = prepared.stagedFiles.find((file) => file.source === "workspace-file")!;
    const inlineStage = prepared.stagedFiles.find((file) => file.source === "explicit-inline")!;
    const outputStage = prepared.stagedFiles.find((file) => file.source === "output-path")!;
    expect(await readFile(workspaceStage.hostPath, "utf8")).toBe("name,score\nAlice,10\n");
    expect(await readFile(inlineStage.hostPath, "utf8")).toBe("name,score\nBob,12\n");
    expect((await stat(exchange.hostPath)).mode & 0o7777).toBe(0o1777);
    expect((await stat(workspaceStage.hostPath)).mode & 0o777).toBe(0o644);
    expect((await stat(inlineStage.hostPath)).mode & 0o777).toBe(0o644);
    expect((await stat(outputStage.hostPath)).mode & 0o777).toBe(0o666);
  });

  it("recognizes camelCase file and output argument names", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-file-exchange-"));
    const workspace = join(root, "workspace");
    await mkdir(workspace, { recursive: true });
    const exchange = mcpManagedFileExchangeForWorkload(join(root, "state"), "ambient-csvglow-standard-mcp");
    const server: ToolHiveInstalledServerState = {
      serverId: "csvglow-standard-mcp",
      workloadName: "ambient-csvglow-standard-mcp",
      permissionProfilePath: join(root, "profile.json"),
      permissionProfileSha256: "abc",
      managedFileExchange: exchange,
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:00.000Z",
    };

    const prepared = await prepareMcpManagedFileExchangeArguments({
      arguments: {
        csvContent: "name,score\nCara,13\n",
        outputPath: "chart.html",
      },
      workspacePath: workspace,
      server,
    });

    expect(prepared.arguments).toMatchObject({
      csvContent: expect.stringMatching(new RegExp(`^${MCP_MANAGED_FILE_EXCHANGE_CONTAINER_PATH}/csvContent-[a-f0-9]{12}\\.csv$`)),
      outputPath: expect.stringMatching(new RegExp(`^${MCP_MANAGED_FILE_EXCHANGE_CONTAINER_PATH}/chart-[a-f0-9]{12}\\.html$`)),
    });
    expect(prepared.stagedFiles.map((file) => file.source).sort()).toEqual(["inline-argument", "output-path"]);
    const inlineStage = prepared.stagedFiles.find((file) => file.source === "inline-argument")!;
    expect(await readFile(inlineStage.hostPath, "utf8")).toBe("name,score\nCara,13\n");
  });

  it("copies referenced managed output artifacts into the workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-file-exchange-"));
    const workspace = join(root, "workspace");
    await mkdir(workspace, { recursive: true });
    const exchange = mcpManagedFileExchangeForWorkload(join(root, "state"), "ambient-csvglow-standard-mcp");
    const outputPath = join(exchange.hostPath, "dashboard-abc123.html");
    await mkdir(exchange.hostPath, { recursive: true, mode: 0o1777 });
    await writeFile(outputPath, "<html><body>ok</body></html>", "utf8");

    const artifacts = await materializeMcpManagedFileExchangeArtifacts({
      exchange,
      workspacePath: workspace,
      workloadName: "ambient-csvglow-standard-mcp",
      text: `{"output_path":"${MCP_MANAGED_FILE_EXCHANGE_CONTAINER_PATH}/dashboard-abc123.html"}`,
      stagedFiles: [],
    });

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      containerPath: `${MCP_MANAGED_FILE_EXCHANGE_CONTAINER_PATH}/dashboard-abc123.html`,
      filename: "dashboard-abc123.html",
      bytes: 28,
      source: "result-reference",
    });
    expect(artifacts[0]?.workspacePath).toMatch(/^\.ambient\/mcp-outputs\/\d{4}-\d{2}-\d{2}\/ambient-csvglow-standard-mcp-dashboard-abc123-[a-f0-9]{12}\.html$/);
    expect(await readFile(join(workspace, artifacts[0]!.workspacePath!), "utf8")).toBe("<html><body>ok</body></html>");
  });
});
