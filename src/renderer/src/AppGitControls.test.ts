import { describe, expect, it } from "vitest";

import type { GitReviewSummary } from "../../shared/types";
import { gitEditSummaryBadgeTitle } from "./AppGitControls";

describe("git controls helpers", () => {
  it("formats edit summary badge titles", () => {
    expect(gitEditSummaryBadgeTitle(review({ fileCount: 1, branch: "feature/git" }))).toBe("1 file changed on feature/git");
    expect(gitEditSummaryBadgeTitle(review({ fileCount: 2, branch: "main" }))).toBe("2 files changed on main");
    expect(gitEditSummaryBadgeTitle(review({ fileCount: 2, branch: "main" }), "refresh failed")).toBe("Git review may be stale: refresh failed");
  });
});

function review(input: { fileCount: number; branch: string }): Pick<GitReviewSummary, "files" | "branch"> {
  return {
    branch: input.branch,
    files: Array.from({ length: input.fileCount }, (_, index) => ({
      path: `file-${index}.ts`,
      status: "modified",
      category: "modified",
      additions: 1,
      deletions: 0,
      staged: false,
      unstaged: true,
      untracked: false,
      conflicted: false,
    })),
  };
}
