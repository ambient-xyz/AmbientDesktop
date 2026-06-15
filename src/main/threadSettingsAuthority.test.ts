import { describe, expect, it } from "vitest";
import {
  parseThreadPermissionModeChange,
  parseThreadSettingsUpdate,
  permissionModeChangeAuditDetail,
} from "./threadSettingsAuthority";

describe("thread settings authority", () => {
  it("rejects permission mode in generic thread settings updates", () => {
    expect(() =>
      parseThreadSettingsUpdate({
        threadId: "thread-1",
        permissionMode: "full-access",
      }),
    ).toThrow();
  });

  it("parses non-authority thread settings through the generic update path", () => {
    expect(
      parseThreadSettingsUpdate({
        threadId: "thread-1",
        collaborationMode: "planner",
        model: "glm-5.1",
        thinkingLevel: "high",
        memoryEnabled: true,
      }),
    ).toEqual({
      threadId: "thread-1",
      collaborationMode: "planner",
      model: "glm-5.1",
      thinkingLevel: "high",
      memoryEnabled: true,
    });
  });

  it("requires the dedicated permission mode change input shape", () => {
    expect(
      parseThreadPermissionModeChange({
        threadId: "thread-1",
        permissionMode: "workspace",
        reason: "User selected workspace scope.",
      }),
    ).toEqual({
      threadId: "thread-1",
      permissionMode: "workspace",
      reason: "User selected workspace scope.",
    });
  });

  it("formats permission mode changes for audit entries", () => {
    expect(
      permissionModeChangeAuditDetail({
        previousPermissionMode: "workspace",
        nextPermissionMode: "full-access",
        reason: "Debugging a local integration.",
      }),
    ).toBe("workspace -> full-access; reason: Debugging a local integration.");
  });
});
