import { describe, expect, it } from "vitest";
import {
  hasRuntimeThreadSettingsUpdate,
  runtimeThreadSettingsUpdateFromSendInput,
} from "./agentRuntimeThreadSettingsUpdate";

describe("agentRuntimeThreadSettingsUpdate", () => {
  it("extracts only user-owned thread settings from send input", () => {
    const update = runtimeThreadSettingsUpdateFromSendInput({
      threadId: "thread-stale-permission",
      content: "continue",
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: "ambient-preview",
      thinkingLevel: "medium",
      delivery: "prompt",
      context: [],
    });

    expect(update).toEqual({
      collaborationMode: "agent",
      model: "ambient-preview",
      thinkingLevel: "medium",
    });
    expect(update).not.toHaveProperty("permissionMode");
    expect(hasRuntimeThreadSettingsUpdate(update)).toBe(true);
  });

  it("does not persist user-owned settings from internal retry sends", () => {
    const update = runtimeThreadSettingsUpdateFromSendInput({
      internal: true,
      threadId: "thread-internal-retry",
      content: "continue internally",
      permissionMode: "workspace",
      collaborationMode: "planner",
      model: "stale-model",
      thinkingLevel: "minimal",
      delivery: "follow-up",
      context: [],
    });

    expect(update).toEqual({});
    expect(hasRuntimeThreadSettingsUpdate(update)).toBe(false);
  });

  it("treats all-undefined updates as empty", () => {
    expect(hasRuntimeThreadSettingsUpdate({
      collaborationMode: undefined,
      model: undefined,
      thinkingLevel: undefined,
    })).toBe(false);
  });
});
