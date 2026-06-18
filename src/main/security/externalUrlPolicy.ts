export type ExternalUrlOpenKind = "external" | "internal-browser";

export function parseExternalOpenUrl(raw: string): string {
  const url = parseAbsoluteUrl(raw);
  if (hasEmbeddedCredentials(url)) {
    throw new Error("External links with embedded credentials are not allowed.");
  }
  if (url.protocol === "https:") return url.toString();
  if (url.protocol === "http:" && isLoopbackHostname(url.hostname)) return url.toString();
  throw new Error("Only https links and loopback http links can be opened externally. Use local file actions for files.");
}

export function assertAllowedInternalBrowserUrl(raw: string): string {
  const url = parseAbsoluteUrl(raw);
  if (hasEmbeddedCredentials(url)) {
    throw new Error("Internal browser URLs with embedded credentials are not allowed.");
  }
  if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  throw new Error("The internal browser is limited to http and https pages.");
}

export function isAllowedExternalOpenUrl(raw: string): boolean {
  try {
    parseExternalOpenUrl(raw);
    return true;
  } catch {
    return false;
  }
}

export function isAllowedInternalBrowserUrl(raw: string): boolean {
  try {
    assertAllowedInternalBrowserUrl(raw);
    return true;
  } catch {
    return false;
  }
}

export function isLoopbackWebUrl(raw: string): boolean {
  try {
    const url = parseAbsoluteUrl(raw);
    if (hasEmbeddedCredentials(url)) return false;
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

function parseAbsoluteUrl(raw: string): URL {
  const value = raw.trim();
  if (!value) throw new Error("URL is required.");
  return new URL(value);
}

function hasEmbeddedCredentials(url: URL): boolean {
  return Boolean(url.username || url.password);
}

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (host === "localhost" || host === "::1") return true;
  const ipv4 = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  return Boolean(ipv4 && ipv4.slice(1).every((part) => Number(part) <= 255));
}
