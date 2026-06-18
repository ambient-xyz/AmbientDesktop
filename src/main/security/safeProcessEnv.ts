const SAFE_INHERITED_ENV_ALLOWLIST = new Set([
  "PATH",
  "HOME",
  "USER",
  "USERNAME",
  "SHELL",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "COLORTERM",
  "SystemRoot",
  "ComSpec",
  "PATHEXT",
  "WINDIR",
]);

const SECRET_ENV_NAME_PATTERNS = [
  /(^|_)(API_?KEY|SECRET|TOKEN|PASSWORD|PASS|CREDENTIAL|PRIVATE_?KEY|ACCESS_?KEY|REFRESH_?TOKEN|BEARER)(_|$)/i,
  /(^|_)AUTH(_|$)/i,
];

export function buildSafeProcessEnv(baseEnv: NodeJS.ProcessEnv = process.env, explicitEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of SAFE_INHERITED_ENV_ALLOWLIST) {
    const value = baseEnv[key];
    if (typeof value === "string" && !isSecretEnvName(key)) env[key] = value;
  }
  for (const [key, value] of Object.entries(explicitEnv ?? {})) {
    if (typeof value === "string" && !isSecretEnvName(key)) env[key] = value;
  }
  return env;
}

export function isSecretEnvName(name: string): boolean {
  return SECRET_ENV_NAME_PATTERNS.some((pattern) => pattern.test(name));
}
