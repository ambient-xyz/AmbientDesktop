import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyMcpWrapperPlan } from "./verify-mcp-wrapper-plan.mjs";

describe("MCP wrapper plan verifier", () => {
  it("accepts the checked-in completed plan", () => {
    const result = verifyMcpWrapperPlan({ planPath: join(process.cwd(), "mcpWrapperPlan.html") });

    expect(result.phaseCount).toBe(10);
    expect(result.phases.map((phase) => phase.number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.requiredTools).toContain("ambient_mcp_autowire_plan");
    expect(result.requiredTools).toContain("ambient_mcp_aggregation_status");
  });

  it("rejects stale next-slice language after closure", async () => {
    const root = await writePlan(mutatedCheckedInPlan((html) => html.replace(
      "No product-blocking open questions remain",
      "Next slice: stale work.\nNo product-blocking open questions remain",
    )));
    try {
      expect(() => verifyMcpWrapperPlan({ planPath: join(root, "mcpWrapperPlan.html") })).toThrow("Next slice");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects phases without implemented status", async () => {
    const root = await writePlan(mutatedCheckedInPlan((html) => html.replace(
      "<p><strong>Status:</strong> Implemented. Ambient now exposes <code>ambient_mcp_autowire_plan</code>",
      "<p>Ambient now exposes <code>ambient_mcp_autowire_plan</code>",
    )));
    try {
      expect(() => verifyMcpWrapperPlan({ planPath: join(root, "mcpWrapperPlan.html") })).toThrow("missing status");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function mutatedCheckedInPlan(mutate) {
  return mutate(readFileSync(join(process.cwd(), "mcpWrapperPlan.html"), "utf8"));
}

async function writePlan(html) {
  const root = await mkdtemp(join(tmpdir(), "ambient-mcp-wrapper-plan-"));
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "mcpWrapperPlan.html"), html, "utf8");
  return root;
}
