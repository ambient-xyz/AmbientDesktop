import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pluginMcpToolDescriptor } from "./desktopToolRegistry";
import { permissionGrantTargetHash } from "./permissionGrants";
import type { PluginMcpToolRegistration } from "./plugins/pluginHost";
import { workspaceInventoryConnectorDescriptor } from "./workflowConnectors";
import {
  buildWorkflowDiscoveryPolicyContext,
  classifyWorkflowDiscoveryContextRequest,
  workflowDiscoveryPolicyContextSummary,
  workflowDiscoveryProviderPolicyPayload,
} from "./workflowDiscoveryPolicy";

describe("workflowDiscoveryPolicy", () => {
  let workspacePath = "";

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-discovery-policy-"));
    await mkdir(join(workspacePath, "docs"), { recursive: true });
    await mkdir(join(workspacePath, ".ambient", "cli-packages", "imported", "pi-arxiv"), { recursive: true });
    await mkdir(join(workspacePath, "node_modules", "fixture"), { recursive: true });
    await writeFile(join(workspacePath, "docs", "brief.md"), "# Brief\n", "utf8");
    await writeFile(join(workspacePath, ".ambient", "cli-packages", "imported", "pi-arxiv", "ambient-cli.json"), "{}", "utf8");
    await writeFile(join(workspacePath, "events.csv"), "name,date\n", "utf8");
    await writeFile(join(workspacePath, ".env"), "SECRET=value\n", "utf8");
    await writeFile(join(workspacePath, "node_modules", "fixture", "data.json"), "{}", "utf8");
  });

  afterEach(async () => {
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("inspects safe base-directory metadata and excludes secrets and generated folders", () => {
    const context = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      connectorDescriptors: [workspaceInventoryConnectorDescriptor()],
      pluginRegistrations: [fixturePluginRegistration()],
      now: new Date("2026-05-02T00:00:00.000Z"),
    });

    expect(context.files.map((file) => file.path).sort()).toEqual(["docs/brief.md", "events.csv"]);
    expect(context.skippedPaths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ".env", reason: "secret-like file skipped" }),
        expect.objectContaining({ path: ".ambient", reason: "generated or dependency directory skipped" }),
        expect.objectContaining({ path: "node_modules", reason: "generated or dependency directory skipped" }),
      ]),
    );
    expect(context.connectors[0]).toMatchObject({
      connectorId: "workspace.inventory",
      accountLabels: ["Active workspace"],
      operationLabels: ["List files"],
    });
    expect(context.pluginTools[0]).toMatchObject({ toolName: "fixture_tool", pluginName: "Fixture" });
    expect(context.policyNotes.join(" ")).toContain("Connector content");

    const summary = workflowDiscoveryPolicyContextSummary(context);
    expect(summary).toContain("2 candidate files");
    expect(summary).toContain("Secret-like paths skipped: 1");
    expect(summary).toContain("Fixture tool");

    const providerPayload = workflowDiscoveryProviderPolicyPayload(context);
    expect(JSON.stringify(providerPayload)).not.toContain(".env");
    expect(providerPayload.skippedPathSummary).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: "secret-like file skipped", count: 1 })]),
    );
    expect(providerPayload.blockedAccessSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: "file_content",
          action: "prompt",
          count: 2,
        }),
      ]),
    );
  });

  it("includes only grant-approved file content excerpts in Workspace mode", () => {
    const grant = {
      id: "grant-notes",
      createdAt: "2026-05-02T00:00:00.000Z",
      updatedAt: "2026-05-02T00:00:00.000Z",
      createdBy: "user" as const,
      permissionModeAtCreation: "workspace" as const,
      scopeKind: "workflow_thread" as const,
      workflowThreadId: "workflow-thread-1",
      actionKind: "file_content_read" as const,
      targetKind: "path" as const,
      targetHash: permissionGrantTargetHash("file_content_read", "path", "docs/brief.md"),
      targetLabel: "docs/brief.md",
      source: "permission_prompt" as const,
      reason: "Allowed discovery content.",
    };

    const context = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      permissionMode: "workspace",
      workflowThreadId: "workflow-thread-1",
      threadId: "workflow-thread-1",
      grants: [grant],
      now: new Date("2026-05-02T00:00:00.000Z"),
    });

    expect(context.contentExcerpts).toEqual([
      expect.objectContaining({
        path: "docs/brief.md",
        access: "allow_by_persistent_grant",
        grantId: "grant-notes",
      }),
    ]);
    expect(context.contentExcerpts[0].excerpt).toContain("# Brief");
    expect(context.accessDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: "file_content",
          targetLabel: "events.csv",
          action: "prompt",
        }),
        expect.objectContaining({
          capability: "file_content",
          targetLabel: "docs/brief.md",
          action: "allow_by_persistent_grant",
          grantId: "grant-notes",
        }),
      ]),
    );
    expect(workflowDiscoveryProviderPolicyPayload(context).grantsUsed).toEqual([
      expect.objectContaining({ capability: "file_content", targetLabel: "docs/brief.md", grantId: "grant-notes" }),
    ]);
  });

  it("routes requested connector, browser, plugin, and shell context through policy decisions", () => {
    const context = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      permissionMode: "workspace",
      connectorDescriptors: [workspaceInventoryConnectorDescriptor()],
      pluginRegistrations: [fixturePluginRegistration()],
      requestedContextAccess: [
        { capability: "browser_network", targetKind: "browser_origin", targetLabel: "web research via https://arxiv.org" },
        { capability: "connector_content", targetKind: "connector", targetLabel: "Workspace Inventory content (List files)" },
        { capability: "connector_account_data", targetKind: "connector_account", targetLabel: "Workspace Inventory account details beyond safe labels" },
        { capability: "plugin_tool_execute", targetKind: "tool", targetLabel: "Fixture/Fixture tool" },
        { capability: "shell_command", targetKind: "shell_command_prefix", targetLabel: "shell command inspection requested by workflow discovery" },
      ],
      now: new Date("2026-05-02T00:00:00.000Z"),
    });

    expect(context.accessDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ capability: "browser_network", action: "prompt", actionKind: "browser_network" }),
        expect.objectContaining({ capability: "connector_content", action: "prompt", actionKind: "connector_content_read" }),
        expect.objectContaining({ capability: "connector_account_data", action: "prompt", actionKind: "connector_account_data_read" }),
        expect.objectContaining({ capability: "plugin_tool_execute", action: "prompt", actionKind: "plugin_tool_execute" }),
        expect.objectContaining({ capability: "shell_command", action: "prompt", actionKind: "shell_command" }),
      ]),
    );
    expect(workflowDiscoveryPolicyContextSummary(context)).toContain("Additional context access needed");
    expect(workflowDiscoveryProviderPolicyPayload(context).blockedAccessSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ capability: "browser_network", action: "prompt" }),
        expect.objectContaining({ capability: "connector_content", action: "prompt" }),
        expect.objectContaining({ capability: "plugin_tool_execute", action: "prompt" }),
      ]),
    );
  });

  it("includes approved external context evidence in provider payload and summary", () => {
    const context = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      permissionMode: "workspace",
      requestedContextAccess: [{ capability: "browser_network", targetKind: "browser_origin", targetLabel: "web research via https://arxiv.org" }],
      contextEvidence: [
        {
          id: "evidence-1",
          capability: "browser_network",
          targetLabel: "web research via https://arxiv.org",
          gatheredAt: "2026-05-03T00:00:00.000Z",
          provider: "arxiv",
          summary: "Gathered 2 arXiv results for discovery context.",
          items: [
            {
              id: "paper-1",
              title: "KV cache reuse",
              snippet: "Prefix cache reuse reduces repeated workflow-planning latency.",
              sourceLabel: "arXiv",
              sourceUrl: "https://arxiv.org/abs/2601.00001",
            },
          ],
          redacted: true,
        },
      ],
    });

    expect(workflowDiscoveryPolicyContextSummary(context)).toContain("Approved external context evidence: browser_network web research via https://arxiv.org (1 item).");
    expect(workflowDiscoveryProviderPolicyPayload(context).contextEvidence).toEqual([
      expect.objectContaining({
        provider: "arxiv",
        summary: "Gathered 2 arXiv results for discovery context.",
      }),
    ]);
  });

  it("uses Full Access as an audited discovery bypass without allowing mutations", () => {
    const context = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      permissionMode: "full-access",
      workflowThreadId: "workflow-thread-1",
      now: new Date("2026-05-02T00:00:00.000Z"),
    });

    expect(context.contentExcerpts.map((excerpt) => excerpt.path).sort()).toEqual(["docs/brief.md", "events.csv"]);
    expect(context.accessDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: "file_content",
          action: "allow_by_full_access",
          decisionSource: "allowed_by_full_access",
        }),
      ]),
    );

    expect(
      classifyWorkflowDiscoveryContextRequest({
        permissionMode: "full-access",
        stage: "initial_discovery",
        workflowThreadId: "workflow-thread-1",
        threadId: "workflow-thread-1",
        projectPath: workspacePath,
        workspacePath,
        capability: "remote_mutation",
        targetLabel: "send email",
        targetKind: "mutation_policy",
      }),
    ).toMatchObject({
      action: "deny",
      decisionSource: "denied_by_policy",
    });
  });
});

function fixturePluginRegistration(): PluginMcpToolRegistration {
  const descriptor = pluginMcpToolDescriptor({
    registeredName: "fixture_tool",
    label: "Fixture tool",
    description: "Fixture plugin tool.",
    promptSnippet: "fixture_tool: Fixture plugin tool.",
    promptGuidelines: [],
    parameters: { type: "object", properties: {}, additionalProperties: false },
  });
  return {
    registeredName: "fixture_tool",
    originalName: "fixture_original",
    label: descriptor.label,
    description: descriptor.description,
    promptSnippet: descriptor.promptSnippet,
    promptGuidelines: descriptor.promptGuidelines,
    parameters: descriptor.inputSchema,
    descriptor,
    launchPlan: {
      pluginId: "plugin-1",
      pluginName: "Fixture",
      pluginVersion: "1.0.0",
      pluginFingerprint: "fixture-fingerprint",
      serverName: "server",
      cwd: workspacePathSafeCwd(),
      command: "node",
      args: [],
      envKeys: [],
      enabled: true,
      startable: true,
    },
    tool: {
      pluginId: "plugin-1",
      pluginName: "Fixture",
      serverName: "server",
      name: "fixture_original",
    },
  };
}

function workspacePathSafeCwd(): string {
  return process.cwd();
}
