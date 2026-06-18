import { describe, expect, it } from "vitest";
import {
  assertAllowedInternalBrowserUrl,
  isAllowedExternalOpenUrl,
  isAllowedInternalBrowserUrl,
  isLoopbackWebUrl,
  parseExternalOpenUrl,
} from "./externalUrlPolicy";

describe("externalUrlPolicy", () => {
  it("allows https external links", () => {
    expect(parseExternalOpenUrl("https://ambient.xyz/docs")).toBe("https://ambient.xyz/docs");
  });

  it("allows loopback http for local OAuth and development callbacks", () => {
    expect(parseExternalOpenUrl("http://localhost:5173/callback")).toBe("http://localhost:5173/callback");
    expect(parseExternalOpenUrl("http://127.0.0.1:43111/callback")).toBe("http://127.0.0.1:43111/callback");
    expect(parseExternalOpenUrl("http://[::1]:43111/callback")).toBe("http://[::1]:43111/callback");
  });

  it("rejects file, script, data, custom, and non-loopback http links", () => {
    for (const url of [
      "file:///path/to/user/.ssh/id_rsa",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "ambient://dangerous-action",
      "http://example.com/",
      "https://user:secret@example.com/",
    ]) {
      expect(isAllowedExternalOpenUrl(url), url).toBe(false);
    }
  });

  it("limits internal browser navigation to web schemes", () => {
    expect(assertAllowedInternalBrowserUrl("https://example.com/path")).toBe("https://example.com/path");
    expect(assertAllowedInternalBrowserUrl("http://example.com/path")).toBe("http://example.com/path");
    expect(isAllowedInternalBrowserUrl("file:///tmp/secret.html")).toBe(false);
    expect(isAllowedInternalBrowserUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedInternalBrowserUrl("data:text/html,hello")).toBe(false);
    expect(isAllowedInternalBrowserUrl("https://user:secret@example.com/")).toBe(false);
  });

  it("identifies loopback web URLs that should stay in Ambient browser routing", () => {
    expect(isLoopbackWebUrl("http://localhost:3001/editor")).toBe(true);
    expect(isLoopbackWebUrl("https://localhost:3001/editor")).toBe(true);
    expect(isLoopbackWebUrl("http://127.0.0.1:5173")).toBe(true);
    expect(isLoopbackWebUrl("http://[::1]:5173")).toBe(true);
    expect(isLoopbackWebUrl("https://example.com")).toBe(false);
    expect(isLoopbackWebUrl("http://192.168.1.5:5173")).toBe(false);
    expect(isLoopbackWebUrl("file:///tmp/index.html")).toBe(false);
    expect(isLoopbackWebUrl("https://user:secret@localhost:5173")).toBe(false);
  });
});
