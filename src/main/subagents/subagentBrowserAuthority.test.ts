import { describe, expect, it } from "vitest";

import type { SubagentToolScopeSnapshotSummary } from "../../shared/subagentTypes";
import { classifySubagentBrowserToolAuthority } from "./subagentBrowserAuthority";

describe("classifySubagentBrowserToolAuthority", () => {
  it("allows child browser URL tools only inside allowed authority domains", () => {
    expect(classifySubagentBrowserToolAuthority({
      thread: childThread(),
      toolName: "browser_nav",
      toolInput: { url: "https://docs.example.test/guide", profileMode: "isolated" },
      snapshots: [snapshot({ networkDecision: "allow", domains: ["example.test"] })],
    })).toEqual({ action: "allow" });

    const outside = classifySubagentBrowserToolAuthority({
      thread: childThread(),
      toolName: "browser_nav",
      toolInput: { url: "https://outside.example/guide", profileMode: "isolated" },
      snapshots: [snapshot({ networkDecision: "allow", domains: ["example.test"] })],
    });

    expect(outside).toMatchObject({
      action: "prompt",
      request: {
        threadId: "child-thread",
        toolName: "browser_nav",
        title: "Allow child browser network access?",
        risk: "browser-network",
        reusableScopes: ["thread", "project", "workspace"],
        grantActionKind: "browser_network",
        grantTargetKind: "browser_origin",
        grantTargetLabel: "outside.example",
        grantConditions: {
          childRunId: "child-run",
          childThreadId: "child-thread",
          domain: "outside.example",
          source: "subagent-child-browser-authority",
        },
      },
    });
    if (outside?.action === "prompt") {
      expect(outside.request.detail).toContain("Allowed domains: example.test");
      expect(outside.request.detail).toContain("Child run: child-run");
    }
  });

  it("asks the parent for child browser authority when the launch profile requires escalation", () => {
    const decision = classifySubagentBrowserToolAuthority({
      thread: childThread(),
      toolName: "browser_search",
      toolInput: { query: "Ambient sub-agent permissions" },
      snapshots: [snapshot({ networkDecision: "ask_parent" })],
    });

    expect(decision).toMatchObject({
      action: "prompt",
      request: {
        title: "Allow child browser network access?",
        risk: "browser-network",
        grantActionKind: "browser_network",
        grantTargetKind: "tool",
        grantTargetLabel: "browser_search",
      },
    });
    if (decision?.action === "prompt") {
      expect(decision.request.message).toContain("Review this in the parent thread");
      expect(decision.request.detail).toContain("Reason: Child browser authority requires parent approval");
    }
  });

  it("fails closed for non-interactive child browser escalation", () => {
    const decision = classifySubagentBrowserToolAuthority({
      thread: childThread(),
      toolName: "browser_content",
      toolInput: { url: "https://example.test" },
      snapshots: [snapshot({ networkDecision: "ask_parent", approvalMode: "non_interactive" })],
    });

    expect(decision).toMatchObject({
      action: "deny",
      reason: "Denied because this sub-agent launch is non-interactive and cannot ask the parent for browser authority.",
      request: {
        risk: "browser-network",
      },
    });
  });

  it("keeps copied browser profile access parent-approved even when network is otherwise allowed", () => {
    const decision = classifySubagentBrowserToolAuthority({
      thread: childThread(),
      toolName: "browser_search",
      toolInput: { query: "ambient", profileMode: "copied" },
      snapshots: [snapshot({ networkDecision: "allow" })],
    });

    expect(decision).toMatchObject({
      action: "prompt",
      request: {
        title: "Allow child copied browser profile access?",
        risk: "browser-profile",
        grantActionKind: "browser_profile",
      },
    });
  });

  it("denies child browser tools when the child authority profile is missing", () => {
    expect(classifySubagentBrowserToolAuthority({
      thread: childThread(),
      toolName: "browser_search",
      toolInput: { query: "ambient" },
      snapshots: [],
    })).toMatchObject({
      action: "deny",
      reason: "Sub-agent browser tool is unavailable because no child authority profile was recorded for this run.",
    });
  });

  it("does not affect non-child threads or non-browser tools", () => {
    expect(classifySubagentBrowserToolAuthority({
      thread: { id: "parent-thread", kind: "chat", subagentRunId: undefined },
      toolName: "browser_search",
      toolInput: { query: "ambient" },
      snapshots: [snapshot({ networkDecision: "deny" })],
    })).toBeUndefined();
    expect(classifySubagentBrowserToolAuthority({
      thread: childThread(),
      toolName: "read",
      toolInput: { path: "README.md" },
      snapshots: [snapshot({ networkDecision: "deny" })],
    })).toBeUndefined();
  });
});

function childThread() {
  return {
    id: "child-thread",
    kind: "subagent_child" as const,
    subagentRunId: "child-run",
  };
}

function snapshot(input: {
  networkDecision: "allow" | "ask_parent" | "deny";
  domains?: string[];
  approvalMode?: "interactive" | "non_interactive";
}): SubagentToolScopeSnapshotSummary {
  return {
    runId: "child-run",
    sequence: 1,
    createdAt: "2026-06-13T00:00:00.000Z",
    resolverInputs: {
      childAuthorityProfile: {
        childRunId: "child-run",
        childThreadId: "child-thread",
        approvalRouting: {
          mode: input.approvalMode ?? "interactive",
        },
        resourceScopes: {
          browser: {
            networkDecision: input.networkDecision,
            domains: input.domains ?? [],
          },
        },
      },
    },
    scope: {
      schemaVersion: "ambient-subagent-tool-scope-v1",
      loadedCategories: ["browser.interactive"],
      piVisibleCategories: ["browser.interactive"],
      deniedCategories: [],
      loadedTools: [],
      piVisibleTools: [],
      deniedTools: [],
      approvalMode: input.approvalMode ?? "interactive",
      worktreeIsolated: false,
      fanoutAvailable: false,
    },
  };
}
