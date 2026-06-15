import { describe, expect, it } from "vitest";

import type {
  ToolEditInputPreview,
  ToolLongformInputPreview,
} from "../../shared/types";
import { runtimeToolStartEventModel } from "./toolStartEvents";

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

describe("toolStartEvents", () => {
  it("models a tool start with previous previews for progress and message upsert", () => {
    expect(runtimeToolStartEventModel({
      kind: "tool-start",
      toolCallId: "tool-call-1",
      label: "file_write",
      content: "{\"path\":\"/workspace/out.txt\"}",
    }, {
      previousLongformInputPreview,
      previousEditInputPreview,
    })).toEqual({
      toolCallId: "tool-call-1",
      label: "file_write",
      inputContent: "{\"path\":\"/workspace/out.txt\"}",
      statusLabel: "running",
      toolEventStatus: "running",
      longformInputPreview: previousLongformInputPreview,
      editInputPreview: previousEditInputPreview,
      argumentProgressInput: {
        toolCallId: "tool-call-1",
        toolName: "file_write",
        inputContent: "{\"path\":\"/workspace/out.txt\"}",
        longformInputPreview: previousLongformInputPreview,
      },
    });
  });

  it("prefers incoming previews over previous previews", () => {
    const startEvent = runtimeToolStartEventModel({
      kind: "tool-start",
      toolCallId: "tool-call-2",
      label: "edit",
      content: "patch input",
      longformInputPreview: incomingLongformInputPreview,
      editInputPreview: incomingEditInputPreview,
    }, {
      previousLongformInputPreview,
      previousEditInputPreview,
    });

    expect(startEvent.longformInputPreview).toBe(incomingLongformInputPreview);
    expect(startEvent.editInputPreview).toBe(incomingEditInputPreview);
    expect(startEvent.argumentProgressInput.longformInputPreview).toBe(incomingLongformInputPreview);
  });

  it("preserves empty visible content without substituting previous state", () => {
    expect(runtimeToolStartEventModel({
      kind: "tool-start",
      toolCallId: "tool-call-3",
      label: "bash",
      content: "",
    })).toEqual({
      toolCallId: "tool-call-3",
      label: "bash",
      inputContent: "",
      statusLabel: "running",
      toolEventStatus: "running",
      argumentProgressInput: {
        toolCallId: "tool-call-3",
        toolName: "bash",
        inputContent: "",
      },
    });
  });
});
