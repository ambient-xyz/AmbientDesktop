import { describe, expect, it } from "vitest";
import { chooseThreadPreview, formatThreadPreview } from "./threadPreview";

describe("formatThreadPreview", () => {
  it("normalizes whitespace and truncates previews", () => {
    const preview = formatThreadPreview(`  first\n\nsecond\t${"x".repeat(220)}  `);

    expect(preview).toHaveLength(180);
    expect(preview.startsWith("first second ")).toBe(true);
    expect(preview).not.toContain("\n");
    expect(preview).not.toContain("\t");
  });
});

describe("chooseThreadPreview", () => {
  it("prefers final assistant text over newer intermediate tool messages", () => {
    expect(
      chooseThreadPreview([
        { role: "user", content: "write a file", createdAt: "2026-04-29T00:00:00.000Z" },
        { role: "assistant", content: "Created the file.", createdAt: "2026-04-29T00:00:01.000Z" },
        { role: "tool", content: "write running", createdAt: "2026-04-29T00:00:02.000Z" },
      ]),
    ).toBe("Created the file.");
  });

  it("prefers a newer unanswered user prompt over an older assistant message", () => {
    expect(
      chooseThreadPreview([
        { role: "user", content: "old request", createdAt: "2026-04-29T00:00:00.000Z" },
        { role: "assistant", content: "Old answer.", createdAt: "2026-04-29T00:00:01.000Z" },
        { role: "user", content: "new request", createdAt: "2026-04-29T00:00:02.000Z" },
      ]),
    ).toBe("new request");
  });

  it("prefers the latest user prompt over newer tool-only status when no assistant response exists", () => {
    expect(
      chooseThreadPreview([
        { role: "user", content: "create a file", createdAt: "2026-04-29T00:00:00.000Z" },
        { role: "tool", content: "write completed", createdAt: "2026-04-29T00:00:01.000Z" },
      ]),
    ).toBe("create a file");
  });

  it("skips assistant thinking when choosing sidebar-safe previews", () => {
    expect(
      chooseThreadPreview([
        { role: "user", content: "inspect memory", createdAt: "2026-04-29T00:00:00.000Z" },
        {
          role: "assistant",
          content: "The user asked me to inspect memory. I should call the tool.",
          createdAt: "2026-04-29T00:00:01.000Z",
          metadata: { kind: "thinking", status: "done" },
        },
      ]),
    ).toBe("inspect memory");
  });

  it("skips hidden internal transcript anchors when choosing sidebar-safe previews", () => {
    expect(
      chooseThreadPreview([
        { role: "assistant", content: "Still working.", createdAt: "2026-04-29T00:00:00.000Z" },
        {
          role: "user",
          content: "Continue working toward the active Ambient Desktop thread goal.",
          createdAt: "2026-04-29T00:00:01.000Z",
          metadata: { hiddenFromTranscript: true, kind: "hidden-user-message" },
        },
      ]),
    ).toBe("Still working.");
  });

  it("falls back to the latest non-empty message when a thread only has tool messages", () => {
    expect(
      chooseThreadPreview([
        { role: "tool", content: "write running", createdAt: "2026-04-29T00:00:00.000Z" },
        { role: "tool", content: "write completed", createdAt: "2026-04-29T00:00:01.000Z" },
      ]),
    ).toBe("write completed");
  });

  it("returns an empty preview for empty threads", () => {
    expect(chooseThreadPreview([])).toBe("");
  });
});
