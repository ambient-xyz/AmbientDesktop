import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { BrowserPageContent, BrowserUserActionState } from "../../../shared/types";
import {
  browserAuditRisk,
  browserContentText,
  browserUserActionText,
  materializeBrowserPageContent,
} from "./agentRuntimeBrowserContentFormatting";

describe("AgentRuntime browser content formatting", () => {
  it("formats browser user action wait states without hidden retry encouragement", () => {
    const text = browserUserActionText(browserUserActionState({
      status: "timed-out",
      kind: "captcha",
      provider: "cloudflare",
      title: "Example challenge",
      url: "https://example.com/challenge",
      message: "Complete the browser challenge.",
    }));

    expect(text).toContain("Browser timed out while waiting for user action.");
    expect(text).toContain("Action: captcha");
    expect(text).toContain("Provider: cloudflare");
    expect(text).toContain("Title: Example challenge");
    expect(text).toContain("URL: https://example.com/challenge");
    expect(text).toContain("Do not retry the same browser action");
  });

  it("formats page title, URL, text, and a bounded link preview", () => {
    const links = Array.from({ length: 13 }, (_unused, index) => ({
      text: `Link ${index + 1}`,
      url: `https://example.com/${index + 1}`,
    }));

    const text = browserContentText({
      title: "Example page",
      url: "https://example.com",
      text: "Readable body",
      links,
    });

    expect(text).toContain("Title: Example page");
    expect(text).toContain("URL: https://example.com");
    expect(text).toContain("Text:\nReadable body");
    expect(text).toContain("12. Link 12 - https://example.com/12");
    expect(text).not.toContain("13. Link 13");
  });

  it("materializes long page content and preserves the saved full text path", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-browser-content-formatting-"));
    try {
      const fullText = "A".repeat(12_050);
      const materialized = await materializeBrowserPageContent(workspacePath, "browser-content", {
        title: "Large page",
        url: "https://example.com/large",
        text: fullText,
        links: [],
      });

      expect(materialized.text).toContain("[truncated] page text preview is 12000 of 12050 chars");
      expect(materialized.textOutput).toMatchObject({
        truncated: true,
        totalChars: 12_050,
        previewChars: 12_000,
      });
      expect(materialized.textOutput?.artifactPath).toContain(".ambient/tool-outputs/");
      expect(await readFile(join(workspacePath, materialized.textOutput!.artifactPath!), "utf8")).toBe(fullText);
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("maps copied browser profiles to profile audit risk", () => {
    expect(browserAuditRisk("copied", "browser-network")).toBe("browser-profile");
    expect(browserAuditRisk("isolated", "browser-network")).toBe("browser-network");
    expect(browserAuditRisk("isolated", "browser-control")).toBe("browser-control");
  });
});

function browserUserActionState(overrides: Partial<BrowserUserActionState>): BrowserUserActionState {
  return {
    id: "action-1",
    active: true,
    status: "waiting",
    kind: "unknown-user-action",
    toolName: "browser_content",
    runtime: "chrome",
    profileMode: "isolated",
    message: "Browser needs user action.",
    startedAt: "2026-06-10T00:00:00.000Z",
    lastCheckedAt: "2026-06-10T00:00:01.000Z",
    canAutoResume: false,
    ...overrides,
  };
}
