import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveGoogleWorkspaceLiveDogfoodRuntime } from "./googleWorkspaceLiveDogfood";
import type { GoogleWorkspaceCliCommandInvocation, GoogleWorkspaceCliCommandResult } from "./googleWorkspaceCliAdapter";

describe("Google Workspace live dogfood resolver", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
    roots.length = 0;
  });

  it("falls back from stale Ambient Desktop config to the latest validated hardening snapshot", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "ambient-gws-live-dogfood-"));
    roots.push(homeDir);
    const platformArch = `${process.platform}-${process.arch}`;
    const ambientBinary = join(
      homeDir,
      "Library",
      "Application Support",
      "Ambient Desktop",
      "tools",
      "google-workspace-cli",
      "v0.22.3",
      platformArch,
      "gws",
    );
    const ambientConfigRoot = join(homeDir, "Library", "Application Support", "Ambient Desktop", "google-workspace-cli");
    await writeExecutable(ambientBinary);
    await writeGwsAccount(ambientConfigRoot, "travis@example.test");

    const snapshotRoot = join(homeDir, ".ambient-example", "snapshots", "google-workspace-cli", "primary-mac-gws-validated-test");
    const snapshotBinaryRelativePath = `userData/tools/google-workspace-cli/v0.22.3/${platformArch}/gws`;
    const snapshotBinary = join(snapshotRoot, snapshotBinaryRelativePath);
    const snapshotConfigRoot = join(snapshotRoot, "userData", "google-workspace-cli");
    await writeExecutable(snapshotBinary);
    await writeGwsAccount(snapshotConfigRoot, "default");
    await writeFile(
      join(snapshotConfigRoot, "accounts.json"),
      `${JSON.stringify({ accounts: [{ accountId: "default", email: "travis@example.test" }] })}\n`,
      "utf8",
    );
    await mkdir(join(snapshotRoot, "meta"), { recursive: true });
    await writeFile(
      join(snapshotRoot, "meta", "manifest.json"),
      `${JSON.stringify({
        snapshotId: "primary-mac-gws-validated-test",
        createdAt: "2026-05-14T05:09:58.076Z",
        containsSecrets: true,
        gws: { binaryRelativePath: snapshotBinaryRelativePath, tokenValid: true },
      })}\n`,
      "utf8",
    );

    const calls: Array<{ configDir?: string; accountHint?: string }> = [];
    const runtime = await resolveGoogleWorkspaceLiveDogfoodRuntime("drive", {
      homeDir,
      env: {},
      adapterOptions: {
        runner: async (invocation): Promise<GoogleWorkspaceCliCommandResult> => {
          calls.push({
            configDir: invocation.env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR,
            accountHint: accountHintFromConfigDir(invocation),
          });
          if (invocation.env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR?.includes("Ambient Desktop")) {
            return { exitCode: 2, stdout: "", stderr: "invalid_grant: Token has been expired or revoked." };
          }
          return { exitCode: 0, stdout: "{\"files\":[],\"nextPageToken\":\"token\"}\n", stderr: "Using keyring backend: keyring\n" };
        },
      },
    });

    expect(runtime).toMatchObject({
      source: "hardening-snapshot:primary-mac-gws-validated-test",
      accountHint: "default",
      configRoot: snapshotConfigRoot,
      binaryPath: snapshotBinary,
    });
    expect(runtime.attempts).toEqual([
      expect.objectContaining({ source: "ambient-desktop", accountHint: "travis@example.test", reason: "invalid_grant" }),
    ]);
    expect(calls.map((call) => call.accountHint)).toEqual(["travis@example.test", "default"]);
  });
});

async function writeExecutable(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, "#!/bin/sh\n", { encoding: "utf8", mode: 0o700 });
}

async function writeGwsAccount(configRoot: string, accountHint: string): Promise<void> {
  const accountRoot = join(configRoot, accountHint);
  await mkdir(accountRoot, { recursive: true });
  await Promise.all([
    writeFile(join(accountRoot, "client_secret.json"), "{}\n", "utf8"),
    writeFile(join(accountRoot, "credentials.enc"), "encrypted\n", "utf8"),
    writeFile(join(accountRoot, "token_cache.json"), "{}\n", "utf8"),
  ]);
}

function accountHintFromConfigDir(invocation: GoogleWorkspaceCliCommandInvocation): string | undefined {
  const configDir = invocation.env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR;
  return configDir ? configDir.split("/").pop() : undefined;
}
