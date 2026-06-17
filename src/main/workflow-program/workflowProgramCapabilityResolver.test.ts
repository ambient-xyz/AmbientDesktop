import { describe, expect, it } from "vitest";
import type { WorkflowProgramIR } from "../../shared/workflowProgramIr";
import { firstPartyDesktopToolDescriptors } from "../desktopToolRegistry";
import {
  resolveWorkflowProgramManifest,
  validateWorkflowProgramNodeCapabilities,
  type WorkflowProgramAmbientCliCapability,
} from "./workflowProgramCapabilityResolver";
import { fixtureWorkflowConnector } from "../workflowConnectors";

function toolsByName() {
  return new Map(firstPartyDesktopToolDescriptors().map((tool) => [tool.name, tool]));
}

function arxivCapability(): WorkflowProgramAmbientCliCapability {
  return {
    capabilityId: "pi-catalog:pi-arxiv:tool:arxiv_search",
    registryPluginId: "pi-catalog",
    packageId: "pi-catalog:pi-arxiv",
    packageName: "pi-arxiv",
    command: "arxiv_search",
    availability: "available",
    missingEnv: [],
  };
}

function braveCapability(overrides: Partial<WorkflowProgramAmbientCliCapability> = {}): WorkflowProgramAmbientCliCapability {
  return {
    capabilityId: "local:ambient-brave-api-search:tool:brave_search",
    registryPluginId: "local",
    packageId: "local:ambient-brave-api-search",
    packageName: "ambient-brave-api-search",
    command: "brave_search",
    availability: "available",
    missingEnv: ["BRAVE_API_KEY"],
    ...overrides,
  };
}

describe("workflowProgramCapabilityResolver", () => {
  it("rejects Ambient CLI describe without search provenance or selected capability metadata", () => {
    const program: WorkflowProgramIR = {
      version: 1,
      title: "Ungrounded CLI Describe",
      goal: "Describe an installed CLI command without progressive discovery.",
      nodes: [{ id: "describe-arxiv", kind: "tool.call", tool: "ambient_cli_describe", args: { packageName: "pi-arxiv", command: "arxiv_search" } }],
    };

    expect(
      validateWorkflowProgramNodeCapabilities({
        program,
        node: program.nodes[0]!,
        nodeIndex: 0,
        toolsByName: toolsByName(),
        connectorsById: new Map(),
        ambientCliCapabilities: [],
        validateGoogleReadOnly: true,
      }),
    ).toEqual([expect.objectContaining({ code: "ambient_cli.search_required", nodeId: "describe-arxiv" })]);
  });

  it("allows Ambient CLI describe when selected capability metadata already grounds the command", () => {
    const program: WorkflowProgramIR = {
      version: 1,
      title: "Grounded CLI Describe",
      goal: "Describe a retained CLI capability.",
      nodes: [{ id: "describe-arxiv", kind: "tool.call", tool: "ambient_cli_describe", args: { packageName: "pi-arxiv", command: "arxiv_search" } }],
    };

    expect(
      validateWorkflowProgramNodeCapabilities({
        program,
        node: program.nodes[0]!,
        nodeIndex: 0,
        toolsByName: toolsByName(),
        connectorsById: new Map(),
        ambientCliCapabilities: [arxivCapability()],
        validateGoogleReadOnly: true,
      }),
    ).toEqual([]);
  });

  it("infers manifest tool, Ambient CLI, connector, and Google read grants from validated IR nodes", () => {
    const connector = fixtureWorkflowConnector().descriptor;
    const program: WorkflowProgramIR = {
      version: 1,
      title: "Capability Manifest",
      goal: "Infer grants without Pi-authored manifest JSON.",
      nodes: [
        { id: "describe-arxiv", kind: "tool.call", tool: "ambient_cli_describe", args: { packageName: "pi-arxiv", command: "arxiv_search" } },
        {
          id: "search-arxiv",
          kind: "tool.call",
          tool: "ambient_cli",
          dependsOn: ["describe-arxiv"],
          args: { packageName: "pi-arxiv", command: "arxiv_search", args: ["workflow compiler"] },
        },
        { id: "read-records", kind: "connector.call", connectorId: "fixture.readonly", operation: "listRecords", accountId: "fixture", input: {} },
        { id: "google-status", kind: "tool.call", tool: "google_workspace_status", args: {} },
        {
          id: "list-files",
          kind: "tool.call",
          tool: "google_workspace_call",
          dependsOn: ["google-status"],
          args: {
            accountHint: { fromNode: "google-status", path: "accounts.0.accountHint" },
            methodId: "drive.files.list",
            params: { pageSize: 10 },
          },
        },
      ],
    };

    const manifest = resolveWorkflowProgramManifest({
      nodes: program.nodes,
      program,
      connectorDescriptors: [connector],
      ambientCliCapabilities: [arxivCapability()],
    });

    expect(manifest.tools).toEqual(expect.arrayContaining(["ambient_cli_describe", "ambient_cli", "google_workspace_status", "google_workspace_call"]));
    expect(manifest.ambientCliCapabilities).toEqual([
      expect.objectContaining({ capabilityId: "pi-catalog:pi-arxiv:tool:arxiv_search", packageName: "pi-arxiv", command: "arxiv_search" }),
    ]);
    expect(manifest.connectors).toEqual([
      expect.objectContaining({ connectorId: "fixture.readonly", accountId: "fixture", operations: ["listRecords"], scopes: ["fixture.records.read"] }),
    ]);
    expect(manifest.googleWorkspaceMethods).toEqual([
      expect.objectContaining({ methodId: "drive.files.list", service: "drive", accountProvenance: "google_workspace_status" }),
    ]);
  });

  it("allows Ambient CLI secret setup only for selected missing env requirements", () => {
    const program: WorkflowProgramIR = {
      version: 1,
      title: "CLI Secret Setup",
      goal: "Request a Desktop-managed secret before running a cloud-backed CLI package.",
      nodes: [
        {
          id: "request-secret",
          kind: "tool.call",
          tool: "ambient_cli_secret_request",
          args: { packageName: "ambient-brave-api-search", envName: "BRAVE_API_KEY" },
        },
        {
          id: "bind-secret",
          kind: "mutation.stage",
          tool: "ambient_cli_env_bind",
          args: { packageName: "ambient-brave-api-search", envName: "BRAVE_API_KEY", filePath: ".env.local" },
        },
      ],
    };

    for (const [nodeIndex, node] of program.nodes.entries()) {
      expect(
        validateWorkflowProgramNodeCapabilities({
          program,
          node,
          nodeIndex,
          toolsByName: toolsByName(),
          connectorsById: new Map(),
          ambientCliCapabilities: [braveCapability()],
          validateGoogleReadOnly: true,
        }),
      ).toEqual([]);
    }
  });

  it("rejects Ambient CLI secret setup for undeclared env and unsafe binding paths", () => {
    const program: WorkflowProgramIR = {
      version: 1,
      title: "Bad CLI Secret Setup",
      goal: "Reject unsafe secret setup IR.",
      nodes: [
        {
          id: "wrong-env",
          kind: "tool.call",
          tool: "ambient_cli_secret_request",
          args: { packageName: "ambient-brave-api-search", envName: "OPENAI_API_KEY" },
        },
        {
          id: "unsafe-bind",
          kind: "mutation.stage",
          tool: "ambient_cli_env_bind",
          args: { packageName: "ambient-brave-api-search", envName: "BRAVE_API_KEY", filePath: "/Users/neo/secret.txt" },
        },
      ],
    };

    expect(
      validateWorkflowProgramNodeCapabilities({
        program,
        node: program.nodes[0]!,
        nodeIndex: 0,
        toolsByName: toolsByName(),
        connectorsById: new Map(),
        ambientCliCapabilities: [braveCapability()],
        validateGoogleReadOnly: true,
      }),
    ).toEqual([expect.objectContaining({ code: "ambient_cli.secret_env_not_declared", nodeId: "wrong-env" })]);
    expect(
      validateWorkflowProgramNodeCapabilities({
        program,
        node: program.nodes[1]!,
        nodeIndex: 1,
        toolsByName: toolsByName(),
        connectorsById: new Map(),
        ambientCliCapabilities: [braveCapability()],
        validateGoogleReadOnly: true,
      }),
    ).toEqual([expect.objectContaining({ code: "ambient_cli.env_bind_file_path_invalid", nodeId: "unsafe-bind" })]);
  });
});
