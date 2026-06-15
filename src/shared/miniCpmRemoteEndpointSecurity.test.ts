import { describe, expect, it } from "vitest";
import {
  miniCpmRemoteEndpointBlockedMessage,
  miniCpmRemoteEndpointReviewChecklistText,
  miniCpmRemoteEndpointSecurityReview,
} from "./miniCpmRemoteEndpointSecurity";

describe("miniCpmRemoteEndpointSecurityReview", () => {
  it("keeps remote MiniCPM-V endpoints blocked behind the required security gates", () => {
    expect(miniCpmRemoteEndpointSecurityReview.status).toBe("blocked-pending-review");
    expect(miniCpmRemoteEndpointSecurityReview.checklist.map((item) => item.id)).toEqual([
      "allowed-hosts",
      "user-consent",
      "media-privacy",
      "secret-handling",
      "request-redaction",
      "artifact-retention",
      "network-egress",
      "ui-copy",
    ]);
    for (const item of miniCpmRemoteEndpointSecurityReview.checklist) {
      expect(item.requirement.length).toBeGreaterThan(40);
      expect(item.evidence.length).toBeGreaterThan(30);
    }
  });

  it("produces concise user-facing blocked copy", () => {
    const checklist = miniCpmRemoteEndpointReviewChecklistText();
    expect(checklist).toContain("allowed hosts");
    expect(checklist).toContain("user consent");
    expect(checklist).toContain("media privacy");
    expect(checklist).toContain("secret handling");
    expect(checklist).toContain("request redaction");
    expect(checklist).toContain("artifact retention");
    expect(checklist).toContain("network egress controls");
    expect(checklist).toContain("ui copy");
    expect(miniCpmRemoteEndpointBlockedMessage()).toContain("Remote MiniCPM-V endpoints remain disabled");
  });
});
