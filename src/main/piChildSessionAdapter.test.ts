import { describe, expect, it } from "vitest";
import {
  describeSubagentChildRuntimeAdapter,
  PI_CHILD_SESSION_ADAPTER_SCHEMA_VERSION,
  SUBAGENT_CHILD_RUNTIME_ADAPTER_METHODS,
  type SubagentChildRuntimeAdapter,
} from "./piChildSessionAdapter";

describe("Pi child session adapter boundary", () => {
  it("describes the stable adapter method surface", () => {
    expect(SUBAGENT_CHILD_RUNTIME_ADAPTER_METHODS).toEqual([
      "preflightChildLaunch",
      "startChildRun",
      "waitForChildRun",
      "cancelChildRun",
      "followupChildRun",
      "retryChildRun",
      "resolveChildApprovalResponse",
    ]);
  });

  it("fails closed when no runtime adapter is attached", () => {
    expect(describeSubagentChildRuntimeAdapter(undefined)).toEqual({
      schemaVersion: PI_CHILD_SESSION_ADAPTER_SCHEMA_VERSION,
      availableMethods: [],
      missingMethods: [
        "preflightChildLaunch",
        "startChildRun",
        "waitForChildRun",
        "cancelChildRun",
        "followupChildRun",
        "retryChildRun",
        "resolveChildApprovalResponse",
      ],
      canPreflightLaunch: false,
      canStart: false,
      canWait: false,
      canCancel: false,
      canFollowup: false,
      canRetry: false,
      canResolveApprovalResponses: false,
    });
  });

  it("reports partial adapter capability without implying missing methods are available", () => {
    const adapter: SubagentChildRuntimeAdapter = {
      preflightChildLaunch: () => ({ schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1", runtime: "test", allowed: true, blockers: [], warnings: [] }),
      startChildRun: () => {
        throw new Error("not invoked in capability test");
      },
      waitForChildRun: () => {
        throw new Error("not invoked in capability test");
      },
      resolveChildApprovalResponse: () => {
        throw new Error("not invoked in capability test");
      },
    };

    expect(describeSubagentChildRuntimeAdapter(adapter)).toEqual({
      schemaVersion: PI_CHILD_SESSION_ADAPTER_SCHEMA_VERSION,
      availableMethods: ["preflightChildLaunch", "startChildRun", "waitForChildRun", "resolveChildApprovalResponse"],
      missingMethods: ["cancelChildRun", "followupChildRun", "retryChildRun"],
      canPreflightLaunch: true,
      canStart: true,
      canWait: true,
      canCancel: false,
      canFollowup: false,
      canRetry: false,
      canResolveApprovalResponses: true,
    });
  });
});
