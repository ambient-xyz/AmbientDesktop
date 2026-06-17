import { describe, expect, it } from "vitest";
import {
  scraplingBrowserContentToolArguments,
  shouldRouteBrowserContentUrlToScrapling,
} from "./scraplingBrowserRouting";

describe("Scrapling browser content routing", () => {
  it("routes ordinary public HTTPS URL reads through Scrapling", () => {
    expect(shouldRouteBrowserContentUrlToScrapling({ url: "https://example.com/docs" })).toBe(true);
    expect(scraplingBrowserContentToolArguments("https://example.com/docs")).toEqual({
      url: "https://example.com/docs",
      extraction_type: "markdown",
      main_content_only: true,
    });
  });

  it("keeps active, interactive, local, and credentialed browser reads on the browser path", () => {
    expect(shouldRouteBrowserContentUrlToScrapling({})).toBe(false);
    expect(shouldRouteBrowserContentUrlToScrapling({ url: "https://example.com", userActionId: "captcha-1" })).toBe(false);
    expect(shouldRouteBrowserContentUrlToScrapling({ url: "https://example.com", waitForUserAction: true })).toBe(false);
    expect(shouldRouteBrowserContentUrlToScrapling({ url: "http://example.com" })).toBe(false);
    expect(shouldRouteBrowserContentUrlToScrapling({ url: "https://user:pass@example.com" })).toBe(false);
    expect(shouldRouteBrowserContentUrlToScrapling({ url: "https://localhost:3000" })).toBe(false);
    expect(shouldRouteBrowserContentUrlToScrapling({ url: "https://192.168.1.10/admin" })).toBe(false);
    expect(shouldRouteBrowserContentUrlToScrapling({ url: "https://[::1]/" })).toBe(false);
    expect(shouldRouteBrowserContentUrlToScrapling({ url: "https://docs.google.com/document/d/private-doc/edit" })).toBe(false);
    expect(shouldRouteBrowserContentUrlToScrapling({ url: "https://acme.slack.com/archives/C123" })).toBe(false);
  });
});
