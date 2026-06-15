import { mkdtemp, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHardeningCapabilitySnapshot, validateHardeningCapabilitySnapshotSource } from "./hardening-capability-snapshot.mjs";

describe("hardening capability snapshots", () => {
  it("copies local secret roots, Google gws state, and provider env bindings when explicitly requested", async () => {
    const base = await fixtureBase();
    const destination = join(await mkdtemp(join(tmpdir(), "ambient-hardening-snapshot-dest-")), "snapshot");

    const result = await createHardeningCapabilitySnapshot({
      sourceBase: base.root,
      destination,
      containsSecrets: true,
      expectAmbientApiKey: true,
      expectGoogleWorkspace: true,
      expectedSecretEnv: ["BRAVE_API_KEY", "CARTESIA_API_KEY"],
      strict: true,
    });

    expect(result.destination).toBe(destination);
    expect(existsSync(join(destination, "userData", "ambient-api-key.enc"))).toBe(true);
    expect(existsSync(join(destination, "userData", "google-workspace-cli", "default", "credentials.enc"))).toBe(true);
    expect(existsSync(join(destination, "userData", "tools", "google-workspace-cli", "v0.22.3", "darwin-arm64", "gws"))).toBe(true);
    expect(existsSync(join(destination, "workspace", ".ambient", "cli-packages", "secrets", "ambient-brave-search", "BRAVE_API_KEY.secret"))).toBe(true);
    expect(existsSync(join(destination, "workspace", ".ambient", "capability-builder", "secrets", "ambient-cartesia", "CARTESIA_API_KEY.secret"))).toBe(true);
    expect(existsSync(join(destination, "userData", "Cookies"))).toBe(false);

    const manifest = JSON.parse(await readFile(join(destination, "meta", "manifest.json"), "utf8"));
    expect(manifest.verification.snapshot.ok).toBe(true);
    expect(manifest.inventory.files.find((file) => file.relativePath.endsWith("BRAVE_API_KEY.secret"))).toMatchObject({
      classification: "secret",
    });
    expect(manifest.inventory.files.find((file) => file.relativePath.endsWith("BRAVE_API_KEY.secret"))).not.toHaveProperty("sha256");
  });

  it("does not copy secret files for redacted snapshots", async () => {
    const base = await fixtureBase();
    const destination = join(await mkdtemp(join(tmpdir(), "ambient-hardening-snapshot-redacted-")), "snapshot");

    await createHardeningCapabilitySnapshot({
      sourceBase: base.root,
      destination,
      containsSecrets: false,
      strict: true,
    });

    expect(existsSync(join(destination, "workspace", ".ambient", "cli-packages", "env-bindings.json"))).toBe(true);
    expect(existsSync(join(destination, "workspace", ".ambient", "cli-packages", "secrets"))).toBe(false);
    expect(existsSync(join(destination, "workspace", ".ambient", "capability-builder", "secrets"))).toBe(false);
    expect(existsSync(join(destination, "userData", "ambient-api-key.enc"))).toBe(false);
    expect(existsSync(join(destination, "userData", "google-workspace-cli"))).toBe(false);
  });

  it("fails validation when an expected secret binding is missing", async () => {
    const base = await fixtureBase({ withBraveBinding: false });

    const report = await validateHardeningCapabilitySnapshotSource({
      sourceWorkspace: join(base.root, "workspace"),
      sourceUserData: join(base.root, "userData"),
      containsSecrets: true,
      expectedSecretEnv: ["BRAVE_API_KEY"],
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toContain("Expected secret env binding is missing: BRAVE_API_KEY");
  });
});

async function fixtureBase(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "ambient-hardening-base-"));
  const workspace = join(root, "workspace");
  const userData = join(root, "userData");
  await mkdir(join(workspace, ".ambient", "cli-packages", "secrets", "ambient-brave-search"), { recursive: true });
  await mkdir(join(workspace, ".ambient", "capability-builder", "secrets", "ambient-cartesia"), { recursive: true });
  await mkdir(join(workspace, ".ambient", "capability-builder", "packages", "ambient-cartesia"), { recursive: true });
  await mkdir(join(userData, "google-workspace-cli", "default", "cache"), { recursive: true });
  await mkdir(join(userData, "tools", "google-workspace-cli", "v0.22.3", "darwin-arm64"), { recursive: true });

  await writeFile(join(userData, "preferences.json"), "{}\n", "utf8");
  await writeFile(join(userData, "ambient-api-key.enc"), "encrypted-ambient-key\n", { encoding: "utf8", mode: 0o600 });
  await writeFile(join(userData, "Cookies"), "browser-cookie-store\n", "utf8");
  await writeFile(join(userData, "google-workspace-cli", "accounts.json"), JSON.stringify({ accounts: [{ accountHint: "default" }] }), "utf8");
  await writeFile(join(userData, "google-workspace-cli", "default", "client_secret.json"), "{}\n", { encoding: "utf8", mode: 0o600 });
  await writeFile(join(userData, "google-workspace-cli", "default", "credentials.enc"), "encrypted-gws-credentials\n", { encoding: "utf8", mode: 0o600 });
  await writeFile(join(userData, "google-workspace-cli", "default", "token_cache.json"), "{}\n", { encoding: "utf8", mode: 0o600 });
  await writeFile(join(userData, "tools", "google-workspace-cli", "v0.22.3", "darwin-arm64", "gws"), "#!/bin/sh\n", { encoding: "utf8", mode: 0o700 });

  await writeFile(join(workspace, ".ambient", "cli-packages", "packages.json"), JSON.stringify({ packages: [{ source: "./.ambient/cli-packages/imported/ambient-brave-search" }] }), "utf8");
  await mkdir(join(workspace, ".ambient", "cli-packages", "imported", "ambient-brave-search"), { recursive: true });
  await writeFile(join(workspace, ".ambient", "cli-packages", "imported", "ambient-brave-search", "ambient-cli.json"), "{}\n", "utf8");
  await writeFile(join(workspace, ".ambient", "cli-packages", "secrets", "ambient-brave-search", "BRAVE_API_KEY.secret"), "brave-key\n", { encoding: "utf8", mode: 0o600 });
  await writeFile(join(workspace, ".ambient", "capability-builder", "secrets", "ambient-cartesia", "CARTESIA_API_KEY.secret"), "cartesia-key\n", { encoding: "utf8", mode: 0o600 });

  await writeFile(
    join(workspace, ".ambient", "cli-packages", "env-bindings.json"),
    JSON.stringify({
      bindings: options.withBraveBinding === false ? [] : [
        {
          packageName: "ambient-brave-search",
          envName: "BRAVE_API_KEY",
          filePath: "./.ambient/cli-packages/secrets/ambient-brave-search/BRAVE_API_KEY.secret",
        },
      ],
    }, null, 2),
    "utf8",
  );
  await writeFile(
    join(workspace, ".ambient", "capability-builder", "env-bindings.json"),
    JSON.stringify({
      bindings: [
        {
          packageName: "ambient-cartesia",
          sourcePath: "./.ambient/capability-builder/packages/ambient-cartesia",
          envName: "CARTESIA_API_KEY",
          filePath: "./.ambient/capability-builder/secrets/ambient-cartesia/CARTESIA_API_KEY.secret",
        },
      ],
    }, null, 2),
    "utf8",
  );

  expect((await stat(join(userData, "tools", "google-workspace-cli", "v0.22.3", "darwin-arm64", "gws"))).mode & 0o111).not.toBe(0);
  return { root, workspace, userData };
}
