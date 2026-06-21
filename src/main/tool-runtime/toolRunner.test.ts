import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  buildMacosWorkspaceSandboxProfile,
  buildProcessInvocation,
  buildShellInvocation,
  buildToolRunnerEnv,
  createToolRunnerBashOperations,
  describeWorkspaceSandboxCapability,
  executableArchitectureFromFileOutput,
  isSecretEnvName,
  listManagedDevServers,
  normalizeToolRunnerRuntimeEnv,
  resolveToolExecutionTimeoutPolicy,
  runShellCommand,
  stopAllManagedDevServers,
  stopManagedDevServer,
} from "./toolRunner";

describe("buildProcessInvocation", () => {
  it("does not sandbox full-access invocations", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-runner-"));
    try {
      const invocation = buildProcessInvocation({
        command: "node",
        args: ["--version"],
        cwd: workspace,
        policy: { permissionMode: "full-access", workspacePath: workspace, subject: "plugin-mcp" },
        host: { platform: "darwin", executableExists: () => true },
      });

      expect(invocation.command).toBe("node");
      expect(invocation.args).toEqual(["--version"]);
      expect(invocation.sandbox.kind).toBe("none");
      expect(invocation.env.AMBIENT_TOOL_RUNNER_SANDBOX).toBe("none");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("does not inherit broad process env or explicit secret-like env", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-runner-"));
    try {
      const invocation = buildProcessInvocation({
        command: "node",
        args: ["--version"],
        cwd: workspace,
        env: {
          PATH: "/safe/bin",
          SAFE_FLAG: "1",
          AMBIENT_API_KEY: "ambient-secret",
          AMBIENT_AGENT_AMBIENT_API_KEY: "agent-secret",
          OPENAI_API_KEY: "provider-secret",
          SOME_TOKEN: "token-secret",
        },
        policy: { permissionMode: "full-access", workspacePath: workspace, subject: "plugin-mcp" },
      });

      expect(invocation.env.PATH).toBe("/safe/bin");
      expect(invocation.env.SAFE_FLAG).toBe("1");
      expect(invocation.env.AMBIENT_API_KEY).toBeUndefined();
      expect(invocation.env.AMBIENT_AGENT_AMBIENT_API_KEY).toBeUndefined();
      expect(invocation.env.OPENAI_API_KEY).toBeUndefined();
      expect(invocation.env.SOME_TOKEN).toBeUndefined();
      expect(invocation.env.AMBIENT_TOOL_RUNNER_SUBJECT).toBe("plugin-mcp");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("wraps workspace-mode macOS invocations with sandbox-exec when available", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-runner-"));
    try {
      const invocation = buildProcessInvocation({
        command: "git",
        args: ["status"],
        cwd: workspace,
        policy: { permissionMode: "workspace", workspacePath: workspace, subject: "plugin-mcp" },
        host: { platform: "darwin", sandboxExecPath: "/sandbox-exec", executableExists: () => true },
      });

      expect(invocation.command).toBe("/sandbox-exec");
      expect(invocation.args.slice(-2)).toEqual(["git", "status"]);
      expect(invocation.sandbox.kind).toBe("macos-sandbox-exec");
      expect(invocation.env.AMBIENT_TOOL_RUNNER_SANDBOX).toBe("macos-sandbox-exec");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("falls back to policy-only workspace enforcement when no host sandbox is available", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-runner-"));
    try {
      const invocation = buildShellInvocation({
        command: "pwd",
        cwd: workspace,
        policy: { permissionMode: "workspace", workspacePath: workspace, subject: "pi-bash" },
        host: { platform: "linux", executableExists: () => false },
      });

      expect(invocation.sandbox.kind).toBe("policy-only");
      expect(invocation.env.TMPDIR).toContain(".ambient-codex");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects a cwd outside the workspace authority", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runner-"));
    const workspace = join(root, "workspace");
    const outside = join(root, "outside");
    await mkdir(workspace);
    await mkdir(outside);
    try {
      expect(() =>
        buildProcessInvocation({
          command: "node",
          cwd: outside,
          policy: { permissionMode: "workspace", workspacePath: workspace, subject: "plugin-mcp" },
        }),
      ).toThrow("outside the current workspace authority");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("allows workspace-mode cwd inside an explicit authority root", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runner-authority-"));
    const projectRoot = join(root, "project");
    const workspace = join(projectRoot, ".ambient-codex", "worktrees", "thread-1");
    await mkdir(workspace, { recursive: true });
    try {
      const invocation = buildProcessInvocation({
        command: "git",
        args: ["status"],
        cwd: projectRoot,
        policy: {
          permissionMode: "workspace",
          workspacePath: workspace,
          authorityRootPaths: [projectRoot],
          subject: "pi-bash",
        },
        host: { platform: "linux", executableExists: () => true },
      });

      expect(invocation.cwd).toBe(await realpath(projectRoot));
      expect(invocation.sandbox.kind).toBe("policy-only");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("can disable implicit workspace cwd authority for child-scoped shell runs", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runner-child-authority-"));
    const workspace = join(root, "workspace");
    const allowed = join(root, "allowed");
    await mkdir(workspace, { recursive: true });
    await mkdir(allowed, { recursive: true });
    try {
      expect(() =>
        buildProcessInvocation({
          command: "node",
          cwd: workspace,
          policy: {
            permissionMode: "workspace",
            workspacePath: workspace,
            authorityRootPaths: [allowed],
            includeWorkspaceRootAuthority: false,
            subject: "pi-bash",
          },
        }),
      ).toThrow("outside the current workspace authority");

      const invocation = buildProcessInvocation({
        command: "node",
        cwd: allowed,
        policy: {
          permissionMode: "workspace",
          workspacePath: workspace,
          authorityRootPaths: [allowed],
          includeWorkspaceRootAuthority: false,
          subject: "pi-bash",
        },
        host: { platform: "linux", executableExists: () => true },
      });

      expect(invocation.cwd).toBe(await realpath(allowed));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("falls back to policy-only for Node-like runtimes that abort under the first macOS sandbox profile", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-runner-"));
    try {
      const direct = buildProcessInvocation({
        command: "node",
        args: ["server.js"],
        cwd: workspace,
        policy: { permissionMode: "workspace", workspacePath: workspace, subject: "plugin-mcp" },
        host: { platform: "darwin", sandboxExecPath: "/sandbox-exec", executableExists: () => true },
      });
      const shell = buildShellInvocation({
        command: "node -e 'console.log(1)'",
        cwd: workspace,
        policy: { permissionMode: "workspace", workspacePath: workspace, subject: "pi-bash" },
        host: { platform: "darwin", sandboxExecPath: "/sandbox-exec", executableExists: () => true },
      });

      expect(direct.command).toBe("node");
      expect(direct.sandbox.kind).toBe("policy-only");
      expect(direct.sandbox.reason).toContain("node currently aborts");
      expect(shell.command).toBe("/bin/sh");
      expect(shell.sandbox.kind).toBe("policy-only");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("keeps macOS shell commands policy-only until the helper sandbox exists", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-runner-"));
    try {
      const invocation = buildShellInvocation({
        command: "ls -la",
        cwd: workspace,
        policy: { permissionMode: "workspace", workspacePath: workspace, subject: "pi-bash" },
        host: { platform: "darwin", sandboxExecPath: "/sandbox-exec", executableExists: () => true },
      });

      expect(invocation.command).toBe("/bin/sh");
      expect(invocation.sandbox.kind).toBe("policy-only");
      expect(invocation.sandbox.reason).toContain("shell command execution currently aborts");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("includes authority roots in the macOS workspace sandbox profile", () => {
    const profile = buildMacosWorkspaceSandboxProfile("/tmp/project/.ambient-codex/worktrees/thread-1", "/tmp/ambient-temp", [
      "/tmp/project/.ambient-codex/worktrees/thread-1",
      "/tmp/project",
    ]);

    expect(profile).toContain('"/tmp/project/.ambient-codex/worktrees/thread-1"');
    expect(profile).toContain('"/tmp/project"');
  });
});

describe("buildToolRunnerEnv", () => {
  it("copies only safe inherited env keys and non-secret explicit env", () => {
    const env = buildToolRunnerEnv(
      {
        PATH: "/usr/bin",
        HOME: "/Users/tester",
        AMBIENT_API_KEY: "ambient-secret",
        OPENAI_API_KEY: "provider-secret",
        SHELL: "/bin/zsh",
        UNRELATED_BASE: "drop-me",
      },
      {
        SAFE_FLAG: "1",
        CUSTOM_CONFIG_PATH: "/tmp/config.json",
        PACKAGE_TOKEN: "token-secret",
        PASSWORD: "password-secret",
      },
    );

    expect(env).toMatchObject({
      PATH: "/usr/bin",
      HOME: "/Users/tester",
      SHELL: "/bin/zsh",
      SAFE_FLAG: "1",
      CUSTOM_CONFIG_PATH: "/tmp/config.json",
    });
    expect(env.AMBIENT_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.UNRELATED_BASE).toBeUndefined();
    expect(env.PACKAGE_TOKEN).toBeUndefined();
    expect(env.PASSWORD).toBeUndefined();
  });
});

describe("normalizeToolRunnerRuntimeEnv", () => {
  it("prefers native Homebrew Node for Pi bash on Apple Silicon", () => {
    const env = normalizeToolRunnerRuntimeEnv(
      {
        PATH: ["<local-user>/.pi/agent/bin", "/usr/local/bin", "/opt/homebrew/bin", "/usr/bin"].join(delimiter),
        HOME: "<local-user>",
      },
      { permissionMode: "full-access", workspacePath: "/workspace", subject: "pi-bash" },
      {
        platform: "darwin",
        arch: "arm64",
        executableExists: (path) => path === "/opt/homebrew/bin/node",
        executableArchitecture: (path) => (path === "/opt/homebrew/bin/node" ? "arm64" : undefined),
        realpath: (path) => path,
      },
    );

    expect(env.PATH?.split(delimiter).slice(0, 4)).toEqual(["/opt/homebrew/bin", "/opt/homebrew/sbin", "<local-user>/.pi/agent/bin", "/usr/local/bin"]);
    expect(env.PATH?.split(delimiter).filter((entry) => entry === "/opt/homebrew/bin")).toHaveLength(1);
    expect(env.npm_node_execpath).toBe("/opt/homebrew/bin/node");
    expect(env.NODE).toBe("/opt/homebrew/bin/node");
    expect(env.AMBIENT_TOOL_RUNNER_RUNTIME_FIXUP).toBe("darwin-arm64-native-node");
  });

  it("does not force native Node for plugin MCP processes or non-arm64 hosts", () => {
    const base = { PATH: "<local-user>/.pi/agent/bin:/usr/local/bin" };
    const host = {
      platform: "darwin" as const,
      arch: "arm64" as const,
      executableExists: () => true,
      executableArchitecture: () => "arm64" as const,
    };

    expect(normalizeToolRunnerRuntimeEnv(base, { permissionMode: "full-access", workspacePath: "/workspace", subject: "plugin-mcp" }, host)).toEqual(base);
    expect(
      normalizeToolRunnerRuntimeEnv(base, { permissionMode: "full-access", workspacePath: "/workspace", subject: "pi-bash" }, { ...host, arch: "x64" }),
    ).toEqual(base);
  });
});

describe("executableArchitectureFromFileOutput", () => {
  it("detects common macOS executable architectures", () => {
    expect(executableArchitectureFromFileOutput("/opt/homebrew/bin/node: Mach-O 64-bit executable arm64")).toBe("arm64");
    expect(executableArchitectureFromFileOutput("/usr/local/bin/node: Mach-O 64-bit executable x86_64")).toBe("x64");
    expect(executableArchitectureFromFileOutput("universal binary with 2 architectures: [x86_64] [arm64]")).toBe("arm64");
    expect(executableArchitectureFromFileOutput("POSIX shell script text executable")).toBeUndefined();
  });
});

describe("isSecretEnvName", () => {
  it("detects common secret-bearing env names without matching unrelated words", () => {
    expect(isSecretEnvName("AMBIENT_API_KEY")).toBe(true);
    expect(isSecretEnvName("AMBIENT_AGENT_AMBIENT_API_KEY")).toBe(true);
    expect(isSecretEnvName("OPENAI_API_KEY")).toBe(true);
    expect(isSecretEnvName("GITHUB_TOKEN")).toBe(true);
    expect(isSecretEnvName("TOKENIZERS_PARALLELISM")).toBe(false);
    expect(isSecretEnvName("PATH")).toBe(false);
  });
});

describe("buildMacosWorkspaceSandboxProfile", () => {
  it("limits writes to the workspace and denies network", () => {
    const profile = buildMacosWorkspaceSandboxProfile("/tmp/project");

    expect(profile).toContain('(allow file-write* (subpath "/tmp/project"))');
    expect(profile).toContain("(deny network*)");
    expect(profile).toContain('(allow file-read* (subpath "/usr"))');
  });
});

describe("describeWorkspaceSandboxCapability", () => {
  it("reports OS-enforced containment on macOS when sandbox-exec is available", () => {
    expect(
      describeWorkspaceSandboxCapability({
        platform: "darwin",
        sandboxExecPath: "/sandbox-exec",
        executableExists: () => true,
      }),
    ).toMatchObject({
      kind: "macos-sandbox-exec",
      osEnforced: true,
    });
  });

  it("reports policy-only containment and the next helper target on Linux and Windows", () => {
    expect(describeWorkspaceSandboxCapability({ platform: "linux", executableExists: () => false })).toMatchObject({
      kind: "policy-only",
      osEnforced: false,
      nextStep: expect.stringContaining("namespace helper"),
    });
    expect(describeWorkspaceSandboxCapability({ platform: "win32", executableExists: () => false })).toMatchObject({
      kind: "policy-only",
      osEnforced: false,
      nextStep: expect.stringContaining("restricted-token"),
    });
  });
});

describe("runShellCommand", () => {
  it("executes a simple command through the runner", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-runner-"));
    let output = "";
    try {
      await expect(
        runShellCommand({
          command: "printf runner-ok",
          cwd: workspace,
          policy: { permissionMode: "full-access", workspacePath: workspace, subject: "workflow-hook" },
          onData: (data) => {
            output += data.toString("utf8");
          },
        }),
      ).resolves.toEqual({ exitCode: 0 });
      expect(output).toBe("runner-ok");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("handles rapid command exits", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-runner-"));
    try {
      for (let index = 0; index < 20; index += 1) {
        await expect(
          runShellCommand({
            command: "true",
            cwd: workspace,
            policy: { permissionMode: "full-access", workspacePath: workspace, subject: "workflow-hook" },
            onData: () => undefined,
          }),
        ).resolves.toEqual({ exitCode: 0 });
      }
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("does not hang when a descendant keeps stdout handles open", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-runner-"));
    let output = "";
    const childScript = "setTimeout(() => {}, 3000);";
    const parentScript = [
      'const { spawn } = require("node:child_process");',
      `const child = spawn(process.execPath, ["-e", ${JSON.stringify(childScript)}], { stdio: ["ignore", "inherit", "inherit"], detached: true });`,
      "child.unref();",
      'console.log("parent-done");',
    ].join("");
    const startedAt = Date.now();
    try {
      await expect(
        runShellCommand({
          command: `${JSON.stringify(process.execPath)} -e ${JSON.stringify(parentScript)}`,
          cwd: workspace,
          policy: { permissionMode: "full-access", workspacePath: workspace, subject: "workflow-hook" },
          onData: (data) => {
            output += data.toString("utf8");
          },
        }),
      ).resolves.toEqual({ exitCode: 0 });
      expect(Date.now() - startedAt).toBeLessThan(1500);
      expect(output).toContain("parent-done");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("resets the shell idle timeout when stdout or stderr is still arriving", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-runner-idle-progress-"));
    let output = "";
    const script = [
      'console.log("tick-0");',
      "let count = 0;",
      "const timer = setInterval(() => {",
      "  count += 1;",
      "  console.log('tick-' + count);",
      "  if (count === 4) { clearInterval(timer); process.exit(0); }",
      "}, 80);",
    ].join("");
    try {
      await expect(
        runShellCommand({
          command: `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`,
          cwd: workspace,
          policy: { permissionMode: "full-access", workspacePath: workspace, subject: "workflow-hook" },
          timeoutPolicy: { descriptorClass: "quick-probe", idleTimeoutMs: 200, maxRunMs: 1_500 },
          onData: (data) => {
            output += data.toString("utf8");
          },
        }),
      ).resolves.toEqual({ exitCode: 0 });
      expect(output).toContain("tick-4");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("kills a silent shell command only after the idle timeout window", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-runner-idle-timeout-"));
    let output = "";
    try {
      await expect(
        runShellCommand({
          command: `${JSON.stringify(process.execPath)} -e "setTimeout(() => {}, 500)"`,
          cwd: workspace,
          policy: { permissionMode: "full-access", workspacePath: workspace, subject: "workflow-hook" },
          timeoutPolicy: { descriptorClass: "quick-probe", idleTimeoutMs: 50, maxRunMs: 1_000 },
          onData: (data) => {
            output += data.toString("utf8");
          },
        }),
      ).rejects.toThrow("timeout:idle:50");
      expect(output).toContain("Ambient tool runner timeout: killed the process tree after 50ms without stdout/stderr activity");
      expect(output).toContain("descriptorClass=quick-probe");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("clamps obviously short Pi-requested bash timeouts to the descriptor minimum", async () => {
    const policy = resolveToolExecutionTimeoutPolicy({
      command: "git status --short",
      subject: "pi-bash",
      requestedTimeoutSeconds: 10,
    });

    expect(policy).toMatchObject({
      descriptorClass: "quick-probe",
      requestedTimeoutMs: 10_000,
      idleTimeoutMs: 30_000,
      clampedIdleTimeoutMs: 30_000,
      maxRunMs: 120_000,
    });
  });

  it("streams a diagnostic when a command timeout kills the process tree", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-runner-timeout-"));
    let output = "";
    try {
      await expect(
        runShellCommand({
          command: "sleep 2",
          cwd: workspace,
          timeout: 0.1,
          policy: { permissionMode: "full-access", workspacePath: workspace, subject: "workflow-hook" },
          timeoutPolicy: { descriptorClass: "quick-probe", idleTimeoutMs: 100, maxRunMs: 1_000 },
          onData: (data) => {
            output += data.toString("utf8");
          },
        }),
      ).rejects.toThrow("timeout:idle:100");
      expect(output).toContain("Ambient tool runner timeout: killed the process tree after 100ms without stdout/stderr activity");
      expect(output).toContain("0 stdout/stderr bytes received before timeout");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("materializes large shell output and streams only a bounded preview", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-runner-large-output-"));
    let output = "";
    try {
      await expect(
        runShellCommand({
          command: `"${process.execPath}" -e "process.stdout.write('x'.repeat(200))"`,
          cwd: workspace,
          policy: { permissionMode: "full-access", workspacePath: workspace, subject: "pi-bash" },
          maxOutputPreviewChars: 40,
          outputArtifactLabel: "large-shell-test-output",
          onData: (data) => {
            output += data.toString("utf8");
          },
        }),
      ).resolves.toEqual({ exitCode: 0 });

      expect(output.startsWith("x".repeat(40))).toBe(true);
      expect(output).not.toContain("x".repeat(80));
      expect(output).toContain("[truncated] shell command stdout preview is 40 of 200 chars");
      expect(output).toContain("Use file_read for exact text, or long_context_process");
      expect(output).toContain("Structured next step:");
      expect(output).toContain('"recommendedNextTools":["file_read","long_context_process"]');
      const artifactPath = output.match(/Full output saved at: (.+)$/m)?.[1];
      expect(artifactPath).toBeDefined();
      await expect(readFile(join(workspace, artifactPath!), "utf8")).resolves.toBe("x".repeat(200));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("materializes large stdout and stderr as separate artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-runner-split-output-"));
    let output = "";
    try {
      await expect(
        runShellCommand({
          command: `${JSON.stringify(process.execPath)} -e "process.stdout.write('o'.repeat(120)); process.stderr.write('e'.repeat(120))"`,
          cwd: workspace,
          policy: { permissionMode: "full-access", workspacePath: workspace, subject: "pi-bash" },
          maxOutputPreviewChars: 30,
          outputArtifactLabel: "split-shell-test-output",
          onData: (data) => {
            output += data.toString("utf8");
          },
        }),
      ).resolves.toEqual({ exitCode: 0 });

      expect(output).toContain("[truncated] shell command stdout preview is 30 of 120 chars");
      expect(output).toContain("[truncated] shell command stderr preview is 30 of 120 chars");
      const artifactPaths = [...output.matchAll(/Full output saved at: (.+)$/gm)].map((match) => match[1]);
      expect(artifactPaths).toHaveLength(2);
      const stdoutPath = artifactPaths.find((artifactPath) => artifactPath.includes("stdout"));
      const stderrPath = artifactPaths.find((artifactPath) => artifactPath.includes("stderr"));
      expect(stdoutPath).toBeDefined();
      expect(stderrPath).toBeDefined();
      await expect(readFile(join(workspace, stdoutPath!), "utf8")).resolves.toBe("o".repeat(120));
      await expect(readFile(join(workspace, stderrPath!), "utf8")).resolves.toBe("e".repeat(120));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("treats dev-server commands as ready without waiting for process exit", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-runner-dev-server-"));
    let output = "";
    const script = [
      'console.log("VITE v5.0.0  ready in 100 ms");',
      'console.log("  Local:   http://localhost:5173/");',
      "setInterval(() => {}, 1000);",
    ].join("");
    try {
      const result = await runShellCommand({
        command: `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`,
        cwd: workspace,
        policy: { permissionMode: "full-access", workspacePath: workspace, subject: "pi-bash" },
        timeoutPolicy: { descriptorClass: "dev-server", idleTimeoutMs: 1_000, maxRunMs: null },
        onData: (data) => {
          output += data.toString("utf8");
        },
      });

      expect(result).toEqual({ exitCode: null });
      expect(output).toContain("ready in 100 ms");
      expect(output).toContain("Ambient tool runner dev-server: readiness detected");
      const [server] = listManagedDevServers();
      expect(server).toMatchObject({ command: expect.stringContaining(process.execPath) });
      expect(server?.cwd).toContain("ambient-runner-dev-server-");
      expect(server?.id).toBeTruthy();
      expect(stopManagedDevServer(server!.id)).toBe(true);
      expect(listManagedDevServers()).toEqual([]);
    } finally {
      stopAllManagedDevServers();
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("streams output through Pi's bash tool wrapper", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-bash-"));
    try {
      await writeFile(join(workspace, "fixture.txt"), "ok", "utf8");
      const bashTool = createBashTool(workspace, {
        operations: createToolRunnerBashOperations(() => ({
          permissionMode: "full-access",
          workspacePath: workspace,
          subject: "pi-bash",
        })),
      });
      const result = await bashTool.execute(
        "call-1",
        { command: "ls -1 fixture.txt" },
        new AbortController().signal,
        () => undefined,
      );
      expect(JSON.stringify(result)).toContain("fixture.txt");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects tokenized Ambient/Pi shell commands before running the shell", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-bash-tokenized-"));
    try {
      const operations = createToolRunnerBashOperations(() => ({
        permissionMode: "full-access",
        workspacePath: workspace,
        subject: "pi-bash",
      }));
      expect(() =>
        operations.exec("which Ġpython 3", workspace, {
          onData: () => undefined,
          signal: new AbortController().signal,
        }),
      ).toThrow("tokenizer-space markers");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("streams output through Pi's bash tool wrapper in workspace mode", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-bash-workspace-"));
    try {
      await writeFile(join(workspace, "workspace-fixture.txt"), "ok", "utf8");
      const bashTool = createBashTool(workspace, {
        operations: createToolRunnerBashOperations(() => ({
          permissionMode: "workspace",
          workspacePath: workspace,
          subject: "pi-bash",
        })),
      });
      const result = await bashTool.execute(
        "call-1",
        { command: "ls -1 workspace-fixture.txt" },
        new AbortController().signal,
        () => undefined,
      );
      expect(JSON.stringify(result)).toContain("workspace-fixture.txt");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
