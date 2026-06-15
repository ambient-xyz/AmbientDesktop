import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { GoogleWorkspaceCliAdapter } from "./googleWorkspaceCliAdapter";
import { GoogleWorkspaceSetupService } from "./googleWorkspaceSetupService";

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  killed = false;
  kill(): boolean {
    this.killed = true;
    this.emit("exit", null, "SIGTERM");
    return true;
  }
}

describe("GoogleWorkspaceSetupService", () => {
  it("starts gws auth login, captures the auth URL, and opens it", () => {
    const child = new FakeChild();
    const openExternal = vi.fn();
    const spawnProcess = vi.fn(() => child);
    const service = new GoogleWorkspaceSetupService({
      adapter: new GoogleWorkspaceCliAdapter({
        binaryPath: "/opt/bin/gws",
        fileExists: () => true,
        appUserDataPath: "/tmp/ambient",
      }),
      accountsPath: "/tmp/ambient/accounts.json",
      env: {
        GOOGLE_WORKSPACE_CLI_CLIENT_ID: "client-id",
        GOOGLE_WORKSPACE_CLI_CLIENT_SECRET: "client-secret",
      },
      spawnProcess: spawnProcess as never,
      openExternal,
      now: () => new Date("2026-05-03T00:00:00.000Z"),
    });

    const state = service.start({ accountHint: "travis@example.test", command: "login" });
    expect(state).toMatchObject({
      status: "running",
      command: "login",
      accountHint: "travis@example.test",
      configDir: "/tmp/ambient/google-workspace-cli/travis@example.test",
      oauthClientConfigured: true,
    });
    child.stderr.write("Open https://accounts.google.com/o/oauth2/v2/auth?client_id=test to continue\n");
    expect(spawnProcess).toHaveBeenCalledWith(
      "/opt/bin/gws",
      expect.arrayContaining(["auth", "login", "--scopes"]),
      expect.any(Object),
    );
    expect(service.state()).toMatchObject({
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=test",
      openedAuthUrl: true,
    });
    expect(openExternal).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?client_id=test");
  });

  it("does not run gws auth setup from Connect account when no OAuth client is configured", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-gws-"));
    const spawnProcess = vi.fn();
    const service = new GoogleWorkspaceSetupService({
      adapter: new GoogleWorkspaceCliAdapter({
        binaryPath: "/opt/bin/gws",
        fileExists: () => true,
        appUserDataPath: dir,
      }),
      accountsPath: join(dir, "accounts.json"),
      spawnProcess: spawnProcess as never,
      now: () => new Date("2026-05-03T00:00:00.000Z"),
    });

    const state = service.start({ accountHint: "travis@example.test", command: "login" });
    expect(state).toMatchObject({
      status: "error",
      command: "login",
      accountHint: "travis@example.test",
      oauthClientConfigured: false,
      requiredAction: "oauth_client_config",
      error: expect.stringContaining("Desktop OAuth client config"),
      outputTail: expect.stringContaining("gws auth setup"),
    });
    expect(spawnProcess).not.toHaveBeenCalled();
    await rm(dir, { recursive: true, force: true });
  });

  it("does not complete explicit setup when setup does not create an OAuth client", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-gws-"));
    const setupChild = new FakeChild();
    const spawnProcess = vi.fn().mockReturnValueOnce(setupChild);
    const service = new GoogleWorkspaceSetupService({
      adapter: new GoogleWorkspaceCliAdapter({
        binaryPath: "/opt/bin/gws",
        fileExists: () => true,
        appUserDataPath: dir,
      }),
      accountsPath: join(dir, "accounts.json"),
      spawnProcess: spawnProcess as never,
      now: () => new Date("2026-05-03T00:00:00.000Z"),
    });

    service.start({ accountHint: "travis@example.test", command: "setup" });
    expect(spawnProcess).toHaveBeenNthCalledWith(1, "/opt/bin/gws", ["auth", "setup"], expect.any(Object));
    setupChild.emit("exit", 0, null);
    expect(spawnProcess).toHaveBeenCalledTimes(1);
    expect(service.state()).toMatchObject({
      status: "error",
      command: "setup",
      oauthClientConfigured: false,
      error: expect.stringContaining("no OAuth client config was created"),
    });
    await rm(dir, { recursive: true, force: true });
  });

  it("runs explicit setup through gws without requiring Google Cloud CLI", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-gws-"));
    const setupChild = new FakeChild();
    const spawnProcess = vi.fn().mockReturnValueOnce(setupChild);
    const service = new GoogleWorkspaceSetupService({
      adapter: new GoogleWorkspaceCliAdapter({
        binaryPath: "/opt/bin/gws",
        fileExists: () => true,
        appUserDataPath: dir,
      }),
      accountsPath: join(dir, "accounts.json"),
      spawnProcess: spawnProcess as never,
      now: () => new Date("2026-05-03T00:00:00.000Z"),
    });

    const state = service.start({ accountHint: "travis@example.test", command: "setup" });
    expect(state).toMatchObject({ status: "running", command: "setup", accountHint: "travis@example.test" });
    expect(spawnProcess).toHaveBeenNthCalledWith(
      1,
      "/opt/bin/gws",
      ["auth", "setup"],
      expect.any(Object),
    );

    await mkdir(join(dir, "google-workspace-cli", "travis@example.test"), { recursive: true });
    await writeFile(join(dir, "google-workspace-cli", "travis@example.test", "client_secret.json"), "{}", "utf8");
    setupChild.emit("exit", 0, null);
    expect(service.state()).toMatchObject({
      status: "completed",
      command: "setup",
      accountHint: "travis@example.test",
      oauthClientConfigured: true,
    });
    await rm(dir, { recursive: true, force: true });
  });

  it("opens the Google Cloud OAuth client page when setup requires manual client config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-gws-"));
    const setupChild = new FakeChild();
    const openExternal = vi.fn();
    const spawnProcess = vi.fn().mockReturnValueOnce(setupChild);
    const service = new GoogleWorkspaceSetupService({
      adapter: new GoogleWorkspaceCliAdapter({
        binaryPath: "/opt/bin/gws",
        fileExists: () => true,
        appUserDataPath: dir,
      }),
      accountsPath: join(dir, "accounts.json"),
      spawnProcess: spawnProcess as never,
      openExternal,
      now: () => new Date("2026-05-03T00:00:00.000Z"),
    });
    const credentialsUrl = "https://console.cloud.google.com/apis/credentials?project=ambient-gws-test";

    service.start({ accountHint: "default", command: "setup" });
    setupChild.stderr.write(`OAuth client creation requires manual setup.\nCreate an OAuth client ID:\n${credentialsUrl}\nDownload client_secret_*.json.\n`);
    setupChild.emit("exit", 2, null);

    expect(service.state()).toMatchObject({
      status: "error",
      requiredAction: "oauth_client_config",
      oauthClientConfigUrl: credentialsUrl,
      openedOAuthClientConfigUrl: true,
      error: expect.stringContaining("Desktop OAuth client config"),
    });
    expect(openExternal).toHaveBeenCalledWith(credentialsUrl);
    await rm(dir, { recursive: true, force: true });
  });

  it("strips escaped JSON newlines from the Google Cloud OAuth client URL", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-gws-"));
    const setupChild = new FakeChild();
    const openExternal = vi.fn();
    const spawnProcess = vi.fn().mockReturnValueOnce(setupChild);
    const service = new GoogleWorkspaceSetupService({
      adapter: new GoogleWorkspaceCliAdapter({
        binaryPath: "/opt/bin/gws",
        fileExists: () => true,
        appUserDataPath: dir,
      }),
      accountsPath: join(dir, "accounts.json"),
      spawnProcess: spawnProcess as never,
      openExternal,
      now: () => new Date("2026-05-03T00:00:00.000Z"),
    });
    const credentialsUrl = "https://console.cloud.google.com/apis/credentials?project=ambient-gws-test-20260504";

    service.start({ accountHint: "default", command: "setup" });
    setupChild.stderr.write(`{\"message\":\"OAuth client creation requires manual setup. Create an OAuth client ID:\\n   ${credentialsUrl}\\\\n   then download client_secret_*.json\"}`);
    setupChild.emit("exit", 2, null);

    expect(service.state()).toMatchObject({
      requiredAction: "oauth_client_config",
      oauthClientConfigUrl: credentialsUrl,
    });
    expect(openExternal).toHaveBeenCalledWith(credentialsUrl);
    await rm(dir, { recursive: true, force: true });
  });

  it("imports downloaded Google OAuth client JSON into the selected gws account", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-gws-"));
    try {
      const sourcePath = join(dir, "client_secret_download.json");
      await writeFile(sourcePath, `${JSON.stringify({
        installed: {
          client_id: "client-id.apps.googleusercontent.com",
          client_secret: "client-secret",
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token",
          project_id: "ambient-gws-test",
          redirect_uris: ["http://localhost"],
        },
      }, null, 2)}\n`, "utf8");
      const service = new GoogleWorkspaceSetupService({
        adapter: new GoogleWorkspaceCliAdapter({
          binaryPath: "/opt/bin/gws",
          fileExists: () => true,
          appUserDataPath: dir,
        }),
        accountsPath: join(dir, "accounts.json"),
        now: () => new Date("2026-05-03T00:00:00.000Z"),
      });

      await expect(service.importOAuthClientConfig({ accountHint: "work", sourcePath })).resolves.toMatchObject({
        status: "completed",
        accountHint: "work",
        oauthClientConfigured: true,
      });
      const imported = JSON.parse(await readFile(join(dir, "google-workspace-cli", "work", "client_secret.json"), "utf8"));
      expect(imported.installed).toMatchObject({
        client_id: "client-id.apps.googleusercontent.com",
        client_secret: "client-secret",
        project_id: "ambient-gws-test",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("persists a validated gws account record", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-gws-"));
    try {
      const runner = vi.fn().mockResolvedValue({ stdout: "{}", stderr: "", exitCode: 0 });
      const service = new GoogleWorkspaceSetupService({
        adapter: new GoogleWorkspaceCliAdapter({
          binaryPath: "/opt/bin/gws",
          fileExists: () => true,
          appUserDataPath: dir,
          runner,
        }),
        accountsPath: join(dir, "accounts.json"),
        now: () => new Date("2026-05-03T00:00:00.000Z"),
      });

      await expect(service.validate({ accountHint: "travis@example.test" })).resolves.toMatchObject({
        account: {
          id: "gws:travis@example.test",
          accountId: "travis@example.test",
          status: "available",
        },
        checks: [
          { service: "gmail", ok: true },
          { service: "calendar", ok: true },
          { service: "drive", ok: true },
        ],
      });
      expect(JSON.parse(await readFile(join(dir, "accounts.json"), "utf8")).accounts[0]).toMatchObject({
        accountId: "travis@example.test",
        status: "available",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("forgets a gws account record without deleting local credentials", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-gws-"));
    try {
      const runner = vi.fn().mockResolvedValue({ stdout: "{}", stderr: "", exitCode: 0 });
      const service = new GoogleWorkspaceSetupService({
        adapter: new GoogleWorkspaceCliAdapter({
          binaryPath: "/opt/bin/gws",
          fileExists: () => true,
          appUserDataPath: dir,
          runner,
        }),
        accountsPath: join(dir, "accounts.json"),
        now: () => new Date("2026-05-03T00:00:00.000Z"),
      });
      await service.validate({ accountHint: "travis@example.test" });

      await expect(service.forgetAccount({ accountHint: "travis@example.test" })).resolves.toEqual([]);
      expect(JSON.parse(await readFile(join(dir, "accounts.json"), "utf8")).accounts).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses gws identity probes to persist the real Google email", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-gws-"));
    try {
      const runner = vi.fn().mockImplementation(async (invocation: { args: string[] }) => ({
        stdout: invocation.args.includes("getProfile") ? JSON.stringify({ emailAddress: "travis@example.test" }) : "{}",
        stderr: "",
        exitCode: 0,
      }));
      const service = new GoogleWorkspaceSetupService({
        adapter: new GoogleWorkspaceCliAdapter({
          binaryPath: "/opt/bin/gws",
          fileExists: () => true,
          appUserDataPath: dir,
          runner,
        }),
        accountsPath: join(dir, "accounts.json"),
        now: () => new Date("2026-05-03T00:00:00.000Z"),
      });

      const result = await service.validate({ accountHint: "work" });
      expect(result).toMatchObject({
        account: {
          accountId: "work",
          email: "travis@example.test",
          label: "travis@example.test",
          status: "available",
        },
        identity: { email: "travis@example.test", source: "gmail.profile" },
      });
      expect(result.checks).toContainEqual({ service: "identity", label: "Account identity", ok: true });
      expect(JSON.parse(await readFile(join(dir, "accounts.json"), "utf8")).accounts[0]).toMatchObject({
        accountId: "work",
        email: "travis@example.test",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("resolves known gws handles from discovered email for validation and disconnect", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-gws-"));
    try {
      const configDirs: string[] = [];
      const runner = vi.fn().mockImplementation(async (invocation: { args: string[]; env: NodeJS.ProcessEnv }) => {
        configDirs.push(invocation.env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR ?? "");
        return {
          stdout: invocation.args.includes("getProfile") ? JSON.stringify({ emailAddress: "travis@example.test" }) : "{}",
          stderr: "",
          exitCode: 0,
        };
      });
      const service = new GoogleWorkspaceSetupService({
        adapter: new GoogleWorkspaceCliAdapter({
          binaryPath: "/opt/bin/gws",
          fileExists: () => true,
          appUserDataPath: dir,
          runner,
        }),
        accountsPath: join(dir, "accounts.json"),
        now: () => new Date("2026-05-03T00:00:00.000Z"),
      });

      await service.validate({ accountHint: "work" });
      configDirs.length = 0;

      await expect(service.validate({ accountHint: "travis@example.test" })).resolves.toMatchObject({
        account: {
          accountId: "work",
          email: "travis@example.test",
          status: "available",
        },
      });
      expect(new Set(configDirs)).toEqual(new Set([join(dir, "google-workspace-cli", "work")]));

      await expect(service.forgetAccount({ accountHint: "travis@example.test" })).resolves.toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("resolves omitted Google calls to the sole available local account handle", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-gws-"));
    try {
      const runner = vi.fn().mockImplementation(async (invocation: { args: string[] }) => ({
        stdout: invocation.args.includes("getProfile") ? JSON.stringify({ emailAddress: "travis@example.test" }) : "{}",
        stderr: "",
        exitCode: 0,
      }));
      const service = new GoogleWorkspaceSetupService({
        adapter: new GoogleWorkspaceCliAdapter({
          binaryPath: "/opt/bin/gws",
          fileExists: () => true,
          appUserDataPath: dir,
          runner,
        }),
        accountsPath: join(dir, "accounts.json"),
        now: () => new Date("2026-05-03T00:00:00.000Z"),
      });

      await service.validate({ accountHint: "work" });

      expect(service.resolveAccountHintForCall()).toBe("work");
      expect(service.resolveAccountHintForCall("travis@example.test")).toBe("work");
      expect(service.resolveAccountHintForCall("other")).toBe("other");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("requires an explicit Google account hint for calls when multiple accounts are available", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-gws-"));
    try {
      await writeFile(
        join(dir, "accounts.json"),
        `${JSON.stringify({
          accounts: [
            { accountId: "work", label: "Work", status: "available", grantedScopes: [] },
            { accountId: "personal", label: "Personal", status: "available", grantedScopes: [] },
          ],
        })}\n`,
        "utf8",
      );
      const service = new GoogleWorkspaceSetupService({
        adapter: new GoogleWorkspaceCliAdapter({
          binaryPath: "/opt/bin/gws",
          fileExists: () => true,
          appUserDataPath: dir,
        }),
        accountsPath: join(dir, "accounts.json"),
      });
      await service.loadAccounts();

      expect(() => service.resolveAccountHintForCall()).toThrow("multiple accounts are connected");
      expect(service.resolveAccountHintForCall("personal")).toBe("personal");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("preserves project ids in gws OAuth client configs before validation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-gws-"));
    try {
      const accountHint = "personal@example.test";
      const configDir = join(dir, "google-workspace-cli", accountHint);
      const clientSecretPath = join(configDir, "client_secret.json");
      await mkdir(configDir, { recursive: true });
      await writeFile(clientSecretPath, `${JSON.stringify({
        installed: {
          client_id: "client-id.apps.googleusercontent.com",
          client_secret: "client-secret",
          project_id: "ambient-gws-test",
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token",
          redirect_uris: ["http://localhost"],
        },
      }, null, 2)}\n`, "utf8");
      const runner = vi.fn().mockImplementation(async (invocation: { args: string[] }) => {
        const clientSecret = JSON.parse(await readFile(clientSecretPath, "utf8"));
        expect(clientSecret.installed).toHaveProperty("project_id", "ambient-gws-test");
        return {
          stdout: invocation.args.includes("getProfile") ? JSON.stringify({ emailAddress: accountHint }) : "{}",
          stderr: "",
          exitCode: 0,
        };
      });
      const service = new GoogleWorkspaceSetupService({
        adapter: new GoogleWorkspaceCliAdapter({
          binaryPath: "/opt/bin/gws",
          fileExists: () => true,
          appUserDataPath: dir,
          runner,
        }),
        accountsPath: join(dir, "accounts.json"),
        now: () => new Date("2026-05-03T00:00:00.000Z"),
      });

      await expect(service.validate({ accountHint })).resolves.toMatchObject({
        account: {
          accountId: accountHint,
          email: accountHint,
          status: "available",
        },
      });
      const persistedClientSecret = JSON.parse(await readFile(clientSecretPath, "utf8"));
      expect(persistedClientSecret.installed).toMatchObject({
        client_id: "client-id.apps.googleusercontent.com",
        client_secret: "client-secret",
        project_id: "ambient-gws-test",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
