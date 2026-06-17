import { describe, expect, it } from "vitest";

import type { RuntimeSessionRecoveryContext } from "./agentRuntimeAssistantRetryInput";
import {
  RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME,
  RECOVERY_READ_TOOL_NAME,
} from "./agentRuntimeInterruptedRecoveryTools";
import {
  activeToolNamesForAgentRuntimeSession,
  recoveryToolNamesForSessionRecovery,
} from "./agentRuntimeRecoveryToolActivation";

describe("agentRuntimeRecoveryToolActivation", () => {
  it("keeps interrupted-tool recovery tools inactive for normal and fresh retry sessions", () => {
    expect(recoveryToolNamesForSessionRecovery()).toEqual([]);
    expect(recoveryToolNamesForSessionRecovery(recovery("fresh_session_after_pre_output_stream_stall"))).toEqual([]);
    expect(recoveryToolNamesForSessionRecovery(recovery("fresh_session_after_provider_error_before_tool_execution"))).toEqual([]);
  });

  it("activates exact-args recovery tools for recovery prompts that mention them", () => {
    const recoveryToolNames = [
      RECOVERY_READ_TOOL_NAME,
      RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME,
    ];

    expect(recoveryToolNamesForSessionRecovery(recovery("interrupted_tool_call_recovery"))).toEqual(recoveryToolNames);
    expect(recoveryToolNamesForSessionRecovery(recovery("provider_interruption_continuation"))).toEqual(recoveryToolNames);
  });

  it("adds recovery tools to the direct session active tool list once", () => {
    expect(activeToolNamesForAgentRuntimeSession({
      agentRuntimeActiveTools: ["read", "write", RECOVERY_READ_TOOL_NAME],
      recoveryToolNames: [
        RECOVERY_READ_TOOL_NAME,
        RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME,
      ],
      transcriptRehydratedToolNames: ["ambient_mcp_tool_call", "read"],
    })).toEqual([
      "read",
      "write",
      RECOVERY_READ_TOOL_NAME,
      RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME,
      "ambient_mcp_tool_call",
    ]);
  });
});

function recovery(kind: RuntimeSessionRecoveryContext["kind"]): Pick<RuntimeSessionRecoveryContext, "kind"> {
  return { kind };
}
