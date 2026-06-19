import { describe, expect, it } from "vitest";

import {
  AGENT_MEMORY_PRIVACY_DISCLOSURE,
  agentMemoryPrivacyLanguageReviewed,
} from "./agentMemoryPrivacy";

describe("agent memory privacy language", () => {
  it("covers workspace-local storage, raw-content omission, deletion, and transcript boundaries", () => {
    expect(agentMemoryPrivacyLanguageReviewed()).toBe(true);
    expect(AGENT_MEMORY_PRIVACY_DISCLOSURE).toContain("workspace-local storage");
    expect(AGENT_MEMORY_PRIVACY_DISCLOSURE).toContain("Inspect, edit, and delete");
    expect(AGENT_MEMORY_PRIVACY_DISCLOSURE).toContain("Tencent-backed memory records");
    expect(AGENT_MEMORY_PRIVACY_DISCLOSURE).toContain("diagnostics and exports omit raw memory content");
    expect(AGENT_MEMORY_PRIVACY_DISCLOSURE).toContain("does not edit existing chat transcripts or workspace files");
  });

  it("fails review when required boundaries are missing", () => {
    expect(agentMemoryPrivacyLanguageReviewed("Memory is cool.")).toBe(false);
  });
});
