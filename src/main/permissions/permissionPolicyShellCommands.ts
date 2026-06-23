export type ShellCommandSemanticIntentKind =
  | "proof-command"
  | "scratch-output"
  | "dependency-artifact-import"
  | "local-server-launch"
  | "browser-proof"
  | "project-root-material-write"
  | "unknown";

const dangerousCommandPatterns = [
  /\brm\s+(-rf?|--recursive|--force)/i,
  /\bsudo\b/i,
  /\bchmod\b[^\n;&|]*\b777\b/i,
  /\bchown\b/i,
  /\bmkfs\b/i,
  /\bdd\b[^\n;&|]*\bof=/i,
];

const networkCommandPatterns = [/\b(curl|wget|scp|sftp|ssh|rsync|nc|netcat|nmap|rclone)\b/i];
const unmanagedToolHiveCommandPattern = new RegExp(String.raw`(?:^|[\s;&|([{])(?:\S*\/)?(?:thv|toolhive)(?:\s|$)`, "i");

export function isDangerousCommand(command: string): boolean {
  return dangerousCommandPatterns.some((pattern) => pattern.test(command));
}

export function isNetworkCommand(command: string): boolean {
  return networkCommandPatterns.some((pattern) => pattern.test(command));
}

export function classifyShellCommandSemanticIntent(command: string): ShellCommandSemanticIntentKind {
  const normalized = command.trim();
  if (!normalized) return "unknown";
  const lower = normalized.toLowerCase();

  if (isBrowserProofShellCommand(lower)) return "browser-proof";
  if (isLocalServerLaunchShellCommand(lower)) return "local-server-launch";
  if (isDependencyArtifactImportShellCommand(lower)) return "dependency-artifact-import";
  if (isProjectRootMaterialWriteShellCommand(lower)) return "project-root-material-write";
  if (isScratchOutputShellCommand(lower)) return "scratch-output";
  if (isProofShellCommand(lower)) return "proof-command";
  return "unknown";
}

export function shellCommandAuditReason(command: string | undefined): string {
  if (!command) return "Allowed workspace-scoped shell command.";
  const intent = classifyShellCommandSemanticIntent(command);
  if (intent === "unknown") return "Allowed workspace-scoped shell command.";
  return `Allowed workspace-scoped ${shellCommandIntentLabel(intent)}.`;
}

export function isUnmanagedToolHiveCommand(command: string): boolean {
  const words = splitShellWords(command);
  if (words?.some((word) => unmanagedToolHiveExecutableName(word))) return true;
  return unmanagedToolHiveCommandPattern.test(command);
}

export function shellCommandIntentLabel(intent: ShellCommandSemanticIntentKind): string {
  if (intent === "proof-command") return "proof command";
  if (intent === "scratch-output") return "scratch proof output";
  return intent.replace(/-/g, " ");
}

export function shellCommandIntentTitleVerb(intent: ShellCommandSemanticIntentKind): string {
  if (intent === "proof-command") return "Run proof command";
  if (intent === "scratch-output") return "Write scratch proof output";
  if (intent === "dependency-artifact-import") return "Import dependency artifacts";
  if (intent === "browser-proof") return "Run browser proof";
  if (intent === "local-server-launch") return "Launch local server";
  if (intent === "project-root-material-write") return "Write project deliverable";
  return "Run shell command";
}

export function shellCommandIntentSubject(intent: ShellCommandSemanticIntentKind): string {
  if (intent === "proof-command") return "A proof command";
  if (intent === "scratch-output") return "A scratch proof output command";
  return `A ${shellCommandIntentLabel(intent)}`;
}

export function splitShellWords(command: string): string[] | undefined {
  const words: string[] = [];
  let current = "";
  let quote: "'" | "\"" | undefined;
  let escaped = false;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quote || escaped) return undefined;
  if (current) words.push(current);
  return words;
}

function unmanagedToolHiveExecutableName(token: string): boolean {
  const executable = token.trim().split("/").pop()?.toLowerCase();
  return executable === "thv" || executable === "toolhive" || executable === "thv.exe" || executable === "toolhive.exe";
}

function isProofShellCommand(lowerCommand: string): boolean {
  return (
    /\b(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?(?:test|check|lint|typecheck|verify)\b/.test(lowerCommand) ||
    /\b(?:vitest|jest|mocha|ava|tsx|tsc|eslint)\b/.test(lowerCommand) ||
    /\bnode\s+(?:--check|--test)\b/.test(lowerCommand) ||
    /\bnode\b[^\n;&|]*\b(?:tests?|spec|verify|check|proof)[\w./-]*\.(?:mjs|cjs|js|ts)\b/.test(lowerCommand) ||
    /\bnode\s+--input-type=module\s+-e\b/.test(lowerCommand) ||
    /\b(?:verify|check|test|proof)[\w./-]*\.(?:mjs|cjs|js|ts)\b/.test(lowerCommand)
  );
}

function isScratchOutputShellCommand(lowerCommand: string): boolean {
  return (
    /(?:^|[\s])(?:>|1>|2>|&>)\s*(?:\/dev\/null|\/tmp\/|\/var\/tmp\/|\.ambient\/|\.ambient-codex\/|tmp\/|temp\/|test-results\/|reports?\/)/.test(lowerCommand) ||
    /\b(?:tee|cp|mv)\b[^\n;&|]*(?:\/tmp\/|\/var\/tmp\/|\.ambient\/|\.ambient-codex\/|tmp\/|temp\/|test-results\/|reports?\/)/.test(lowerCommand)
  );
}

function isDependencyArtifactImportShellCommand(lowerCommand: string): boolean {
  return lowerCommand.includes(".ambient/dependency-artifacts") || lowerCommand.includes("dependency-artifacts/manifest.json");
}

function isLocalServerLaunchShellCommand(lowerCommand: string): boolean {
  return (
    /\b(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?(?:dev|start|preview|serve)\b/.test(lowerCommand) ||
    /\b(?:vite|next|astro|svelte-kit|webpack-dev-server|http-server|serve)\b/.test(lowerCommand) ||
    /\bpython(?:3)?\s+-m\s+http\.server\b/.test(lowerCommand)
  );
}

function isBrowserProofShellCommand(lowerCommand: string): boolean {
  return /\b(?:playwright|cypress)\b/.test(lowerCommand) || /\bbrowser[-_ ]proof\b/.test(lowerCommand);
}

function isProjectRootMaterialWriteShellCommand(lowerCommand: string): boolean {
  return /\b(?:git\s+apply|git\s+add|apply to root|apply-to-root|integration queue|project-root)\b/.test(lowerCommand);
}
