import type { BrowserPageContent } from "../../shared/browserTypes";

export const PAGE_READY_TIMEOUT_MS = 10_000;
export const LOCAL_BROWSER_NAVIGATION_PREFLIGHT_TIMEOUT_MS = 2_500;

export function normalizeBrowserUrl(input: string): string {
  const value = input.trim();
  if (!value) throw new Error("URL is required.");
  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(value)) return `http://${value}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return `https://${value}`;
}

export function assertBrowserNavigationReachedRequestedPage(requestedUrl: string, content: BrowserPageContent): BrowserPageContent {
  const requested = normalizeBrowserUrl(requestedUrl);
  const finalUrl = (content.url ?? "").trim();
  if (isAboutBlankUrl(finalUrl) && !isAboutBlankUrl(requested)) {
    throw new Error(browserNavigationDidNotCommitMessage(requested));
  }
  return content;
}

export function isAboutBlankUrl(value: string): boolean {
  return value.trim().toLowerCase() === "about:blank";
}

export function browserNavigationReachedExpectedUrl(
  requestedUrl: string | undefined,
  currentUrl: string | undefined,
  previousUrl?: string,
): boolean {
  if (!requestedUrl) return true;
  const requested = normalizeBrowserUrl(requestedUrl);
  const current = (currentUrl ?? "").trim();
  if (isAboutBlankUrl(requested)) return isAboutBlankUrl(current);
  if (!current || isAboutBlankUrl(current)) return false;
  if (urlsEquivalentForBrowserNavigation(requested, current)) return true;
  if (previousUrl && urlsEquivalentForBrowserNavigation(previousUrl, current)) return false;
  return hasBrowserNavigationCommittedAwayFromBlank(requested, current);
}

export function browserNavigationDidNotCommitMessage(requested: string): string {
  if (isWorkspaceLocalFileUrl(requested)) {
    return `Browser navigation to ${requested} ended at about:blank; the requested page did not load. For local workspace HTML/static app files, use browser_local_preview instead of file:// navigation.`;
  }
  if (isLocalBrowserHttpUrl(requested)) {
    return `Browser navigation to ${requested} ended at about:blank; the local server navigation did not commit. Check that the dev server is reachable and retry browser_nav.`;
  }
  return `Browser navigation to ${requested} ended at about:blank; the external browser navigation did not commit. This usually indicates a browser profile, CDP, or navigation timing issue.`;
}

function hasBrowserNavigationCommittedAwayFromBlank(requested: string, current: string): boolean {
  try {
    const requestedUrl = new URL(requested);
    const currentParsed = new URL(current);
    if (isLocalBrowserHttpUrl(requested)) return currentParsed.origin === requestedUrl.origin;
    return currentParsed.protocol === "http:" || currentParsed.protocol === "https:";
  } catch {
    return current === requested;
  }
}

function urlsEquivalentForBrowserNavigation(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    if (leftUrl.href === rightUrl.href) return true;
    if (leftUrl.origin !== rightUrl.origin) return false;
    return normalizeBrowserPathForComparison(leftUrl) === normalizeBrowserPathForComparison(rightUrl);
  } catch {
    return left.trim() === right.trim();
  }
}

function normalizeBrowserPathForComparison(url: URL): string {
  const path = url.pathname === "" ? "/" : url.pathname;
  return `${path.replace(/\/+$/, "") || "/"}${url.search}${url.hash}`;
}

function isWorkspaceLocalFileUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "file:";
  } catch {
    return false;
  }
}

export function isLocalBrowserHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && isLocalBrowserHostname(url.hostname);
  } catch {
    return false;
  }
}

export async function assertLocalBrowserNavigationReachable(value: string, timeoutMs = LOCAL_BROWSER_NAVIGATION_PREFLIGHT_TIMEOUT_MS): Promise<void> {
  if (!isLocalBrowserHttpUrl(value)) return;
  if (new URL(value).protocol === "https:") return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(value, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.body) await response.body.cancel().catch(() => undefined);
  } catch (error) {
    throw new Error(
      `Local browser target ${value} is not reachable before browser navigation. Start or repair the local server, then retry browser_nav. ${errorMessage(error)}`,
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }
}

function isLocalBrowserHostname(hostname: string): boolean {
  const value = hostname.toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1" || value === "[::1]";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
