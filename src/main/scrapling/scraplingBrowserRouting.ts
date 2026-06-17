import { isIP } from "node:net";

export const SCRAPLING_DEFAULT_SERVER_ID = "io.github.d4vinci/scrapling";
export const SCRAPLING_DEFAULT_WORKLOAD_NAME = "ambient-scrapling";
export const SCRAPLING_BROWSER_CONTENT_TOOL_CANDIDATES = ["fetch", "get", "stealthy_fetch"] as const;

export interface ScraplingBrowserContentRouteInput {
  url?: unknown;
  waitForUserAction?: unknown;
  userActionId?: unknown;
}

export function shouldRouteBrowserContentUrlToScrapling(input: ScraplingBrowserContentRouteInput): boolean {
  if (input.waitForUserAction === true) return false;
  if (typeof input.userActionId === "string" && input.userActionId.trim()) return false;
  if (typeof input.url !== "string" || !input.url.trim()) return false;
  const url = parseUrl(input.url);
  if (!url) return false;
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (isLikelyAuthenticatedHost(url.hostname)) return false;
  return isPublicHostname(url.hostname);
}

export function scraplingBrowserContentToolArguments(url: string): Record<string, unknown> {
  return {
    url,
    extraction_type: "markdown",
    main_content_only: true,
  };
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function isPublicHostname(rawHostname: string): boolean {
  const hostname = rawHostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return false;
  const ipKind = isIP(hostname);
  if (ipKind === 4) return isPublicIpv4(hostname);
  if (ipKind === 6) return isPublicIpv6(hostname);
  return true;
}

function isLikelyAuthenticatedHost(rawHostname: string): boolean {
  const hostname = rawHostname.replace(/^\[|\]$/g, "").toLowerCase();
  return AUTHENTICATED_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

function isPublicIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
}

function isPublicIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "::" || normalized === "::1") return false;
  if (normalized.startsWith("fe80:")) return false;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
  if (normalized.startsWith("2001:db8:")) return false;
  return true;
}

const AUTHENTICATED_HOST_SUFFIXES = [
  "airtable.com",
  "app.asana.com",
  "atlassian.net",
  "box.com",
  "calendar.google.com",
  "docs.google.com",
  "dropbox.com",
  "drive.google.com",
  "figma.com",
  "linear.app",
  "mail.google.com",
  "monday.com",
  "notion.so",
  "onedrive.live.com",
  "sharepoint.com",
  "slack.com",
  "trello.com",
];
