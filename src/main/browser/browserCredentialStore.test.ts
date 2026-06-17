import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { BrowserCredentialStore, normalizeBrowserCredentialOrigin, type BrowserCredentialSafeStorage } from "./browserCredentialStore";

class FakeSafeStorage implements BrowserCredentialSafeStorage {
  constructor(private readonly available = true) {}

  isEncryptionAvailable(): boolean {
    return this.available;
  }

  encryptString(value: string): Buffer {
    return Buffer.from(`encrypted:${value}`, "utf8");
  }

  decryptString(value: Buffer): string {
    return value.toString("utf8").replace(/^encrypted:/, "");
  }
}

describe("normalizeBrowserCredentialOrigin", () => {
  it("normalizes http origins and defaults bare hosts to https", () => {
    expect(normalizeBrowserCredentialOrigin("example.com/login")).toBe("https://example.com");
    expect(normalizeBrowserCredentialOrigin("http://localhost:3000/sign-in")).toBe("http://localhost:3000");
  });

  it("rejects non-http credential origins", () => {
    expect(() => normalizeBrowserCredentialOrigin("file:///tmp/login.html")).toThrow(/http or https/);
  });
});

describe("BrowserCredentialStore", () => {
  it("stores only encrypted password material and returns metadata from list", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-credentials-"));
    const workspace = join(root, "workspace");
    const statePath = join(root, "state");
    await mkdir(workspace, { recursive: true });

    const store = new BrowserCredentialStore(
      () => ({ path: workspace, name: "workspace", statePath, sessionPath: join(root, "sessions") }),
      new FakeSafeStorage(),
    );

    const [created] = store.save({
      label: "Fixture",
      origin: "https://example.test/login",
      username: "neo@example.test",
      password: "correct horse battery staple",
    });

    expect(created).toMatchObject({
      label: "Fixture",
      origin: "https://example.test",
      username: "neo@example.test",
      scope: "workspace",
    });
    expect(JSON.stringify(created)).not.toContain("correct horse");

    const raw = await readFile(join(statePath, "browser", "credentials.json"), "utf8");
    expect(raw).toContain("encryptedPayload");
    expect(raw).not.toContain("encryptedPassword");
    expect(raw).not.toContain("correct horse battery staple");

    expect(store.get(created.id)).toEqual(created);
    expect(JSON.stringify(store.get(created.id))).not.toContain("correct horse");

    expect(store.resolve(created.id)).toMatchObject({
      id: created.id,
      label: "Fixture",
      origin: "https://example.test",
      username: "neo@example.test",
      password: "correct horse battery staple",
    });

    const [used] = store.markUsed(created.id);
    expect(used.lastUsedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(store.delete(created.id)).toEqual([]);
  });

  it("rejects credentials when metadata is tampered independently from the encrypted payload", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-credentials-tamper-"));
    const workspace = join(root, "workspace");
    const statePath = join(root, "state");
    await mkdir(workspace, { recursive: true });

    const store = new BrowserCredentialStore(
      () => ({ path: workspace, name: "workspace", statePath, sessionPath: join(root, "sessions") }),
      new FakeSafeStorage(),
    );
    const [created] = store.save({
      label: "Fixture",
      origin: "https://bank.example.test/login",
      username: "neo@example.test",
      password: "correct horse battery staple",
    });
    const filePath = join(statePath, "browser", "credentials.json");
    const raw = JSON.parse(await readFile(filePath, "utf8")) as { credentials: Array<{ origin: string }> };
    raw.credentials[0].origin = "https://attacker.example.test";
    await writeFile(filePath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

    expect(store.get(created.id)).toMatchObject({ origin: "https://attacker.example.test" });
    expect(() => store.resolve(created.id)).toThrow(/metadata failed integrity validation/);
  });

  it("updates existing metadata and fails closed when encryption is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-credentials-update-"));
    const workspace = join(root, "workspace");
    const statePath = join(root, "state");
    await mkdir(workspace, { recursive: true });

    const store = new BrowserCredentialStore(
      () => ({ path: workspace, name: "workspace", statePath, sessionPath: join(root, "sessions") }),
      new FakeSafeStorage(),
    );
    const [created] = store.save({
      label: "Fixture",
      origin: "example.test/login",
      username: "neo@example.test",
      password: "first-password",
    });
    const [updated] = store.save({
      id: created.id,
      label: "Fixture updated",
      origin: "http://example.test/login",
      username: "neo2@example.test",
      password: "second-password",
      scope: "global",
    });

    expect(updated).toMatchObject({
      id: created.id,
      label: "Fixture updated",
      origin: "http://example.test",
      username: "neo2@example.test",
      scope: "global",
      createdAt: created.createdAt,
    });
    expect(store.list()).toHaveLength(1);
    expect(store.resolve(created.id).password).toBe("second-password");

    const unavailable = new BrowserCredentialStore(
      () => ({ path: workspace, name: "workspace", statePath, sessionPath: join(root, "sessions") }),
      new FakeSafeStorage(false),
    );
    expect(() =>
      unavailable.save({
        label: "Blocked",
        origin: "https://example.test",
        username: "neo@example.test",
        password: "blocked-password",
      }),
    ).toThrow(/Secure credential storage is not available/);
  });
});
