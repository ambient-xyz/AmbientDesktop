import { describe, expect, it } from "vitest";

import type { ToolEditInputPreview, ToolLongformInputPreview } from "../../shared/threadTypes";
import { runtimeToolInputEventModel } from "./toolInputEvents";

const previousLongformInputPreview: ToolLongformInputPreview = {
  kind: "longform-input",
  summary: "Previous longform",
  items: [],
};

const incomingLongformInputPreview: ToolLongformInputPreview = {
  kind: "longform-input",
  summary: "Incoming longform",
  items: [],
};

const previousEditInputPreview: ToolEditInputPreview = {
  kind: "edit-input",
  path: "patches/previous.diff",
  summary: "Previous edit",
  edits: [],
};

const incomingEditInputPreview: ToolEditInputPreview = {
  kind: "edit-input",
  path: "patches/incoming.diff",
  summary: "Incoming edit",
  edits: [],
};

describe("toolInputEvents", () => {
  it("models a tool input start from visible content and raw input", () => {
    expect(runtimeToolInputEventModel({
      kind: "tool-input-start",
      toolCallId: "tool-call-1",
      label: "file_write",
      content: "{\"path\":\"/workspace/out.txt\"}",
      input: { path: "/workspace/out.txt" },
    })).toEqual({
      toolCallId: "tool-call-1",
      label: "file_write",
      statusLabel: "preparing",
      argumentEventType: "toolcall_start",
      inputContent: "{\"path\":\"/workspace/out.txt\"}",
      shouldEmitRunningToolEvent: true,
      recoveryCapture: {
        text: "{\n  \"path\": \"/workspace/out.txt\"\n}",
        source: "raw_tool_input",
      },
    });
  });

  it("models a tool input update using previous visible content and previews", () => {
    expect(runtimeToolInputEventModel({
      kind: "tool-input-update",
      toolCallId: "tool-call-2",
      label: "write",
      content: "   ",
    }, {
      previousInputContent: "previous visible input",
      previousLongformInputPreview,
      previousEditInputPreview,
    })).toEqual({
      toolCallId: "tool-call-2",
      label: "write",
      statusLabel: "preparing",
      argumentEventType: "toolcall_delta",
      inputContent: "previous visible input",
      shouldEmitRunningToolEvent: false,
      recoveryCapture: {
        text: "previous visible input",
        source: "visible_tool_input",
      },
      longformInputPreview: previousLongformInputPreview,
      editInputPreview: previousEditInputPreview,
    });
  });

  it("accumulates raw streamed delta chunks before progress and recovery capture", () => {
    expect(runtimeToolInputEventModel({
      kind: "tool-input-update",
      toolCallId: "tool-call-delta",
      label: "write",
      content: "tent",
      contentDelta: true,
    }, {
      previousInputContent: "{\"path\":\"index.html\",\"con",
    })).toEqual({
      toolCallId: "tool-call-delta",
      label: "write",
      statusLabel: "preparing",
      argumentEventType: "toolcall_delta",
      inputContent: "{\"path\":\"index.html\",\"content",
      shouldEmitRunningToolEvent: false,
      recoveryCapture: {
        text: "{\"path\":\"index.html\",\"content",
        source: "visible_tool_input",
      },
    });
  });

  it("uses parsed cumulative tool input instead of appending delta text", () => {
    expect(runtimeToolInputEventModel({
      kind: "tool-input-update",
      toolCallId: "tool-call-parsed",
      label: "write",
      content: "{\"path\":\"index.html\"}",
      contentDelta: true,
      input: { path: "index.html" },
    }, {
      previousInputContent: "partial-prefix",
    })).toEqual({
      toolCallId: "tool-call-parsed",
      label: "write",
      statusLabel: "preparing",
      argumentEventType: "toolcall_delta",
      inputContent: "{\"path\":\"index.html\"}",
      shouldEmitRunningToolEvent: false,
      recoveryCapture: {
        text: "{\n  \"path\": \"index.html\"\n}",
        source: "raw_tool_input",
      },
    });
  });

  it("models a tool input end using incoming previews over previous previews", () => {
    expect(runtimeToolInputEventModel({
      kind: "tool-input-end",
      toolCallId: "tool-call-3",
      label: "edit",
      content: "final input",
      longformInputPreview: incomingLongformInputPreview,
      editInputPreview: incomingEditInputPreview,
    }, {
      previousLongformInputPreview,
      previousEditInputPreview,
    })).toEqual({
      toolCallId: "tool-call-3",
      label: "edit",
      statusLabel: "prepared",
      argumentEventType: "toolcall_end",
      inputContent: "final input",
      shouldEmitRunningToolEvent: true,
      recoveryCapture: {
        text: "final input",
        source: "visible_tool_input",
      },
      longformInputPreview: incomingLongformInputPreview,
      editInputPreview: incomingEditInputPreview,
    });
  });
});
