import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  describeSetupRecipe,
  setupRecipeDescribeText,
  type SetupRecipeCommandInput,
  type SetupRecipeCommandRunner,
} from "./setupRecipeService";

describe("setup recipe service", () => {
  it("describes a containerized app recipe with host readiness, compose commands, and port conflicts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-container-recipe-"));
    await writeFile(join(workspace, "docker-compose.yml"), [
      "services:",
      "  web:",
      "    build: .",
      "    ports:",
      "      - \"3000:3000\"",
      "  db:",
      "    image: postgres:16",
      "    ports:",
      "      - published: 5432",
      "        target: 5432",
      "        protocol: tcp",
    ].join("\n"));
    await writeFile(join(workspace, "Dockerfile"), "FROM node:22\n");
    await writeFile(join(workspace, "package.json"), JSON.stringify({
      scripts: {
        dev: "docker compose up web",
      },
    }));

    const result = await describeSetupRecipe({
      workspacePath: workspace,
      recipe: "containerized_app",
    }, {
      commandRunner: fakeRunner({
        lsofInUsePorts: [3000],
        dockerReady: true,
        dockerComposeReady: true,
      }),
      platform: "darwin",
      env: {},
    });

    expect(result.activation).toMatchObject({
      active: true,
      confidence: "high",
    });
    expect(result.containerFiles.map((file) => file.path)).toEqual(expect.arrayContaining(["docker-compose.yml", "Dockerfile"]));
    expect(result.portBindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ service: "web", hostPort: 3000, containerPort: 3000 }),
      expect.objectContaining({ service: "db", hostPort: 5432, containerPort: 5432 }),
    ]));
    expect(result.composeCommands).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: "docker", args: ["compose", "version"], available: true }),
    ]));
    expect(result.hostPreflight).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "docker", status: "ready" }),
    ]));
    expect(result.portConflicts).toEqual([
      expect.objectContaining({ port: 3000, status: "in-use", suggestedHostPort: 3001 }),
    ]);
    expect(result.nextActions.join("\n")).toContain("Port 3000 is already in use");

    const text = setupRecipeDescribeText(result);
    expect(text).toContain("Ambient setup recipe: containerized_app");
    expect(text).toContain("docker-compose.yml");
    expect(text).toContain("Port conflicts:");
    expect(text).not.toContain("POSTGRES_PASSWORD");
  });

  it("stays inactive and skips runtime probes when no container signals are present", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-container-recipe-"));
    await writeFile(join(workspace, "package.json"), JSON.stringify({
      scripts: {
        dev: "vite",
      },
    }));
    const calls: SetupRecipeCommandInput[] = [];

    const result = await describeSetupRecipe({
      workspacePath: workspace,
      recipe: "containerized_app",
    }, {
      commandRunner: async (input) => {
        calls.push(input);
        return fail(input, "unexpected probe");
      },
    });

    expect(result.activation).toMatchObject({ active: false, confidence: "none" });
    expect(result.hostPreflight).toEqual([]);
    expect(result.composeCommands).toEqual([]);
    expect(result.nextActions.join("\n")).toContain("Do not load Docker/Podman setup guidance");
    expect(calls).toEqual([]);
  });

  it("detects nested compose files and package scripts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-container-recipe-"));
    await mkdir(join(workspace, "infra"));
    await writeFile(join(workspace, "infra", "compose.yaml"), [
      "services:",
      "  redis:",
      "    image: redis:7",
      "    ports:",
      "      - \"6379\"",
    ].join("\n"));
    await writeFile(join(workspace, "package.json"), JSON.stringify({
      scripts: {
        infra: "podman compose -f infra/compose.yaml up",
      },
    }));

    const result = await describeSetupRecipe({
      workspacePath: workspace,
      recipe: "containerized_app",
      includeHostPreflight: false,
    }, {
      commandRunner: fakeRunner({}),
    });

    expect(result.activation.confidence).toBe("high");
    expect(result.containerFiles).toEqual([
      expect.objectContaining({ path: "infra/compose.yaml", kind: "compose", services: ["redis"] }),
    ]);
    expect(result.packageScripts).toEqual([
      { name: "infra", command: "podman compose -f infra/compose.yaml up" },
    ]);
    expect(result.portBindings).toEqual([
      expect.objectContaining({ service: "redis", containerPort: 6379 }),
    ]);
  });
});

function fakeRunner(input: {
  dockerReady?: boolean;
  dockerComposeReady?: boolean;
  podmanReady?: boolean;
  lsofInUsePorts?: number[];
}): SetupRecipeCommandRunner {
  return async (command) => {
    if (command.command === "docker" && command.args.join(" ") === "--version") {
      return input.dockerReady ? ok(command, "Docker version 28.1.1") : missing(command);
    }
    if (command.command === "docker" && command.args.join(" ") === "info --format {{json .ServerVersion}}") {
      return input.dockerReady ? ok(command, "\"28.1.1\"") : fail(command, "Cannot connect to the Docker daemon");
    }
    if (command.command === "docker" && command.args.join(" ") === "compose version") {
      return input.dockerComposeReady ? ok(command, "Docker Compose version v2.35.1") : fail(command, "docker compose unavailable");
    }
    if (command.command === "docker" && command.args[0] === "ps") {
      return input.dockerReady ? ok(command, "ambient_web_1\tUp 2 minutes\t0.0.0.0:3000->3000/tcp\n") : fail(command, "docker unavailable");
    }
    if (command.command === "docker-compose") {
      return fail(command, "docker-compose unavailable");
    }
    if (command.command === "podman" && command.args.join(" ") === "--version") {
      return input.podmanReady ? ok(command, "podman version 5.4.0") : missing(command);
    }
    if (command.command === "podman" && command.args[0] === "info") {
      return input.podmanReady ? ok(command, "{}") : fail(command, "podman unavailable");
    }
    if (command.command === "podman" && command.args.join(" ") === "compose version") {
      return input.podmanReady ? ok(command, "podman-compose version 1.2.0") : fail(command, "podman compose unavailable");
    }
    if (command.command === "podman" && command.args[0] === "ps") {
      return ok(command, "");
    }
    if (command.command === "colima") {
      return missing(command);
    }
    if (command.command === "lsof") {
      const port = Number(command.args.join(" ").match(/-iTCP:(\d+)/)?.[1] ?? 0);
      if (input.lsofInUsePorts?.includes(port)) {
        return ok(command, "COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\nnode    12345 neo   21u  IPv4 0x00      0t0  TCP *:3000 (LISTEN)\n");
      }
      return { ...ok(command, ""), exitCode: 1 };
    }
    return fail(command, `unexpected command ${command.command} ${command.args.join(" ")}`);
  };
}

function ok(command: SetupRecipeCommandInput, stdout: string) {
  return { command: command.command, args: command.args, stdout, stderr: "", exitCode: 0, durationMs: 1 };
}

function fail(command: SetupRecipeCommandInput, stderr: string) {
  return { command: command.command, args: command.args, stdout: "", stderr, exitCode: 1, durationMs: 1 };
}

function missing(command: SetupRecipeCommandInput) {
  return { ...fail(command, "command not found"), errorCode: "ENOENT" };
}
