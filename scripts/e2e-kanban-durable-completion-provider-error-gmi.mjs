#!/usr/bin/env node
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.AMBIENT_E2E_PROJECT_BOARD_FINAL_ERROR_AFTER_TASK_COMPLETE ||= "1";
process.env.AMBIENT_KANBAN_CONTRAST_NATIVE_ACTIONS_EXPECT_DURABLE_COMPLETION_RECOVERY = "1";
process.env.AMBIENT_KANBAN_CONTRAST_NATIVE_ACTIONS_OUT_DIR ||=
  join(tmpdir(), "ambient-kanban-durable-completion-provider-error-gmi");

await import("./e2e-kanban-contrast-native-task-actions-gmi.mjs");
