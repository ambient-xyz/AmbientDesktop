import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { readSecretReference, saveSecretReference } from "./secretReferenceStore";

const originalStoreRoot = process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT;

describe("secretReferenceStore", () => {
  afterEach(() => {
    if (originalStoreRoot === undefined) {
      delete process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT;
    } else {
      process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT = originalStoreRoot;
    }
  });

  it("preserves leading and trailing whitespace in stored secret values", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-secret-reference-"));
    process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT = root;

    try {
      const ref = await saveSecretReference({
        scope: "named-secret",
        workspacePath: join(root, "workspace"),
        ownerId: "owner",
        envName: "SECRET_VALUE",
        value: " pass ",
      });

      await expect(readSecretReference(ref)).resolves.toBe(" pass ");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects empty secret values without rejecting whitespace values", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-secret-reference-empty-"));
    process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT = root;

    try {
      await expect(saveSecretReference({
        scope: "named-secret",
        workspacePath: join(root, "workspace"),
        ownerId: "owner",
        envName: "SECRET_VALUE",
        value: "",
      })).rejects.toThrow(/empty/);

      await expect(saveSecretReference({
        scope: "named-secret",
        workspacePath: join(root, "workspace"),
        ownerId: "owner",
        envName: "SECRET_VALUE",
        value: " ",
      })).resolves.toMatch(/^ambient-secret-ref:v1:/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
