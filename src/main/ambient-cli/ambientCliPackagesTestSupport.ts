import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

export const execFileAsync = promisify(execFile);

export async function seedCliFixture(workspace: string, options: { healthCheck?: string[] } = {}): Promise<void> {
  const root = join(workspace, "cli-fixture");
  await mkdir(join(root, "bin"), { recursive: true });
  await mkdir(join(root, "skills", "json-cli"), { recursive: true });
  await writeFile(
    join(root, "ambient-cli.json"),
    `${JSON.stringify(
      {
        name: "ambient-json-cli",
        version: "0.1.0",
        description: "Fixture JSON CLI package.",
        skills: "./skills",
        commands: {
          "json-pick": {
            command: "node",
            args: ["./bin/json-pick.mjs"],
            cwd: "workspace",
            description: "Print a top-level JSON field.",
            healthCheck: options.healthCheck ?? ["node", "./bin/json-pick.mjs", "health.json", "message"],
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "bin", "json-pick.mjs"),
    [
      "import { readFileSync } from 'node:fs';",
      "const [file, key] = process.argv.slice(2);",
      "const value = JSON.parse(readFileSync(file, 'utf8'))[key];",
      "process.stdout.write(String(value));",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(join(root, "health.json"), `${JSON.stringify({ message: "healthy" })}\n`, "utf8");
  await writeFile(
    join(root, "skills", "json-cli", "SKILL.md"),
    [
      "---",
      "name: ambient-json-cli",
      "description: Use ambient_cli json-pick for JSON field extraction.",
      "---",
      "",
      "Use ambient_cli.",
      "",
    ].join("\n"),
    "utf8",
  );
}

export function braveSearchOverlayDescriptor(): Record<string, unknown> {
  return {
    name: "brave-search",
    version: "1.0.0",
    description: "Reviewed Brave Search CLI package.",
    skills: "./SKILL.md",
    commands: {
      search: {
        command: "node",
        args: ["./search.js"],
        cwd: "package",
        description: "Run Brave Search.",
        healthCheck: ["node", "--check", "./search.js"],
      },
    },
  };
}

export async function seedCliPackageWithLocalDependency(
  root: string,
  dependencySection: "dependencies" | "optionalDependencies" = "dependencies",
): Promise<void> {
  await mkdir(join(root, "deps", "ambient-helper"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "brave-search",
        version: "1.0.0",
        type: "module",
        description: "Headless web search via Brave Search",
        [dependencySection]: { "ambient-helper": "file:./deps/ambient-helper" },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "deps", "ambient-helper", "package.json"),
    `${JSON.stringify({ name: "ambient-helper", version: "1.0.0", type: "module" }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "deps", "ambient-helper", "index.js"),
    "export function format(value) { return `formatted:${value}`; }\n",
    "utf8",
  );
  await writeFile(
    join(root, "search.js"),
    "import { format } from 'ambient-helper';\nprocess.stdout.write(format(process.argv[2] ?? ''));\n",
    "utf8",
  );
  await writeFile(
    join(root, "SKILL.md"),
    [
      "---",
      "name: brave-search",
      "description: Web search and content extraction via Brave Search API.",
      "---",
      "",
      "# Brave Search",
      "",
    ].join("\n"),
    "utf8",
  );
  await execFileAsync("npm", ["install", "--package-lock-only", "--ignore-scripts"], { cwd: root, env: { ...process.env } });
}

export async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
}
