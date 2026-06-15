import { describe, expect, it } from "vitest";
import { mcpAutowirePhase0Fixtures } from "./mcpAutowireFixtures";
import { describeMcpAutowireRuntimeRepair } from "./mcpAutowirePlanEdits";
import type { McpAutowireCandidate } from "./mcpAutowireSchemas";

describe("MCP autowire runtime repair inference", () => {
  it("suggests exact filesystem mount repairs and rejects ambiguous mount evidence", () => {
    const candidate = structuredClone(mcpAutowirePhase0Fixtures.scrapling) as McpAutowireCandidate;

    const result = describeMcpAutowireRuntimeRepair({
      candidate,
      failureText: "ENOENT: required file mount missing hostPath=/tmp/ambient-fixtures/data containerPath=/projects/data mode=read-only",
    });

    expect(result.status).toBe("repair-available");
    expect(result.operations).toEqual([
      expect.objectContaining({
        op: "filesystem.mount.add",
        path: "/tmp/ambient-fixtures/data",
        containerPath: "/projects/data",
        mode: "read-only",
      }),
    ]);
    expect(result.editPreview?.permissionExpanding).toBe(true);
    expect(result.editPreview?.approvalReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("Adds filesystem mount")]),
    );

    const ambiguous = describeMcpAutowireRuntimeRepair({
      candidate,
      failureText: "ENOENT: no such file or directory, open /projects/data/input.csv",
    });

    expect(ambiguous.status).toBe("needs-more-context");
    expect(ambiguous.operations).toEqual([]);
    expect(ambiguous.detectedIssues).toEqual(
      expect.arrayContaining([expect.stringContaining("Ambient needs an explicit host path")]),
    );
  });

  it("suggests package argument additions and removals from explicit diagnostics", () => {
    const missingArgCandidate = structuredClone(mcpAutowirePhase0Fixtures.katzillaInstallFailure) as McpAutowireCandidate;

    const addResult = describeMcpAutowireRuntimeRepair({
      candidate: missingArgCandidate,
      failureText: "Startup failed: missing required argument --mcp",
    });

    expect(addResult.status).toBe("repair-available");
    expect(addResult.operations).toEqual([
      expect.objectContaining({
        op: "runtime.packageArgument.add",
        argument: {
          type: "switch",
          name: "--mcp",
          isFixed: true,
        },
      }),
    ]);
    expect(addResult.editPreview?.permissionExpanding).toBe(false);

    const badArgCandidate = structuredClone(mcpAutowirePhase0Fixtures.katzillaInstallFailure) as McpAutowireCandidate;
    badArgCandidate.runtime.package!.packageArguments = [{ type: "switch", name: "--bad", isFixed: true }];

    const removeResult = describeMcpAutowireRuntimeRepair({
      candidate: badArgCandidate,
      failureText: "Server failed: unrecognized option --bad",
    });

    expect(removeResult.status).toBe("repair-available");
    expect(removeResult.operations).toEqual([
      expect.objectContaining({
        op: "runtime.packageArgument.remove",
        name: "--bad",
      }),
    ]);
  });

  it("suggests expected-tool validation repairs from discovered tool descriptors", () => {
    const candidate = structuredClone(mcpAutowirePhase0Fixtures.katzillaInstallFailure) as McpAutowireCandidate;
    candidate.validationPlan.expectedTools = [];

    const result = describeMcpAutowireRuntimeRepair({
      candidate,
      failureText: "Tool descriptor validation failed. Discovered tools: fetch_html, fetch_json",
    });

    expect(result.status).toBe("repair-available");
    expect(result.operations).toEqual([
      expect.objectContaining({
        op: "validation.expectedTools.add",
        tools: ["fetch_html", "fetch_json"],
      }),
    ]);
    expect(result.editPreview?.permissionExpanding).toBe(false);
  });
});
