import { describe, expect, it } from "vitest";
import { computeAutomationScheduleNextRunAt, normalizeAutomationScheduleCronExpression } from "./automationSchedules";

describe("automation schedule timing", () => {
  it("calculates preset next-run windows", () => {
    const now = new Date(2026, 4, 1, 8, 30, 0, 0);

    expect(computeAutomationScheduleNextRunAt({ preset: "manual", enabled: true, now })).toBeUndefined();
    expect(computeAutomationScheduleNextRunAt({ preset: "daily", enabled: false, now })).toBeUndefined();
    expect(computeAutomationScheduleNextRunAt({ preset: "hourly", enabled: true, now })).toBe(new Date(2026, 4, 1, 9, 0, 0, 0).toISOString());
    expect(computeAutomationScheduleNextRunAt({ preset: "daily", enabled: true, now })).toBe(new Date(2026, 4, 1, 9, 0, 0, 0).toISOString());
    expect(computeAutomationScheduleNextRunAt({ preset: "weekdays", enabled: true, now: new Date(2026, 4, 1, 10, 0, 0, 0) })).toBe(
      new Date(2026, 4, 4, 9, 0, 0, 0).toISOString(),
    );
    expect(computeAutomationScheduleNextRunAt({ preset: "weekly", enabled: true, now })).toBe(new Date(2026, 4, 4, 9, 0, 0, 0).toISOString());
  });

  it("normalizes supported advanced cron expressions", () => {
    expect(normalizeAutomationScheduleCronExpression("advanced", " 15   8 *  *  1 ")).toBe("15 8 * * 1");
    expect(computeAutomationScheduleNextRunAt({ preset: "advanced", cronExpression: "15 8 * * 1", enabled: true, now: new Date(2026, 4, 1, 10, 0, 0, 0) })).toBe(
      new Date(2026, 4, 4, 8, 15, 0, 0).toISOString(),
    );
    expect(() => normalizeAutomationScheduleCronExpression("advanced", "")).toThrow("Advanced schedules require a cron expression.");
    expect(() => normalizeAutomationScheduleCronExpression("advanced", "*/5 * * * *")).toThrow("minute must be a number");
  });
});
