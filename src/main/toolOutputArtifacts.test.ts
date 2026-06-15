import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearRegisteredSecretRedactionsForTests, registerSecretRedaction } from "./secretRedaction";
import { materializeTextOutput, materializedTextNotice } from "./toolOutputArtifacts";

describe("materializeTextOutput", () => {
  afterEach(() => {
    clearRegisteredSecretRedactionsForTests();
  });

  it("redacts registered secret values from short Pi-visible output", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-output-redaction-"));
    try {
      registerSecretRedaction("live-provider-secret");
      const output = await materializeTextOutput(workspace, {
        label: "short-output",
        text: "provider returned live-provider-secret",
        maxPreviewChars: 200,
      });

      expect(output).toMatchObject({
        text: "provider returned [REDACTED]",
        truncated: false,
        redacted: true,
        redactionCount: 1,
      });
      expect(output.text).not.toContain("live-provider-secret");
      expect(output.artifactPath).toBeUndefined();
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("redacts registered and pattern-matched secrets before writing large artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-output-artifact-redaction-"));
    try {
      await mkdir(workspace, { recursive: true });
      registerSecretRedaction("artifact-provider-secret");
      const output = await materializeTextOutput(workspace, {
        label: "large-output",
        text: `TOKEN=artifact-provider-secret\n${"x".repeat(80)}\nAuthorization: Bearer abcdefghijklmnopqrstuv`,
        maxPreviewChars: 20,
      });

      expect(output.truncated).toBe(true);
      expect(output.redacted).toBe(true);
      expect(output.text).not.toContain("artifact-provider-secret");
      expect(output.artifactPath).toMatch(/^\.ambient\/tool-outputs\//);
      expect(output.artifactPath && existsSync(join(workspace, output.artifactPath))).toBe(true);

      const artifact = await readFile(join(workspace, output.artifactPath!), "utf8");
      expect(artifact).toContain("TOKEN=[REDACTED]");
      expect(artifact).toContain("Authorization: Bearer [REDACTED]");
      expect(artifact).not.toContain("artifact-provider-secret");
      expect(materializedTextNotice("large output", output)).toContain("Sensitive values were redacted");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
