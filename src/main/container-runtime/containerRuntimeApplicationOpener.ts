import { spawn as defaultSpawn } from "node:child_process";

export interface SpawnedApplicationProcess {
  once(event: "error", listener: (error: Error) => void): this;
  once(event: "exit", listener: (code: number | null) => void): this;
}

export interface ApplicationSpawnOptions {
  stdio: "ignore";
  windowsHide?: boolean;
}

export type ApplicationSpawnProcess = (
  command: string,
  args: string[],
  options: ApplicationSpawnOptions,
) => SpawnedApplicationProcess;

export interface ContainerRuntimeApplicationOpenerDependencies {
  platform?: NodeJS.Platform;
  spawnProcess?: ApplicationSpawnProcess;
  log?: (message: string) => void;
}

export interface ContainerRuntimeApplicationOpener {
  openContainerRuntimeApplication(applicationNames: string[]): Promise<boolean>;
  runMacOpen(args: string[]): Promise<boolean>;
  runWindowsStartApplication(applicationName: string): Promise<boolean>;
}

export function createContainerRuntimeApplicationOpener(
  dependencies: ContainerRuntimeApplicationOpenerDependencies = {},
): ContainerRuntimeApplicationOpener {
  const platform = dependencies.platform ?? process.platform;
  const spawnProcess = dependencies.spawnProcess ?? (defaultSpawn as ApplicationSpawnProcess);
  const log = dependencies.log ?? console.log;

  async function openContainerRuntimeApplication(applicationNames: string[]): Promise<boolean> {
    const names = applicationNames.map((name) => name.trim()).filter(Boolean).slice(0, 3);
    if (!names.length) return false;
    if (platform === "darwin") {
      for (const name of names) {
        if (await runMacOpen(["-a", name])) {
          log(`[mcp-container-runtime] opened application ${name}`);
          return true;
        }
      }
    }
    if (platform === "win32") {
      for (const name of names) {
        if (await runWindowsStartApplication(name)) {
          log(`[mcp-container-runtime] opened application ${name}`);
          return true;
        }
      }
    }
    return false;
  }

  function runMacOpen(args: string[]): Promise<boolean> {
    return runSpawnedApplicationProcess(spawnProcess("/usr/bin/open", args, { stdio: "ignore" }));
  }

  function runWindowsStartApplication(applicationName: string): Promise<boolean> {
    return runSpawnedApplicationProcess(
      spawnProcess("cmd.exe", ["/c", "start", "", applicationName], {
        stdio: "ignore",
        windowsHide: true,
      }),
    );
  }

  return {
    openContainerRuntimeApplication,
    runMacOpen,
    runWindowsStartApplication,
  };
}

function runSpawnedApplicationProcess(child: SpawnedApplicationProcess): Promise<boolean> {
  return new Promise((resolve) => {
    child.once("error", () => resolve(false));
    child.once("exit", (code) => resolve(code === 0));
  });
}
