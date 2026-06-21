import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { NamedSecretStore } from "./namedSecretStore";

describe("NamedSecretStore", () => {
  it("stores only metadata in the named-secret file and keeps values behind secret refs", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-named-secret-"));
    const values = new Map<string, string>();
    const store = new NamedSecretStore({
      filePath: join(root, "metadata.json"),
      currentWorkspacePath: () => "/workspace-a",
      now: () => new Date("2026-06-20T12:00:00.000Z"),
      saveSecretReferenceImpl: async (input) => {
        const ref = `ambient-secret-ref:v1:${"a".repeat(64)}`;
        values.set(ref, input.value);
        return ref;
      },
      readSecretReferenceImpl: async (ref) => values.get(ref),
      removeSecretReferenceImpl: async (ref) => {
        values.delete(ref);
      },
    });

    try {
      const [created] = await store.save({
        label: "RTX login",
        kind: "login",
        scope: "workspace",
        notes: "Fixture account",
        value: "super-secret-rtx-password",
      });

      expect(created).toMatchObject({
        label: "RTX login",
        kind: "login",
        scope: "workspace",
        configured: true,
      });
      expect(JSON.stringify(created)).not.toContain("super-secret-rtx-password");
      expect(JSON.stringify(created)).not.toContain("ambient-secret-ref");

      const raw = await readFile(join(root, "metadata.json"), "utf8");
      expect(raw).toContain("RTX login");
      expect(raw).toContain("ambient-secret-ref");
      expect(raw).not.toContain("super-secret-rtx-password");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("preserves leading and trailing whitespace in secret values", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-named-secret-whitespace-"));
    const values = new Map<string, string>();
    const store = new NamedSecretStore({
      filePath: join(root, "metadata.json"),
      currentWorkspacePath: () => "/workspace-a",
      saveSecretReferenceImpl: async (input) => {
        const ref = `ambient-secret-ref:v1:${"f".repeat(64)}`;
        values.set(ref, input.value);
        return ref;
      },
      readSecretReferenceImpl: async (ref) => values.get(ref),
      removeSecretReferenceImpl: async () => undefined,
    });

    try {
      await store.save({ label: "Whitespace password", value: " pass " });

      expect([...values.values()]).toEqual([" pass "]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("lists global secrets and the current workspace while hiding other workspace secrets", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-named-secret-filter-"));
    let workspacePath = "/workspace-a";
    let refCounter = 0;
    const store = new NamedSecretStore({
      filePath: join(root, "metadata.json"),
      currentWorkspacePath: () => workspacePath,
      saveSecretReferenceImpl: async () => `ambient-secret-ref:v1:${String(++refCounter).padStart(64, "b")}`,
      readSecretReferenceImpl: async () => "value",
      removeSecretReferenceImpl: async () => undefined,
    });

    try {
      await store.save({ label: "Workspace A", value: "secret-a" });
      await store.save({ label: "Global", value: "secret-global", scope: "global" });
      workspacePath = "/workspace-b";
      await store.save({ label: "Workspace B", value: "secret-b" });

      expect(store.list().map((secret) => secret.label)).toEqual(["Global", "Workspace B"]);
      workspacePath = "/workspace-a";
      expect(store.list().map((secret) => secret.label)).toEqual(["Workspace A", "Global"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("updates metadata, rotates values, deletes refs, and exports rehydration tasks without values", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-named-secret-update-"));
    const values = new Map<string, string>();
    const removed: string[] = [];
    const store = new NamedSecretStore({
      filePath: join(root, "metadata.json"),
      currentWorkspacePath: () => "/workspace-a",
      now: (() => {
        let tick = 0;
        return () => new Date(`2026-06-20T12:00:0${tick++}.000Z`);
      })(),
      saveSecretReferenceImpl: async (input) => {
        const ref = `ambient-secret-ref:v1:${input.ownerId.includes("ambient-named-secret-owner") ? "c".repeat(64) : "d".repeat(64)}`;
        values.set(ref, input.value);
        return ref;
      },
      readSecretReferenceImpl: async (ref) => values.get(ref),
      removeSecretReferenceImpl: async (ref) => {
        removed.push(ref);
        values.delete(ref);
      },
    });

    try {
      const [created] = await store.save({ label: "API", kind: "api-key", value: "first-secret" });
      const [updated] = await store.update({
        id: created.id,
        label: "API token",
        kind: "token",
        notes: "",
        value: "second-secret",
      });

      expect(updated).toMatchObject({ id: created.id, label: "API token", kind: "token" });
      expect(JSON.stringify(updated)).not.toContain("second-secret");

      const exported = store.exportMetadata(new Date("2026-06-20T13:00:00.000Z"));
      expect(exported.secrets).toEqual([
        expect.objectContaining({
          id: created.id,
          label: "API token",
          reason: "secret-value-not-exported",
        }),
      ]);
      expect(JSON.stringify(exported)).not.toContain("second-secret");
      expect(JSON.stringify(exported)).not.toContain("ambient-secret-ref");

      await store.delete({ id: created.id });
      expect(store.list()).toEqual([]);
      expect(removed.length).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("brokers a named secret to a local fixture without returning the value", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-named-secret-broker-"));
    const value = "brokered-super-secret";
    const store = new NamedSecretStore({
      filePath: join(root, "metadata.json"),
      currentWorkspacePath: () => "/workspace-a",
      saveSecretReferenceImpl: async () => `ambient-secret-ref:v1:${"e".repeat(64)}`,
      readSecretReferenceImpl: async () => value,
      removeSecretReferenceImpl: async () => undefined,
      now: () => new Date("2026-06-20T12:00:00.000Z"),
    });

    try {
      const [created] = await store.save({ label: "Fixture", value });
      const result = await store.brokerToLocalFixture({
        id: created.id,
        purpose: "verify brokered local fixture",
        target: "local-fixture",
      });

      expect(result).toMatchObject({
        id: created.id,
        delivered: true,
        approved: true,
        target: "local-fixture",
      });
      expect(JSON.stringify(result)).not.toContain(value);
      expect(store.list()[0].lastUsedAt).toBe("2026-06-20T12:00:00.000Z");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects raw-value-free invalid saves before touching secret storage", async () => {
    const saveSecretReferenceImpl = vi.fn();
    const store = new NamedSecretStore({
      filePath: "/tmp/unused-metadata.json",
      currentWorkspacePath: () => "/workspace-a",
      saveSecretReferenceImpl,
    });

    await expect(store.save({ label: "   ", value: "secret" })).rejects.toThrow(/label/);
    await expect(store.save({ label: "Label", value: "" })).rejects.toThrow(/value/);
    expect(saveSecretReferenceImpl).not.toHaveBeenCalled();
  });
});
