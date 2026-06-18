import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  AutomationFolderSummary,
  AutomationScheduleExceptionSummary,
  AutomationScheduleOccurrenceActionInput,
  AutomationScheduleOccurrenceActionResult,
  AutomationScheduleSummary,
  CreateAutomationFolderInput,
  CreateAutomationScheduleInput,
  MoveAutomationThreadInput,
  UpdateAutomationScheduleInput,
} from "../../shared/automationTypes";
import {
  automationsCreateFolderIpcChannels,
  automationsCreateScheduleIpcChannels,
  automationsListFoldersIpcChannels,
  automationsListScheduleExceptionsIpcChannels,
  automationsListSchedulesIpcChannels,
  automationsMoveThreadIpcChannels,
  automationsRescheduleScheduleOccurrenceIpcChannels,
  automationsSkipScheduleOccurrenceIpcChannels,
  automationsUpdateScheduleOccurrenceRunLimitsIpcChannels,
  automationsUpdateScheduleIpcChannels,
  registerAutomationsCreateFolderIpc,
  registerAutomationsCreateScheduleIpc,
  registerAutomationsListFoldersIpc,
  registerAutomationsListScheduleExceptionsIpc,
  registerAutomationsListSchedulesIpc,
  registerAutomationsMoveThreadIpc,
  registerAutomationsRescheduleScheduleOccurrenceIpc,
  registerAutomationsSkipScheduleOccurrenceIpc,
  registerAutomationsUpdateScheduleOccurrenceRunLimitsIpc,
  registerAutomationsUpdateScheduleIpc,
  type RegisterAutomationsCreateFolderIpcDependencies,
  type RegisterAutomationsCreateScheduleIpcDependencies,
  type RegisterAutomationsListFoldersIpcDependencies,
  type RegisterAutomationsListScheduleExceptionsIpcDependencies,
  type RegisterAutomationsListSchedulesIpcDependencies,
  type RegisterAutomationsMoveThreadIpcDependencies,
  type RegisterAutomationsRescheduleScheduleOccurrenceIpcDependencies,
  type RegisterAutomationsSkipScheduleOccurrenceIpcDependencies,
  type RegisterAutomationsUpdateScheduleOccurrenceRunLimitsIpcDependencies,
  type RegisterAutomationsUpdateScheduleIpcDependencies,
} from "./registerAutomationsIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerAutomationsListFoldersIpc", () => {
  it("registers the automations list folders channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...automationsListFoldersIpcChannels]);
  });

  it("lists automation folders", async () => {
    const { deps, folders, invoke } = registerWithFakes();

    await expect(invoke("automations:list-folders")).resolves.toEqual(folders);

    expect(deps.listAutomationFolders).toHaveBeenCalledOnce();
  });

  it("propagates automation folder list errors", async () => {
    const error = new Error("folders unavailable");
    const { deps, invoke } = registerWithFakes({ error });

    await expect(invoke("automations:list-folders")).rejects.toThrow("folders unavailable");

    expect(deps.listAutomationFolders).toHaveBeenCalledOnce();
  });
});

describe("registerAutomationsCreateFolderIpc", () => {
  it("registers the automations create folder channel", () => {
    const { handlers } = registerCreateFolderWithFakes();

    expect([...handlers.keys()]).toEqual([...automationsCreateFolderIpcChannels]);
  });

  it("parses create folder input before creating the folder", async () => {
    const { deps, folders, invoke } = registerCreateFolderWithFakes();

    await expect(
      invoke("automations:create-folder", {
        name: "Daily checks",
        extra: "ignored",
      }),
    ).resolves.toEqual(folders);

    expect(deps.createAutomationFolder).toHaveBeenCalledWith({ name: "Daily checks" });
  });

  it("rejects invalid create folder input before calling the dependency", () => {
    const { deps, invoke } = registerCreateFolderWithFakes();

    expect(() => invoke("automations:create-folder", { name: "" })).toThrow();

    expect(deps.createAutomationFolder).not.toHaveBeenCalled();
  });

  it("propagates create folder errors", async () => {
    const error = new Error("folder create failed");
    const { deps, invoke } = registerCreateFolderWithFakes({ error });

    await expect(invoke("automations:create-folder", { name: "Daily checks" })).rejects.toThrow("folder create failed");

    expect(deps.createAutomationFolder).toHaveBeenCalledWith({ name: "Daily checks" });
  });
});

describe("registerAutomationsMoveThreadIpc", () => {
  it("registers the automations move thread channel", () => {
    const { handlers } = registerMoveThreadWithFakes();

    expect([...handlers.keys()]).toEqual([...automationsMoveThreadIpcChannels]);
  });

  it("parses move thread input before moving the automation thread", async () => {
    const { deps, folders, invoke } = registerMoveThreadWithFakes();

    await expect(
      invoke("automations:move-thread", {
        threadId: "thread-1",
        folderId: "folder-1",
        extra: "ignored",
      }),
    ).resolves.toEqual(folders);

    expect(deps.moveAutomationThread).toHaveBeenCalledWith({
      threadId: "thread-1",
      folderId: "folder-1",
    });
  });

  it("rejects invalid move thread input before calling the dependency", () => {
    const { deps, invoke } = registerMoveThreadWithFakes();

    expect(() => invoke("automations:move-thread", { threadId: "", folderId: "folder-1" })).toThrow();

    expect(deps.moveAutomationThread).not.toHaveBeenCalled();
  });

  it("propagates move thread errors", async () => {
    const error = new Error("thread move failed");
    const { deps, invoke } = registerMoveThreadWithFakes({ error });

    await expect(invoke("automations:move-thread", { threadId: "thread-1", folderId: "folder-1" })).rejects.toThrow(
      "thread move failed",
    );

    expect(deps.moveAutomationThread).toHaveBeenCalledWith({
      threadId: "thread-1",
      folderId: "folder-1",
    });
  });
});

describe("registerAutomationsListSchedulesIpc", () => {
  it("registers the automations list schedules channel", () => {
    const { handlers } = registerListSchedulesWithFakes();

    expect([...handlers.keys()]).toEqual([...automationsListSchedulesIpcChannels]);
  });

  it("lists automation schedules", async () => {
    const { deps, invoke, schedules } = registerListSchedulesWithFakes();

    await expect(invoke("automations:list-schedules")).resolves.toEqual(schedules);

    expect(deps.listAutomationSchedules).toHaveBeenCalledOnce();
  });

  it("propagates automation schedule list errors", async () => {
    const error = new Error("schedules unavailable");
    const { deps, invoke } = registerListSchedulesWithFakes({ error });

    await expect(invoke("automations:list-schedules")).rejects.toThrow("schedules unavailable");

    expect(deps.listAutomationSchedules).toHaveBeenCalledOnce();
  });
});

describe("registerAutomationsCreateScheduleIpc", () => {
  it("registers the automations create schedule channel", () => {
    const { handlers } = registerCreateScheduleWithFakes();

    expect([...handlers.keys()]).toEqual([...automationsCreateScheduleIpcChannels]);
  });

  it("parses create schedule input before creating the schedule", async () => {
    const { deps, invoke, schedules } = registerCreateScheduleWithFakes();

    await expect(
      invoke("automations:create-schedule", {
        targetKind: "workflow_thread",
        targetId: "workflow-thread-1",
        targetVersion: 2,
        preset: "daily",
        cronExpression: "0 9 * * *",
        timezone: "America/Phoenix",
        enabled: true,
        skipIfActive: true,
        runLimits: {
          idleTimeoutMs: 30_000,
          maxRunMs: null,
        },
        extra: "ignored",
      }),
    ).resolves.toEqual(schedules);

    expect(deps.createAutomationSchedule).toHaveBeenCalledWith({
      targetKind: "workflow_thread",
      targetId: "workflow-thread-1",
      targetVersion: 2,
      preset: "daily",
      cronExpression: "0 9 * * *",
      timezone: "America/Phoenix",
      enabled: true,
      skipIfActive: true,
      runLimits: {
        idleTimeoutMs: 30_000,
        maxRunMs: null,
      },
    });
  });

  it("rejects invalid create schedule input before calling the dependency", () => {
    const { deps, invoke } = registerCreateScheduleWithFakes();

    expect(() => invoke("automations:create-schedule", { targetKind: "workflow_thread", targetId: "", preset: "daily" })).toThrow();

    expect(deps.createAutomationSchedule).not.toHaveBeenCalled();
  });

  it("propagates create schedule errors", async () => {
    const error = new Error("schedule create failed");
    const { deps, invoke } = registerCreateScheduleWithFakes({ error });

    await expect(
      invoke("automations:create-schedule", {
        targetKind: "workflow_thread",
        targetId: "workflow-thread-1",
        preset: "daily",
      }),
    ).rejects.toThrow("schedule create failed");

    expect(deps.createAutomationSchedule).toHaveBeenCalledWith({
      targetKind: "workflow_thread",
      targetId: "workflow-thread-1",
      preset: "daily",
    });
  });
});

describe("registerAutomationsUpdateScheduleIpc", () => {
  it("registers the automations update schedule channel", () => {
    const { handlers } = registerUpdateScheduleWithFakes();

    expect([...handlers.keys()]).toEqual([...automationsUpdateScheduleIpcChannels]);
  });

  it("parses update schedule input before updating the schedule", async () => {
    const { deps, invoke, schedules } = registerUpdateScheduleWithFakes();

    await expect(
      invoke("automations:update-schedule", {
        id: "schedule-1",
        targetKind: "workflow_thread",
        targetId: "workflow-thread-2",
        targetVersion: 3,
        preset: "weekly",
        cronExpression: "0 9 * * 1",
        timezone: "America/Phoenix",
        enabled: false,
        skipIfActive: true,
        runLimits: {
          idleTimeoutMs: 45_000,
          maxRunMs: 300_000,
        },
        editScope: "this_and_following",
        occurrenceAt: "2026-06-06T15:00:00.000Z",
        extra: "ignored",
      }),
    ).resolves.toEqual(schedules);

    expect(deps.updateAutomationSchedule).toHaveBeenCalledWith({
      id: "schedule-1",
      targetKind: "workflow_thread",
      targetId: "workflow-thread-2",
      targetVersion: 3,
      preset: "weekly",
      cronExpression: "0 9 * * 1",
      timezone: "America/Phoenix",
      enabled: false,
      skipIfActive: true,
      runLimits: {
        idleTimeoutMs: 45_000,
        maxRunMs: 300_000,
      },
      editScope: "this_and_following",
      occurrenceAt: "2026-06-06T15:00:00.000Z",
    });
  });

  it("rejects invalid update schedule input before calling the dependency", () => {
    const { deps, invoke } = registerUpdateScheduleWithFakes();

    expect(() => invoke("automations:update-schedule", { id: "", preset: "daily" })).toThrow();

    expect(deps.updateAutomationSchedule).not.toHaveBeenCalled();
  });

  it("propagates update schedule errors", async () => {
    const error = new Error("schedule update failed");
    const { deps, invoke } = registerUpdateScheduleWithFakes({ error });

    await expect(invoke("automations:update-schedule", { id: "schedule-1", enabled: false })).rejects.toThrow(
      "schedule update failed",
    );

    expect(deps.updateAutomationSchedule).toHaveBeenCalledWith({ id: "schedule-1", enabled: false });
  });
});

describe("registerAutomationsListScheduleExceptionsIpc", () => {
  it("registers the automations list schedule exceptions channel", () => {
    const { handlers } = registerListScheduleExceptionsWithFakes();

    expect([...handlers.keys()]).toEqual([...automationsListScheduleExceptionsIpcChannels]);
  });

  it("lists schedule exceptions with default input", async () => {
    const { deps, exceptions, invoke } = registerListScheduleExceptionsWithFakes();

    await expect(invoke("automations:list-schedule-exceptions")).resolves.toEqual(exceptions);

    expect(deps.listAutomationScheduleExceptions).toHaveBeenCalledWith({});
  });

  it("parses schedule exception list input before listing exceptions", async () => {
    const { deps, exceptions, invoke } = registerListScheduleExceptionsWithFakes();

    await expect(
      invoke("automations:list-schedule-exceptions", {
        scheduleId: "schedule-1",
        extra: "ignored",
      }),
    ).resolves.toEqual(exceptions);

    expect(deps.listAutomationScheduleExceptions).toHaveBeenCalledWith({ scheduleId: "schedule-1" });
  });

  it("rejects invalid schedule exception list input before calling the dependency", () => {
    const { deps, invoke } = registerListScheduleExceptionsWithFakes();

    expect(() => invoke("automations:list-schedule-exceptions", { scheduleId: "" })).toThrow();

    expect(deps.listAutomationScheduleExceptions).not.toHaveBeenCalled();
  });

  it("propagates schedule exception list errors", async () => {
    const error = new Error("schedule exceptions unavailable");
    const { deps, invoke } = registerListScheduleExceptionsWithFakes({ error });

    await expect(invoke("automations:list-schedule-exceptions", { scheduleId: "schedule-1" })).rejects.toThrow(
      "schedule exceptions unavailable",
    );

    expect(deps.listAutomationScheduleExceptions).toHaveBeenCalledWith({ scheduleId: "schedule-1" });
  });
});

describe("registerAutomationsSkipScheduleOccurrenceIpc", () => {
  it("registers the automations skip schedule occurrence channel", () => {
    const { handlers } = registerSkipScheduleOccurrenceWithFakes();

    expect([...handlers.keys()]).toEqual([...automationsSkipScheduleOccurrenceIpcChannels]);
  });

  it("parses occurrence action input before skipping an occurrence", async () => {
    const { deps, invoke, result } = registerSkipScheduleOccurrenceWithFakes();

    await expect(
      invoke("automations:skip-schedule-occurrence", {
        scheduleId: "schedule-1",
        occurrenceAt: "2026-06-06T15:00:00.000Z",
        replacementRunAt: "2026-06-06T16:00:00.000Z",
        runLimits: {
          idleTimeoutMs: 30_000,
          maxRunMs: null,
        },
        reason: "Skip this run",
        extra: "ignored",
      }),
    ).resolves.toEqual(result);

    expect(deps.skipAutomationScheduleOccurrence).toHaveBeenCalledWith({
      scheduleId: "schedule-1",
      occurrenceAt: "2026-06-06T15:00:00.000Z",
      replacementRunAt: "2026-06-06T16:00:00.000Z",
      runLimits: {
        idleTimeoutMs: 30_000,
        maxRunMs: null,
      },
      reason: "Skip this run",
    });
  });

  it("rejects invalid skip occurrence input before calling the dependency", () => {
    const { deps, invoke } = registerSkipScheduleOccurrenceWithFakes();

    expect(() => invoke("automations:skip-schedule-occurrence", { scheduleId: "" })).toThrow();

    expect(deps.skipAutomationScheduleOccurrence).not.toHaveBeenCalled();
  });

  it("propagates skip occurrence errors", async () => {
    const error = new Error("skip occurrence failed");
    const { deps, invoke } = registerSkipScheduleOccurrenceWithFakes({ error });

    await expect(invoke("automations:skip-schedule-occurrence", { scheduleId: "schedule-1" })).rejects.toThrow(
      "skip occurrence failed",
    );

    expect(deps.skipAutomationScheduleOccurrence).toHaveBeenCalledWith({ scheduleId: "schedule-1" });
  });
});

describe("registerAutomationsRescheduleScheduleOccurrenceIpc", () => {
  it("registers the automations reschedule schedule occurrence channel", () => {
    const { handlers } = registerRescheduleScheduleOccurrenceWithFakes();

    expect([...handlers.keys()]).toEqual([...automationsRescheduleScheduleOccurrenceIpcChannels]);
  });

  it("parses occurrence action input before rescheduling an occurrence", async () => {
    const { deps, invoke, result } = registerRescheduleScheduleOccurrenceWithFakes();

    await expect(
      invoke("automations:reschedule-schedule-occurrence", {
        scheduleId: "schedule-1",
        occurrenceAt: "2026-06-06T15:00:00.000Z",
        replacementRunAt: "2026-06-06T16:00:00.000Z",
        reason: "Move this run",
        extra: "ignored",
      }),
    ).resolves.toEqual(result);

    expect(deps.rescheduleAutomationScheduleOccurrence).toHaveBeenCalledWith({
      scheduleId: "schedule-1",
      occurrenceAt: "2026-06-06T15:00:00.000Z",
      replacementRunAt: "2026-06-06T16:00:00.000Z",
      reason: "Move this run",
    });
  });

  it("rejects invalid reschedule occurrence input before calling the dependency", () => {
    const { deps, invoke } = registerRescheduleScheduleOccurrenceWithFakes();

    expect(() => invoke("automations:reschedule-schedule-occurrence", { scheduleId: "" })).toThrow();

    expect(deps.rescheduleAutomationScheduleOccurrence).not.toHaveBeenCalled();
  });

  it("propagates reschedule occurrence errors", async () => {
    const error = new Error("reschedule occurrence failed");
    const { deps, invoke } = registerRescheduleScheduleOccurrenceWithFakes({ error });

    await expect(invoke("automations:reschedule-schedule-occurrence", { scheduleId: "schedule-1" })).rejects.toThrow(
      "reschedule occurrence failed",
    );

    expect(deps.rescheduleAutomationScheduleOccurrence).toHaveBeenCalledWith({ scheduleId: "schedule-1" });
  });
});

describe("registerAutomationsUpdateScheduleOccurrenceRunLimitsIpc", () => {
  it("registers the automations update schedule occurrence run limits channel", () => {
    const { handlers } = registerUpdateScheduleOccurrenceRunLimitsWithFakes();

    expect([...handlers.keys()]).toEqual([...automationsUpdateScheduleOccurrenceRunLimitsIpcChannels]);
  });

  it("parses occurrence action input before updating occurrence run limits", async () => {
    const { deps, invoke, result } = registerUpdateScheduleOccurrenceRunLimitsWithFakes();

    await expect(
      invoke("automations:update-schedule-occurrence-run-limits", {
        scheduleId: "schedule-1",
        occurrenceAt: "2026-06-06T15:00:00.000Z",
        runLimits: {
          idleTimeoutMs: 45_000,
          maxRunMs: 300_000,
        },
        extra: "ignored",
      }),
    ).resolves.toEqual(result);

    expect(deps.updateAutomationScheduleOccurrenceRunLimits).toHaveBeenCalledWith({
      scheduleId: "schedule-1",
      occurrenceAt: "2026-06-06T15:00:00.000Z",
      runLimits: {
        idleTimeoutMs: 45_000,
        maxRunMs: 300_000,
      },
    });
  });

  it("rejects invalid update occurrence run limits input before calling the dependency", () => {
    const { deps, invoke } = registerUpdateScheduleOccurrenceRunLimitsWithFakes();

    expect(() => invoke("automations:update-schedule-occurrence-run-limits", { scheduleId: "" })).toThrow();

    expect(deps.updateAutomationScheduleOccurrenceRunLimits).not.toHaveBeenCalled();
  });

  it("propagates update occurrence run limits errors", async () => {
    const error = new Error("update occurrence run limits failed");
    const { deps, invoke } = registerUpdateScheduleOccurrenceRunLimitsWithFakes({ error });

    await expect(
      invoke("automations:update-schedule-occurrence-run-limits", { scheduleId: "schedule-1" }),
    ).rejects.toThrow("update occurrence run limits failed");

    expect(deps.updateAutomationScheduleOccurrenceRunLimits).toHaveBeenCalledWith({ scheduleId: "schedule-1" });
  });
});

function registerWithFakes({
  folders = sampleAutomationFolders(),
  error,
}: {
  folders?: AutomationFolderSummary[];
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterAutomationsListFoldersIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    listAutomationFolders: vi.fn(async () => {
      if (error) throw error;
      return folders;
    }),
  };
  registerAutomationsListFoldersIpc(deps);

  return {
    deps,
    folders,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
  };
}

function registerListSchedulesWithFakes({
  schedules = sampleAutomationSchedules(),
  error,
}: {
  schedules?: AutomationScheduleSummary[];
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterAutomationsListSchedulesIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    listAutomationSchedules: vi.fn(async () => {
      if (error) throw error;
      return schedules;
    }),
  };
  registerAutomationsListSchedulesIpc(deps);

  return {
    deps,
    handlers,
    schedules,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
  };
}

function registerCreateScheduleWithFakes({
  schedules = sampleAutomationSchedules(),
  error,
}: {
  schedules?: AutomationScheduleSummary[];
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterAutomationsCreateScheduleIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    createAutomationSchedule: vi.fn(async (_input: CreateAutomationScheduleInput) => {
      if (error) throw error;
      return schedules;
    }),
  };
  registerAutomationsCreateScheduleIpc(deps);

  return {
    deps,
    handlers,
    schedules,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerUpdateScheduleWithFakes({
  schedules = sampleAutomationSchedules(),
  error,
}: {
  schedules?: AutomationScheduleSummary[];
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterAutomationsUpdateScheduleIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    updateAutomationSchedule: vi.fn(async (_input: UpdateAutomationScheduleInput) => {
      if (error) throw error;
      return schedules;
    }),
  };
  registerAutomationsUpdateScheduleIpc(deps);

  return {
    deps,
    handlers,
    schedules,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerListScheduleExceptionsWithFakes({
  exceptions = sampleAutomationScheduleExceptions(),
  error,
}: {
  exceptions?: AutomationScheduleExceptionSummary[];
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterAutomationsListScheduleExceptionsIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    listAutomationScheduleExceptions: vi.fn(async (_input: { scheduleId?: string }) => {
      if (error) throw error;
      return exceptions;
    }),
  };
  registerAutomationsListScheduleExceptionsIpc(deps);

  return {
    deps,
    exceptions,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerSkipScheduleOccurrenceWithFakes({
  result = sampleAutomationScheduleOccurrenceActionResult(),
  error,
}: {
  result?: AutomationScheduleOccurrenceActionResult;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterAutomationsSkipScheduleOccurrenceIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    skipAutomationScheduleOccurrence: vi.fn(async (_input: AutomationScheduleOccurrenceActionInput) => {
      if (error) throw error;
      return result;
    }),
  };
  registerAutomationsSkipScheduleOccurrenceIpc(deps);

  return {
    deps,
    handlers,
    result,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerRescheduleScheduleOccurrenceWithFakes({
  result = sampleAutomationScheduleOccurrenceActionResult(),
  error,
}: {
  result?: AutomationScheduleOccurrenceActionResult;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterAutomationsRescheduleScheduleOccurrenceIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    rescheduleAutomationScheduleOccurrence: vi.fn(async (_input: AutomationScheduleOccurrenceActionInput) => {
      if (error) throw error;
      return result;
    }),
  };
  registerAutomationsRescheduleScheduleOccurrenceIpc(deps);

  return {
    deps,
    handlers,
    result,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerUpdateScheduleOccurrenceRunLimitsWithFakes({
  result = sampleAutomationScheduleOccurrenceActionResult(),
  error,
}: {
  result?: AutomationScheduleOccurrenceActionResult;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterAutomationsUpdateScheduleOccurrenceRunLimitsIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    updateAutomationScheduleOccurrenceRunLimits: vi.fn(async (_input: AutomationScheduleOccurrenceActionInput) => {
      if (error) throw error;
      return result;
    }),
  };
  registerAutomationsUpdateScheduleOccurrenceRunLimitsIpc(deps);

  return {
    deps,
    handlers,
    result,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerMoveThreadWithFakes({
  folders = sampleAutomationFolders(),
  error,
}: {
  folders?: AutomationFolderSummary[];
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterAutomationsMoveThreadIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    moveAutomationThread: vi.fn(async (_input: MoveAutomationThreadInput) => {
      if (error) throw error;
      return folders;
    }),
  };
  registerAutomationsMoveThreadIpc(deps);

  return {
    deps,
    folders,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerCreateFolderWithFakes({
  folders = sampleAutomationFolders(),
  error,
}: {
  folders?: AutomationFolderSummary[];
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterAutomationsCreateFolderIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    createAutomationFolder: vi.fn(async (_input: CreateAutomationFolderInput) => {
      if (error) throw error;
      return folders;
    }),
  };
  registerAutomationsCreateFolderIpc(deps);

  return {
    deps,
    folders,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function sampleAutomationSchedules(): AutomationScheduleSummary[] {
  return [
    {
      id: "schedule-1",
      targetKind: "workflow_thread",
      targetId: "workflow-thread-1",
      targetLabel: "Weekly customer summary",
      preset: "daily",
      timezone: "America/Phoenix",
      enabled: true,
      skipIfActive: true,
      concurrencyPolicy: "skip_if_active",
      nextRunAt: "2026-06-06T15:00:00.000Z",
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:00:00.000Z",
    },
  ];
}

function sampleAutomationScheduleExceptions(): AutomationScheduleExceptionSummary[] {
  return [
    {
      id: "exception-1",
      scheduleId: "schedule-1",
      occurrenceAt: "2026-06-06T15:00:00.000Z",
      exceptionKind: "skip",
      status: "pending",
      reason: "User skipped this occurrence",
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:00:00.000Z",
    },
  ];
}

function sampleAutomationScheduleOccurrenceActionResult(): AutomationScheduleOccurrenceActionResult {
  return {
    schedules: sampleAutomationSchedules(),
    exceptions: sampleAutomationScheduleExceptions(),
  };
}

function sampleAutomationFolders(): AutomationFolderSummary[] {
  return [
    {
      id: "folder-1",
      name: "Daily checks",
      kind: "custom",
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:00:00.000Z",
      threads: [],
    },
  ];
}
