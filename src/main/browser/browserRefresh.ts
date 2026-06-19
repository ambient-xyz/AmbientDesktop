import { execFile } from "node:child_process";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { isPathInside } from "./browserSessionFacade";

const execFileAsync = promisify(execFile);

const WEB_ARTIFACT_EXTENSIONS = new Set([
  ".css",
  ".gif",
  ".htm",
  ".html",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".mjs",
  ".png",
  ".svg",
  ".webp",
]);
const HTML_EXTENSIONS = new Set([".html", ".htm"]);

export interface WorkspaceBrowserReloadScope {
  workspacePath: string;
  changedPath: string;
  changedAbsolutePath: string;
  changedFileUrl: string;
  changedDirectoryUrl: string;
}

export function workspaceBrowserReloadScope(workspacePath: string, changedPath: string): WorkspaceBrowserReloadScope | undefined {
  const workspace = resolve(workspacePath);
  const changedAbsolutePath = resolve(workspace, changedPath);
  if (!isPathInside(workspace, changedAbsolutePath)) return undefined;
  const changedExtension = extname(changedAbsolutePath).toLowerCase();
  if (!WEB_ARTIFACT_EXTENSIONS.has(changedExtension)) return undefined;
  return {
    workspacePath: workspace,
    changedPath: relative(workspace, changedAbsolutePath),
    changedAbsolutePath,
    changedFileUrl: pathToFileURL(changedAbsolutePath).href,
    changedDirectoryUrl: pathToFileURL(`${dirname(changedAbsolutePath)}${sep}`).href,
  };
}

export function shouldReloadBrowserUrlForWorkspaceChange(url: string | undefined, workspacePath: string, changedPath: string): boolean {
  const scope = workspaceBrowserReloadScope(workspacePath, changedPath);
  return scope ? shouldReloadBrowserUrlForScope(url, scope) : false;
}

export function shouldReloadBrowserUrlForScope(url: string | undefined, scope: WorkspaceBrowserReloadScope): boolean {
  const activePath = browserFilePathFromUrl(url);
  if (!activePath) return false;
  if (!isPathInside(scope.workspacePath, activePath)) return false;
  if (resolve(activePath) === scope.changedAbsolutePath) return true;
  const activeExtension = extname(activePath).toLowerCase();
  if (!HTML_EXTENSIONS.has(activeExtension)) return false;
  return isPathInside(dirname(activePath), scope.changedAbsolutePath);
}

export async function refreshExternalFileBrowserTabs(workspacePath: string, changedPath: string): Promise<number> {
  if (process.platform !== "darwin") return 0;
  const scope = workspaceBrowserReloadScope(workspacePath, changedPath);
  if (!scope) return 0;
  try {
    const { stdout } = await execFileAsync("osascript", ["-l", "JavaScript", "-e", macBrowserRefreshScript(scope)], {
      timeout: 3_000,
    });
    return Number.parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function browserFilePathFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:") return undefined;
    return fileURLToPath(parsed);
  } catch {
    return undefined;
  }
}

function macBrowserRefreshScript(scope: WorkspaceBrowserReloadScope): string {
  return `
const fileUrl = ${JSON.stringify(scope.changedFileUrl)};
const directoryUrl = ${JSON.stringify(scope.changedDirectoryUrl)};
let refreshed = 0;

function matches(url) {
  return typeof url === "string" && (url === fileUrl || url.startsWith(directoryUrl));
}

function refreshSafari() {
  try {
    const app = Application("Safari");
    if (!app.running()) return;
    for (const window of app.windows()) {
      for (const tab of window.tabs()) {
        const url = tab.url();
        if (!matches(url)) continue;
        app.doJavaScript("location.reload()", { in: tab });
        refreshed += 1;
      }
    }
  } catch (_) {}
}

function refreshChromeLike(name) {
  try {
    const app = Application(name);
    if (!app.running()) return;
    for (const window of app.windows()) {
      for (const tab of window.tabs()) {
        const url = tab.url();
        if (!matches(url)) continue;
        tab.reload();
        refreshed += 1;
      }
    }
  } catch (_) {}
}

refreshSafari();
["Google Chrome", "Chromium", "Microsoft Edge", "Brave Browser"].forEach(refreshChromeLike);
String(refreshed);
`;
}
