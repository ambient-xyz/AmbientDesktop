import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const threadRepositorySource = readFileSync(new URL("./threadRepository.ts", import.meta.url), "utf8");
const threadWorktreeRepositorySource = readFileSync(new URL("./threadWorktreeRepository.ts", import.meta.url), "utf8");

describe("ProjectStoreThreadWorktreeRepository", () => {
  it("keeps thread worktree SQL ownership out of the broad thread repository", () => {
    expect(threadRepositorySource).toContain("ProjectStoreThreadWorktreeRepository");
    expect(threadRepositorySource).not.toContain("INSERT INTO thread_worktrees");
    expect(threadRepositorySource).not.toContain("UPDATE thread_worktrees SET last_checkpoint_id");
    expect(threadWorktreeRepositorySource).toContain("INSERT INTO thread_worktrees");
    expect(threadWorktreeRepositorySource).toContain("UPDATE thread_worktrees SET last_checkpoint_id");
  });
});
