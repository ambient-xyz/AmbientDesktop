#!/usr/bin/env node
import { spawn } from "node:child_process";
import { chmod, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { arch, platform } from "node:os";

const root = resolve(new URL("..", import.meta.url).pathname);
const sidecarRoot = join(root, "sidecars", "google");
const outputRoot = join(root, "build", "google-sidecar");
const targets = parseTargets(process.argv.slice(2));

await mkdir(outputRoot, { recursive: true });
for (const target of targets) {
  const output = join(outputRoot, binaryName(target.goos, target.goarch));
  await run("go", ["build", "-trimpath", "-ldflags=-s -w", "-o", output, "./cmd/google-sidecar"], {
    cwd: sidecarRoot,
    env: {
      ...process.env,
      CGO_ENABLED: "0",
      GOOS: target.goos,
      GOARCH: target.goarch,
    },
  });
  if (target.goos !== "windows") await chmod(output, 0o755);
  console.log(`Built ${output}`);
}

function parseTargets(args) {
  if (args.includes("--all-supported")) {
    return [
      { goos: "darwin", goarch: "arm64" },
      { goos: "darwin", goarch: "amd64" },
      { goos: "linux", goarch: "amd64" },
      { goos: "linux", goarch: "arm64" },
    ];
  }
  const targetArg = args.find((arg) => arg.startsWith("--target="));
  if (targetArg) {
    const [, raw] = targetArg.split("=", 2);
    const [goos, goarch] = raw.split("/");
    if (!goos || !goarch) throw new Error(`Invalid target ${raw}; expected GOOS/GOARCH.`);
    return [{ goos, goarch }];
  }
  return [currentTarget()];
}

function currentTarget() {
  return {
    goos: platform() === "win32" ? "windows" : platform(),
    goarch: arch() === "x64" ? "amd64" : arch(),
  };
}

function binaryName(goos, goarch) {
  const platformName = goos === "windows" ? "win32" : goos;
  const archName = goarch === "amd64" ? "x64" : goarch;
  const extension = goos === "windows" ? ".exe" : "";
  return `ambient-google-sidecar-${platformName}-${archName}${extension}`;
}

function run(command, args, options) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { ...options, stdio: "inherit" });
    child.on("error", rejectRun);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`${command} ${args.join(" ")} failed with code=${code ?? "none"} signal=${signal ?? "none"}`));
    });
  });
}

