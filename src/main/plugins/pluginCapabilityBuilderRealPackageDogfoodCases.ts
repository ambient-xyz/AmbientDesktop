/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";

import { scaffoldCapabilityBuilderPackage } from "./pluginsCapabilityBuilderDogfoodFacade";
import { sendDogfoodTurn } from "./pluginCapabilityBuilderDogfoodTestSupport";
import type { AgentRuntime } from "./pluginsAgentRuntimeDogfoodFacade";
import type { ProjectStore } from "./pluginsProjectStoreFacade";

interface PluginCapabilityBuilderRealPackageDogfoodDeps {
  AgentRuntime: new (...args: any[]) => AgentRuntime;
  BrowserCredentialStore: new (...args: any[]) => any;
  BrowserService: new (...args: any[]) => any;
  getStore: () => ProjectStore;
  getWorkspacePath: () => string;
  safeStorage: any;
  setRuntime: (runtime: AgentRuntime) => void;
}

export function registerPluginCapabilityBuilderRealPackageDogfoodCases(deps: PluginCapabilityBuilderRealPackageDogfoodDeps): void {
  const itLive = process.env.AMBIENT_PLUGIN_CHAT_LIVE === "1" ? it : it.skip;
  const store = new Proxy({} as any, {
    get(_target, property) {
      const current = deps.getStore() as any;
      const value = current[property];
      return typeof value === "function" ? value.bind(current) : value;
    },
  }) as ProjectStore;
  let runtime: AgentRuntime;
  const createRuntime = (...args: any[]): AgentRuntime => {
    const value = new deps.AgentRuntime(...args);
    runtime = value;
    deps.setRuntime(value);
    return value;
  };

  itLive(
    "dogfoods a real bookmarked Scrapling package through lifecycle and repair",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live real-package Capability Builder dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      await scaffoldCapabilityBuilderPackage(deps.getWorkspacePath(), {
        name: "scrapling-static-extract",
        goal: "Extract values from static HTML using the bookmarked Scrapling package.",
        provider: "Scrapling",
        kind: "structured data extractor",
        locality: "local",
      });
      const rootPath = join(deps.getWorkspacePath(), ".ambient", "capability-builder", "packages", "ambient-scrapling-static-extract");
      await writeScraplingStaticCapability(rootPath);

      const thread = store.createThread("Capability Builder real Scrapling lifecycle dogfood");
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            if (
              ![
                "ambient_capability_builder_install_deps",
                "ambient_capability_builder_validate",
                "ambient_capability_builder_register",
                "ambient_capability_builder_unregister",
                "ambient_capability_builder_apply_repair",
                "ambient_cli",
              ].includes(request.toolName)
            ) {
              throw new Error(`Unexpected permission prompt during real-package Capability Builder dogfood: ${request.title}`);
            }
            return { allowed: true, mode: "allow_once" };
          },
          denyThread: () => undefined,
        },
      );

      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is an Ambient Desktop Capability Builder real-package dogfood test using the bookmarked GitHub package D4Vinci/Scrapling.",
          "Call ambient_capability_builder_install_deps with packageName ambient-scrapling-static-extract.",
          'Use exactly one command object with command uv, args ["run", "--with", "scrapling", "--with", "curl_cffi", "--with", "playwright", "--with", "browserforge", "python", "./scripts/scrapling_extract.py", "--health"], cwd ".", rationale "Install and warm the real Scrapling runtime plus imports that Scrapling requires on macOS before validation."',
          "After the dependency install tool completes, answer with exactly CAPABILITY_BUILDER_SCRAPLING_INSTALL_OK and nothing else.",
        ],
        expected: "CAPABILITY_BUILDER_SCRAPLING_INSTALL_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Call ambient_capability_builder_validate with packageName ambient-scrapling-static-extract and includeSmokeTests true.",
          "Wait for validation to succeed, then call ambient_capability_builder_register with packageName ambient-scrapling-static-extract.",
          "Do not stop after validation. After registration completes, answer with exactly CAPABILITY_BUILDER_SCRAPLING_VALIDATE_REGISTER_OK and nothing else.",
        ],
        expected: "CAPABILITY_BUILDER_SCRAPLING_VALIDATE_REGISTER_OK",
      });

      const registeredManifest = JSON.parse(await readFile(join(rootPath, "capability-build.json"), "utf8"));
      const installedPackageId = String(registeredManifest.installedPackageId);
      await sendDogfoodTurn(runtime, store, thread.id, {
        content:
          'Call ambient_cli_search with query exactly Extract h1 text from static HTML using Scrapling. Then call ambient_cli_describe with packageName ambient-scrapling-static-extract and command scrapling_extract. Then call ambient_cli with packageName ambient-scrapling-static-extract, command scrapling_extract, and args ["--html", "<html><body><h1>Bookmark Dogfood</h1></body></html>", "--selector", "h1::text"]. After ambient_cli completes, answer with exactly CAPABILITY_BUILDER_SCRAPLING_RUN_OK and include the phrase Bookmark Dogfood.',
        expected: "CAPABILITY_BUILDER_SCRAPLING_RUN_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Call ambient_capability_builder_unregister with packageName ambient-scrapling-static-extract.",
          `Use installedPackageId exactly ${installedPackageId}.`,
          "Use reason exactly: Real-package dogfood rollback preserves source after installed capability use.",
          "Wait for unregister to complete, then call ambient_capability_builder_register with packageName ambient-scrapling-static-extract.",
          "Do not stop after unregistering. After re-registration completes, answer with exactly CAPABILITY_BUILDER_SCRAPLING_UNREGISTER_REREGISTER_OK and nothing else.",
        ],
        expected: "CAPABILITY_BUILDER_SCRAPLING_UNREGISTER_REREGISTER_OK",
      });

      await writeFile(
        join(rootPath, "scripts", "scrapling_extract.py"),
        "raise RuntimeError('intentional real-package dogfood break')\n",
        "utf8",
      );
      await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content:
          "Call ambient_capability_builder_repair_plan with packageName ambient-scrapling-static-extract. Use requestedRepair exactly: Restore the Scrapling static extraction wrapper and smoke test after an intentional break. After the repair-plan tool completes, answer with exactly CAPABILITY_BUILDER_SCRAPLING_REPAIR_PLAN_OK and nothing else.",
        expected: "CAPABILITY_BUILDER_SCRAPLING_REPAIR_PLAN_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Call ambient_capability_builder_apply_repair with packageName ambient-scrapling-static-extract.",
          "Use reason exactly: Restore the intentionally broken real-package Scrapling wrapper.",
          "Use this exact files JSON array:",
          JSON.stringify(scraplingStaticRepairFiles()),
          "After apply-repair completes, answer with exactly CAPABILITY_BUILDER_SCRAPLING_APPLY_REPAIR_OK and nothing else.",
        ],
        expected: "CAPABILITY_BUILDER_SCRAPLING_APPLY_REPAIR_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Call ambient_capability_builder_validate with packageName ambient-scrapling-static-extract and includeSmokeTests true.",
          "Wait for validation to succeed, then call ambient_capability_builder_register with packageName ambient-scrapling-static-extract.",
          "Do not stop after validation. After registration completes, answer with exactly CAPABILITY_BUILDER_SCRAPLING_REPAIRED_VALIDATE_REGISTER_OK and nothing else.",
        ],
        expected: "CAPABILITY_BUILDER_SCRAPLING_REPAIRED_VALIDATE_REGISTER_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content:
          'Call ambient_cli with packageName ambient-scrapling-static-extract, command scrapling_extract, and args ["--html", "<html><body><h1>Repaired Bookmark Dogfood</h1></body></html>", "--selector", "h1::text"]. After ambient_cli completes, answer with exactly CAPABILITY_BUILDER_SCRAPLING_REPAIRED_RUN_OK and include the phrase Repaired Bookmark Dogfood.',
        expected: "CAPABILITY_BUILDER_SCRAPLING_REPAIRED_RUN_OK",
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      for (const expected of [
        "CAPABILITY_BUILDER_SCRAPLING_INSTALL_OK",
        "`uv run --with ...` is a package-manager mediated runtime",
        "do not add arbitrary post-command wait padding",
        "Total duration:",
        "CAPABILITY_BUILDER_SCRAPLING_VALIDATE_REGISTER_OK",
        "CAPABILITY_BUILDER_SCRAPLING_RUN_OK",
        "Bookmark Dogfood",
        "CAPABILITY_BUILDER_SCRAPLING_UNREGISTER_REREGISTER_OK",
        "CAPABILITY_BUILDER_SCRAPLING_REPAIR_PLAN_OK",
        "CAPABILITY_BUILDER_SCRAPLING_APPLY_REPAIR_OK",
        "CAPABILITY_BUILDER_SCRAPLING_REPAIRED_VALIDATE_REGISTER_OK",
        "CAPABILITY_BUILDER_SCRAPLING_REPAIRED_RUN_OK",
        "Repaired Bookmark Dogfood",
      ]) {
        expect(transcript).toContain(expected);
      }
      const repairedManifest = JSON.parse(await readFile(join(rootPath, "capability-build.json"), "utf8"));
      expect(repairedManifest.refs.lastRepair).toEqual(expect.any(String));
      expect(repairedManifest.refs.lastValidatedHash).toEqual(expect.any(String));
    },
    900_000,
  );

  itLive(
    "dogfoods a real bookmarked Graphify package through lifecycle and repair",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live real-package Graphify dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      await scaffoldCapabilityBuilderPackage(deps.getWorkspacePath(), {
        name: "graphify-path-inspector",
        goal: "Find paths in a Graphify node-link graph using the bookmarked Graphify package.",
        provider: "Graphify",
        kind: "knowledge graph query tool",
        locality: "local",
      });
      const rootPath = join(deps.getWorkspacePath(), ".ambient", "capability-builder", "packages", "ambient-graphify-path-inspector");
      await writeGraphifyPathCapability(rootPath);

      const thread = store.createThread("Capability Builder real Graphify lifecycle dogfood");
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            if (
              ![
                "ambient_capability_builder_install_deps",
                "ambient_capability_builder_validate",
                "ambient_capability_builder_register",
                "ambient_capability_builder_unregister",
                "ambient_capability_builder_apply_repair",
                "ambient_cli",
              ].includes(request.toolName)
            ) {
              throw new Error(`Unexpected permission prompt during real Graphify Capability Builder dogfood: ${request.title}`);
            }
            return { allowed: true, mode: "allow_once" };
          },
          denyThread: () => undefined,
        },
      );

      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is an Ambient Desktop Capability Builder real-package dogfood test using the bookmarked Graphify package.",
          "Call ambient_capability_builder_install_deps with packageName ambient-graphify-path-inspector.",
          'Use exactly one command object with command uv, args ["run", "--with", "graphifyy", "graphify", "--help"], cwd ".", rationale "Install and warm the real Graphify CLI runtime before validation."',
          "After the dependency install tool completes, answer with exactly CAPABILITY_BUILDER_GRAPHIFY_INSTALL_OK and nothing else.",
        ],
        expected: "CAPABILITY_BUILDER_GRAPHIFY_INSTALL_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Call ambient_capability_builder_validate with packageName ambient-graphify-path-inspector and includeSmokeTests true.",
          "Wait for validation to succeed, then call ambient_capability_builder_register with packageName ambient-graphify-path-inspector.",
          "Do not stop after validation. After registration completes, answer with exactly CAPABILITY_BUILDER_GRAPHIFY_VALIDATE_REGISTER_OK and nothing else.",
        ],
        expected: "CAPABILITY_BUILDER_GRAPHIFY_VALIDATE_REGISTER_OK",
      });

      const registeredManifest = JSON.parse(await readFile(join(rootPath, "capability-build.json"), "utf8"));
      const installedPackageId = String(registeredManifest.installedPackageId);
      await sendDogfoodTurn(runtime, store, thread.id, {
        content:
          'Call ambient_cli_search with query exactly Find a path in a Graphify knowledge graph. Then call ambient_cli_describe with packageName ambient-graphify-path-inspector and command graphify_path. Then call ambient_cli with packageName ambient-graphify-path-inspector, command graphify_path, and args ["Ambient", "Graphify", "--graph", "fixtures/ambient-graph.json"]. After ambient_cli completes, answer with exactly CAPABILITY_BUILDER_GRAPHIFY_RUN_OK and include the phrase Capability Builder ----> Graphify.',
        expected: "CAPABILITY_BUILDER_GRAPHIFY_RUN_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Call ambient_capability_builder_unregister with packageName ambient-graphify-path-inspector.",
          `Use installedPackageId exactly ${installedPackageId}.`,
          "Use reason exactly: Real-package Graphify dogfood rollback preserves source after installed capability use.",
          "Wait for unregister to complete, then call ambient_capability_builder_register with packageName ambient-graphify-path-inspector.",
          "Do not stop after unregistering. After re-registration completes, answer with exactly CAPABILITY_BUILDER_GRAPHIFY_UNREGISTER_REREGISTER_OK and nothing else.",
        ],
        expected: "CAPABILITY_BUILDER_GRAPHIFY_UNREGISTER_REREGISTER_OK",
      });

      await writeFile(join(rootPath, "ambient-cli.json"), "{}\n", "utf8");
      await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content:
          "Call ambient_capability_builder_repair_plan with packageName ambient-graphify-path-inspector. Use requestedRepair exactly: Restore the Graphify descriptor, SKILL, graph fixture, and smoke test after an intentional descriptor break. After the repair-plan tool completes, answer with exactly CAPABILITY_BUILDER_GRAPHIFY_REPAIR_PLAN_OK and nothing else.",
        expected: "CAPABILITY_BUILDER_GRAPHIFY_REPAIR_PLAN_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Call ambient_capability_builder_apply_repair with packageName ambient-graphify-path-inspector.",
          "Use reason exactly: Restore the intentionally broken real-package Graphify descriptor.",
          "Use this exact files JSON array:",
          JSON.stringify(graphifyPathRepairFiles()),
          "After apply-repair completes, answer with exactly CAPABILITY_BUILDER_GRAPHIFY_APPLY_REPAIR_OK and nothing else.",
        ],
        expected: "CAPABILITY_BUILDER_GRAPHIFY_APPLY_REPAIR_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Call ambient_capability_builder_validate with packageName ambient-graphify-path-inspector and includeSmokeTests true.",
          "Wait for validation to succeed, then call ambient_capability_builder_register with packageName ambient-graphify-path-inspector.",
          "Do not stop after validation. After registration completes, answer with exactly CAPABILITY_BUILDER_GRAPHIFY_REPAIRED_VALIDATE_REGISTER_OK and nothing else.",
        ],
        expected: "CAPABILITY_BUILDER_GRAPHIFY_REPAIRED_VALIDATE_REGISTER_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content:
          'Call ambient_cli with packageName ambient-graphify-path-inspector, command graphify_path, and args ["Ambient", "Graphify", "--graph", "fixtures/ambient-graph.json"]. After ambient_cli completes, answer with exactly CAPABILITY_BUILDER_GRAPHIFY_REPAIRED_RUN_OK and include the phrase Ambient ----> Capability Builder ----> Graphify.',
        expected: "CAPABILITY_BUILDER_GRAPHIFY_REPAIRED_RUN_OK",
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      for (const expected of [
        "CAPABILITY_BUILDER_GRAPHIFY_INSTALL_OK",
        "`uv run --with ...` is a package-manager mediated runtime",
        "CAPABILITY_BUILDER_GRAPHIFY_VALIDATE_REGISTER_OK",
        "CAPABILITY_BUILDER_GRAPHIFY_RUN_OK",
        "Capability Builder ----> Graphify",
        "CAPABILITY_BUILDER_GRAPHIFY_UNREGISTER_REREGISTER_OK",
        "CAPABILITY_BUILDER_GRAPHIFY_REPAIR_PLAN_OK",
        "CAPABILITY_BUILDER_GRAPHIFY_APPLY_REPAIR_OK",
        "CAPABILITY_BUILDER_GRAPHIFY_REPAIRED_VALIDATE_REGISTER_OK",
        "CAPABILITY_BUILDER_GRAPHIFY_REPAIRED_RUN_OK",
        "Ambient ----> Capability Builder ----> Graphify",
      ]) {
        expect(transcript).toContain(expected);
      }
      const repairedManifest = JSON.parse(await readFile(join(rootPath, "capability-build.json"), "utf8"));
      expect(repairedManifest.refs.lastRepair).toEqual(expect.any(String));
      expect(repairedManifest.refs.lastValidatedHash).toEqual(expect.any(String));
    },
    900_000,
  );
}

async function writeScraplingStaticCapability(rootPath: string): Promise<void> {
  await mkdir(join(rootPath, "scripts"), { recursive: true });
  await mkdir(join(rootPath, "tests"), { recursive: true });
  for (const file of scraplingStaticRepairFiles()) {
    await writeFile(join(rootPath, file.path), file.content, "utf8");
  }
}

async function writeGraphifyPathCapability(rootPath: string): Promise<void> {
  await mkdir(join(rootPath, "fixtures"), { recursive: true });
  await mkdir(join(rootPath, "tests"), { recursive: true });
  for (const file of graphifyPathRepairFiles()) {
    await writeFile(join(rootPath, file.path), file.content, "utf8");
  }
}

function scraplingStaticRepairFiles(): Array<{ path: string; content: string; rationale: string }> {
  const runtimeArgs = [
    "run",
    "--with",
    "scrapling",
    "--with",
    "curl_cffi",
    "--with",
    "playwright",
    "--with",
    "browserforge",
    "python",
    "./scripts/scrapling_extract.py",
  ];
  return [
    {
      path: "ambient-cli.json",
      rationale: "Define the real Scrapling-backed command with a health check that imports Scrapling and its macOS runtime dependencies.",
      content: `${JSON.stringify(
        {
          name: "ambient-scrapling-static-extract",
          version: "0.1.1",
          description: "Extract values from static HTML using the real Scrapling package.",
          skills: "./SKILL.md",
          commands: {
            scrapling_extract: {
              command: "uv",
              args: runtimeArgs,
              cwd: "package",
              description: "Extract matching values from static HTML with a CSS selector using Scrapling.",
              healthCheck: ["uv", ...runtimeArgs, "--health"],
            },
          },
          env: [],
          artifacts: { outputTypes: [], policy: "return concise JSON in stdout; do not write artifacts for static extraction" },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      rationale: "Guide Pi to use the generated Scrapling command for static HTML extraction instead of browser automation.",
      content: [
        "---",
        "name: ambient-scrapling-static-extract",
        "description: Extract values from static HTML using the real Scrapling package.",
        "---",
        "",
        "Use `ambient_cli` with packageName `ambient-scrapling-static-extract` and command `scrapling_extract` when the user provides static HTML and asks to extract values with CSS selectors.",
        "Pass `--html` with the HTML content and `--selector` with a CSS selector such as `h1::text`.",
        "Return the concise JSON result from stdout. Do not launch a browser for static HTML extraction.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/scrapling_extract.py",
      rationale:
        "Restore the real Scrapling wrapper that imports Scrapling, validates runtime availability, and extracts selector matches from static HTML.",
      content: [
        "import argparse",
        "import json",
        "from importlib import metadata",
        "",
        "from scrapling import Fetcher, Selector",
        "",
        "def version_for(package_name):",
        "    try:",
        "        return metadata.version(package_name)",
        "    except metadata.PackageNotFoundError:",
        "        return 'unknown'",
        "",
        "def main():",
        "    parser = argparse.ArgumentParser(description='Extract static HTML values with Scrapling.')",
        "    parser.add_argument('--health', action='store_true')",
        "    parser.add_argument('--html', default='<html><body><h1>Ambient Scrapling</h1></body></html>')",
        "    parser.add_argument('--selector', default='h1::text')",
        "    args = parser.parse_args()",
        "    if args.health:",
        "        print(json.dumps({'ok': True, 'scrapling': version_for('scrapling'), 'fetcher': Fetcher.__name__}, sort_keys=True))",
        "        return",
        "    page = Selector(args.html)",
        "    matches = [str(value) for value in page.css(args.selector).extract()]",
        "    print(json.dumps({'package': 'scrapling', 'selector': args.selector, 'matchCount': len(matches), 'matches': matches}, sort_keys=True))",
        "",
        "if __name__ == '__main__':",
        "    main()",
        "",
      ].join("\n"),
    },
    {
      path: "tests/smoke.test.mjs",
      rationale: "Exercise the real Scrapling runtime on static HTML so validation catches missing dependency or wrapper regressions.",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { execFileSync } from 'node:child_process';",
        "",
        "const args = ['run', '--with', 'scrapling', '--with', 'curl_cffi', '--with', 'playwright', '--with', 'browserforge', 'python', './scripts/scrapling_extract.py', '--html', '<html><body><h1>Smoke Scrapling</h1></body></html>', '--selector', 'h1::text'];",
        "const stdout = execFileSync('uv', args, { encoding: 'utf8' });",
        "const result = JSON.parse(stdout);",
        "assert.equal(result.package, 'scrapling');",
        "assert.deepEqual(result.matches, ['Smoke Scrapling']);",
        "",
      ].join("\n"),
    },
  ];
}

function graphifyPathRepairFiles(): Array<{ path: string; content: string; rationale: string }> {
  const runtimeArgs = ["run", "--with", "graphifyy", "graphify", "path"];
  const fixture = {
    directed: true,
    multigraph: false,
    graph: {},
    nodes: [
      { id: "Ambient", label: "Ambient" },
      { id: "Capability Builder", label: "Capability Builder" },
      { id: "Graphify", label: "Graphify" },
    ],
    links: [
      { source: "Ambient", target: "Capability Builder", label: "builds" },
      { source: "Capability Builder", target: "Graphify", label: "dogfoods" },
    ],
  };
  return [
    {
      path: "ambient-cli.json",
      rationale: "Define a real Graphify CLI command over a package-local graph fixture.",
      content: `${JSON.stringify(
        {
          name: "ambient-graphify-path-inspector",
          version: "0.1.1",
          description: "Find paths in Graphify node-link graphs using the real Graphify CLI.",
          skills: "./SKILL.md",
          commands: {
            graphify_path: {
              command: "uv",
              args: runtimeArgs,
              cwd: "package",
              description: "Find the shortest path between two nodes in a Graphify graph.json file.",
              healthCheck: ["uv", "run", "--with", "graphifyy", "graphify", "--help"],
            },
          },
          env: [],
          artifacts: { outputTypes: [], policy: "return the Graphify CLI path output in stdout; do not write artifacts" },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      rationale: "Guide Pi to use the generated Graphify CLI command for graph path questions.",
      content: [
        "---",
        "name: ambient-graphify-path-inspector",
        "description: Find paths in Graphify node-link graphs using the real Graphify CLI.",
        "---",
        "",
        "Use `ambient_cli` with packageName `ambient-graphify-path-inspector` and command `graphify_path` when the user asks for a shortest path between nodes in a Graphify graph JSON file.",
        "Pass the start node, end node, `--graph`, and the graph JSON path.",
        "For the built-in dogfood fixture, use `fixtures/ambient-graph.json`.",
        "Return the concise Graphify stdout path result.",
        "",
      ].join("\n"),
    },
    {
      path: "fixtures/ambient-graph.json",
      rationale: "Provide a deterministic Graphify-compatible node-link fixture for validation and live use.",
      content: `${JSON.stringify(fixture, null, 2)}\n`,
    },
    {
      path: "tests/smoke.test.mjs",
      rationale: "Exercise the real Graphify CLI against the package-local node-link graph fixture.",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { execFileSync } from 'node:child_process';",
        "",
        "const stdout = execFileSync('uv', ['run', '--with', 'graphifyy', 'graphify', 'path', 'Ambient', 'Graphify', '--graph', 'fixtures/ambient-graph.json'], { encoding: 'utf8' });",
        "assert.match(stdout, /Shortest path/);",
        "assert.match(stdout, /Ambient ----> Capability Builder ----> Graphify/);",
        "",
      ].join("\n"),
    },
  ];
}
