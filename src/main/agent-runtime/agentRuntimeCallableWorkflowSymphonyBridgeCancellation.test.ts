import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controllerSource = readFileSync(new URL("./agentRuntimeCallableWorkflowSymphonyBridgeController.ts", import.meta.url), "utf8");
const cancellationSource = readFileSync(new URL("./agentRuntimeCallableWorkflowSymphonyBridgeCancellation.ts", import.meta.url), "utf8");

describe("AgentRuntime callable workflow Symphony bridge cancellation owner", () => {
  it("keeps child-wait cancellation and barrier cleanup out of the bridge controller", () => {
    expect(controllerSource).toContain("cancelCallableWorkflowSymphonyChildWait");
    expect(controllerSource).not.toContain("callableWorkflowTaskCancellation: true");
    expect(controllerSource).not.toContain("SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION");
    expect(cancellationSource).toContain("callableWorkflowTaskCancellation: true");
    expect(cancellationSource).toContain("SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION");
  });
});
