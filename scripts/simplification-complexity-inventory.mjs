#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2).filter((arg) => arg !== "--");
const limit = positiveNumberArg("--limit", 20);
const json = argv.includes("--json");

const files = gitTrackedSourceFiles()
  .filter((file) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file))
  .filter((file) => !isGeneratedOrVendored(file));

const fileStats = files
  .map((file) => ({
    file,
    lines: lineCount(readFileSync(resolve(repoRoot, file), "utf8")),
  }))
  .sort((a, b) => b.lines - a.lines)
  .slice(0, limit);

const declarationStats = files
  .flatMap((file) => declarationSizes(file))
  .sort((a, b) => b.lines - a.lines)
  .slice(0, limit);

const report = {
  generatedAt: new Date().toISOString(),
  sourceFileCount: files.length,
  generatedFilesExcluded: true,
  declarationScan: "approximate",
  topFiles: fileStats,
  topDeclarations: declarationStats,
};

if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(markdownReport(report));
}

function gitTrackedSourceFiles() {
  const output = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
  return output.split("\n").filter(Boolean);
}

function isGeneratedOrVendored(file) {
  return (
    file.includes("/node_modules/") ||
    file.startsWith("out/") ||
    file.startsWith("dist/") ||
    file.startsWith("release/") ||
    file.includes(".generated.") ||
    /\.gen\./.test(file) ||
    /(^|\/)generated(\/|$)/i.test(file)
  );
}

function lineCount(text) {
  return text.length ? text.split(/\r?\n/).length : 0;
}

function declarationSizes(file) {
  const text = readFileSync(resolve(repoRoot, file), "utf8");
  const lines = text.split(/\r?\n/);
  const entries = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = declarationMatch(lines[index]);
    if (!match) continue;

    const endLine = estimateDeclarationEnd(lines, index);
    entries.push({
      file,
      line: index + 1,
      lines: Math.max(1, endLine - index),
      kind: match.kind,
      name: match.name,
    });
  }

  return entries;
}

function declarationMatch(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return undefined;

  const modifierPrefix =
    String.raw`(?:export\s+default\s+|export\s+|async\s+|public\s+|private\s+|protected\s+|static\s+|readonly\s+)*`;
  const patterns = [
    ["FunctionDeclaration", new RegExp(String.raw`^\s*${modifierPrefix}function\s+([A-Za-z_$][\w$]*)\b`)],
    ["ClassDeclaration", new RegExp(String.raw`^\s*${modifierPrefix}class\s+([A-Za-z_$][\w$]*)\b`)],
    ["InterfaceDeclaration", new RegExp(String.raw`^\s*${modifierPrefix}interface\s+([A-Za-z_$][\w$]*)\b`)],
    ["TypeAliasDeclaration", new RegExp(String.raw`^\s*${modifierPrefix}type\s+([A-Za-z_$][\w$]*)\b`)],
    [
      "ArrowFunction",
      new RegExp(String.raw`^\s*${modifierPrefix}(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>`),
    ],
    ["MethodDeclaration", new RegExp(String.raw`^\s*${modifierPrefix}([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^={;]+)?\{`)],
  ];

  for (const [kind, pattern] of patterns) {
    const match = line.match(pattern);
    if (!match) continue;
    if (kind === "MethodDeclaration" && isControlKeyword(match[1])) continue;
    return { kind, name: match[1] };
  }

  return undefined;
}

function isControlKeyword(name) {
  return new Set(["catch", "do", "for", "function", "if", "switch", "while", "with"]).has(name);
}

function estimateDeclarationEnd(lines, startIndex) {
  let balance = 0;
  let sawBrace = false;

  for (let index = startIndex; index < lines.length; index += 1) {
    const structural = structuralLine(lines[index]);
    for (const char of structural) {
      if (char === "{") {
        balance += 1;
        sawBrace = true;
      } else if (char === "}") {
        balance -= 1;
      }
    }

    if (sawBrace && balance <= 0) return index + 1;
    if (!sawBrace && structural.includes(";")) return index + 1;
    if (index > startIndex && !sawBrace && declarationMatch(lines[index])) return index;
  }

  return startIndex + 1;
}

function structuralLine(line) {
  let output = "";
  let state = "code";

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (state === "single-quote" || state === "double-quote" || state === "template") {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (state === "single-quote" && char === "'") state = "code";
      if (state === "double-quote" && char === "\"") state = "code";
      if (state === "template" && char === "`") state = "code";
      continue;
    }

    if (char === "/" && next === "/") break;
    if (char === "/" && next === "*") break;
    if (char === "'") {
      state = "single-quote";
      continue;
    }
    if (char === "\"") {
      state = "double-quote";
      continue;
    }
    if (char === "`") {
      state = "template";
      continue;
    }

    output += char;
  }

  return output;
}

function positiveNumberArg(name, fallback) {
  const prefix = `${name}=`;
  const withEquals = argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const splitIndex = argv.indexOf(name);
  const raw = withEquals ?? (splitIndex === -1 ? undefined : argv[splitIndex + 1]);
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function markdownReport(input) {
  return [
    "# Simplification Complexity Inventory",
    "",
    `Generated: ${input.generatedAt}`,
    `Tracked source files scanned: ${input.sourceFileCount}`,
    "Generated files are excluded.",
    "Declaration sizes are approximate and intended for refactor triage, not enforcement.",
    "",
    "## Largest Files",
    "",
    "| Lines | File |",
    "| ---: | --- |",
    ...input.topFiles.map((entry) => `| ${entry.lines.toLocaleString()} | \`${entry.file}\` |`),
    "",
    "## Largest Declarations",
    "",
    "| Lines | Location | Declaration |",
    "| ---: | --- | --- |",
    ...input.topDeclarations.map((entry) => `| ${entry.lines.toLocaleString()} | \`${entry.file}:${entry.line}\` | ${entry.kind} \`${entry.name}\` |`),
    "",
  ].join("\n");
}
