import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { shell } from "electron";
import type { WorkspaceOpenTarget } from "../../shared/workspaceTypes";

const execFileAsync = promisify(execFile);

interface EditorCandidate {
  id: string;
  appName: string;
  label: string;
  kind: WorkspaceOpenTarget["kind"];
  bundleId?: string;
  openDirectory?: boolean;
}

const macCandidates: EditorCandidate[] = [
  { id: "chrome", appName: "Google Chrome", label: "Google Chrome", kind: "browser", bundleId: "com.google.Chrome" },
  { id: "vscode", appName: "Visual Studio Code", label: "VS Code", kind: "editor", bundleId: "com.microsoft.VSCode" },
  { id: "cursor", appName: "Cursor", label: "Cursor", kind: "editor", bundleId: "com.todesktop.230313mzl4w4u92" },
  { id: "sublime", appName: "Sublime Text", label: "Sublime Text", kind: "editor", bundleId: "com.sublimetext.4" },
  { id: "windsurf", appName: "Windsurf", label: "Windsurf", kind: "editor", bundleId: "com.exafunction.windsurf" },
  { id: "finder", appName: "Finder", label: "Finder", kind: "finder", bundleId: "com.apple.finder" },
  { id: "terminal", appName: "Terminal", label: "Terminal", kind: "terminal", bundleId: "com.apple.Terminal", openDirectory: true },
  { id: "xcode", appName: "Xcode", label: "Xcode", kind: "editor", bundleId: "com.apple.dt.Xcode" },
  { id: "pycharm", appName: "PyCharm", label: "PyCharm", kind: "editor", bundleId: "com.jetbrains.pycharm" },
  { id: "webstorm", appName: "WebStorm", label: "WebStorm", kind: "editor", bundleId: "com.jetbrains.WebStorm" },
  { id: "intellij", appName: "IntelliJ IDEA", label: "IntelliJ IDEA", kind: "editor", bundleId: "com.jetbrains.intellij" },
];

export async function listWorkspaceOpenTargets(): Promise<WorkspaceOpenTarget[]> {
  if (process.env.AMBIENT_E2E_OPEN_TARGETS === "1") {
    return dedupeTargets([
      ...macCandidates.map((candidate) => ({
        id: candidate.id,
        label: candidate.label,
        kind: candidate.kind,
        bundleId: candidate.bundleId,
        available: true,
      })),
      { id: "default", label: "Default app", kind: "default", available: true },
    ]);
  }

  if (process.platform !== "darwin") {
    return [
      { id: "default", label: "Default app", kind: "default", available: true },
      { id: "finder", label: "File manager", kind: "finder", available: true },
    ];
  }

  const targets: WorkspaceOpenTarget[] = [];
  for (const candidate of macCandidates) {
    const detectedBundleId = await detectMacBundleId(candidate.appName);
    const bundleId = detectedBundleId || candidate.bundleId;
    if (detectedBundleId || candidate.kind === "finder" || candidate.kind === "terminal") {
      targets.push({
        id: candidate.id,
        label: candidate.label,
        kind: candidate.kind,
        bundleId,
        available: true,
      });
    }
  }
  targets.push({ id: "default", label: "Default app", kind: "default", available: true });
  return dedupeTargets(targets);
}

export async function openWorkspaceTarget(absolutePath: string, targetId = "default"): Promise<void> {
  if (await recordE2eOpenTarget(absolutePath, targetId)) return;

  if (targetId === "finder") {
    shell.showItemInFolder(absolutePath);
    return;
  }

  if (process.platform !== "darwin") {
    if (targetId === "finder") {
      await shell.showItemInFolder(absolutePath);
      return;
    }
    const error = await shell.openPath(absolutePath);
    if (error) throw new Error(error);
    return;
  }

  const targets = await listWorkspaceOpenTargets();
  const target = targets.find((item) => item.id === targetId) ?? targets.find((item) => item.id === "default");
  if (!target || target.id === "default" || !target.bundleId) {
    const error = await shell.openPath(absolutePath);
    if (error) throw new Error(error);
    return;
  }

  const candidate = macCandidates.find((item) => item.id === target.id);
  const pathToOpen = candidate?.openDirectory ? dirname(absolutePath) : absolutePath;
  await execFileAsync("open", ["-b", target.bundleId, pathToOpen], { timeout: 8_000 });
}

export function normalizeDetectedBundleId(stdout: string): string | undefined {
  const bundleId = stdout.trim();
  return bundleId.includes(".") ? bundleId : undefined;
}

async function detectMacBundleId(appName: string): Promise<string | undefined> {
  try {
    const script = `id of app ${JSON.stringify(appName)}`;
    const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 2_000 });
    return normalizeDetectedBundleId(stdout);
  } catch {
    return undefined;
  }
}

async function recordE2eOpenTarget(absolutePath: string, targetId: string): Promise<boolean> {
  const logPath = process.env.AMBIENT_E2E_OPEN_TARGET_LOG;
  if (process.env.AMBIENT_E2E !== "1" || !logPath) return false;
  await appendFile(logPath, `${JSON.stringify({ targetId, path: absolutePath, at: new Date().toISOString() })}\n`, "utf8");
  return true;
}

function dedupeTargets(targets: WorkspaceOpenTarget[]): WorkspaceOpenTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    if (seen.has(target.id)) return false;
    seen.add(target.id);
    return true;
  });
}
