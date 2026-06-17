import { describe, expect, it } from "vitest";
import {
  mapRunRow,
  type RunRow,
} from "./projectStoreRunMappers";

describe("project store run mappers", () => {
  it("maps persisted run rows without store state", () => {
    const row: RunRow = {
      id: "run-1",
      thread_id: "thread-1",
      assistant_message_id: "message-1",
      status: "tool",
      started_at: "2026-06-06T19:00:00.000Z",
      updated_at: "2026-06-06T19:01:00.000Z",
      completed_at: null,
      error_message: null,
      diagnostics_json: "{\"provider\":\"gmi-cloud\",\"attempts\":2}",
    };

    expect(mapRunRow(row)).toEqual({
      id: "run-1",
      threadId: "thread-1",
      assistantMessageId: "message-1",
      status: "tool",
      startedAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:01:00.000Z",
      completedAt: undefined,
      errorMessage: undefined,
      diagnostics: {
        provider: "gmi-cloud",
        attempts: 2,
      },
    });
  });

  it("preserves persisted run optional fields and diagnostics fallback behavior", () => {
    expect(mapRunRow({ ...baseRunRow(), completed_at: "2026-06-06T19:02:00.000Z" }).completedAt).toBe("2026-06-06T19:02:00.000Z");
    expect(mapRunRow({ ...baseRunRow(), error_message: "Stopped by user." }).errorMessage).toBe("Stopped by user.");
    expect(mapRunRow({ ...baseRunRow(), diagnostics_json: "not json" }).diagnostics).toBeUndefined();
    expect(mapRunRow({ ...baseRunRow(), diagnostics_json: "[]" }).diagnostics).toBeUndefined();
    expect(mapRunRow({ ...baseRunRow(), diagnostics_json: null }).diagnostics).toBeUndefined();
  });
});

function baseRunRow(): RunRow {
  return {
    id: "run-1",
    thread_id: "thread-1",
    assistant_message_id: "message-1",
    status: "streaming",
    started_at: "2026-06-06T19:00:00.000Z",
    updated_at: "2026-06-06T19:01:00.000Z",
    completed_at: null,
    error_message: null,
    diagnostics_json: "{\"provider\":\"gmi-cloud\"}",
  };
}
