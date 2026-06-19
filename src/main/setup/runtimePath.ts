import { existsSync } from "node:fs";
import { delimiter, dirname } from "node:path";
import { buildSafeProcessEnv } from "./setupSecurityFacade";

const commonRuntimeBinDirs = [
  dirname(process.execPath),
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];

export function ambientRuntimePath(env: NodeJS.ProcessEnv = process.env): string {
  const existing = (env.PATH ?? "")
    .split(delimiter)
    .map((part) => part.trim())
    .filter(Boolean);
  const additions = commonRuntimeBinDirs.filter((dir) => dir && existsSync(dir));
  return [...new Set([...existing, ...additions])].join(delimiter);
}

export function ambientRuntimeEnv(env: NodeJS.ProcessEnv = process.env, explicitEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const pathEnv = { ...env, ...explicitEnv };
  return {
    ...buildSafeProcessEnv(env, explicitEnv),
    PATH: ambientRuntimePath(pathEnv),
  };
}
