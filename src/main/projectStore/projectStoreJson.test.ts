import { describe, expect, it } from "vitest";
import { parseJsonArray, parseJsonObject, parseJsonValue, parseMetadata, parseStringList, stringFromRecord } from "./projectStoreJson";

describe("projectStoreJson", () => {
  it("parses metadata with the same empty-object fallback", () => {
    expect(parseMetadata(null)).toEqual({});
    expect(parseMetadata("not json")).toEqual({});
    expect(parseMetadata(JSON.stringify({ source: "workflow", count: 2 }))).toEqual({ source: "workflow", count: 2 });
  });

  it("parses object, array, and arbitrary JSON values with safe fallbacks", () => {
    expect(parseJsonObject(JSON.stringify({ ok: true }), { ok: false })).toEqual({ ok: true });
    expect(parseJsonObject("[]", { ok: false })).toEqual({ ok: false });
    expect(parseJsonArray<string>(JSON.stringify(["a", "b"]))).toEqual(["a", "b"]);
    expect(parseJsonArray<string>("not json")).toEqual([]);
    expect(parseJsonValue(JSON.stringify(["event"]))).toEqual(["event"]);
    expect(parseJsonValue("not json")).toBeUndefined();
  });

  it("filters parsed string lists and extracts non-empty record strings", () => {
    expect(parseStringList(JSON.stringify(["ready", 1, "blocked", null]))).toEqual(["ready", "blocked"]);
    expect(parseStringList("not json")).toEqual([]);
    expect(stringFromRecord({ graphNodeId: "node-1", empty: "" }, "graphNodeId")).toBe("node-1");
    expect(stringFromRecord({ graphNodeId: "node-1", empty: "" }, "empty")).toBeUndefined();
    expect(stringFromRecord({ graphNodeId: 12 }, "graphNodeId")).toBeUndefined();
  });
});
