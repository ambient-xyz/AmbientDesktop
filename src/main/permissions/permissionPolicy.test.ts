import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  classifyToolPermission,
  classifyShellCommandSemanticIntent,
  extractCommandPathCandidates,
  isDangerousCommand,
  isManagedAuthorityPath,
  isManagedSecretPath,
  isNetworkCommand,
  isSecretLikePath,
  resolvePolicyPath,
} from "./permissionPolicy";
import { isDotEnvPath, isEnvTemplatePath } from "../../shared/pathSensitivity";

describe("isDangerousCommand", () => {
  it("detects destructive or privileged shell commands", () => {
    expect(isDangerousCommand("rm -rf dist")).toBe(true);
    expect(isDangerousCommand("sudo npm install")).toBe(true);
    expect(isDangerousCommand("chmod 777 secret.txt")).toBe(true);
    expect(isDangerousCommand("npm test")).toBe(false);
  });
});

describe("isNetworkCommand", () => {
  it("detects shell commands that can send data over the network", () => {
    expect(isNetworkCommand("curl https://example.com")).toBe(true);
    expect(isNetworkCommand("scp file host:/tmp")).toBe(true);
    expect(isNetworkCommand("npm test")).toBe(false);
  });
});

describe("isSecretLikePath", () => {
  it("detects common credential paths", () => {
    expect(isSecretLikePath("/tmp/project/.env")).toBe(true);
    expect(isSecretLikePath("/tmp/project/.env.local")).toBe(true);
    expect(isSecretLikePath("/tmp/project/config/secrets.json")).toBe(true);
    expect(isSecretLikePath("/tmp/project/.ambient/cli-packages/secrets/brave/BRAVE_API_KEY.secret")).toBe(true);
    expect(isSecretLikePath("/tmp/project/.ambient-codex/runtime/secrets/OPENAI_API_KEY.secret")).toBe(true);
    expect(isSecretLikePath("/tmp/project/standalone.secret")).toBe(true);
    expect(isSecretLikePath("/tmp/project/src/app.ts")).toBe(false);
  });

  it("treats common env template files as readable templates, not secrets", () => {
    for (const path of [
      "/tmp/project/.env.example",
      "/tmp/project/.env.sample",
      "/tmp/project/.env.template",
      "/tmp/project/example.env",
      "/tmp/project/sample.env",
    ]) {
      expect(isEnvTemplatePath(path)).toBe(true);
      expect(isSecretLikePath(path)).toBe(false);
    }
    expect(isDotEnvPath("/tmp/project/.env.local")).toBe(true);
    expect(isEnvTemplatePath("/tmp/project/.env.local")).toBe(false);
    expect(isSecretLikePath("/tmp/project/.env.local")).toBe(true);
  });
});

describe("isManagedSecretPath", () => {
  it("detects legacy Ambient-managed secret material", () => {
    expect(isManagedSecretPath("/tmp/project/.ambient/cli-packages/secrets/brave/BRAVE_API_KEY.secret")).toBe(true);
    expect(isManagedSecretPath("/tmp/project/.ambient-codex/runtime/secrets/OPENAI_API_KEY.secret")).toBe(true);
    expect(isManagedSecretPath("/tmp/project/provider.secret")).toBe(true);
    expect(isManagedSecretPath("/tmp/project/config/secrets.json")).toBe(false);
  });
});

describe("isManagedAuthorityPath", () => {
  it("detects legacy workspace authority state material without blocking normal artifacts", () => {
    expect(isManagedAuthorityPath("/tmp/project/.ambient-codex/state.sqlite")).toBe(true);
    expect(isManagedAuthorityPath("/tmp/project/.ambient-codex/state.sqlite-wal")).toBe(true);
    expect(isManagedAuthorityPath("/tmp/project/.ambient-codex/browser/credentials.json")).toBe(true);
    expect(isManagedAuthorityPath("/tmp/project/.ambient-codex/remote-marketplaces.json")).toBe(true);
    expect(isManagedAuthorityPath("/tmp/user-data/authority-state/workspaces/demo-123/state.sqlite")).toBe(true);
    expect(isManagedAuthorityPath("/tmp/user-data/authority-state/workspaces/demo-123/browser/credentials.json")).toBe(true);
    expect(isManagedAuthorityPath("/tmp/project/.ambient-codex/workflows/demo/main.ts")).toBe(false);
    expect(isManagedAuthorityPath("/tmp/project/.ambient/board/planner-workspaces/run-1/manifest.json")).toBe(false);
  });

  it("detects managed MCP Autowire and ToolHive state", () => {
    expect(isManagedAuthorityPath("/tmp/state/mcp/autowire-candidates/thread-1.json")).toBe(true);
    expect(isManagedAuthorityPath("/tmp/state/mcp/autowire-plan-revisions.json")).toBe(true);
    expect(isManagedAuthorityPath("/tmp/user-data/mcp/source-builds/server/abcdef/.ambient-source-build/Dockerfile")).toBe(true);
    expect(isManagedAuthorityPath("/tmp/user-data/mcp/toolhive/state.json")).toBe(true);
    expect(isManagedAuthorityPath("/tmp/user-data/mcp/toolhive/permission-profiles/server.json")).toBe(true);
    expect(isManagedAuthorityPath("/tmp/user-data/mcp/toolhive/runtime-secret-bindings/server.env")).toBe(true);
    expect(isManagedAuthorityPath("/tmp/user-data/mcp/toolhive/docker-config/config.json")).toBe(true);
    expect(isManagedAuthorityPath("/tmp/user-data/mcp/toolhive/file-exchange/server/input.csv")).toBe(true);
    expect(isManagedAuthorityPath("/tmp/user-data/mcp-container-runtime/default-capabilities.json")).toBe(true);
    expect(isManagedAuthorityPath("/tmp/user-data/mcp-container-runtime/setup-state.json")).toBe(true);
    expect(isManagedAuthorityPath("/tmp/project/mcp/examples/server.json")).toBe(false);
    expect(isManagedAuthorityPath("/tmp/project/mcp/toolhive-notes/state.json")).toBe(false);
  });
});

describe("classifyToolPermission", () => {
  const base = {
    threadId: "thread-1",
    workspacePath: "/tmp/project",
  };

  it("allows everything in full-access mode", async () => {
    expect(
      await classifyToolPermission({
        ...base,
        permissionMode: "full-access",
        toolName: "write",
        toolInput: { path: "/tmp/outside.txt" },
      }),
    ).toEqual({ action: "allow" });
  });

  it("prompts for unmanaged ToolHive CLI commands even in full-access mode", async () => {
    const directDecision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      toolName: "bash",
      toolInput: { command: "thv run --name ambient-example --isolate-network uvx://example" },
    });
    expect(directDecision.action).toBe("prompt");
    if (directDecision.action === "prompt") {
      expect(directDecision.request.title).toBe("Allow unmanaged ToolHive CLI command?");
      expect(directDecision.request.reusableScopes).toEqual(["thread"]);
      expect(directDecision.request.grantTargetLabel).toBe("unmanaged-toolhive-cli");
      expect(directDecision.request.detail).toContain("Direct ToolHive CLI use is an unmanaged debugging path");
    }

    const bundledDecision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      toolName: "bash",
      toolInput: { command: "/Applications/Ambient.app/Contents/Resources/toolhive/darwin-arm64/thv version" },
    });
    expect(bundledDecision.action).toBe("prompt");
  });

  it("denies legacy workspace authority state paths even in full-access mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      toolName: "file_read",
      toolInput: { path: ".ambient-codex/state.sqlite" },
    });
    expect(decision.action).toBe("deny");
    if (decision.action === "deny") {
      expect(decision.reason).toContain("authority state");
      expect(decision.request.title).toBe("Blocked Ambient authority state path");
    }
  });

  it("denies shell access to legacy browser credential metadata", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "bash",
      toolInput: { command: "cat .ambient-codex/browser/credentials.json" },
    });
    expect(decision.action).toBe("deny");
    if (decision.action === "deny") {
      expect(decision.request.detail).toContain(".ambient-codex/browser/credentials.json");
    }
  });

  it("denies managed MCP Autowire state paths even in full-access mode", async () => {
    const revisionDecision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      toolName: "file_read",
      toolInput: { path: "/tmp/project/.ambient-codex/mcp/autowire-plan-revisions.json" },
    });
    expect(revisionDecision.action).toBe("deny");
    if (revisionDecision.action === "deny") {
      expect(revisionDecision.request.title).toBe("Blocked Ambient authority state path");
      expect(revisionDecision.request.detail).toContain("autowire-plan-revisions.json");
    }

    const candidateDecision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      toolName: "bash",
      toolInput: { command: "node -e \"require('fs').writeFileSync('/tmp/project/.ambient-codex/mcp/autowire-candidates/thread-1.json','{}')\"" },
    });
    expect(candidateDecision.action).toBe("deny");
    if (candidateDecision.action === "deny") {
      expect(candidateDecision.request.detail).toContain("autowire-candidates");
    }
  });

  it("denies managed ToolHive state and profiles before outside-workspace prompts", async () => {
    const profilePath = "/tmp/user data/Ambient/mcp/toolhive/permission-profiles/server.json";
    const profileDecision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "file_write",
      toolInput: { path: profilePath },
    });
    expect(profileDecision.action).toBe("deny");
    if (profileDecision.action === "deny") {
      expect(profileDecision.request.detail).toContain("permission-profiles");
    }

    const stateDecision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      toolName: "bash",
      toolInput: { command: `cat "${profilePath.replace("permission-profiles/server.json", "state.json")}"` },
    });
    expect(stateDecision.action).toBe("deny");
    if (stateDecision.action === "deny") {
      expect(stateDecision.request.detail).toContain("mcp/toolhive/state.json");
      expect(stateDecision.request.detail).toContain("Approved path: use the capability-specific Ambient API");
    }
  });

  it("allows workspace paths in workspace mode", async () => {
    expect(
      await classifyToolPermission({
        ...base,
        permissionMode: "workspace",
        toolName: "edit",
        toolInput: { path: "src/app.ts" },
      }),
    ).toEqual({ action: "allow" });
  });

  it("prompts for outside workspace file access", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "read",
      toolInput: { path: "../outside.txt" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("outside-workspace");
      expect(decision.request.detail).toContain("/tmp/outside.txt");
      expect(decision.request.detail).toContain("Approved path:");
    }
  });

  it("allows project-root file access from an internal worktree in Defensive mode", async () => {
    await expect(
      classifyToolPermission({
        threadId: "thread-1",
        workspacePath: "/tmp/project/.ambient-codex/worktrees/thread-1",
        projectPath: "/tmp/project",
        permissionMode: "workspace",
        toolName: "write",
        toolInput: { path: "/tmp/project/.gitignore" },
      }),
    ).resolves.toEqual({ action: "allow" });

    await expect(
      classifyToolPermission({
        threadId: "thread-1",
        workspacePath: "/tmp/project/.ambient-codex/worktrees/thread-1",
        projectPath: "/tmp/project",
        permissionMode: "workspace",
        toolName: "read",
        toolInput: { path: "/tmp/project/package.json" },
      }),
    ).resolves.toEqual({ action: "allow" });
  });

  it("allows Power User project-root writes from an internal worktree while preserving protected carve-outs", async () => {
    await expect(
      classifyToolPermission({
        threadId: "thread-1",
        workspacePath: "/tmp/project/.ambient-codex/worktrees/thread-1",
        projectPath: "/tmp/project",
        permissionMode: "full-access",
        toolName: "write",
        toolInput: { path: "/tmp/project/.gitignore" },
      }),
    ).resolves.toEqual({ action: "allow" });

    const protectedDecision = await classifyToolPermission({
      threadId: "thread-1",
      workspacePath: "/tmp/project/.ambient-codex/worktrees/thread-1",
      projectPath: "/tmp/project",
      permissionMode: "full-access",
      toolName: "write",
      toolInput: { path: "/tmp/project/.ambient-codex/state.sqlite" },
    });
    expect(protectedDecision.action).toBe("deny");
  });

  it("applies file tool aliases to workspace path policy", async () => {
    await expect(
      classifyToolPermission({
        ...base,
        permissionMode: "workspace",
        toolName: "file_write",
        toolInput: { path: "reports/out.txt" },
      }),
    ).resolves.toEqual({ action: "allow" });

    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "file_read",
      toolInput: { path: "../outside.txt" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") expect(decision.request.risk).toBe("outside-workspace");
  });

  it("applies local filesystem workflow tools to outside-workspace path policy", async () => {
    const listDecision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "local_directory_list",
      toolInput: { path: "~/Downloads" },
    });
    expect(listDecision.action).toBe("prompt");
    if (listDecision.action === "prompt") {
      expect(listDecision.request).toMatchObject({
        risk: "outside-workspace",
        grantActionKind: "file_content_read",
        grantTargetKind: "path",
        reusableScopes: ["thread", "project", "workspace"],
      });
      expect(listDecision.request.detail).toContain(join(homedir(), "Downloads"));
      expect(listDecision.request.detail).toContain("Approved path:");
    }

    const readDecision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "local_file_read",
      toolInput: { path: "~/Downloads/notes.md" },
    });
    expect(readDecision.action).toBe("prompt");
    if (readDecision.action === "prompt") {
      expect(readDecision.request.detail).toContain(join(homedir(), "Downloads", "notes.md"));
      expect(readDecision.request.detail).toContain("Approved path:");
    }
  });

  it("canonicalizes outside-workspace file-tool grant paths before prompting", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-policy-file-tool-"));
    const workspace = join(root, "workspace");
    const allowed = join(root, "allowed");
    const outside = join(root, "outside");
    const targetPath = join(outside, "public-note.txt");
    const symlinkPath = join(allowed, "linked-note.txt");
    await mkdir(workspace);
    await mkdir(allowed);
    await mkdir(outside);
    await writeFile(targetPath, "outside\n", "utf8");
    await symlink(targetPath, symlinkPath);
    const canonicalTarget = await realpath(targetPath);

    const decision = await classifyToolPermission({
      ...base,
      workspacePath: workspace,
      permissionMode: "workspace",
      toolName: "local_file_read",
      toolInput: { path: symlinkPath },
    });

    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request).toMatchObject({
        risk: "outside-workspace",
        grantActionKind: "file_content_read",
        grantTargetKind: "path",
        grantTargetLabel: canonicalTarget,
        grantConditions: {
          path: canonicalTarget,
          canonicalPath: canonicalTarget,
          requestedPath: symlinkPath,
        },
      });
    }
  });

  it("brokers managed skill file writes with scoped path metadata", async () => {
    const skillPath = join(homedir(), ".agents", "skills", "mystery", "SKILL.md");
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "write",
      toolInput: { path: skillPath },
    });

    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request).toMatchObject({
        title: "Allow managed skill install write?",
        risk: "outside-workspace",
        grantActionKind: "local_file_write",
        grantTargetKind: "path",
        grantTargetLabel: skillPath,
      });
      expect(decision.request.detail).toContain(`Path: ${skillPath}`);
      expect(decision.request.detail).toContain("Operation: write");
      expect(decision.request.detail).toContain("Command class: write");
      expect(decision.request.detail).toContain("Reason:");
      expect(decision.request.detail).toContain("ambient_cli_package_install");
      expect(decision.request.grantConditions).toMatchObject({
        operation: "write",
        path: skillPath,
        managedInstallKind: "agent-skill",
      });
    }
  });

  it("brokers managed skill shell installs instead of generic outside-workspace prompts", async () => {
    const skillDir = join(homedir(), ".agents", "skills", "mystery");
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "bash",
      toolInput: { command: "mkdir -p ~/.agents/skills/mystery" },
    });

    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request).toMatchObject({
        title: "Allow managed skill install write?",
        risk: "outside-workspace",
        grantActionKind: "local_file_write",
        grantTargetKind: "path",
        grantTargetLabel: skillDir,
      });
      expect(decision.request.detail).toContain(`Path: ${skillDir}`);
      expect(decision.request.detail).toContain("Operation: bash");
      expect(decision.request.detail).toContain("ambient_cli_package_preview");
      expect(decision.request.detail).toContain("Command: mkdir -p ~/.agents/skills/mystery");
    }
  });

  it("uses the same scoped path grant for outside-workspace file and Bash writes", async () => {
    const outsidePath = "/tmp/ambient-unified-path-authority.txt";
    const fileDecision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "write",
      toolInput: { path: outsidePath },
    });
    const bashDecision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "bash",
      toolInput: { command: `printf hi > ${outsidePath}` },
    });

    expect(fileDecision.action).toBe("prompt");
    expect(bashDecision.action).toBe("prompt");
    if (fileDecision.action === "prompt" && bashDecision.action === "prompt") {
      expect(fileDecision.request).toMatchObject({
        grantActionKind: "local_file_write",
        grantTargetKind: "path",
        grantTargetLabel: outsidePath,
      });
      expect(bashDecision.request).toMatchObject({
        grantActionKind: "local_file_write",
        grantTargetKind: "path",
        grantTargetLabel: outsidePath,
      });
      expect(bashDecision.request.grantTargetHash).toBe(fileDecision.request.grantTargetHash);
      expect(bashDecision.request.grantConditions).toMatchObject({
        operation: "bash",
        path: outsidePath,
        commandClass: "scratch proof output",
      });
      expect(bashDecision.request.detail).toContain("Approved path:");
    }
  });

  it("prompts with the local-model installer shape before Local Deep Research install side effects", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "ambient_local_deep_research_setup",
      toolInput: {
        action: "install",
        installerShape: localDeepResearchInstallerShape(),
      },
    });

    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request).toMatchObject({
        title: "Install Local Deep Research model?",
        risk: "plugin-tool",
        reusableScopes: ["thread", "project", "workspace"],
        grantActionKind: "plugin_tool_execute",
        grantTargetKind: "tool",
        grantTargetLabel: "Local Deep Research install:literesearcher-4b-q4-k-m:Q4_K_M",
      });
      expect(decision.request.detail).toContain("Model family: LiteResearcher-4B");
      expect(decision.request.detail).toContain("Expected disk: 2.54 GiB");
      expect(decision.request.detail).toContain("Estimated resident memory: 7.00 GiB");
      expect(decision.request.detail).toContain("Server: 127.0.0.1:auto");
      expect(decision.request.detail).toContain("Progress: local-deep-research-install-progress events");
      expect(decision.request.detail).toContain("Cancellation: cancel the tool call");
      expect(decision.request.detail).toContain("Logs: .ambient/local-deep-research/install-jobs");
      expect(decision.request.grantConditions).toMatchObject({
        operation: "ambient_local_deep_research_setup",
        action: "install",
        installerShapeSchemaVersion: "ambient-local-model-installer-shape-v1",
        modelProfileId: "literesearcher-4b-q4-k-m",
        quantization: "Q4_K_M",
        runtimeArtifactId: "llama-cpp-macos-arm64-metal",
        expectedDiskBytes: 2724716998,
        estimatedResidentMemoryBytes: 7 * 1024 ** 3,
        serverHost: "127.0.0.1",
        serverPort: "auto",
      });
    }
  });

  it("prompts before Local Deep Research smoke starts a lease-managed server", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "ambient_local_deep_research_setup",
      toolInput: {
        action: "smoke",
        installerShape: localDeepResearchInstallerShape(),
      },
    });

    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.title).toBe("Run Local Deep Research smoke?");
      expect(decision.request.message).toContain("start the managed local LiteResearcher model");
      expect(decision.request.detail).toContain("Server: 127.0.0.1:auto");
    }
  });

  it("allows Local Deep Research status checks in workspace mode and install in Power User mode", async () => {
    await expect(
      classifyToolPermission({
        ...base,
        permissionMode: "workspace",
        toolName: "ambient_local_deep_research_setup",
        toolInput: { action: "status" },
      }),
    ).resolves.toEqual({ action: "allow" });

    await expect(
      classifyToolPermission({
        ...base,
        permissionMode: "full-access",
        toolName: "ambient_local_deep_research_setup",
        toolInput: { action: "install", installerShape: localDeepResearchInstallerShape() },
      }),
    ).resolves.toEqual({ action: "allow" });
  });

  it("prompts before starting a managed local model runtime", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "ambient_local_model_runtime_start",
      toolInput: {
        runtimeId: "local-text-runtime",
      },
    });

    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request).toMatchObject({
        title: "Start local model runtime?",
        risk: "workspace-command",
        reusableScopes: ["thread", "project", "workspace"],
        grantActionKind: "shell_command",
        grantTargetKind: "tool",
        grantTargetLabel: "Local model runtime Start: local-text-runtime",
      });
      expect(decision.request.message).toContain("persisted runtime state");
      expect(decision.request.detail).toContain("Runtime id: local-text-runtime");
      expect(decision.request.detail).toContain("re-check runtime inventory load blockers");
      expect(decision.request.grantConditions).toMatchObject({
        provider: "ambient.desktop",
        operation: "local_model_runtime_start",
        runtimeId: "local-text-runtime",
      });
    }

    await expect(classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "ambient_local_model_runtime_start",
      toolInput: {
        runtimeId: "local-text-runtime",
        dryRun: true,
      },
    })).resolves.toEqual({ action: "allow" });
  });

  it("prompts before stopping a managed local model runtime", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "ambient_local_model_runtime_stop",
      toolInput: {
        runtimeId: "local-text-runtime",
        force: true,
      },
    });

    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request).toMatchObject({
        title: "Force local model runtime Stop?",
        risk: "workspace-command",
        reusableScopes: ["thread", "project", "workspace"],
        grantActionKind: "shell_command",
        grantTargetKind: "tool",
        grantTargetLabel: "Local model runtime Stop: local-text-runtime",
      });
      expect(decision.request.message).toContain("Active sub-agent leases");
      expect(decision.request.detail).toContain("Runtime id: local-text-runtime");
      expect(decision.request.detail).toContain("Force requested: yes");
      expect(decision.request.detail).toContain("re-check runtime inventory stop blockers");
      expect(decision.request.grantConditions).toMatchObject({
        provider: "ambient.desktop",
        operation: "local_model_runtime_stop",
        runtimeId: "local-text-runtime",
        force: true,
      });
    }

    await expect(classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "ambient_local_model_runtime_stop",
      toolInput: {
        runtimeId: "local-text-runtime",
        dryRun: true,
      },
    })).resolves.toEqual({ action: "allow" });
  });

  it("prompts before restarting a managed local model runtime", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "ambient_local_model_runtime_restart",
      toolInput: {
        runtimeId: "local-text-runtime",
        force: true,
      },
    });

    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request).toMatchObject({
        title: "Force local model runtime Restart?",
        risk: "workspace-command",
        reusableScopes: ["thread", "project", "workspace"],
        grantActionKind: "shell_command",
        grantTargetKind: "tool",
        grantTargetLabel: "Local model runtime Restart: local-text-runtime",
      });
      expect(decision.request.message).toContain("Active sub-agent leases");
      expect(decision.request.detail).toContain("Runtime id: local-text-runtime");
      expect(decision.request.detail).toContain("Force requested: yes");
      expect(decision.request.detail).toContain("re-check runtime inventory blockers");
      expect(decision.request.grantConditions).toMatchObject({
        provider: "ambient.desktop",
        operation: "local_model_runtime_restart",
        runtimeId: "local-text-runtime",
        force: true,
      });
    }

    await expect(classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "ambient_local_model_runtime_restart",
      toolInput: {
        runtimeId: "local-text-runtime",
        dryRun: true,
      },
    })).resolves.toEqual({ action: "allow" });
  });

  it("prompts for dangerous shell commands in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "bash",
      toolInput: { command: "rm -rf build" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("destructive-command");
      expect(decision.request.detail).toBe("rm -rf build");
    }
  });

  it("prompts for dangerous async bash commands in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "bash_start",
      toolInput: { cmd: "rm -rf build" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("destructive-command");
      expect(decision.request.detail).toBe("rm -rf build");
    }
  });

  it("prompts for dangerous async bash stdin writes in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "bash_write",
      toolInput: { job_id: "job-1", chars: "rm -rf build\n" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("destructive-command");
      expect(decision.request.detail).toBe("rm -rf build\n");
    }
  });

  it("prompts for async bash stdin fragments in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "bash_write",
      toolInput: { job_id: "job-1", chars: "rm -" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("workspace-command");
      expect(decision.request.message).toContain("writes can be split across tool calls");
      expect(decision.request.detail).toBe("rm -");
    }
  });

  it("prompts before applying workflow revisions in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "workflow_apply_revision",
      toolInput: { workflowThreadId: "workflow-1", revisionId: "revision-1" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request).toMatchObject({
        title: "Apply workflow revision?",
        risk: "workspace-command",
        grantActionKind: "local_file_write",
        grantTargetKind: "tool",
        grantTargetLabel: "workflow_apply_revision:workflow-1",
      });
      expect(decision.request.reusableScopes).toEqual(["workflow_thread", "project", "workspace"]);
      expect(decision.request.detail).toContain("revision-1");
    }
  });

  it("allows run-settings previews but prompts for persistent workflow run-setting updates", async () => {
    await expect(
      classifyToolPermission({
        ...base,
        permissionMode: "workspace",
        toolName: "workflow_update_run_settings",
        toolInput: { workflowThreadId: "workflow-1", action: "preview_foreground", idleTimeoutMs: 300000 },
      }),
    ).resolves.toEqual({ action: "allow" });

    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "workflow_update_run_settings",
      toolInput: { workflowThreadId: "workflow-1", action: "apply_persistent", idleTimeoutMs: 300000 },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request).toMatchObject({
        title: "Update workflow run settings?",
        risk: "workspace-command",
        grantTargetLabel: "workflow_update_run_settings:workflow-1",
      });
      expect(decision.request.detail).toContain("apply_persistent");
    }
  });

  it("prompts before restoring a workflow version", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "workflow_restore_version",
      toolInput: { workflowThreadId: "workflow-1", versionId: "version-1", approveRestored: true },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request).toMatchObject({
        title: "Restore workflow version?",
        risk: "workspace-command",
        grantActionKind: "local_file_write",
        grantTargetKind: "tool",
        grantTargetLabel: "workflow_restore_version:workflow-1",
      });
      expect(decision.request.reusableScopes).toEqual(["workflow_thread", "project", "workspace"]);
      expect(decision.request.detail).toContain("version-1");
      expect(decision.request.detail).toContain("Approve restored version: yes");
    }
  });

  it("prompts before running a workflow preview", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "workflow_run_preview",
      toolInput: { workflowThreadId: "workflow-1", artifactId: "artifact-1" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request).toMatchObject({
        title: "Run workflow preview?",
        risk: "workspace-command",
        grantActionKind: "local_file_write",
        grantTargetKind: "tool",
        grantTargetLabel: "workflow_run_preview:workflow-1",
      });
      expect(decision.request.reusableScopes).toEqual(["workflow_thread", "project", "workspace"]);
      expect(decision.request.detail).toContain("artifact-1");
      expect(decision.request.detail).toContain("Mode: dry_run");
    }
  });

  it("prompts before running a workflow version", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "workflow_run_version",
      toolInput: { workflowThreadId: "workflow-1", artifactId: "artifact-1", versionId: "version-1", allowUnapproved: true },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request).toMatchObject({
        title: "Run unapproved workflow?",
        risk: "workspace-command",
        grantActionKind: "local_file_write",
        grantTargetKind: "tool",
        grantTargetLabel: "workflow_run_version:workflow-1",
      });
      expect(decision.request.reusableScopes).toEqual(["workflow_thread", "project", "workspace"]);
      expect(decision.request.detail).toContain("version-1");
      expect(decision.request.detail).toContain("Allow unapproved: yes");
    }
  });

  it("prompts for shell commands that reference outside paths", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "bash",
      toolInput: { command: "cat ../secret.txt" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("outside-workspace");
      expect(decision.request.detail).toContain("/tmp/secret.txt");
    }
  });

  it("allows workspace shell commands with inline JavaScript Markdown heading regexes", async () => {
    const workspacePath = "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-3";
    const command = [
      `cd ${workspacePath}`,
      "&& node --input-type=module -e '",
      'const valid = "# Recipe Index\\n\\n## vegetarian\\n\\n- [Garden Salad](salad.md)";',
      'const wrongSort = valid.replace(/## vegetarian\\n\\n- \\[Garden Salad\\]\\(salad\\.md\\)/, "");',
      "console.log(wrongSort);",
      "'",
    ].join(" ");
    const decision = await classifyToolPermission({
      ...base,
      workspacePath,
      permissionMode: "workspace",
      toolName: "bash",
      toolInput: { command },
    });
    expect(decision).toEqual({ action: "allow" });
    expect(classifyShellCommandSemanticIntent(command)).toBe("proof-command");
    expect(extractCommandPathCandidates(command)).not.toContain("/##");
  });

  it("allows workspace shell commands with inline JavaScript division operators", async () => {
    const workspacePath = "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-3";
    const command = [
      `cd ${workspacePath}`,
      '&& node -e "',
      "if (op === '/' && b === 0) console.log('divide by zero');",
      "const ops = { '/': (a, b) => a / b };",
      '"',
    ].join(" ");
    const decision = await classifyToolPermission({
      ...base,
      workspacePath,
      permissionMode: "workspace",
      toolName: "bash",
      toolInput: { command },
    });
    expect(decision).toEqual({ action: "allow" });
    expect(extractCommandPathCandidates(command)).toEqual([workspacePath]);
  });

  it("prompts in proof-command terms when a real outside path is present", async () => {
    const workspacePath = "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-3";
    const command = `cd ${workspacePath} && node tests/verify-link-checker.mjs /tmp/unrelated-docs`;
    const decision = await classifyToolPermission({
      ...base,
      workspacePath,
      permissionMode: "workspace",
      toolName: "bash",
      toolInput: { command },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("outside-workspace");
      expect(decision.request.title).toBe("Run proof command with outside-workspace path?");
      expect(decision.request.message).toContain("A proof command references a path outside");
      expect(decision.request.detail).toContain("Intent: proof command");
      expect(decision.request.detail).toContain("/tmp/unrelated-docs");
    }
  });

  it("allows shell commands that redirect test output to the null device", async () => {
    const workspacePath = "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-3";
    const command = `cd ${workspacePath} && node --test summarize.test.mjs > /dev/null 2>&1; echo "Exit code: $?"`;
    const decision = await classifyToolPermission({
      ...base,
      workspacePath,
      permissionMode: "workspace",
      toolName: "bash",
      toolInput: { command },
    });
    expect(decision).toEqual({ action: "allow" });
    expect(classifyShellCommandSemanticIntent(command)).toBe("scratch-output");
    expect(extractCommandPathCandidates(command)).toEqual([workspacePath]);
  });

  it("allows workspace scratch proof output while preserving outside scratch prompts", async () => {
    const workspacePath = "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-3";
    const command = `cd ${workspacePath} && node --input-type=module -e 'console.log(JSON.stringify({ ok: true }))' > tmp/expense-scratch-proof.json`;
    await expect(
      classifyToolPermission({
        ...base,
        workspacePath,
        permissionMode: "workspace",
        toolName: "bash",
        toolInput: { command },
      }),
    ).resolves.toEqual({ action: "allow" });
    expect(classifyShellCommandSemanticIntent(command)).toBe("scratch-output");

    const outsideCommand = `cd ${workspacePath} && node --input-type=module -e 'console.log(JSON.stringify({ ok: true }))' > /tmp/expense-scratch-proof.json`;
    const decision = await classifyToolPermission({
      ...base,
      workspacePath,
      permissionMode: "workspace",
      toolName: "bash",
      toolInput: { command: outsideCommand },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("outside-workspace");
      expect(decision.request.title).toBe("Write scratch proof output with outside-workspace path?");
      expect(decision.request.detail).toContain("Intent: scratch proof output");
      expect(decision.request.detail).toContain("/tmp/expense-scratch-proof.json");
    }
  });

  it("keeps unrelated outside reads guarded during scratch proof validation", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "bash",
      toolInput: { command: "cat /tmp/unrelated-expenses.csv" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("outside-workspace");
      expect(decision.request.detail).toContain("/tmp/unrelated-expenses.csv");
    }
  });

  it("keeps other dev device paths behind outside-workspace approval", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "bash",
      toolInput: { command: "cat /dev/tty" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("outside-workspace");
      expect(decision.request.detail).toContain("/dev/tty");
    }
  });

  it("allows read-only shell inspection of declared dependency workspaces", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      readOnlyAllowedPaths: ["/tmp/deps/LOCAL-2"],
      toolName: "bash",
      toolInput: { command: "cat /tmp/deps/LOCAL-2/converter.mjs" },
    });
    expect(decision).toEqual({ action: "allow" });
  });

  it("allows copying declared dependency files into the writable workspace", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      readOnlyAllowedPaths: ["/tmp/deps/LOCAL-2"],
      toolName: "bash",
      toolInput: { command: "cp /tmp/deps/LOCAL-2/converter.mjs converter.mjs" },
    });
    expect(decision).toEqual({ action: "allow" });
  });

  it("allows simple workspace setup around copying declared dependency files", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      readOnlyAllowedPaths: ["/tmp/deps/LOCAL-2"],
      toolName: "bash",
      toolInput: { command: "mkdir -p recipes && cp /tmp/deps/LOCAL-2/*.md recipes/" },
    });
    expect(decision).toEqual({ action: "allow" });
  });

  it("keeps shell writes into declared dependency workspaces behind approval", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      readOnlyAllowedPaths: ["/tmp/deps/LOCAL-2"],
      toolName: "bash",
      toolInput: { command: "cp converter.mjs /tmp/deps/LOCAL-2/converter.mjs" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("outside-workspace");
    }
  });

  it("keeps dependency copies to unrelated outside paths behind approval", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      readOnlyAllowedPaths: ["/tmp/deps/LOCAL-2"],
      toolName: "bash",
      toolInput: { command: "cp /tmp/deps/LOCAL-2/converter.mjs /tmp/export/converter.mjs" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("outside-workspace");
    }
  });

  it("does not broaden missing dependency roots to their existing parent directory", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      readOnlyAllowedPaths: ["/tmp/deps/LOCAL-2"],
      toolName: "bash",
      toolInput: { command: "cat /tmp/other-dep/converter.mjs" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("outside-workspace");
      expect(decision.request.detail).toContain("/tmp/other-dep/converter.mjs");
    }
  });

  it("allows file reads from declared dependency workspaces", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      readOnlyAllowedPaths: ["/tmp/deps/LOCAL-2"],
      toolName: "file_read",
      toolInput: { path: "/tmp/deps/LOCAL-2/converter.mjs" },
    });
    expect(decision).toEqual({ action: "allow" });
  });

  it("still prompts for secret-like paths under declared dependency workspaces", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      readOnlyAllowedPaths: ["/tmp/deps/LOCAL-2"],
      toolName: "bash",
      toolInput: { command: "cat /tmp/deps/LOCAL-2/.env" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("secret-path");
    }
  });

  it("prompts for secret-like paths inside the workspace", async () => {
    const decision = await classifyToolPermission({
      ...base,
      projectPath: "/tmp/project",
      permissionMode: "workspace",
      toolName: "read",
      toolInput: { path: ".env" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("secret-path");
      expect(decision.request.message).toContain("configure or run the project");
      expect(decision.request.reusableScopes).toEqual(["thread", "project", "workspace"]);
      expect(decision.request.grantTargetLabel).toBe("/tmp/project/.env");
      expect(decision.request.grantConditions).toMatchObject({
        operation: "read",
        path: "/tmp/project/.env",
        sensitivePathKind: "dotenv",
      });
    }
  });

  it("allows common env template files through file, shell, and long-context reads", async () => {
    await expect(
      classifyToolPermission({
        ...base,
        permissionMode: "workspace",
        toolName: "read",
        toolInput: { path: ".env.example" },
      }),
    ).resolves.toEqual({ action: "allow" });
    await expect(
      classifyToolPermission({
        ...base,
        permissionMode: "workspace",
        toolName: "bash",
        toolInput: { command: "cat .env.sample" },
      }),
    ).resolves.toEqual({ action: "allow" });
    await expect(
      classifyToolPermission({
        ...base,
        permissionMode: "workspace",
        toolName: "long_context_process",
        toolInput: { workspacePaths: ["example.env"] },
      }),
    ).resolves.toEqual({ action: "allow" });
  });

  it("denies managed secret file access even in full-access mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      toolName: "file_read",
      toolInput: { path: ".ambient/cli-packages/secrets/brave/BRAVE_API_KEY.secret" },
    });

    expect(decision.action).toBe("deny");
    if (decision.action === "deny") {
      expect(decision.request.risk).toBe("secret-path");
      expect(decision.reason).toContain("not exposed");
    }
  });

  it("denies shell access to managed secret paths before full-access bypasses policy", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      toolName: "bash",
      toolInput: { command: "cat .ambient/cli-packages/secrets/brave/BRAVE_API_KEY.secret" },
    });

    expect(decision.action).toBe("deny");
    if (decision.action === "deny") {
      expect(decision.request.risk).toBe("secret-path");
      expect(decision.request.detail).toContain(".ambient/cli-packages/secrets/brave/BRAVE_API_KEY.secret");
    }
  });

  it("prompts for workspace shell commands that read non-managed secret-like paths", async () => {
    const decision = await classifyToolPermission({
      ...base,
      projectPath: "/tmp/project",
      permissionMode: "workspace",
      toolName: "bash",
      toolInput: { command: "cat .env" },
    });

    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("secret-path");
      expect(decision.request.detail).toContain("/tmp/project/.env");
      expect(decision.request.message).toContain("configure or run the project");
      expect(decision.request.reusableScopes).toEqual(["thread", "project", "workspace"]);
      expect(decision.request.grantTargetLabel).toBe("/tmp/project/.env");
    }
  });

  it("denies managed secret path usage in mediated tool path fields", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      toolName: "google_workspace_materialize_file",
      toolInput: { handle: "file-1", path: ".ambient-codex/runtime/secrets/OPENAI_API_KEY.secret" },
    });

    expect(decision.action).toBe("deny");
    if (decision.action === "deny") expect(decision.request.risk).toBe("secret-path");
  });

  it("prompts for long-context tool access to secret-like paths", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "long_context_process",
      toolInput: { workspacePaths: [".env"] },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("secret-path");
      expect(decision.request.title).toContain("long-context");
    }
  });

  it("prompts for long-context tool outside-workspace file access", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "long_context_process",
      toolInput: { workspacePaths: ["../outside.txt"] },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("outside-workspace");
      expect(decision.request.detail).toBe("/tmp/outside.txt");
    }
  });

  it("prompts for async long-context start outside-workspace file access", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "long_context_start",
      toolInput: { workspacePaths: ["../outside.txt"] },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("outside-workspace");
      expect(decision.request.message).toContain("long_context_start");
      expect(decision.request.detail).toBe("/tmp/outside.txt");
    }
  });

  it("includes every outside long-context path in canonical grant metadata", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "long_context_process",
      toolInput: { workspacePaths: ["../outside-a.txt", "../outside-b.txt"] },
    });

    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request).toMatchObject({
        risk: "outside-workspace",
        grantActionKind: "file_content_read",
        grantTargetKind: "path",
        grantTargetLabel: "2 outside-workspace long-context paths",
        grantConditions: {
          paths: ["/tmp/outside-a.txt", "/tmp/outside-b.txt"],
          path: "/tmp/outside-a.txt",
          canonicalPath: "/tmp/outside-a.txt",
          requestedPaths: ["/tmp/outside-a.txt", "/tmp/outside-b.txt"],
        },
      });
      expect(decision.request.detail).toContain("Outside path: /tmp/outside-a.txt");
      expect(decision.request.detail).toContain("Outside path: /tmp/outside-b.txt");
    }
  });

  it("allows long-context reads from declared dependency workspaces", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      readOnlyAllowedPaths: ["/tmp/deps/LOCAL-2"],
      toolName: "long_context_process",
      toolInput: { workspacePaths: ["/tmp/deps/LOCAL-2"] },
    });
    expect(decision).toEqual({ action: "allow" });
  });

  it("allows project-root bash and long-context paths from an internal worktree", async () => {
    const internal = {
      threadId: "thread-1",
      workspacePath: "/tmp/project/.ambient-codex/worktrees/thread-1",
      projectPath: "/tmp/project",
      permissionMode: "workspace" as const,
    };

    await expect(
      classifyToolPermission({
        ...internal,
        toolName: "bash",
        toolInput: { command: "cat /tmp/project/package.json" },
      }),
    ).resolves.toEqual({ action: "allow" });

    await expect(
      classifyToolPermission({
        ...internal,
        toolName: "long_context_process",
        toolInput: { workspacePaths: ["/tmp/project/docs/recovery.md"] },
      }),
    ).resolves.toEqual({ action: "allow" });
  });

  it("prompts for network shell commands in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "bash",
      toolInput: { command: "curl https://example.com" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("network-command");
    }
  });

  it("prompts for network async bash commands in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "bash_start",
      toolInput: { cmd: "curl https://example.com" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("network-command");
    }
  });

  it("prompts for network async bash stdin writes in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "bash_write",
      toolInput: { job_id: "job-1", chars: "curl https://example.com\n" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("network-command");
    }
  });

  it("prompts before browser tools navigate the web in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "browser_search",
      toolInput: { query: "Ambient Desktop", profileMode: "isolated" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("browser-network");
      expect(decision.request.detail).toBe("Ambient Desktop");
    }
  });

  it("prompts before managed local preview starts browser network access in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "browser_local_preview",
      toolInput: { path: "webgl-hello-world/index.html" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.title).toBe("Allow local browser preview?");
      expect(decision.request.message).toContain("managed local browser preview");
      expect(decision.request.risk).toBe("browser-network");
      expect(decision.request.detail).toContain("webgl-hello-world/index.html");
    }
  });

  it("prompts before media_download fetches remote media in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "media_download",
      toolInput: { url: "https://example.test/bunny.jpg", outputPath: "bunny.jpg" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("browser-network");
      expect(decision.request.detail).toContain("https://example.test/bunny.jpg");
      expect(decision.request.detail).toContain("bunny.jpg");
      expect(decision.request.grantConditions).toMatchObject({
        provider: "ambient.desktop",
        operation: "media_download",
        url: "https://example.test/bunny.jpg",
        outputPath: "bunny.jpg",
      });
    }
  });

  it("prompts before MiniCPM-V analyzes workspace images in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "ambient_visual_analyze",
      toolInput: { imagePath: "screenshots/main.png", task: "ui_review" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("workspace-command");
      expect(decision.request.detail).toContain("screenshots/main.png");
      expect(decision.request.detail).toContain("ui_review");
      expect(decision.request.grantConditions).toMatchObject({
        provider: "ambient.desktop",
        operation: "minicpm_visual_analyze",
        imagePath: "screenshots/main.png",
        task: "ui_review",
      });
    }
  });

  it("prompts before MiniCPM-V visual analysis in Planner Mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      collaborationMode: "planner",
      permissionMode: "workspace",
      toolName: "ambient_visual_analyze",
      toolInput: {
        image: { path: ".ambient-codex/browser/screenshots/current.png", source: "browser_screenshot" },
        task: "ui_review",
      },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("workspace-command");
      expect(decision.request.detail).toContain(".ambient-codex/browser/screenshots/current.png");
      expect(decision.request.grantConditions).toMatchObject({
        provider: "ambient.desktop",
        operation: "minicpm_visual_analyze",
        imagePath: ".ambient-codex/browser/screenshots/current.png",
        task: "ui_review",
      });
    }
  });

  it("prompts before MiniCPM-V copies outside-workspace images", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "ambient_visual_analyze",
      toolInput: { imagePath: "/tmp/outside.png", task: "image_description", allowExternalImagePaths: true },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("outside-workspace");
      expect(decision.request.detail).toContain("/tmp/outside.png");
      expect(decision.request.detail).toContain("External media copy allowed: yes");
      expect(decision.request.grantConditions).toMatchObject({
        provider: "ambient.desktop",
        operation: "minicpm_visual_analyze",
        imagePath: "/tmp/outside.png",
        task: "image_description",
        allowExternalMediaPaths: true,
      });
    }
  });

  it("prompts before MiniCPM-V samples structured video references", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "ambient_visual_analyze",
      toolInput: {
        video: { path: "clips/playtest.mp4", source: "media_artifact", frameTimestampMs: 1500 },
        task: "video_frame_review",
      },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("workspace-command");
      expect(decision.request.detail).toContain("clips/playtest.mp4");
      expect(decision.request.detail).toContain("Frame timestamp: 1500ms");
      expect(decision.request.grantConditions).toMatchObject({
        provider: "ambient.desktop",
        operation: "minicpm_visual_analyze",
        videoPath: "clips/playtest.mp4",
        frameTimestampMs: 1500,
        task: "video_frame_review",
      });
    }
  });

  it("prompts before MiniCPM-V compares structured screenshot references", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "ambient_visual_analyze",
      toolInput: {
        image: { path: "screenshots/current.png", source: "browser_screenshot" },
        referenceImage: { path: "screenshots/reference.png", source: "chat_attachment" },
        task: "design_comparison",
      },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("workspace-command");
      expect(decision.request.detail).toContain("screenshots/current.png");
      expect(decision.request.detail).toContain("Reference image:");
      expect(decision.request.detail).toContain("screenshots/reference.png");
      expect(decision.request.grantConditions).toMatchObject({
        provider: "ambient.desktop",
        operation: "minicpm_visual_analyze",
        imagePath: "screenshots/current.png",
        referenceImagePath: "screenshots/reference.png",
        task: "design_comparison",
      });
    }
  });

  it("prompts before MiniCPM-V provider setup in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "ambient_visual_minicpm_setup",
      toolInput: { action: "repair", runtimeBinaryPath: "/usr/local/bin/llama-server" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("workspace-command");
      expect(decision.request.detail).toContain("Action: repair");
      expect(decision.request.detail).toContain("/usr/local/bin/llama-server");
      expect(decision.request.grantConditions).toMatchObject({
        provider: "ambient.desktop",
        operation: "minicpm_visual_setup",
        action: "repair",
        runtimeBinaryPath: "/usr/local/bin/llama-server",
      });
    }
  });

  it("prompts before browser tools control a page in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "browser_eval",
      toolInput: { code: "document.title", profileMode: "isolated" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("browser-control");
      expect(decision.request.detail).toBe("document.title");
    }
  });

  it("prompts before browser tools fill a stored login credential", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "browser_login",
      toolInput: {
        credentialId: "cred-1",
        credentialLabel: "Fixture",
        expectedOrigin: "https://example.test",
        currentUrl: "https://example.test/login",
        username: "neo@example.test",
        passwordSelector: "input[type=password]",
        submit: true,
      },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("browser-login");
      expect(decision.request.detail).toContain("Credential: Fixture (cred-1)");
      expect(decision.request.detail).toContain("Origin: https://example.test");
      expect(decision.request.detail).toContain("Current URL: https://example.test/login");
      expect(decision.request.detail).toContain("Username: neo@example.test");
      expect(decision.request.detail).toContain("Submit: yes");
      expect(decision.request.detail).not.toContain("password=");
    }
  });

  it("still prompts for brokered login in full-access mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      toolName: "browser_login",
      toolInput: { credentialId: "cred-1", expectedOrigin: "https://example.test", submit: false },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("browser-login");
      expect(decision.request.detail).toContain("Submit: no");
    }
  });

  it("prompts before installing the managed Google Workspace CLI even in full-access mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      toolName: "google_workspace_install_gws",
      toolInput: {},
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("plugin-tool");
      expect(decision.request.title).toContain("Install Google Workspace CLI");
    }
  });

  it("prompts before starting Google OAuth from a Pi tool call", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      toolName: "google_workspace_start_login",
      toolInput: { accountHint: "travis@example.test" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("browser-network");
      expect(decision.request.detail).toBe("Account handle: travis@example.test");
    }
  });

  it("prompts before importing a Google OAuth client JSON from a Pi tool call", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      toolName: "google_workspace_import_oauth_client",
      toolInput: { accountHint: "travis@example.test", path: "/Users/travis/Documents/client_secret_download.json" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("secret-path");
      expect(decision.request.title).toContain("Import Google OAuth client JSON");
      expect(decision.request.detail).toContain("Account handle: travis@example.test");
      expect(decision.request.detail).toContain("Source path: /Users/travis/Documents/client_secret_download.json");
      expect(decision.request.detail).toContain("Secret contents will not be printed");
    }
  });

  it("prompts before validating a Google Workspace account from a Pi tool call", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      toolName: "google_workspace_validate_account",
      toolInput: { accountHint: "travis@example.test" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("plugin-tool");
      expect(decision.request.title).toContain("Validate Google Workspace account");
      expect(decision.request.detail).toBe("Account handle: travis@example.test");
    }
  });

  it("allows Google Workspace method catalog search without prompting", async () => {
    await expect(
      classifyToolPermission({
        ...base,
        permissionMode: "workspace",
        toolName: "google_workspace_search_methods",
        toolInput: { query: "gmail labels" },
      }),
    ).resolves.toEqual({ action: "allow" });
  });

  it("prompts for Google Workspace personal content method calls with reusable scopes", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      toolName: "google_workspace_call",
      toolInput: {
        accountHint: "travis@example.test",
        methodId: "gmail.users.messages.list",
        params: { userId: "me", q: "from:ada@example.com" },
        method: {
          id: "gmail.users.messages.list",
          service: "gmail",
          resource: "users.messages",
          method: "list",
          label: "List Gmail messages",
          description: "List Gmail messages.",
          httpMethod: "GET",
          path: "gmail/v1/users/{userId}/messages",
          scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
          sideEffect: "personal_content_read",
          dryRunSupported: false,
        },
      },
    });

    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.title).toContain("content read");
      expect(decision.request.reusableScopes).toEqual(["thread", "project", "workspace"]);
      expect(decision.request.grantActionKind).toBe("connector_content_read");
      expect(decision.request.grantTargetKind).toBe("connector");
      expect(decision.request.grantTargetLabel).toBe("Gmail metadata search (travis@example.test)");
      expect(decision.request.grantConditions).toMatchObject({
        googleWorkspaceConnectorId: "google.gmail",
        googleWorkspaceAccountId: "travis@example.test",
        googleWorkspaceAccess: "metadata_search",
      });
      expect(decision.request.detail).toContain("Account: travis@example.test");
      expect(decision.request.detail).toContain("Method: gmail.users.messages.list");
      expect(decision.request.detail).toContain("Side effect: personal_content_read");
      expect(decision.request.detail).not.toContain("ada@example.com");
    }
  });

  it("allows Google Workspace metadata reads in full-access mode", async () => {
    await expect(
      classifyToolPermission({
        ...base,
        permissionMode: "full-access",
        toolName: "google_workspace_call",
        toolInput: {
          methodId: "gmail.users.labels.list",
          method: {
            id: "gmail.users.labels.list",
            service: "gmail",
            resource: "users.labels",
            method: "list",
            label: "List Gmail labels",
            description: "List Gmail labels.",
            httpMethod: "GET",
            scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
            sideEffect: "metadata_read",
            dryRunSupported: false,
          },
        },
      }),
    ).resolves.toEqual({ action: "allow" });
  });

  it("uses resolved Google Workspace account ids for reusable call grants", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "google_workspace_call",
      toolInput: {
        accountHint: "default",
        resolvedAccountHint: "travis@example.test",
        methodId: "calendar.events.list",
        method: {
          id: "calendar.events.list",
          service: "calendar",
          resource: "events",
          method: "list",
          label: "List events",
          description: "List calendar events.",
          httpMethod: "GET",
          path: "calendar/v3/calendars/{calendarId}/events",
          scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
          sideEffect: "personal_content_read",
          dryRunSupported: false,
        },
      },
    });

    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.grantTargetKind).toBe("connector");
      expect(decision.request.grantTargetLabel).toBe("Google Calendar read access (travis@example.test)");
      expect(decision.request.grantConditions).toMatchObject({
        googleWorkspaceConnectorId: "google.calendar",
        googleWorkspaceAccountId: "travis@example.test",
        requestedAccountHint: "default",
        resolvedAccountHint: "travis@example.test",
      });
      expect(decision.request.detail).toContain("Account: travis@example.test");
    }
  });

  it("prompts before materializing a managed Google Workspace file in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "google_workspace_materialize_file",
      toolInput: {
        handle: "file-handle-1",
        path: "exports/report.pdf",
      },
    });

    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.title).toContain("Save Google Workspace file");
      expect(decision.request.grantActionKind).toBe("local_file_write");
      expect(decision.request.grantTargetKind).toBe("path");
      expect(decision.request.grantTargetLabel).toContain("exports/report.pdf");
      expect(decision.request.detail).toContain("Handle: file-handle-1");
      expect(decision.request.detail).toContain("Workspace path: exports/report.pdf");
    }
  });

  it("includes Google Workspace upload context in mutation approval copy", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "google_workspace_call",
      toolInput: {
        accountHint: "travis@example.test",
        methodId: "drive.files.create",
        body: { name: "upload.txt" },
        upload: { path: "uploads/upload.txt", mimeType: "text/plain" },
        method: {
          id: "drive.files.create",
          service: "drive",
          resource: "files",
          method: "create",
          label: "Create Drive file",
          description: "Creates a Drive file.",
          httpMethod: "POST",
          scopes: ["https://www.googleapis.com/auth/drive.file"],
          sideEffect: "data_mutation",
          dryRunSupported: true,
        },
      },
    });

    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.title).toContain("Google Workspace data mutation");
      expect(decision.request.detail).toContain("Upload: workspace path uploads/upload.txt; mimeType text/plain");
      expect(decision.request.detail).not.toContain("/Users/");
    }
  });

  it("includes Gmail draft attachment context without raw draft body", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "google_workspace_call",
      toolInput: {
        accountHint: "travis@example.test",
        methodId: "gmail.users.drafts.create",
        params: { userId: "me" },
        gmailDraft: {
          to: "nobody@example.test",
          subject: "Attachment fixture",
          textBody: "secret draft body",
          attachments: [{ path: "attachments/notes.txt", mimeType: "text/plain" }],
        },
        method: {
          id: "gmail.users.drafts.create",
          service: "gmail",
          resource: "users.drafts",
          method: "create",
          label: "Create Gmail draft",
          description: "Create a Gmail draft.",
          httpMethod: "POST",
          scopes: ["https://www.googleapis.com/auth/gmail.compose"],
          sideEffect: "draft_write",
          dryRunSupported: true,
        },
      },
    });

    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.title).toContain("draft change");
      expect(decision.request.detail).toContain("Gmail draft: subject Attachment fixture; to yes; attachments 1; attachment paths attachments/notes.txt");
      expect(decision.request.detail).not.toContain("secret draft body");
      expect(decision.request.detail).not.toContain("/Users/");
    }
  });

  it("prompts with high-friction copy for Google Workspace external communication", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "google_workspace_call",
      toolInput: {
        accountHint: "travis@example.test",
        methodId: "gmail.users.drafts.send",
        params: { userId: "me", id: "draft-1" },
        method: {
          id: "gmail.users.drafts.send",
          service: "gmail",
          resource: "users.drafts",
          method: "send",
          label: "Send Gmail draft",
          description: "Send a Gmail draft.",
          httpMethod: "POST",
          scopes: ["https://www.googleapis.com/auth/gmail.send"],
          sideEffect: "external_communication",
          dryRunSupported: true,
        },
      },
    });

    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.title).toContain("send external communication");
      expect(decision.request.grantActionKind).toBe("remote_mutation");
      expect(decision.request.detail).toContain("External communication: yes");
    }
  });

  it("classifies Gmail draft delete as a draft change rather than external communication", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "google_workspace_call",
      toolInput: {
        accountHint: "travis@example.test",
        methodId: "gmail.users.drafts.delete",
        params: { userId: "me", id: "draft-1" },
        method: {
          id: "gmail.users.drafts.delete",
          service: "gmail",
          resource: "users.drafts",
          method: "delete",
          label: "Delete Gmail draft",
          description: "Delete a Gmail draft without sending it.",
          httpMethod: "DELETE",
          scopes: ["https://www.googleapis.com/auth/gmail.compose"],
          sideEffect: "draft_write",
          dryRunSupported: true,
        },
      },
    });

    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.title).toContain("draft change");
      expect(decision.request.message).toContain("changes a draft but does not send it");
      expect(decision.request.detail).toContain("Side effect: draft_write");
      expect(decision.request.detail).toContain("External communication: no");
    }
  });

  it("keeps Gmail direct message send on external communication approval copy", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "google_workspace_call",
      toolInput: {
        accountHint: "travis@example.test",
        methodId: "gmail.users.messages.send",
        params: { userId: "me" },
        dryRun: true,
        method: {
          id: "gmail.users.messages.send",
          service: "gmail",
          resource: "users.messages",
          method: "send",
          label: "Send Gmail message",
          description: "Send a Gmail message.",
          httpMethod: "POST",
          scopes: ["https://www.googleapis.com/auth/gmail.send"],
          sideEffect: "external_communication",
          dryRunSupported: true,
        },
      },
    });

    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.title).toContain("send external communication");
      expect(decision.request.detail).toContain("Dry run requested: yes");
      expect(decision.request.detail).toContain("External communication: yes");
    }
  });

  it("prompts before browser tools control the active page in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "browser_keypress",
      toolInput: { keys: [{ key: "Space" }], profileMode: "isolated" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("browser-control");
    }
  });

  it("prompts with picker instructions before mediated browser picking in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "browser_pick",
      toolInput: { prompt: "Select the checkout button", profileMode: "isolated" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("browser-control");
      expect(decision.request.detail).toBe("Select the checkout button");
    }
  });

  it("prompts before browser tools use a copied Chrome profile in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "browser_search",
      toolInput: { query: "Ambient Desktop", profileMode: "copied" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("browser-profile");
      expect(decision.request.detail).toBe("Ambient Desktop");
    }
  });

  it("treats omitted browser profile mode as isolated in workspace mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      toolName: "browser_search",
      toolInput: { query: "Ambient Desktop" },
    });
    expect(decision.action).toBe("prompt");
    if (decision.action === "prompt") {
      expect(decision.request.risk).toBe("browser-network");
      expect(decision.request.detail).toBe("Ambient Desktop");
    }
  });

  it("allows isolated browser navigation in planner mode without a workspace prompt", async () => {
    await expect(
      classifyToolPermission({
        ...base,
        permissionMode: "workspace",
        collaborationMode: "planner",
        toolName: "browser_nav",
        toolInput: { url: "https://example.test", profileMode: "isolated" },
      }),
    ).resolves.toEqual({ action: "allow" });
  });

  it("allows default isolated browser profile access in planner mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      collaborationMode: "planner",
      toolName: "browser_nav",
      toolInput: { url: "https://example.test" },
    });
    expect(decision.action).toBe("allow");
  });

  it("blocks explicit copied browser profile access in planner mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "workspace",
      collaborationMode: "planner",
      toolName: "browser_nav",
      toolInput: { url: "https://example.test", profileMode: "copied" },
    });
    expect(decision.action).toBe("deny");
    if (decision.action === "deny") expect(decision.request.risk).toBe("browser-profile");
  });

  it("denies mutating tools in planner mode instead of prompting", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      collaborationMode: "planner",
      toolName: "write",
      toolInput: { path: "src/app.ts" },
    });

    expect(decision.action).toBe("deny");
    if (decision.action === "deny") {
      expect(decision.request.risk).toBe("workspace-command");
      expect(decision.reason).toContain("read-only");
    }
  });

  it("denies unsafe shell and test commands in planner mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      collaborationMode: "planner",
      toolName: "bash",
      toolInput: { command: "npm test" },
    });

    expect(decision.action).toBe("deny");
    if (decision.action === "deny") expect(decision.request.risk).toBe("workspace-command");
  });

  it("allows read-only shell inspection in planner mode", async () => {
    await expect(
      classifyToolPermission({
        ...base,
        permissionMode: "full-access",
        collaborationMode: "planner",
        toolName: "bash",
        toolInput: { command: "rg -n \"Planner\" src" },
      }),
    ).resolves.toEqual({ action: "allow" });
  });

  it("denies secret-looking reads in planner mode even with full access", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      collaborationMode: "planner",
      toolName: "read",
      toolInput: { path: ".env" },
    });

    expect(decision.action).toBe("deny");
    if (decision.action === "deny") expect(decision.request.risk).toBe("secret-path");
  });

  it("denies secret-looking shell reads in planner mode", async () => {
    const decision = await classifyToolPermission({
      ...base,
      permissionMode: "full-access",
      collaborationMode: "planner",
      toolName: "bash",
      toolInput: { command: "cat .ambient/cli-packages/secrets/brave/BRAVE_API_KEY.secret" },
    });

    expect(decision.action).toBe("deny");
    if (decision.action === "deny") expect(decision.request.risk).toBe("secret-path");
  });
});

function localDeepResearchInstallerShape() {
  return {
    schemaVersion: "ambient-local-model-installer-shape-v1",
    installerKind: "local-model",
    capabilityId: "local.deep-research.literesearcher",
    modelFamily: "LiteResearcher-4B",
    modelProfileId: "literesearcher-4b-q4-k-m",
    modelDisplayName: "LiteResearcher-4B Q4_K_M",
    quantization: "Q4_K_M",
    runtime: {
      source: "shared-llama-cpp-runtime",
      manifestId: "minicpm-v-llamacpp-runtime-pinned-b9122-2026-05-12",
      status: "needs-install",
      selectedArtifactId: "llama-cpp-macos-arm64-metal",
      downloadBytes: 8647910,
    },
    disk: {
      managedRootKind: "workspace-managed-state",
      modelDownloadBytes: 2716069088,
      runtimeDownloadBytes: 8647910,
      expectedDiskBytes: 2724716998,
      cacheRoots: [".ambient/local-deep-research/models", ".ambient/vision/minicpm-v/runtime"],
    },
    memory: {
      memoryTier: "standard",
      contextMode: "target-16k",
      contextTokens: 16384,
      estimatedResidentMemoryBytes: 7 * 1024 ** 3,
      activeLocalModelCount: 0,
      activeLocalModelEstimatedResidentMemoryBytes: 0,
      fit: "selected",
      warnings: [],
      blockers: [],
    },
    server: {
      host: "127.0.0.1",
      port: "auto",
      portAllocation: "loopback-auto-on-launch",
      lifecycle: "lease-managed",
      idleTimeoutMs: 300000,
      startsOnActions: ["smoke", "run"],
    },
    confirmation: {
      required: true,
      requiredForActions: ["install", "repair", "smoke"],
      reasons: [
        "Download 2.53 GiB for LiteResearcher-4B.Q4_K_M.gguf.",
        "Install shared llama.cpp runtime (8.2 MiB).",
      ],
    },
    lifecycle: {
      progressEvent: "local-deep-research-install-progress",
      progressPhases: ["preflight", "model-download-progress", "validation-ready"],
      cancellation: { supported: true, mechanism: "tool-abort-signal", resumableDownloads: true },
      logs: {
        installJobRoot: ".ambient/local-deep-research/install-jobs",
        serverStateRoot: ".ambient/local-deep-research/llama-server",
      },
      cleanup: {
        managedModelRoot: ".ambient/local-deep-research/models",
        managedRuntimeRoot: ".ambient/vision/minicpm-v/runtime",
        action: "settings-managed-cleanup",
      },
      smokeTest: { setupAction: "smoke", queryKind: "tiny-local-chat" },
    },
  };
}

describe("resolvePolicyPath", () => {
  it("treats symlink escapes as outside the workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-policy-"));
    const workspace = join(root, "workspace");
    const outside = join(root, "outside");
    await mkdir(workspace);
    await mkdir(outside);
    await symlink(outside, join(workspace, "linked-outside"));

    const result = await resolvePolicyPath(workspace, "linked-outside/secret.txt");
    expect(result.insideWorkspace).toBe(false);
  });
});

describe("extractCommandPathCandidates", () => {
  it("extracts outside-looking command paths", () => {
    expect(extractCommandPathCandidates("cat ../secret.txt && ls /tmp")).toEqual(["../secret.txt", "/tmp"]);
    expect(extractCommandPathCandidates("npm test")).toEqual([]);
  });

  it("ignores the POSIX null device when extracting command paths", () => {
    expect(extractCommandPathCandidates('node --test summarize.test.mjs > /dev/null 2>&1; echo "Exit code: $?"')).toEqual([]);
    expect(extractCommandPathCandidates("cat /dev/tty")).toEqual(["/dev/tty"]);
  });

  it("ignores inline JavaScript regex literals and comments when extracting shell paths", () => {
    const command = [
      'cd "/tmp/workspace/.ambient-codex/orchestration/workspaces/LOCAL-1"',
      "&& node --input-type=module -e '",
      'const match = content.match(/^---\\n([\\s\\S]*?)\\n---/);',
      "// Extract front matter between delimiters",
      'const tags = fm.match(/^tags:\\s*\\[(.+)\\]$/m);',
      'const wrongSort = valid.replace(/## vegetarian\\n\\n- \\[Garden Salad\\]\\(salad\\.md\\)/, "");',
      "'",
    ].join(" ");

    expect(extractCommandPathCandidates(command)).toEqual([
      "/tmp/workspace/.ambient-codex/orchestration/workspaces/LOCAL-1",
    ]);
  });

  it("ignores inline JavaScript slash operators while preserving real root shell operands", () => {
    const command = [
      'cd "/tmp/workspace"',
      '&& node -e "',
      "if (op === '/' && b === 0) console.log('divide');",
      "const ops = { '/': (a, b) => a / b };",
      '"',
    ].join(" ");

    expect(extractCommandPathCandidates(command)).toEqual(["/tmp/workspace"]);
    expect(extractCommandPathCandidates("ls /")).toEqual(["/"]);
  });

  it("extracts workspace-relative and managed secret command paths", () => {
    expect(
      extractCommandPathCandidates('cat ".ambient/cli-packages/secrets/brave/BRAVE_API_KEY.secret" src/app.ts ./scripts/run.sh https://example.test/a/b .env'),
    ).toEqual([
      ".ambient/cli-packages/secrets/brave/BRAVE_API_KEY.secret",
      "src/app.ts",
      "./scripts/run.sh",
      ".env",
    ]);
  });
});
