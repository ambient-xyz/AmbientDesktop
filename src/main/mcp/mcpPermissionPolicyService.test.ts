import { describe, expect, it } from "vitest";
import {
  evaluateMcpToolCallPermission,
  mcpPermissionGrantIdentityHash,
  mcpPermissionGrantIdsForDescriptorDrift,
  mcpPermissionPolicyBlockedMessage,
  mcpPermissionPolicyDetailText,
  mcpPermissionPolicyPromptCopy,
  mcpPermissionPolicyPromptCopyText,
  planMcpPermissionPromptGrant,
} from "./mcpPermissionPolicyService";
import { permissionGrantTargetHash } from "../permissions/permissionGrants";
import type { AmbientPermissionGrant } from "../../shared/permissionTypes";
import type { McpToolDescriptor } from "./mcpToolBridge";

describe("MCP permission policy service", () => {
  it("normalizes public web tool calls into host-scoped grant identities", () => {
    const first = evaluateMcpToolCallPermission({
      descriptor: scraplingDescriptor,
      toolArguments: { url: "https://docs.python.org/3/library/json.html", mode: "text" },
      workspacePath: "/workspaces/project",
      projectPath: "/workspaces/project",
    });
    const sameHostDifferentPath = evaluateMcpToolCallPermission({
      descriptor: scraplingDescriptor,
      toolArguments: { url: "https://docs.python.org/3/tutorial/index.html" },
      workspacePath: "/workspaces/project",
      projectPath: "/workspaces/project",
    });
    const differentHost = evaluateMcpToolCallPermission({
      descriptor: scraplingDescriptor,
      toolArguments: { url: "https://example.com/" },
      workspacePath: "/workspaces/project",
      projectPath: "/workspaces/project",
    });

    expect(first.hardDenials).toEqual([]);
    expect(first.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "network", action: "connect", label: "docs.python.org:443" }),
      expect.objectContaining({ kind: "tool-call", label: "scrapling-github-server-json/fetch" }),
    ]));
    expect(first.reusableScopes).toEqual(["thread", "project", "workspace"]);
    expect(first.grantTargetIdentity).toBe(sameHostDifferentPath.grantTargetIdentity);
    expect(first.grantTargetIdentity).not.toBe(differentHost.grantTargetIdentity);
    expect(mcpPermissionGrantIdentityHash(first.grantTargetIdentity)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("ties grants to descriptor hash and reports local bridge endpoints", () => {
    const first = evaluateMcpToolCallPermission({
      descriptor: ghidraDescriptor,
      toolArguments: { functionName: "main" },
      workspacePath: "/workspaces/reverse",
      projectPath: "/workspaces/reverse",
    });
    const drifted = evaluateMcpToolCallPermission({
      descriptor: { ...ghidraDescriptor, descriptorHash: "hash456" },
      toolArguments: { functionName: "main" },
      workspacePath: "/workspaces/reverse",
      projectPath: "/workspaces/reverse",
    });

    expect(first.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "local-endpoint", label: "127.0.0.1:8081" }),
    ]));
    expect(first.grantTargetIdentity).not.toBe(drifted.grantTargetIdentity);
    expect(mcpPermissionPolicyDetailText(first)).toContain("local-endpoint:connect 127.0.0.1:8081");
  });

  it("blocks metadata, private network, file URL, insecure public HTTP, socket/IPC, and raw secret arguments", () => {
    const evaluation = evaluateMcpToolCallPermission({
      descriptor: scraplingDescriptor,
      toolArguments: {
        metadataUrl: "http://169.254.169.254/latest/meta-data",
        privateUrl: "https://192.168.1.10/admin",
        publicHttp: "http://example.com/",
        fileUrl: "file://<local-user>/.ssh/id_rsa",
        socketUrl: "unix:///var/run/docker.sock",
        pipePath: "\\\\.\\pipe\\docker_engine",
        apiKey: "sk-test-secret-value-1234567890",
      },
      workspacePath: "/workspaces/project",
    });

    expect(evaluation.hardDenials.map((denial) => denial.code)).toEqual(expect.arrayContaining([
      "mcp.denied_network_target",
      "mcp.file_url_argument",
      "mcp.insecure_public_http",
      "mcp.socket_ipc_argument",
      "mcp.raw_secret_argument",
    ]));
    expect(evaluation.reusableScopes).toEqual([]);
    expect(mcpPermissionPolicyBlockedMessage(evaluation)).toContain("MCP tool call blocked");
    expect(mcpPermissionPolicyBlockedMessage(evaluation)).toContain("Blocked boundary");
    expect(mcpPermissionPolicyBlockedMessage(evaluation)).toContain("Public-web grants never include localhost");
  });

  it("builds user-facing permission prompt copy with groups and output guardrails", () => {
    const evaluation = evaluateMcpToolCallPermission({
      descriptor: scraplingDescriptor,
      toolArguments: { url: "https://docs.python.org/3/library/json.html" },
      workspacePath: "/workspaces/project",
      projectPath: "/workspaces/project",
    });

    const copy = mcpPermissionPolicyPromptCopy(evaluation);
    const text = mcpPermissionPolicyPromptCopyText(evaluation);

    expect(copy.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "public-web",
        label: "Public web access",
        resources: ["docs.python.org:443"],
      }),
      expect.objectContaining({
        kind: "tool",
        label: "MCP tool call",
      }),
    ]));
    expect(copy.hardBoundaries.join(" ")).toContain("file URLs");
    expect(copy.outputGuardrails.join(" ")).toContain("materializes the complete output");
    expect(text).toContain("MCP permission summary");
    expect(text).toContain("Response and download guardrails");
  });

  it("classifies filesystem, persistent-store, external-account, and Ambient secret-ref resources", () => {
    const evaluation = evaluateMcpToolCallPermission({
      descriptor: githubMemoryDescriptor,
      toolArguments: {
        outputPath: "reports/result.md",
        token: `ambient-secret-ref:v1:${"a".repeat(64)}`,
      },
      workspacePath: "/workspaces/project",
      projectPath: "/workspaces/project",
    });

    expect(evaluation.hardDenials).toEqual([]);
    expect(evaluation.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "filesystem", action: "write", label: "workspace:reports/result.md" }),
      expect.objectContaining({ kind: "persistent-store", action: "write" }),
      expect.objectContaining({ kind: "external-account", action: "connect" }),
      expect.objectContaining({ kind: "secret", action: "use-secret" }),
    ]));
    expect(evaluation.recommendedResponse).toBe("always_thread");
    expect(evaluation.reusableScopes).toEqual(["thread", "project"]);
    expect(evaluation.grantConditions.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "filesystem", action: "write" }),
    ]));
  });

  it("classifies process execution descriptors and command-shaped arguments without exposing raw commands", () => {
    const evaluation = evaluateMcpToolCallPermission({
      descriptor: processRunnerDescriptor,
      toolArguments: { command: "git status --short" },
      workspacePath: "/workspaces/project",
      projectPath: "/workspaces/project",
    });

    expect(evaluation.hardDenials).toEqual([]);
    expect(evaluation.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "runtime",
        action: "execute",
        label: "process-runner-mcp/run-command process execution",
        identity: "runtime:process:process-runner-mcp:run-command",
        risk: "high",
      }),
      expect.objectContaining({
        kind: "runtime",
        action: "execute",
        label: "process-runner-mcp/run-command runtime argument $.command",
        risk: "high",
      }),
    ]));
    expect(evaluation.recommendedResponse).toBe("always_thread");
    expect(evaluation.reusableScopes).toEqual(["thread", "project"]);
    expect(mcpPermissionPolicyDetailText(evaluation)).toContain("runtime:execute process-runner-mcp/run-command process execution");
    expect(mcpPermissionPolicyDetailText(evaluation)).not.toContain("git status --short");
    expect(JSON.stringify(evaluation.grantConditions)).not.toContain("git status --short");
  });

  it("classifies browser automation descriptors as high-risk runtime resources alongside public-web targets", () => {
    const evaluation = evaluateMcpToolCallPermission({
      descriptor: browserAutomationDescriptor,
      toolArguments: { url: "https://example.com/dashboard" },
      workspacePath: "/workspaces/project",
      projectPath: "/workspaces/project",
    });

    expect(evaluation.hardDenials).toEqual([]);
    expect(evaluation.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "runtime",
        action: "execute",
        label: "browser-automation-mcp/screenshot-page browser runtime",
        identity: "runtime:browser:browser-automation-mcp:screenshot-page",
        risk: "high",
      }),
      expect.objectContaining({ kind: "network", action: "connect", label: "example.com:443" }),
    ]));
    expect(evaluation.reusableScopes).toEqual(["thread", "project"]);
    expect(planMcpPermissionPromptGrant({
      evaluation,
      existingGrants: [],
      context: { threadId: "thread-1", projectPath: "/workspaces/project", workspacePath: "/workspaces/project" },
    }).profile).toBe("exact");
  });

  it("keeps public web grants host-specific before repeated compatible approvals", () => {
    const evaluation = evaluateMcpToolCallPermission({
      descriptor: scraplingDescriptor,
      toolArguments: { url: "https://docs.python.org/3/library/json.html" },
      workspacePath: "/workspaces/project",
      projectPath: "/workspaces/project",
    });

    const plan = planMcpPermissionPromptGrant({
      evaluation,
      existingGrants: [],
      context: { threadId: "thread-1", projectPath: "/workspaces/project", workspacePath: "/workspaces/project" },
    });

    expect(plan.profile).toBe("exact");
    expect(plan.grantTargetIdentity).toBe(evaluation.grantTargetIdentity);
    expect(plan.grantConditions).toBe(evaluation.grantConditions);
  });

  it("suggests a public-web grant only after repeated host-specific approvals for the same descriptor", () => {
    const first = scraplingEvaluation("https://docs.python.org/3/library/json.html");
    const second = scraplingEvaluation("https://developer.mozilla.org/en-US/docs/Web/JavaScript");
    const third = scraplingEvaluation("https://example.com/");
    const fourth = scraplingEvaluation("https://www.rfc-editor.org/rfc/rfc9110.html");

    const plan = planMcpPermissionPromptGrant({
      evaluation: fourth,
      existingGrants: [
        grantFromEvaluation(first, { id: "grant-python" }),
        grantFromEvaluation(second, { id: "grant-mdn" }),
        grantFromEvaluation(third, { id: "grant-example" }),
      ],
      context: { threadId: "thread-1", projectPath: "/workspaces/project", workspacePath: "/workspaces/project" },
    });

    expect(plan.profile).toBe("public-web-egress");
    expect(plan.grantTargetIdentity).not.toBe(fourth.grantTargetIdentity);
    expect(plan.grantTargetIdentity).toContain("profile:public-web-egress");
    expect(plan.detailText).toContain("MCP reusable grant suggestion");
    expect(plan.detailText).toContain("public web access");
    expect(plan.detailText).toContain("docs.python.org:443");
    expect(plan.detailText).toContain("Large responses still use bounded previews");
    expect(plan.grantConditions).toMatchObject({
      profile: "public-web-egress",
      observedPriorHosts: ["developer.mozilla.org:443", "docs.python.org:443", "example.com:443"],
    });
    expect(plan.grantConditions.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "network", identity: "network:https:*", label: "Public HTTPS hosts" }),
    ]));
    expect(plan.reusableScopes).toEqual(["thread", "project", "workspace"]);
  });

  it("uses an existing public-web grant identity for later public hosts", () => {
    const first = scraplingEvaluation("https://docs.python.org/3/library/json.html");
    const second = scraplingEvaluation("https://developer.mozilla.org/en-US/docs/Web/JavaScript");
    const third = scraplingEvaluation("https://example.com/");
    const fourth = scraplingEvaluation("https://www.rfc-editor.org/rfc/rfc9110.html");
    const broad = planMcpPermissionPromptGrant({
      evaluation: fourth,
      existingGrants: [
        grantFromEvaluation(first, { id: "grant-python" }),
        grantFromEvaluation(second, { id: "grant-mdn" }),
        grantFromEvaluation(third, { id: "grant-example" }),
      ],
      context: { threadId: "thread-1", projectPath: "/workspaces/project", workspacePath: "/workspaces/project" },
    });
    const later = scraplingEvaluation("https://www.iana.org/domains/reserved");

    const plan = planMcpPermissionPromptGrant({
      evaluation: later,
      existingGrants: [grantFromPlan(broad, { id: "grant-public-web" })],
      context: { threadId: "thread-1", projectPath: "/workspaces/project", workspacePath: "/workspaces/project" },
    });

    expect(plan.profile).toBe("public-web-egress");
    expect(plan.grantTargetIdentity).toBe(broad.grantTargetIdentity);
    expect(plan.detailText).toBeUndefined();
  });

  it("suggests a local-endpoint grant only after repeated exact loopback approvals for the same descriptor", () => {
    const first = ghidraEndpointEvaluation("http://127.0.0.1:8080/status");
    const second = ghidraEndpointEvaluation("http://127.0.0.1:8081/sse");
    const third = ghidraEndpointEvaluation("http://localhost:8082/tools");

    const plan = planMcpPermissionPromptGrant({
      evaluation: third,
      existingGrants: [
        grantFromEvaluation(first, { id: "grant-ghidra-http", projectPath: "/workspaces/reverse", workspacePath: "/workspaces/reverse" }),
        grantFromEvaluation(second, { id: "grant-ghidra-sse", projectPath: "/workspaces/reverse", workspacePath: "/workspaces/reverse" }),
      ],
      context: { threadId: "thread-1", projectPath: "/workspaces/reverse", workspacePath: "/workspaces/reverse" },
    });

    expect(plan.profile).toBe("local-endpoint");
    expect(plan.grantTargetIdentity).toContain("profile:local-endpoint");
    expect(plan.detailText).toContain("prior exact loopback endpoint grants");
    expect(plan.detailText).toContain("127.0.0.1:8080");
    expect(plan.grantConditions).toMatchObject({
      profile: "local-endpoint",
      observedPriorEndpoints: ["127.0.0.1:8080", "127.0.0.1:8081"],
    });
    expect(plan.grantConditions.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "local-endpoint", identity: "local-endpoint:loopback:*", label: "Reviewed loopback endpoints" }),
    ]));
    expect(plan.reusableScopes).toEqual(["thread", "project", "workspace"]);
  });

  it("uses an existing local-endpoint grant identity for later loopback endpoints", () => {
    const first = ghidraEndpointEvaluation("http://127.0.0.1:8080/status");
    const second = ghidraEndpointEvaluation("http://127.0.0.1:8081/sse");
    const third = ghidraEndpointEvaluation("http://localhost:8082/tools");
    const broad = planMcpPermissionPromptGrant({
      evaluation: third,
      existingGrants: [
        grantFromEvaluation(first, { id: "grant-ghidra-http", projectPath: "/workspaces/reverse", workspacePath: "/workspaces/reverse" }),
        grantFromEvaluation(second, { id: "grant-ghidra-sse", projectPath: "/workspaces/reverse", workspacePath: "/workspaces/reverse" }),
      ],
      context: { threadId: "thread-1", projectPath: "/workspaces/reverse", workspacePath: "/workspaces/reverse" },
    });
    const later = ghidraEndpointEvaluation("http://127.0.0.1:8083/decompile");

    const plan = planMcpPermissionPromptGrant({
      evaluation: later,
      existingGrants: [grantFromPlan(broad, { id: "grant-ghidra-local-endpoints", projectPath: "/workspaces/reverse", workspacePath: "/workspaces/reverse" })],
      context: { threadId: "thread-1", projectPath: "/workspaces/reverse", workspacePath: "/workspaces/reverse" },
    });

    expect(plan.profile).toBe("local-endpoint");
    expect(plan.grantTargetIdentity).toBe(broad.grantTargetIdentity);
    expect(plan.detailText).toBeUndefined();
  });

  it("suggests a filesystem-directory grant only after repeated same-directory approvals", () => {
    const first = filesystemEvaluation("reports/a.md");
    const second = filesystemEvaluation("reports/b.md");
    const third = filesystemEvaluation("reports/c.md");
    const fourth = filesystemEvaluation("reports/d.md");

    const beforeThreshold = planMcpPermissionPromptGrant({
      evaluation: third,
      existingGrants: [
        grantFromEvaluation(first, { id: "grant-report-a" }),
        grantFromEvaluation(second, { id: "grant-report-b" }),
      ],
      context: { threadId: "thread-1", projectPath: "/workspaces/project", workspacePath: "/workspaces/project" },
    });
    expect(beforeThreshold.profile).toBe("exact");

    const plan = planMcpPermissionPromptGrant({
      evaluation: fourth,
      existingGrants: [
        grantFromEvaluation(first, { id: "grant-report-a" }),
        grantFromEvaluation(second, { id: "grant-report-b" }),
        grantFromEvaluation(third, { id: "grant-report-c" }),
      ],
      context: { threadId: "thread-1", projectPath: "/workspaces/project", workspacePath: "/workspaces/project" },
    });

    expect(plan.profile).toBe("filesystem-directory");
    expect(plan.grantTargetIdentity).toContain("profile:filesystem-directory");
    expect(plan.detailText).toContain("prior write grants in workspace:reports");
    expect(plan.grantConditions).toMatchObject({
      profile: "filesystem-directory",
      filesystemAction: "write",
      filesystemDirectory: "workspace:reports",
      observedPriorPaths: ["workspace:reports/a.md", "workspace:reports/b.md", "workspace:reports/c.md"],
    });
    expect(plan.grantConditions.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "filesystem", action: "write", identity: "filesystem:write:workspace:reports:*", label: "workspace:reports/*" }),
    ]));
    expect(plan.reusableScopes).toEqual(["thread", "project", "workspace"]);
  });

  it("keeps filesystem directory grants action- and directory-specific", () => {
    const first = filesystemEvaluation("reports/a.md");
    const second = filesystemEvaluation("reports/b.md");
    const third = filesystemEvaluation("reports/c.md");
    const broad = planMcpPermissionPromptGrant({
      evaluation: filesystemEvaluation("reports/d.md"),
      existingGrants: [
        grantFromEvaluation(first, { id: "grant-report-a" }),
        grantFromEvaluation(second, { id: "grant-report-b" }),
        grantFromEvaluation(third, { id: "grant-report-c" }),
      ],
      context: { threadId: "thread-1", projectPath: "/workspaces/project", workspacePath: "/workspaces/project" },
    });

    const sameDirectory = planMcpPermissionPromptGrant({
      evaluation: filesystemEvaluation("reports/e.md"),
      existingGrants: [grantFromPlan(broad, { id: "grant-report-dir" })],
      context: { threadId: "thread-1", projectPath: "/workspaces/project", workspacePath: "/workspaces/project" },
    });
    const differentDirectory = planMcpPermissionPromptGrant({
      evaluation: filesystemEvaluation("exports/e.md"),
      existingGrants: [grantFromPlan(broad, { id: "grant-report-dir" })],
      context: { threadId: "thread-1", projectPath: "/workspaces/project", workspacePath: "/workspaces/project" },
    });
    const readAction = planMcpPermissionPromptGrant({
      evaluation: filesystemEvaluation("reports/e.md", "inputPath"),
      existingGrants: [grantFromPlan(broad, { id: "grant-report-dir" })],
      context: { threadId: "thread-1", projectPath: "/workspaces/project", workspacePath: "/workspaces/project" },
    });

    expect(sameDirectory.profile).toBe("filesystem-directory");
    expect(sameDirectory.grantTargetIdentity).toBe(broad.grantTargetIdentity);
    expect(differentDirectory.profile).toBe("exact");
    expect(readAction.profile).toBe("exact");
  });

  it("suppresses public-web reusable grants when runtime enforcement cannot enforce public-web boundaries", () => {
    const first = scraplingEvaluation("https://docs.python.org/3/library/json.html");
    const second = scraplingEvaluation("https://developer.mozilla.org/en-US/docs/Web/JavaScript");
    const third = scraplingEvaluation("https://example.com/");
    const fourth = scraplingEvaluation("https://www.rfc-editor.org/rfc/rfc9110.html");

    const plan = planMcpPermissionPromptGrant({
      evaluation: fourth,
      existingGrants: [
        grantFromEvaluation(first, { id: "grant-python" }),
        grantFromEvaluation(second, { id: "grant-mdn" }),
        grantFromEvaluation(third, { id: "grant-example" }),
      ],
      runtime: {
        publicWebEgressGrantEnforced: false,
        reusableScopeLimit: ["thread"],
      },
      context: { threadId: "thread-1", projectPath: "/workspaces/project", workspacePath: "/workspaces/project" },
    });

    expect(plan.profile).toBe("exact");
    expect(plan.grantTargetIdentity).toBe(fourth.grantTargetIdentity);
    expect(plan.reusableScopes).toEqual(["thread"]);
  });

  it("finds active MCP grants tied to the previous descriptor hash after drift", () => {
    const first = scraplingEvaluation("https://docs.python.org/3/library/json.html");
    const second = scraplingEvaluation("https://developer.mozilla.org/en-US/docs/Web/JavaScript");
    const third = scraplingEvaluation("https://example.com/");
    const fourth = scraplingEvaluation("https://www.rfc-editor.org/rfc/rfc9110.html");
    const broad = planMcpPermissionPromptGrant({
      evaluation: fourth,
      existingGrants: [
        grantFromEvaluation(first, { id: "grant-python" }),
        grantFromEvaluation(second, { id: "grant-mdn" }),
        grantFromEvaluation(third, { id: "grant-example" }),
      ],
      context: { threadId: "thread-1", projectPath: "/workspaces/project", workspacePath: "/workspaces/project" },
    });
    const currentDescriptorGrant = grantFromEvaluation(evaluateMcpToolCallPermission({
      descriptor: { ...scraplingDescriptor, descriptorHash: "hash456" },
      toolArguments: { url: "https://docs.python.org/3/library/json.html" },
      workspacePath: "/workspaces/project",
      projectPath: "/workspaces/project",
    }), { id: "grant-current" });

    const grantIds = mcpPermissionGrantIdsForDescriptorDrift({
      grants: [
        grantFromEvaluation(first, { id: "grant-old-host" }),
        grantFromPlan(broad, { id: "grant-old-public-web" }),
        currentDescriptorGrant,
        grantFromEvaluation(first, { id: "grant-revoked", revokedAt: "2026-05-02T00:00:00.000Z" }),
        grantFromEvaluation(first, { id: "grant-other-server", conditions: { ...first.grantConditions, subject: { ...first.subject, serverId: "other-server" } } }),
      ],
      serverId: "scrapling-github-server-json",
      workloadName: "ambient-scrapling",
      previousDescriptorHash: "hash123",
      descriptorHash: "hash456",
    });

    expect(grantIds).toEqual(["grant-old-host", "grant-old-public-web"]);
  });
});

function scraplingEvaluation(url: string) {
  return evaluateMcpToolCallPermission({
    descriptor: scraplingDescriptor,
    toolArguments: { url },
    workspacePath: "/workspaces/project",
    projectPath: "/workspaces/project",
  });
}

function ghidraEndpointEvaluation(endpoint: string) {
  return evaluateMcpToolCallPermission({
    descriptor: { ...ghidraDescriptor, endpoint },
    toolArguments: { functionName: "main" },
    workspacePath: "/workspaces/reverse",
    projectPath: "/workspaces/reverse",
  });
}

function filesystemEvaluation(path: string, key = "outputPath") {
  return evaluateMcpToolCallPermission({
    descriptor: filesystemDescriptor,
    toolArguments: { [key]: path },
    workspacePath: "/workspaces/project",
    projectPath: "/workspaces/project",
  });
}

function grantFromEvaluation(
  evaluation: ReturnType<typeof evaluateMcpToolCallPermission>,
  overrides: Partial<AmbientPermissionGrant> = {},
): AmbientPermissionGrant {
  return grantFromPlan({
    grantTargetLabel: evaluation.grantTargetLabel,
    grantTargetIdentity: evaluation.grantTargetIdentity,
    grantConditions: evaluation.grantConditions,
  }, overrides);
}

function grantFromPlan(
  plan: { grantTargetLabel: string; grantTargetIdentity: string; grantConditions: Record<string, unknown> },
  overrides: Partial<AmbientPermissionGrant> = {},
): AmbientPermissionGrant {
  return {
    id: "grant",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    createdBy: "user",
    permissionModeAtCreation: "workspace",
    scopeKind: "workspace",
    workspacePath: "/workspaces/project",
    actionKind: "plugin_tool_execute",
    targetKind: "tool",
    targetHash: permissionGrantTargetHash("plugin_tool_execute", "tool", plan.grantTargetIdentity),
    targetLabel: plan.grantTargetLabel,
    conditions: plan.grantConditions,
    source: "permission_prompt",
    reason: "Allowed from prompt",
    ...overrides,
  };
}

const scraplingDescriptor: McpToolDescriptor = {
  serverId: "scrapling-github-server-json",
  workloadName: "ambient-scrapling",
  toolRef: "scrapling-github-server-json/fetch",
  endpoint: "http://127.0.0.1:4411/mcp",
  workloadStatus: "running",
  reviewStatus: "trusted",
  descriptorHash: "hash123",
  name: "fetch",
  description: "Fetch a public HTTPS page with Scrapling.",
  inputSchema: {
    type: "object",
    properties: { url: { type: "string" }, mode: { type: "string" } },
    required: ["url"],
  },
};

const ghidraDescriptor: McpToolDescriptor = {
  serverId: "ghidra-mcp",
  workloadName: "ambient-ghidra",
  toolRef: "ghidra-mcp/list-functions",
  endpoint: "http://127.0.0.1:8081/sse",
  workloadStatus: "registered-local-bridge",
  reviewStatus: "trusted",
  descriptorHash: "hash123",
  name: "list-functions",
  description: "Read function metadata from a user-run Ghidra bridge.",
  inputSchema: { type: "object", properties: { functionName: { type: "string" } } },
};

const githubMemoryDescriptor: McpToolDescriptor = {
  serverId: "github-memory-mcp",
  workloadName: "ambient-github-memory",
  toolRef: "github-memory-mcp/store-issue-summary",
  endpoint: "http://127.0.0.1:4412/mcp",
  workloadStatus: "running",
  reviewStatus: "trusted",
  descriptorHash: "hash123",
  name: "store-issue-summary",
  description: "Use GitHub account data and store a vector memory record for later retrieval.",
  inputSchema: {
    type: "object",
    properties: {
      outputPath: { type: "string" },
      token: { type: "string" },
    },
  },
};

const filesystemDescriptor: McpToolDescriptor = {
  serverId: "filesystem-mcp",
  workloadName: "ambient-filesystem",
  toolRef: "filesystem-mcp/write-report",
  endpoint: "http://127.0.0.1:4413/mcp",
  workloadStatus: "running",
  reviewStatus: "trusted",
  descriptorHash: "hash123",
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

const processRunnerDescriptor: McpToolDescriptor = {
  serverId: "process-runner-mcp",
  workloadName: "ambient-process-runner",
  toolRef: "process-runner-mcp/run-command",
  endpoint: "http://127.0.0.1:4414/mcp",
  workloadStatus: "running",
  reviewStatus: "trusted",
  descriptorHash: "hash123",
  name: "run-command",
  description: "Execute reviewed shell commands in a ToolHive-contained subprocess.",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string" },
      cwd: { type: "string" },
    },
    required: ["command"],
  },
};

const browserAutomationDescriptor: McpToolDescriptor = {
  serverId: "browser-automation-mcp",
  workloadName: "ambient-browser-automation",
  toolRef: "browser-automation-mcp/screenshot-page",
  endpoint: "http://127.0.0.1:4415/mcp",
  workloadStatus: "running",
  reviewStatus: "trusted",
  descriptorHash: "hash123",
  name: "screenshot-page",
  description: "Use Playwright with a headless Chromium browser to open pages and capture screenshots.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string" },
      selector: { type: "string" },
    },
    required: ["url"],
  },
};
