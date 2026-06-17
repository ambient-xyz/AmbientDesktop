import { describe, expect, it } from "vitest";

import { workspaceBoundedAgentContextFiles } from "./piContextFiles";

describe("workspaceBoundedAgentContextFiles", () => {
  it("keeps agent context inside the active workspace and drops ancestor project copies", () => {
    const workspacePath = "/repo/.ambient-codex/worktrees/thread-1";
    const agentDir = "/state/pi";

    const files = workspaceBoundedAgentContextFiles({
      workspacePath,
      agentDir,
      contextFiles: [
        { path: "/repo/AGENTS.md", content: "root instructions" },
        { path: "/repo/.ambient-codex/worktrees/thread-1/AGENTS.md", content: "worktree instructions" },
        { path: "/state/pi/AGENTS.md", content: "global instructions" },
      ],
    });

    expect(files.map((file) => file.path)).toEqual([
      "/repo/.ambient-codex/worktrees/thread-1/AGENTS.md",
      "/state/pi/AGENTS.md",
    ]);
  });

  it("dedupes normalized duplicate context content", () => {
    const files = workspaceBoundedAgentContextFiles({
      workspacePath: "/repo",
      agentDir: "/state/pi",
      contextFiles: [
        { path: "/repo/AGENTS.md", content: "Use live validation.\r\n" },
        { path: "/repo/subdir/AGENTS.md", content: "Use live validation.\n\n" },
        { path: "/repo/CLAUDE.md", content: "Different note." },
      ],
    });

    expect(files.map((file) => file.path)).toEqual(["/repo/AGENTS.md", "/repo/CLAUDE.md"]);
  });
});
