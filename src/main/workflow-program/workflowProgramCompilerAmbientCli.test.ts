import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors } from "./workflowProgramDesktopToolFacade";
import { compileWorkflowProgramIr, type WorkflowProgramAmbientCliCapability } from "./workflowProgramCompiler";

function arxivAmbientCliCapability(overrides: Partial<WorkflowProgramAmbientCliCapability> = {}): WorkflowProgramAmbientCliCapability {
  return {
    capabilityId: "pi-catalog:pi-arxiv:tool:arxiv_search",
    registryPluginId: "pi-catalog",
    packageId: "pi-catalog:pi-arxiv",
    packageName: "pi-arxiv",
    command: "arxiv_search",
    availability: "available",
    missingEnv: [],
    ...overrides,
  };
}

function arxivAmbientCliGrant() {
  return {
    capabilityId: "pi-catalog:pi-arxiv:tool:arxiv_search",
    registryPluginId: "pi-catalog",
    packageId: "pi-catalog:pi-arxiv",
    packageName: "pi-arxiv",
    command: "arxiv_search",
  };
}

describe("compileWorkflowProgramIr Ambient CLI policy", () => {
  it("compiles Ambient CLI calls only when a selected descriptor-backed capability grants the exact command", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      ambientCliCapabilities: [arxivAmbientCliCapability()],
      program: {
        version: 1,
        title: "Arxiv Research",
        goal: "Search arXiv with an installed Ambient CLI command and summarize the output.",
        nodes: [
          {
            id: "describe-arxiv",
            kind: "tool.call",
            tool: "ambient_cli_describe",
            args: { packageName: "pi-arxiv", command: "arxiv_search" },
          },
          {
            id: "search-arxiv",
            kind: "tool.call",
            tool: "ambient_cli",
            dependsOn: ["describe-arxiv"],
            args: { packageName: "pi-arxiv", command: "arxiv_search", args: ["workflow compiler", "--max-results", "3"] },
            output: { type: "ambientCliResult" },
          },
          {
            id: "summarize",
            kind: "model.call",
            dependsOn: ["search-arxiv"],
            task: "summarize.arxiv.results",
            input: { cliOutput: { fromNode: "search-arxiv", path: "stdout" } },
            output: { schema: { summary: "string", citations: "array" } },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["summarize"],
            value: { summary: { fromNode: "summarize", path: "summary" } },
          },
        ],
      },
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["ambient_cli", "ambient.responses"]));
    expect(result.output.manifest.ambientCliCapabilities).toEqual([arxivAmbientCliGrant()]);
    expect(result.output.source).toContain("tools.ambient_cli_describe");
    expect(result.output.source).toContain('tools.ambient_cli({ "packageName": "pi-arxiv", "command": "arxiv_search"');
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["tool:ambient_cli_describe", "tool:ambient_cli", "model:summarize.arxiv.results"]),
    );
  });

  it("rejects Ambient CLI execution that is not preceded by a matching describe node", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        ambientCliCapabilities: [arxivAmbientCliCapability()],
        program: {
          version: 1,
          title: "Undescribed CLI",
          goal: "Try to run an Ambient CLI command without describing it first.",
          nodes: [
            {
              id: "search-arxiv",
              kind: "tool.call",
              tool: "ambient_cli",
              args: { packageName: "pi-arxiv", command: "arxiv_search", args: ["workflow compiler"] },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "ambient_cli.describe_required", nodeId: "search-arxiv" })],
    });
  });

  it("rejects Ambient CLI describe nodes that are not grounded by search or selected capability metadata", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Ungrounded CLI Describe",
          goal: "Try to describe an Ambient CLI package without discovery provenance.",
          nodes: [
            {
              id: "describe-arxiv",
              kind: "tool.call",
              tool: "ambient_cli_describe",
              args: { packageName: "pi-arxiv", command: "arxiv_search" },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "ambient_cli.search_required", nodeId: "describe-arxiv" })],
    });
  });

  it("allows Ambient CLI describe nodes grounded by a prior search dependency", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Search Then Describe CLI",
        goal: "Discover installed Ambient CLI capabilities before describing the selected package.",
        nodes: [
          {
            id: "search-cli",
            kind: "tool.call",
            tool: "ambient_cli_search",
            args: { query: "arxiv paper search", kind: "command", limit: 5 },
          },
          {
            id: "describe-arxiv",
            kind: "tool.call",
            tool: "ambient_cli_describe",
            dependsOn: ["search-cli"],
            args: { packageName: "pi-arxiv", command: "arxiv_search" },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["describe-arxiv"],
            value: { description: { fromNode: "describe-arxiv" } },
          },
        ],
      },
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["ambient_cli_search", "ambient_cli_describe"]));
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["tool:ambient_cli_search", "tool:ambient_cli_describe"]),
    );
  });

  it("rejects Ambient CLI calls without a selected capability grant", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Ungranted CLI",
          goal: "Try to run an Ambient CLI command without a grant.",
          nodes: [
            {
              id: "describe-arxiv",
              kind: "tool.call",
              tool: "ambient_cli_describe",
              args: { packageName: "pi-arxiv", command: "arxiv_search" },
            },
            {
              id: "search-arxiv",
              kind: "tool.call",
              tool: "ambient_cli",
              dependsOn: ["describe-arxiv"],
              args: { packageName: "pi-arxiv", command: "arxiv_search", args: ["workflow compiler"] },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "ambient_cli.search_required", nodeId: "describe-arxiv" }),
        expect.objectContaining({ code: "ambient_cli.capability_required", nodeId: "search-arxiv" }),
      ]),
    });
  });

  it("rejects Ambient CLI calls with dynamic command identity before source generation", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        ambientCliCapabilities: [arxivAmbientCliCapability()],
        program: {
          version: 1,
          title: "Dynamic CLI",
          goal: "Try to run an Ambient CLI command from dynamic identity fields.",
          nodes: [
            { id: "read-command", kind: "tool.call", tool: "file_read", args: { path: "command.txt" } },
            {
              id: "search-arxiv",
              kind: "tool.call",
              tool: "ambient_cli",
              dependsOn: ["read-command"],
              args: { packageName: "pi-arxiv", command: { fromNode: "read-command", path: "content" }, args: ["workflow compiler"] },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "ambient_cli.literal_command_required", nodeId: "search-arxiv" })],
    });
  });

  it("rejects Ambient CLI calls that embed secret-looking argument literals", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        ambientCliCapabilities: [arxivAmbientCliCapability()],
        program: {
          version: 1,
          title: "Secret In CLI Args",
          goal: "Try to pass a secret value through Ambient CLI arguments.",
          nodes: [
            {
              id: "describe-arxiv",
              kind: "tool.call",
              tool: "ambient_cli_describe",
              args: { packageName: "pi-arxiv", command: "arxiv_search" },
            },
            {
              id: "search-arxiv",
              kind: "tool.call",
              tool: "ambient_cli",
              dependsOn: ["describe-arxiv"],
              args: {
                packageName: "pi-arxiv",
                command: "arxiv_search",
                args: ["--api-key", "sk-1234567890abcdefghijklmnop", "workflow compiler"],
              },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "ambient_cli.secret_value_rejected", nodeId: "search-arxiv" })]),
    });
  });

  it("rejects Ambient CLI capabilities that still need environment bindings", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        ambientCliCapabilities: [arxivAmbientCliCapability({ missingEnv: ["ARXIV_API_KEY"] })],
        program: {
          version: 1,
          title: "Missing Env CLI",
          goal: "Try to compile an Ambient CLI command whose package is not ready.",
          nodes: [
            {
              id: "describe-arxiv",
              kind: "tool.call",
              tool: "ambient_cli_describe",
              args: { packageName: "pi-arxiv", command: "arxiv_search" },
            },
            {
              id: "search-arxiv",
              kind: "tool.call",
              tool: "ambient_cli",
              dependsOn: ["describe-arxiv"],
              args: { packageName: "pi-arxiv", command: "arxiv_search", args: ["workflow compiler"] },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "ambient_cli.capability_missing_env", nodeId: "search-arxiv" })],
    });
  });

  it("compiles Ambient CLI missing-env setup without exposing or executing the secret-backed command", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      ambientCliCapabilities: [arxivAmbientCliCapability({ missingEnv: ["ARXIV_API_KEY"] })],
      program: {
        version: 1,
        title: "CLI Secret Setup",
        goal: "Request a Desktop-owned secret entry before running the cloud-backed CLI command.",
        nodes: [
          {
            id: "describe-arxiv",
            kind: "tool.call",
            tool: "ambient_cli_describe",
            args: { packageName: "pi-arxiv", command: "arxiv_search" },
          },
          {
            id: "request-secret",
            kind: "tool.call",
            tool: "ambient_cli_secret_request",
            dependsOn: ["describe-arxiv"],
            args: { packageName: "pi-arxiv", envName: "ARXIV_API_KEY" },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["request-secret"],
            value: {
              status: "secret requested",
              packageName: "pi-arxiv",
              envName: "ARXIV_API_KEY",
              next: "Retry after Desktop reports the env as configured.",
            },
          },
        ],
      },
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["ambient_cli_describe", "ambient_cli_secret_request"]));
    expect(result.output.manifest.tools).not.toContain("ambient_cli");
    expect(result.output.manifest.ambientCliCapabilities).toBeUndefined();
    expect(result.output.source).toContain("tools.ambient_cli_secret_request");
    expect(result.output.source).not.toContain("tools.ambient_cli({");
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["tool:ambient_cli_secret_request"]),
    );
  });

  it("rejects Ambient CLI env binding paths outside the workspace-secret boundary", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        ambientCliCapabilities: [arxivAmbientCliCapability({ missingEnv: ["ARXIV_API_KEY"] })],
        program: {
          version: 1,
          title: "Bad CLI Secret Bind",
          goal: "Try to bind a host secret path into an Ambient CLI package.",
          nodes: [
            {
              id: "bind-secret",
              kind: "mutation.stage",
              tool: "ambient_cli_env_bind",
              args: { packageName: "pi-arxiv", envName: "ARXIV_API_KEY", filePath: "/Users/example/.secrets/arxiv.txt" },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "ambient_cli.env_bind_file_path_invalid", nodeId: "bind-secret" })],
    });
  });
});
