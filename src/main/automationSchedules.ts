import type { AutomationSchedulePresetKind } from "../shared/types";

export interface AutomationScheduleTimingInput {
  preset: AutomationSchedulePresetKind;
  cronExpression?: string;
  enabled?: boolean;
  now?: Date;
}

export function computeAutomationScheduleNextRunAt(input: AutomationScheduleTimingInput): string | undefined {
  if (input.enabled === false || input.preset === "manual") return undefined;
  const now = validDate(input.now) ?? new Date();
  const next =
    input.preset === "hourly"
      ? nextHourlyWindow(now)
      : input.preset === "daily"
        ? nextTimeWindow(now, 9, 0)
        : input.preset === "weekdays"
          ? nextWeekdayWindow(now, 9, 0)
          : input.preset === "weekly"
            ? nextWeeklyWindow(now, 1, 9, 0)
            : nextAdvancedCronWindow(now, input.cronExpression);
  return next?.toISOString();
}

export function normalizeAutomationScheduleCronExpression(preset: AutomationSchedulePresetKind, expression?: string): string | undefined {
  if (preset !== "advanced") return undefined;
  const normalized = expression?.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error("Advanced schedules require a cron expression.");
  parseSupportedCronExpression(normalized);
  return normalized;
}

function nextHourlyWindow(now: Date): Date {
  const next = cloneDate(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next;
}

function nextTimeWindow(now: Date, hour: number, minute: number): Date {
  const next = cloneDate(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

function nextWeekdayWindow(now: Date, hour: number, minute: number): Date {
  let next = nextTimeWindow(now, hour, minute);
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1);
    next.setHours(hour, minute, 0, 0);
  }
  return next;
}

function nextWeeklyWindow(now: Date, dayOfWeek: number, hour: number, minute: number): Date {
  const next = nextTimeWindow(now, hour, minute);
  while (next.getDay() !== dayOfWeek) {
    next.setDate(next.getDate() + 1);
    next.setHours(hour, minute, 0, 0);
  }
  return next;
}

function nextAdvancedCronWindow(now: Date, expression?: string): Date {
  const cron = parseSupportedCronExpression(expression?.trim() ?? "");
  const candidate = cloneDate(now);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);
  for (let attempts = 0; attempts < 366 * 24 * 60; attempts += 1) {
    if (
      candidate.getMinutes() === cron.minute &&
      candidate.getHours() === cron.hour &&
      (cron.dayOfWeek === undefined || candidate.getDay() === cron.dayOfWeek)
    ) {
      return candidate;
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  throw new Error(`Could not calculate the next run for cron expression: ${expression}`);
}

function parseSupportedCronExpression(expression: string): { minute: number; hour: number; dayOfWeek?: number } {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("Advanced schedules support five-field cron expressions.");
  const [minutePart, hourPart, dayOfMonthPart, monthPart, dayOfWeekPart] = parts;
  if (dayOfMonthPart !== "*" || monthPart !== "*") {
    throw new Error("Advanced schedules currently support daily or weekly cron expressions only.");
  }
  const minute = parseCronNumber(minutePart, 0, 59, "minute");
  const hour = parseCronNumber(hourPart, 0, 23, "hour");
  const dayOfWeek = dayOfWeekPart === "*" ? undefined : parseCronNumber(dayOfWeekPart, 0, 6, "day of week");
  return { minute, hour, dayOfWeek };
}

function parseCronNumber(value: string, min: number, max: number, label: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`Advanced schedule ${label} must be a number.`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Advanced schedule ${label} must be between ${min} and ${max}.`);
  }
  return parsed;
}

function cloneDate(value: Date): Date {
  return new Date(value.getTime());
}

function validDate(value: Date | undefined): Date | undefined {
  return value && Number.isFinite(value.getTime()) ? value : undefined;
}
