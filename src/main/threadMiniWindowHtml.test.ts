import { describe, expect, it } from "vitest";
import type { ChatMessage, ThreadSummary } from "../shared/types";
import { miniWindowHeaderPaddingLeft, renderThreadMiniWindowHtml } from "./threadMiniWindowHtml";

const thread: ThreadSummary = {
  id: "thread-1",
  title: "Flying Goats Starry Night Sky",
  workspacePath: "/Users/example/moreExperimentalFollies",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  lastMessagePreview: "",
  permissionMode: "full-access",
  collaborationMode: "agent",
  model: "zai-org/GLM-5.1-FP8",
  thinkingLevel: "xhigh",
};

const messages: ChatMessage[] = [
  {
    id: "message-1",
    threadId: "thread-1",
    role: "assistant",
    content: "Initialized empty Git repository.",
    createdAt: "2026-05-01T00:00:00.000Z",
  },
  {
    id: "message-2",
    threadId: "thread-1",
    role: "assistant",
    content: "Thinking about repository setup.",
    createdAt: "2026-05-01T00:00:01.000Z",
    metadata: { kind: "thinking", status: "done" },
  },
];

describe("thread mini window html", () => {
  it("reserves header space for macOS traffic lights", () => {
    expect(miniWindowHeaderPaddingLeft("darwin")).toBe("96px");

    const html = renderThreadMiniWindowHtml(thread, messages, thread.workspacePath, {
      theme: "light",
      platform: "darwin",
    });

    expect(html).toContain("--mini-header-left: 96px;");
    expect(html).toContain("padding: 18px 20px 14px var(--mini-header-left);");
  });

  it("uses normal header padding on non-macOS platforms", () => {
    expect(miniWindowHeaderPaddingLeft("linux")).toBe("20px");
  });

  it("escapes transcript content rendered in the mini window", () => {
    const html = renderThreadMiniWindowHtml(
      { ...thread, title: "A <title>" },
      [{ ...messages[0], content: "Use <script>alert('x')</script>" }],
      "/tmp/example & sample",
      { theme: "dark", platform: "darwin" },
    );

    expect(html).toContain("A &lt;title&gt;");
    expect(html).toContain("/tmp/example &amp; sample");
    expect(html).toContain("Use &lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
  });

  it("renders thinking only in full display mode", () => {
    const full = renderThreadMiniWindowHtml(thread, messages, thread.workspacePath, {
      theme: "light",
      platform: "darwin",
      thinkingDisplayMode: "full",
    });
    const off = renderThreadMiniWindowHtml(thread, messages, thread.workspacePath, {
      theme: "light",
      platform: "darwin",
      thinkingDisplayMode: "off",
    });
    const transient = renderThreadMiniWindowHtml(thread, messages, thread.workspacePath, {
      theme: "light",
      platform: "darwin",
      thinkingDisplayMode: "transient",
    });

    expect(full).toContain("Thinking about repository setup.");
    expect(off).not.toContain("Thinking about repository setup.");
    expect(transient).not.toContain("Thinking about repository setup.");
  });
});
