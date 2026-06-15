export interface AppLogEntry {
  timestamp: string;
  level: "debug" | "error" | "info" | "log" | "warn";
  message: string;
}

const MAX_LOG_ENTRIES = 500;
const entries: AppLogEntry[] = [];
let installed = false;

function formatArg(arg: unknown): string {
  if (arg instanceof Error) return arg.stack || arg.message;
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function appendLog(level: AppLogEntry["level"], args: unknown[]): void {
  entries.push({
    timestamp: new Date().toISOString(),
    level,
    message: args.map(formatArg).join(" "),
  });
  if (entries.length > MAX_LOG_ENTRIES) entries.splice(0, entries.length - MAX_LOG_ENTRIES);
}

export function installAppLogCapture(): void {
  if (installed) return;
  installed = true;

  for (const level of ["debug", "error", "info", "log", "warn"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      appendLog(level, args);
      original(...args);
    };
  }
}

export function getAppLogs(): AppLogEntry[] {
  return [...entries];
}
