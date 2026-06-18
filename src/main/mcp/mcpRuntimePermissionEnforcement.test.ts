import { describe, expect, it } from "vitest";
import { evaluateMcpToolCallPermission } from "./mcpPermissionPolicyService";
import {
  evaluateMcpRuntimePermissionEnforcement,
  mcpRuntimePermissionBlockedMessage,
  mcpRuntimePermissionEnforcementDetailText,
} from "./mcpRuntimePermissionEnforcement";
import type { McpToolDescriptor } from "./mcpToolBridge";
import type { ToolHiveInstalledServerState } from "./mcpToolRuntimeFacade";

describe("MCP runtime permission enforcement", () => {
  it("accepts exact public HTTPS resources covered by the installed ToolHive allowlist", () => {
    const enforcement = evaluateMcpRuntimePermissionEnforcement({
      permission: scraplingPermission("https://docs.python.org/3/library/json.html"),
      server: installedServer(),
      permissionProfile: permissionProfile({ allowHosts: ["docs.python.org"], allowPorts: [443] }),
      profilePath: "/tmp/profile.json",
      profileSha256: "hash123",
      expectedProfileSha256: "hash123",
      profileSha256Verified: true,
    });

    expect(enforcement).toMatchObject({
      status: "enforced",
      blockers: [],
      warnings: [],
      networkMode: "allowlist",
      allowHosts: ["docs.python.org"],
      allowPorts: [443],
      filesystemMode: "isolated",
    });
    expect(mcpRuntimePermissionEnforcementDetailText(enforcement)).toContain("Profile hash verified: yes");
  });

  it("blocks exact public HTTPS resources missing from the installed ToolHive allowlist", () => {
    const enforcement = evaluateMcpRuntimePermissionEnforcement({
      permission: scraplingPermission("https://docs.python.org/3/library/json.html"),
      server: installedServer(),
      permissionProfile: permissionProfile({ allowHosts: ["example.com"], allowPorts: [443] }),
      profilePath: "/tmp/profile.json",
      profileSha256: "hash123",
      expectedProfileSha256: "hash123",
      profileSha256Verified: true,
    });

    expect(enforcement.status).toBe("blocked");
    expect(enforcement.blockers.join(" ")).toContain("does not allow docs.python.org:443");
    expect(enforcement.deniedResources).toEqual([
      expect.objectContaining({
        kind: "network",
        host: "docs.python.org",
        port: 443,
        reason: expect.stringContaining("does not allow docs.python.org:443"),
      }),
    ]);
    expect(enforcement.repairHint).toMatchObject({
      nextToolName: "ambient_mcp_runtime_repair_describe",
      nextToolInput: {
        serverId: "scrapling",
        workloadName: "ambient-scrapling",
        failureText: expect.stringContaining("docs.python.org:443"),
      },
      profileSummary: {
        networkMode: "allowlist",
        allowHosts: ["example.com"],
        allowPorts: [443],
      },
    });
    expect(mcpRuntimePermissionBlockedMessage(enforcement)).toContain("runtime permission enforcement");
    expect(mcpRuntimePermissionBlockedMessage(enforcement)).toContain("ambient_mcp_runtime_repair_describe");
  });

  it("blocks tampered installed permission profiles before tool calls", () => {
    const enforcement = evaluateMcpRuntimePermissionEnforcement({
      permission: scraplingPermission("https://docs.python.org/3/library/json.html"),
      server: installedServer(),
      permissionProfile: permissionProfile({ allowHosts: ["docs.python.org"], allowPorts: [443] }),
      profilePath: "/tmp/profile.json",
      profileSha256: "changed",
      expectedProfileSha256: "hash123",
      profileSha256Verified: false,
    });

    expect(enforcement.status).toBe("blocked");
    expect(enforcement.blockers.join(" ")).toContain("permission profile hash changed");
  });

  it("downgrades reusable scopes for broad runtime profiles because exact host enforcement is impossible", () => {
    const enforcement = evaluateMcpRuntimePermissionEnforcement({
      permission: scraplingPermission("https://docs.python.org/3/library/json.html"),
      server: installedServer(),
      permissionProfile: permissionProfile({ broadNetwork: true, allowPorts: [443] }),
      profilePath: "/tmp/profile.json",
      profileSha256: "hash123",
      expectedProfileSha256: "hash123",
      profileSha256Verified: true,
    });

    expect(enforcement.status).toBe("broad-runtime-profile");
    expect(enforcement.reusableScopeLimit).toEqual(["thread"]);
    expect(enforcement.publicWebEgressGrantEnforced).toBe(false);
    expect(enforcement.warnings.join(" ")).toContain("broad outbound network access");
  });

  it("ignores the reviewed ToolHive descriptor loopback endpoint but blocks loopback tool arguments outside a guided bridge", () => {
    const standard = evaluateMcpRuntimePermissionEnforcement({
      permission: scraplingPermission("http://localhost:8080/admin"),
      server: installedServer(),
      permissionProfile: permissionProfile({ broadNetwork: true }),
      profilePath: "/tmp/profile.json",
      profileSha256: "hash123",
      expectedProfileSha256: "hash123",
      profileSha256Verified: true,
    });

    expect(standard.status).toBe("blocked");
    expect(standard.blockers.join(" ")).toContain("Loopback MCP tool arguments require a guided local bridge runtime");

    const guided = evaluateMcpRuntimePermissionEnforcement({
      permission: scraplingPermission("http://localhost:8080/admin"),
      server: installedServer({ sourceIdentity: { runtimeLane: "guided-local-bridge" } }),
      permissionProfile: permissionProfile({ broadNetwork: true }),
      profilePath: "/tmp/profile.json",
      profileSha256: "hash123",
      expectedProfileSha256: "hash123",
      profileSha256Verified: true,
    });

    expect(guided.status).toBe("not-applicable");
    expect(guided.blockers).toEqual([]);
  });

  it("blocks filesystem access when the installed runtime profile has no filesystem declaration", () => {
    const enforcement = evaluateMcpRuntimePermissionEnforcement({
      permission: filesystemPermission("reports/result.md"),
      server: installedServer(),
      permissionProfile: { network: { outbound: { insecure_allow_all: false } } },
      profilePath: "/tmp/profile.json",
      profileSha256: "hash123",
      expectedProfileSha256: "hash123",
      profileSha256Verified: true,
    });

    expect(enforcement.status).toBe("blocked");
    expect(enforcement.blockers.join(" ")).toContain("does not declare filesystem access");
  });

  it("enforces workspace filesystem write access from the installed runtime profile", () => {
    const readOnly = evaluateMcpRuntimePermissionEnforcement({
      permission: filesystemPermission("reports/result.md"),
      server: installedServer(),
      permissionProfile: permissionProfile({ workspaceRead: true }),
      profilePath: "/tmp/profile.json",
      profileSha256: "hash123",
      expectedProfileSha256: "hash123",
      profileSha256Verified: true,
    });

    expect(readOnly.status).toBe("blocked");
    expect(readOnly.blockers.join(" ")).toContain("does not allow workspace:reports/result.md");

    const readWrite = evaluateMcpRuntimePermissionEnforcement({
      permission: filesystemPermission("reports/result.md"),
      server: installedServer(),
      permissionProfile: permissionProfile({ workspaceRead: true, workspaceWrite: true }),
      profilePath: "/tmp/profile.json",
      profileSha256: "hash123",
      expectedProfileSha256: "hash123",
      profileSha256Verified: true,
    });

    expect(readWrite).toMatchObject({
      status: "enforced",
      blockers: [],
      filesystemMode: "allowlist",
      allowReadPaths: ["workspace:*"],
      allowWritePaths: ["workspace:*"],
    });
  });

  it("enforces reviewed ToolHive mount container paths recursively", () => {
    const read = evaluateMcpRuntimePermissionEnforcement({
      permission: filesystemPermission("/projects/filesystem-fixture/notes.txt", "inputPath"),
      server: installedServer(),
      permissionProfile: permissionProfile({
        extraMounts: [{
          path: "/tmp/ambient-filesystem-fixture",
          containerPath: "/projects/filesystem-fixture",
          mode: "read-only",
        }],
      }),
      profilePath: "/tmp/profile.json",
      profileSha256: "hash123",
      expectedProfileSha256: "hash123",
      profileSha256Verified: true,
    });

    expect(read).toMatchObject({
      status: "enforced",
      blockers: [],
      filesystemMode: "allowlist",
    });
    expect(read.allowReadPaths).toEqual(expect.arrayContaining([
      "/tmp/ambient-filesystem-fixture",
      "/tmp/ambient-filesystem-fixture/*",
      "/projects/filesystem-fixture",
      "/projects/filesystem-fixture/*",
    ]));

    const write = evaluateMcpRuntimePermissionEnforcement({
      permission: filesystemPermission("/projects/filesystem-fixture/notes.txt", "outputPath"),
      server: installedServer(),
      permissionProfile: permissionProfile({
        extraMounts: [{
          path: "/tmp/ambient-filesystem-fixture",
          containerPath: "/projects/filesystem-fixture",
          mode: "read-only",
        }],
      }),
      profilePath: "/tmp/profile.json",
      profileSha256: "hash123",
      expectedProfileSha256: "hash123",
      profileSha256Verified: true,
    });

    expect(write.status).toBe("blocked");
    expect(write.blockers.join(" ")).toContain("does not allow /projects/filesystem-fixture/notes.txt");
  });

  it("downgrades reusable scopes for broad filesystem runtime profiles", () => {
    const enforcement = evaluateMcpRuntimePermissionEnforcement({
      permission: filesystemPermission("reports/result.md"),
      server: installedServer(),
      permissionProfile: {
        network: { outbound: { insecure_allow_all: false } },
        filesystem: { insecure_allow_all: true },
      },
      profilePath: "/tmp/profile.json",
      profileSha256: "hash123",
      expectedProfileSha256: "hash123",
      profileSha256Verified: true,
    });

    expect(enforcement.status).toBe("broad-runtime-profile");
    expect(enforcement.reusableScopeLimit).toEqual(["thread"]);
    expect(enforcement.warnings.join(" ")).toContain("broad filesystem access");
  });
});

function scraplingPermission(url: string) {
  return evaluateMcpToolCallPermission({
    descriptor: scraplingDescriptor,
    toolArguments: { url },
    workspacePath: "/workspaces/project",
    projectPath: "/workspaces/project",
  });
}

function filesystemPermission(path: string, key = "outputPath") {
  return evaluateMcpToolCallPermission({
    descriptor: filesystemDescriptor,
    toolArguments: { [key]: path },
    workspacePath: "/workspaces/project",
    projectPath: "/workspaces/project",
  });
}

function permissionProfile(input: {
  broadNetwork?: boolean;
  allowHosts?: string[];
  allowPorts?: number[];
  workspaceRead?: boolean;
  workspaceWrite?: boolean;
  extraMounts?: Array<Record<string, unknown>>;
}): Record<string, unknown> {
  return {
    network: {
      outbound: {
        insecure_allow_all: input.broadNetwork === true,
        allow_host: input.allowHosts ?? [],
        allow_port: input.allowPorts ?? [],
      },
    },
    filesystem: {
      workspaceRead: input.workspaceRead === true,
      workspaceWrite: input.workspaceWrite === true,
      extraMounts: input.extraMounts ?? [],
    },
  };
}

function installedServer(overrides: Partial<ToolHiveInstalledServerState> = {}): ToolHiveInstalledServerState {
  return {
    serverId: "scrapling",
    workloadName: "ambient-scrapling",
    sourceIdentity: { runtimeLane: "standard-mcp-import" },
    permissionProfilePath: "/tmp/profile.json",
    permissionProfileSha256: "hash123",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    ...overrides,
  };
}

const scraplingDescriptor: McpToolDescriptor = {
  serverId: "scrapling",
  workloadName: "ambient-scrapling",
  toolRef: "scrapling/fetch",
  endpoint: "http://127.0.0.1:4411/mcp",
  workloadStatus: "running",
  reviewStatus: "trusted",
  descriptorHash: "descriptor-hash",
  name: "fetch",
  description: "Fetch a public HTTPS page with Scrapling.",
  inputSchema: {
    type: "object",
    properties: { url: { type: "string" } },
    required: ["url"],
  },
};

const filesystemDescriptor: McpToolDescriptor = {
  serverId: "filesystem-mcp",
  workloadName: "ambient-filesystem",
  toolRef: "filesystem-mcp/write-report",
  endpoint: "http://127.0.0.1:4413/mcp",
  workloadStatus: "running",
  reviewStatus: "trusted",
  descriptorHash: "descriptor-hash",
  name: "write-report",
  description: "Write a report file under a reviewed workspace path.",
  inputSchema: {
    type: "object",
    properties: {
      outputPath: { type: "string" },
      inputPath: { type: "string" },
    },
  },
};
