---
version: 1
tracker:
  active_states: [todo, ready, in_progress]
  review_states: [review]
  terminal_states: [done, canceled, duplicate]
orchestration:
  poll_interval_ms: 30000
  max_concurrent_agents: 1
  max_turns: 2
  stall_timeout_ms: 600000
  auto_dispatch: false
workspace:
  strategy: git-worktree
  root: .ambient-codex/orchestration/workspaces
  branch_prefix: dogfood/
  cleanup_terminal_workspaces: false
  reuse_existing: true
agent:
  permission_mode: full-access
  thinking_level: low
  extra_instructions: |
    Keep this dogfood task narrow and proof-oriented. Prefer the smallest coherent implementation slice that satisfies the card. Run relevant verification and summarize changed files, test results, and any remaining blockers.
proof_of_work:
  require_tests: true
  require_diff_summary: true
  require_screenshots: false
---
You are executing a Starfall Courier project-board card in a prepared git worktree.

Prepared workspace path: {{ workspace.path }}

Task: {{ task.identifier }} - {{ task.title }}

Description:
{{ task.description }}

Complete the card as independently as possible inside the prepared workspace path above. Do not edit or test against the source project root outside that worktree. Use the project docs as source-of-truth, make a small implementation or documentation change, run the relevant verification from the prepared workspace, and end with a concise proof packet:

- changed files;
- commands/tests run and their result;
- acceptance criteria satisfied;
- visual/manual proof status if the card requires it;
- explicit follow-ups or blockers, if any.
