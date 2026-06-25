import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AmbientPermissionGrant, CreateAmbientPermissionGrantInput, PermissionRequest } from "../../shared/permissionTypes";
import { googleWorkspaceGrantTargetIdentityCondition } from "../../shared/googleWorkspaceGrantTargets";
import { createLocalFolderAllowlistGrantInput } from "./localFolderAllowlistGrants";
import {
  enrichPermissionRequest,
  findMatchingPermissionGrant,
  grantInputFromPromptResponse,
  permissionGrantTargetHash,
  resolvePermissionWithGrants,
} from "./permissionGrants";

const baseContext = {
  permissionMode: "workspace" as const,
  threadId: "thread-1",
  workflowThreadId: "workflow-1",
  projectPath: "/workspaces/project",
  workspacePath: "/workspaces/project/app",
};

function request(overrides: Partial<Omit<PermissionRequest, "id">> = {}): Omit<PermissionRequest, "id"> {
  return {
    threadId: "thread-1",
    toolName: "bash",
    title: "Allow command?",
    message: "Review the command",
    detail: "npm test",
    risk: "workspace-command",
    ...overrides,
  };
}

function grant(overrides: Partial<AmbientPermissionGrant> = {}): AmbientPermissionGrant {
  const enriched = enrichPermissionRequest(request(), baseContext);
  return {
    id: "grant-1",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    createdBy: "user",
    permissionModeAtCreation: "workspace",
    scopeKind: "workspace",
    workspacePath: baseContext.workspacePath,
    actionKind: enriched.grantActionKind!,
    targetKind: enriched.grantTargetKind!,
    targetHash: enriched.grantTargetHash!,
    targetLabel: enriched.grantTargetLabel!,
    source: "permission_prompt",
    reason: "Allowed from prompt",
    ...overrides,
  };
}

function localFolderGrant(
  folderPath: string,
  threadId: string,
  overrides: Partial<AmbientPermissionGrant> = {},
): AmbientPermissionGrant {
  const input = createLocalFolderAllowlistGrantInput({
    folderPath,
    threadId,
    workspacePath: baseContext.workspacePath,
    permissionMode: "workspace",
  });
  return {
    id: "folder-grant",
    createdAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z",
    ...input,
    createdBy: input.createdBy ?? "user",
    source: input.source ?? "settings",
    ...overrides,
  };
}

describe("permission grants", () => {
  it("enriches permission prompts with reusable scopes and stable grant targets", () => {
    const enriched = enrichPermissionRequest(request(), baseContext);

    expect(enriched.reusableScopes).toEqual(["thread", "workflow_thread", "project", "workspace"]);
    expect(enriched.grantActionKind).toBe("shell_command");
    expect(enriched.grantTargetKind).toBe("shell_command_prefix");
    expect(enriched.grantTargetLabel).toBe("npm test");
    expect(enriched.grantTargetHash).toBe(permissionGrantTargetHash("shell_command", "shell_command_prefix", "npm test"));
  });

  it("limits sensitive grants to thread-level scopes by default", () => {
    const secret = enrichPermissionRequest(request({ risk: "secret-path", detail: "/Users/example/.ssh/id_rsa" }), baseContext);
    const login = enrichPermissionRequest(request({ risk: "browser-login", detail: "https://example.com" }), baseContext);
    const privileged = enrichPermissionRequest(request({ risk: "privileged-action", toolName: "ambient_privileged_action_request" }), baseContext);

    expect(secret.reusableScopes).toEqual(["thread", "workflow_thread"]);
    expect(login.reusableScopes).toEqual(["thread", "workflow_thread"]);
    expect(privileged.reusableScopes).toEqual([]);
    expect(privileged.grantActionKind).toBe("plugin_tool_execute");
    expect(privileged.grantTargetKind).toBe("tool");
  });

  it("uses stable grant targets for repeated browser profile and control prompts", () => {
    const profileNav = enrichPermissionRequest(
      request({ toolName: "browser_nav", risk: "browser-profile", detail: "file:///workspace/index.html" }),
      baseContext,
    );
    const profileEval = enrichPermissionRequest(
      request({ toolName: "browser_eval", risk: "browser-profile", detail: "document.body.innerText" }),
      baseContext,
    );
    const controlEval = enrichPermissionRequest(
      request({ toolName: "browser_eval", risk: "browser-control", detail: "document.getElementById('start').click()" }),
      baseContext,
    );
    const controlScreenshot = enrichPermissionRequest(
      request({ toolName: "browser_screenshot", risk: "browser-control", detail: "current viewport" }),
      baseContext,
    );

    expect(profileNav).toMatchObject({
      grantActionKind: "browser_profile",
      grantTargetKind: "risk",
      grantTargetLabel: "copied-chrome-profile",
    });
    expect(profileEval.grantTargetHash).toBe(profileNav.grantTargetHash);

    expect(controlEval).toMatchObject({
      grantActionKind: "browser_control",
      grantTargetKind: "risk",
      grantTargetLabel: "browser-page-control",
    });
    expect(controlScreenshot.grantTargetHash).toBe(controlEval.grantTargetHash);
  });

  it("uses a reusable grant target for loopback network proof commands", () => {
    const serverProof = enrichPermissionRequest(
      request({
        risk: "network-command",
        detail: "python3 -m http.server 8742 &>/dev/null &\necho \"Server PID: $!\"\nsleep 1\ncurl -s http://localhost:8742/ | head -20",
      }),
      baseContext,
    );
    const curlProbe = enrichPermissionRequest(
      request({
        risk: "network-command",
        detail: "lsof -i :8765 2>/dev/null; sleep 1; curl -s http://127.0.0.1:8765/ | head -5",
      }),
      baseContext,
    );
    const external = enrichPermissionRequest(
      request({
        risk: "network-command",
        detail: "curl -s https://example.com/ | head -5",
      }),
      baseContext,
    );

    expect(serverProof).toMatchObject({
      grantActionKind: "shell_command",
      grantTargetKind: "shell_command_prefix",
      grantTargetLabel: "loopback shell network commands",
    });
    expect(curlProbe.grantTargetHash).toBe(serverProof.grantTargetHash);
    expect(external.grantTargetHash).not.toBe(serverProof.grantTargetHash);
    expect(external.grantTargetLabel).toBe("curl -s https://example.com/ | head -5");
  });

  it("matches grants only inside their scope", () => {
    const matching = grant();

    expect(findMatchingPermissionGrant([matching], request(), baseContext)?.id).toBe("grant-1");
    expect(
      findMatchingPermissionGrant([matching], request(), {
        ...baseContext,
        workspacePath: "/other/workspace",
      }),
    ).toBeUndefined();
    expect(findMatchingPermissionGrant([grant({ revokedAt: "2026-05-02T00:00:00.000Z" })], request(), baseContext)).toBeUndefined();
    expect(
      findMatchingPermissionGrant([grant({ expiresAt: "2026-04-30T00:00:00.000Z" })], request(), baseContext, new Date("2026-05-01T00:00:00.000Z")),
    ).toBeUndefined();
  });

  it("matches ordinary grants only when grant conditions are equivalent", () => {
    const conditions = {
      provider: "google.workspace.cli",
      accountHint: "neo@example.test",
      methodId: "gmail.users.messages.get",
      scopes: ["gmail.readonly", "profile"],
      nested: { b: 2, a: 1 },
    };
    const reorderedConditions = {
      nested: { a: 1, b: 2 },
      scopes: ["gmail.readonly", "profile"],
      methodId: "gmail.users.messages.get",
      accountHint: "neo@example.test",
      provider: "google.workspace.cli",
    };
    const conditionedRequest = request({ grantConditions: reorderedConditions });
    const conditionedGrant = grant({ conditions });

    expect(findMatchingPermissionGrant([conditionedGrant], conditionedRequest, baseContext)?.id).toBe("grant-1");
    expect(findMatchingPermissionGrant([grant()], conditionedRequest, baseContext)).toBeUndefined();
    expect(findMatchingPermissionGrant([conditionedGrant], request(), baseContext)).toBeUndefined();
    expect(
      findMatchingPermissionGrant([
        grant({ conditions: { ...conditions, methodId: "gmail.users.messages.list" } }),
      ], conditionedRequest, baseContext),
    ).toBeUndefined();
    expect(
      findMatchingPermissionGrant([
        grant({ conditions: { ...conditions, scopes: ["profile", "gmail.readonly"] } }),
      ], conditionedRequest, baseContext),
    ).toBeUndefined();
  });

  it("matches child browser authority grants by stable browser identity, not volatile child run evidence", () => {
    const targetHash = permissionGrantTargetHash("browser_network", "browser_origin", "example.com");
    const browserGrant = grant({
      actionKind: "browser_network",
      targetKind: "browser_origin",
      targetLabel: "example.com",
      targetHash,
      conditions: {
        provider: "ambient.desktop",
        source: "subagent-child-browser-authority",
        operation: "browser_nav",
        domain: "example.com",
        childThreadId: "child-thread-a",
        childRunId: "child-run-a",
        target: "https://example.com/start",
      },
    });

    const sameDomainLaterRun = request({
      toolName: "browser_nav",
      risk: "browser-network",
      grantActionKind: "browser_network",
      grantTargetKind: "browser_origin",
      grantTargetLabel: "example.com",
      grantTargetHash: targetHash,
      grantConditions: {
        provider: "ambient.desktop",
        source: "subagent-child-browser-authority",
        operation: "browser_nav",
        domain: "example.com",
        childThreadId: "child-thread-b",
        childRunId: "child-run-b",
        target: "https://example.com/other-page",
      },
    });
    const differentDomain = {
      ...sameDomainLaterRun,
      grantConditions: {
        ...sameDomainLaterRun.grantConditions,
        domain: "other.example",
      },
    };

    expect(findMatchingPermissionGrant([browserGrant], sameDomainLaterRun, baseContext)?.id).toBe("grant-1");
    expect(findMatchingPermissionGrant([browserGrant], differentDomain, baseContext)).toBeUndefined();
  });

  it("matches file authority adapter grants by canonical path and access, not requested path spelling", () => {
    const path = "/workspaces/project/secrets/notes.md";
    const targetHash = permissionGrantTargetHash("file_content_read", "path", path);
    const fileGrant = grant({
      actionKind: "file_content_read",
      targetKind: "path",
      targetLabel: path,
      targetHash,
      conditions: {
        source: "file-authority-adapter",
        path,
        canonicalPath: path,
        requestedPath: "../project/secrets/notes.md",
        access: "read",
      },
    });
    const sameCanonicalPath = request({
      toolName: "read",
      risk: "outside-workspace",
      grantActionKind: "file_content_read",
      grantTargetKind: "path",
      grantTargetLabel: path,
      grantTargetHash: targetHash,
      grantConditions: {
        source: "file-authority-adapter",
        path,
        canonicalPath: path,
        requestedPath: "/workspaces/project/./secrets/notes.md",
        access: "read",
      },
    });
    const writeRequest = {
      ...sameCanonicalPath,
      grantActionKind: "local_file_write" as const,
      grantConditions: {
        ...sameCanonicalPath.grantConditions,
        access: "write",
      },
    };
    const contradictoryReadRequest = {
      ...sameCanonicalPath,
      grantConditions: {
        ...sameCanonicalPath.grantConditions,
        access: "write",
      },
    };

    expect(findMatchingPermissionGrant([fileGrant], sameCanonicalPath, baseContext)?.id).toBe("grant-1");
    expect(findMatchingPermissionGrant([fileGrant], writeRequest, baseContext)).toBeUndefined();
    expect(findMatchingPermissionGrant([fileGrant], contradictoryReadRequest, baseContext)).toBeUndefined();
  });

  it("matches ordinary path grants by canonical path, not requested path spelling", () => {
    const path = "/workspaces/project/secrets/notes.md";
    const targetHash = permissionGrantTargetHash("file_content_read", "path", path);
    const fileGrant = grant({
      actionKind: "file_content_read",
      targetKind: "path",
      targetLabel: path,
      targetHash,
      conditions: {
        provider: "ambient.desktop",
        operation: "read",
        path: "../project/secrets/notes.md",
        canonicalPath: path,
        requestedPath: "../project/secrets/notes.md",
        access: "read",
      },
    });
    const sameCanonicalPath = request({
      toolName: "read",
      risk: "outside-workspace",
      grantActionKind: "file_content_read",
      grantTargetKind: "path",
      grantTargetLabel: path,
      grantTargetHash: targetHash,
      grantConditions: {
        provider: "ambient.desktop",
        operation: "read",
        path: "/workspaces/project/./secrets/notes.md",
        canonicalPath: path,
        requestedPath: "/workspaces/project/./secrets/notes.md",
        access: "read",
      },
    });
    const changedOperation = {
      ...sameCanonicalPath,
      grantConditions: {
        ...sameCanonicalPath.grantConditions,
        operation: "long_context_process",
      },
    };
    const changedAccess = {
      ...sameCanonicalPath,
      grantConditions: {
        ...sameCanonicalPath.grantConditions,
        access: "write",
      },
    };

    expect(findMatchingPermissionGrant([fileGrant], sameCanonicalPath, baseContext)?.id).toBe("grant-1");
    expect(findMatchingPermissionGrant([fileGrant], changedOperation, baseContext)).toBeUndefined();
    expect(findMatchingPermissionGrant([fileGrant], changedAccess, baseContext)).toBeUndefined();
  });

  it("matches workflow discovery grants despite stored capability and one-shot markers", () => {
    const targetHash = permissionGrantTargetHash("connector_content_read", "connector", "gmail.messages");
    const discoveryGrant = grant({
      actionKind: "connector_content_read",
      targetKind: "connector",
      targetLabel: "gmail.messages",
      targetHash,
      conditions: {
        discoveryOnly: true,
        capability: "connector_content",
        oneShot: true,
      },
    });
    const discoveryRequest = request({
      toolName: "workflow_discovery:connector_content",
      risk: "plugin-tool",
      grantActionKind: "connector_content_read",
      grantTargetKind: "connector",
      grantTargetLabel: "gmail.messages",
      grantTargetHash: targetHash,
      grantConditions: { discoveryOnly: true },
    });

    expect(findMatchingPermissionGrant([discoveryGrant], discoveryRequest, baseContext)?.id).toBe("grant-1");
  });

  it("matches Google Workspace connector grants by resolved account identity, not requested account alias", () => {
    const grantTargetIdentity = "google.workspace.connector\0google.calendar\0travis@example.test\0read_calendar";
    const targetHash = permissionGrantTargetHash("connector_content_read", "connector", grantTargetIdentity);
    const googleGrant = grant({
      actionKind: "connector_content_read",
      targetKind: "connector",
      targetLabel: "Google Calendar read access (travis@example.test)",
      targetHash,
      conditions: {
        provider: "google.workspace",
        [googleWorkspaceGrantTargetIdentityCondition]: grantTargetIdentity,
        googleWorkspaceConnectorId: "google.calendar",
        googleWorkspaceAccountId: "travis@example.test",
        googleWorkspaceAccess: "read_calendar",
        operation: "method_call",
        methodId: "calendar.events.list",
        sideEffect: "personal_content_read",
        requestedAccountHint: "default",
        resolvedAccountHint: "travis@example.test",
      },
    });
    const sameResolvedAccount = request({
      toolName: "google_workspace_call",
      risk: "plugin-tool",
      grantActionKind: "connector_content_read",
      grantTargetKind: "connector",
      grantTargetLabel: "Google Calendar read access (travis@example.test)",
      grantTargetHash: targetHash,
      grantConditions: {
        provider: "google.workspace",
        [googleWorkspaceGrantTargetIdentityCondition]: grantTargetIdentity,
        googleWorkspaceConnectorId: "google.calendar",
        googleWorkspaceAccountId: "travis@example.test",
        googleWorkspaceAccess: "read_calendar",
        operation: "method_call",
        methodId: "calendar.events.list",
        sideEffect: "personal_content_read",
        requestedAccountHint: "travis@example.test",
        resolvedAccountHint: "travis@example.test",
      },
    });
    const differentResolvedAccount = {
      ...sameResolvedAccount,
      grantConditions: {
        ...sameResolvedAccount.grantConditions,
        [googleWorkspaceGrantTargetIdentityCondition]: "google.workspace.connector\0google.calendar\0other@example.test\0read_calendar",
        googleWorkspaceAccountId: "other@example.test",
        resolvedAccountHint: "other@example.test",
      },
    };
    const differentMethod = {
      ...sameResolvedAccount,
      grantConditions: {
        ...sameResolvedAccount.grantConditions,
        methodId: "calendar.events.get",
      },
    };

    expect(findMatchingPermissionGrant([googleGrant], sameResolvedAccount, baseContext)?.id).toBe("grant-1");
    expect(findMatchingPermissionGrant([googleGrant], differentResolvedAccount, baseContext)).toBeUndefined();
    expect(findMatchingPermissionGrant([googleGrant], differentMethod, baseContext)).toBeUndefined();
  });

  it("matches MCP reusable profile grants despite observed-prior evidence drift", () => {
    const resources = [
      { kind: "tool-call", action: "call", identity: "tool:server:workload:search:hash", label: "server/search", risk: "medium" },
      { kind: "network", action: "connect", identity: "network:https:*", label: "Public HTTPS hosts", risk: "medium" },
    ];
    const targetHash = permissionGrantTargetHash("plugin_tool_execute", "tool", "mcp-public-web");
    const mcpGrant = grant({
      actionKind: "plugin_tool_execute",
      targetKind: "tool",
      targetLabel: "Call MCP tool search for public HTTPS hosts",
      targetHash,
      conditions: {
        kind: "ambient-mcp-tool-call",
        schemaVersion: "ambient-mcp-permission-policy-v1",
        subject: { serverId: "server", workloadName: "workload", toolName: "search", descriptorHash: "hash" },
        descriptorHash: "hash",
        profile: "public-web-egress",
        profileReason: "Repeated compatible public HTTPS approvals.",
        observedPriorHosts: ["docs.example"],
        resources,
      },
    });
    const laterRequest = request({
      toolName: "mcp_call",
      risk: "plugin-tool",
      grantActionKind: "plugin_tool_execute",
      grantTargetKind: "tool",
      grantTargetLabel: "Call MCP tool search for public HTTPS hosts",
      grantTargetHash: targetHash,
      grantConditions: {
        kind: "ambient-mcp-tool-call",
        schemaVersion: "ambient-mcp-permission-policy-v1",
        subject: { serverId: "server", workloadName: "workload", toolName: "search", descriptorHash: "hash" },
        descriptorHash: "hash",
        profile: "public-web-egress",
        profileReason: "Updated evidence copy.",
        observedPriorHosts: ["docs.example", "developer.example"],
        resources,
      },
    });
    const changedResources = {
      ...laterRequest,
      grantConditions: {
        ...laterRequest.grantConditions,
        resources: [
          resources[0],
          { kind: "network", action: "connect", identity: "network:https:metadata.google.internal", label: "metadata", risk: "high" },
        ],
      },
    };

    expect(findMatchingPermissionGrant([mcpGrant], laterRequest, baseContext)?.id).toBe("grant-1");
    expect(findMatchingPermissionGrant([mcpGrant], changedResources, baseContext)).toBeUndefined();
  });

  it("matches thread folder allowlist grants for descendants but not sibling threads or sibling paths", () => {
    const folderGrant = localFolderGrant("/Users/test/Shared", "thread-1");
    const rootRequest = request({
      toolName: "read",
      risk: "outside-workspace",
      detail: "/Users/test/Shared",
      grantActionKind: "file_content_read",
      grantTargetKind: "path",
      grantTargetLabel: "/Users/test/Shared",
      grantTargetHash: permissionGrantTargetHash("file_content_read", "path", "/Users/test/Shared"),
      grantConditions: {
        path: "/Users/test/Shared",
        operation: "read",
      },
    });
    const descendant = request({
      toolName: "read",
      risk: "outside-workspace",
      detail: "/Users/test/Shared/notes/plan.md",
      grantActionKind: "file_content_read",
      grantTargetKind: "path",
      grantTargetLabel: "/Users/test/Shared/notes/plan.md",
      grantTargetHash: permissionGrantTargetHash("file_content_read", "path", "/Users/test/Shared/notes/plan.md"),
      grantConditions: {
        path: "/Users/test/Shared/notes/plan.md",
        operation: "read",
      },
    });
    const sibling = {
      ...descendant,
      grantTargetLabel: "/Users/test/Other/plan.md",
      grantTargetHash: permissionGrantTargetHash("file_content_read", "path", "/Users/test/Other/plan.md"),
      grantConditions: { path: "/Users/test/Other/plan.md" },
    };

    expect(findMatchingPermissionGrant([folderGrant], rootRequest, baseContext)?.id).toBe("folder-grant");
    expect(findMatchingPermissionGrant([folderGrant], descendant, baseContext)?.id).toBe("folder-grant");
    expect(findMatchingPermissionGrant([folderGrant], sibling, baseContext)).toBeUndefined();
    expect(findMatchingPermissionGrant([localFolderGrant("/Users/test/Shared", "thread-2")], descendant, baseContext)).toBeUndefined();
    expect(findMatchingPermissionGrant([localFolderGrant("/Users/test/Shared", "thread-1", { revokedAt: "2026-06-23T01:00:00.000Z" })], descendant, baseContext)).toBeUndefined();
  });

  it("does not retarget folder allowlist grants when the approved root becomes a symlink", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-permission-allowlist-"));
    const allowed = join(root, "allowed");
    const outside = join(root, "outside");
    const secretPath = join(outside, "secret.txt");
    try {
      await mkdir(allowed);
      await mkdir(outside);
      await writeFile(secretPath, "secret\n", "utf8");
      const folderGrant = localFolderGrant(allowed, "thread-1");
      await rm(allowed, { recursive: true, force: true });
      await symlink(outside, allowed);

      const escaped = request({
        toolName: "read",
        risk: "outside-workspace",
        detail: secretPath,
        grantActionKind: "file_content_read",
        grantTargetKind: "path",
        grantTargetLabel: secretPath,
        grantTargetHash: permissionGrantTargetHash("file_content_read", "path", secretPath),
        grantConditions: {
          path: secretPath,
          operation: "read",
        },
      });

      expect(findMatchingPermissionGrant([folderGrant], escaped, baseContext)).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("matches folder allowlist grants against canonical request paths when provided", () => {
    const folderGrant = localFolderGrant("/Users/test/Shared", "thread-1");
    const symlinkRequest = request({
      toolName: "read",
      risk: "outside-workspace",
      detail: "/Users/test/Shared/linked-secret.md",
      grantActionKind: "file_content_read",
      grantTargetKind: "path",
      grantTargetLabel: "/Users/test/Shared/linked-secret.md",
      grantTargetHash: permissionGrantTargetHash("file_content_read", "path", "/Users/test/Shared/linked-secret.md"),
      grantConditions: {
        path: "/Users/test/Shared/linked-secret.md",
        canonicalPath: "/Users/test/Outside/secret.md",
        operation: "read",
      },
    });

    expect(findMatchingPermissionGrant([folderGrant], symlinkRequest, baseContext)).toBeUndefined();
  });

  it("matches folder allowlist grants only when every requested canonical path is inside the folder", () => {
    const folderGrant = localFolderGrant("/Users/test/Shared", "thread-1");
    const multiPathRequest = request({
      toolName: "long_context_process",
      risk: "outside-workspace",
      detail: "Outside path: /Users/test/Shared/a.md\nOutside path: /Users/test/Shared/b.md",
      grantActionKind: "file_content_read",
      grantTargetKind: "path",
      grantTargetLabel: "2 outside-workspace long-context paths",
      grantTargetHash: permissionGrantTargetHash("file_content_read", "path", "/Users/test/Shared/a.md\0/Users/test/Shared/b.md"),
      grantConditions: {
        paths: ["/Users/test/Shared/a.md", "/Users/test/Shared/b.md"],
        path: "/Users/test/Shared/a.md",
        canonicalPath: "/Users/test/Shared/a.md",
      },
    });
    const mixedPathRequest = {
      ...multiPathRequest,
      grantConditions: {
        paths: ["/Users/test/Shared/a.md", "/Users/test/Other/b.md"],
        path: "/Users/test/Shared/a.md",
        canonicalPath: "/Users/test/Shared/a.md",
      },
    };

    expect(findMatchingPermissionGrant([folderGrant], multiPathRequest, baseContext)?.id).toBe("folder-grant");
    expect(findMatchingPermissionGrant([folderGrant], mixedPathRequest, baseContext)).toBeUndefined();
  });

  it("turns reusable prompt responses into persisted grant inputs", () => {
    expect(grantInputFromPromptResponse(request(), baseContext, "allow_once")).toBeUndefined();
    expect(grantInputFromPromptResponse(request({ risk: "privileged-action" }), baseContext, "always_thread")).toBeUndefined();

    const input = grantInputFromPromptResponse(request(), baseContext, "always_workspace");

    expect(input).toMatchObject({
      permissionModeAtCreation: "workspace",
      scopeKind: "workspace",
      workspacePath: baseContext.workspacePath,
      actionKind: "shell_command",
      targetKind: "shell_command_prefix",
      targetLabel: "npm test",
      source: "permission_prompt",
    });
  });

  it("reuses a persisted grant before opening a prompt", async () => {
    const store = {
      listPermissionGrants: vi.fn(() => [grant()]),
      createPermissionGrant: vi.fn(),
    };
    const requester = {
      request: vi.fn(async () => ({ allowed: false, mode: "deny" as const })),
    };

    await expect(resolvePermissionWithGrants({ store: store as any, requester, request: request(), context: baseContext })).resolves.toMatchObject({
      allowed: true,
      decisionSource: "persistent_grant",
      grant: expect.objectContaining({ id: "grant-1" }),
    });
    expect(requester.request).not.toHaveBeenCalled();
  });

  it("reuses a persisted loopback network grant for later localhost proof variants", async () => {
    const first = request({
      risk: "network-command",
      detail: "python3 -m http.server 8742 &>/dev/null &\necho \"Server PID: $!\"\nsleep 1\ncurl -s http://localhost:8742/ | head -20",
    });
    const second = request({
      risk: "network-command",
      detail: "lsof -i :8765 2>/dev/null; sleep 1; curl -s http://127.0.0.1:8765/ | head -5",
    });
    const enriched = enrichPermissionRequest(first, baseContext);
    const store = {
      listPermissionGrants: vi.fn(() => [
        grant({
          id: "loopback-grant",
          actionKind: enriched.grantActionKind!,
          targetKind: enriched.grantTargetKind!,
          targetHash: enriched.grantTargetHash!,
          targetLabel: enriched.grantTargetLabel!,
        }),
      ]),
      createPermissionGrant: vi.fn(),
    };
    const requester = {
      request: vi.fn(async () => ({ allowed: false, mode: "deny" as const })),
    };

    await expect(resolvePermissionWithGrants({ store: store as any, requester, request: second, context: baseContext })).resolves.toMatchObject({
      allowed: true,
      decisionSource: "persistent_grant",
      grant: expect.objectContaining({ id: "loopback-grant" }),
    });
    expect(requester.request).not.toHaveBeenCalled();
  });

  it("creates a persistent grant when the user chooses an always mode", async () => {
    const created = grant({ id: "grant-created" });
    const store = {
      listPermissionGrants: vi.fn(() => []),
      createPermissionGrant: vi.fn((_input: CreateAmbientPermissionGrantInput) => created),
    };
    const requester = {
      request: vi.fn(async () => ({ allowed: true, mode: "always_project" as const })),
    };

    await expect(resolvePermissionWithGrants({ store: store as any, requester, request: request(), context: baseContext })).resolves.toMatchObject({
      allowed: true,
      decisionSource: "prompt_always_project",
      grant: expect.objectContaining({ id: "grant-created" }),
    });
    expect(store.createPermissionGrant).toHaveBeenCalledWith(expect.objectContaining({ scopeKind: "project", projectPath: baseContext.projectPath }));
  });

  it("can require a fresh prompt even when a persistent grant exists", async () => {
    const store = {
      listPermissionGrants: vi.fn(() => [grant()]),
      createPermissionGrant: vi.fn(),
    };
    const requester = {
      request: vi.fn(async () => ({ allowed: true, mode: "always_project" as const })),
    };

    await expect(resolvePermissionWithGrants({
      store: store as any,
      requester,
      request: request(),
      context: baseContext,
      requireFreshPrompt: true,
    })).resolves.toMatchObject({
      allowed: true,
      decisionSource: "prompt_allow_once",
      response: "always_project",
    });
    expect(requester.request).toHaveBeenCalledWith(expect.objectContaining({ reusableScopes: [] }));
    expect(store.createPermissionGrant).not.toHaveBeenCalled();
  });

  it("never reuses or creates privileged-action grants", async () => {
    const privilegedRequest = request({
      risk: "privileged-action",
      toolName: "ambient_privileged_action_request",
      detail: "Purpose: install_system_package",
    });
    const enriched = enrichPermissionRequest(privilegedRequest, baseContext);
    const store = {
      listPermissionGrants: vi.fn(() => [
        grant({
          actionKind: enriched.grantActionKind!,
          targetKind: enriched.grantTargetKind!,
          targetHash: enriched.grantTargetHash!,
          targetLabel: enriched.grantTargetLabel!,
        }),
      ]),
      createPermissionGrant: vi.fn(),
    };
    const requester = {
      request: vi.fn(async () => ({ allowed: true, mode: "always_thread" as const })),
    };

    await expect(resolvePermissionWithGrants({
      store: store as any,
      requester,
      request: privilegedRequest,
      context: baseContext,
    })).resolves.toMatchObject({
      allowed: true,
      decisionSource: "prompt_allow_once",
      response: "always_thread",
    });
    expect(requester.request).toHaveBeenCalledWith(expect.objectContaining({ reusableScopes: [] }));
    expect(store.createPermissionGrant).not.toHaveBeenCalled();
  });
});
