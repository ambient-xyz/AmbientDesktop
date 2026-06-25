import { lookup as lookupWithCallback, type LookupAddress, type LookupAllOptions, type LookupOptions } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP, type TcpNetConnectOpts } from "node:net";
import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";

export type UrlEgressUseCase = "plugin-preview" | "plugin-install" | "managed-download" | "remote-fetch";

export type UrlEgressHostKind = "public" | "loopback" | "private" | "link-local" | "metadata" | "reserved";

export interface UrlEgressHostAddress {
  address: string;
  family?: number;
}

export type UrlEgressResolveHostAddresses = (hostname: string) => Promise<UrlEgressHostAddress[]>;

export interface UrlEgressPolicyOptions {
  useCase: UrlEgressUseCase;
  allowLocalDevLoopbackHttp?: boolean;
  maxRedirects?: number;
  resolveHostAddresses?: UrlEgressResolveHostAddresses;
  enableDnsCheck?: boolean;
  dnsTimeoutMs?: number;
}

export interface UrlEgressValidation {
  url: string;
  hostname: string;
  protocol: "http:" | "https:";
  port: number;
}

export interface UrlEgressFetchResult {
  response: Response;
  finalUrl: string;
  redirects: string[];
  cleanup?: () => Promise<void>;
}

const defaultMaxRedirects = 5;
const localDevEgressEnv = "AMBIENT_EGRESS_ALLOW_LOCAL_HTTP";
const metadataHostnames = new Set([
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);
const unsafePorts = new Set([
  0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
  101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179,
  389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601,
  636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665,
  6666, 6667, 6668, 6669, 6697, 10080,
]);

export function allowLocalDevUrlEgressFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[localDevEgressEnv] === "1";
}

export function assertAllowedUrlEgress(rawUrl: string | URL, options: UrlEgressPolicyOptions): UrlEgressValidation {
  const url = normalizeEgressUrl(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${options.useCase} URL egress only supports http and https URLs.`);
  }
  if (url.username || url.password) {
    throw new Error(`${options.useCase} URL egress blocked embedded credentials for ${redactedUrlForMessage(url)}.`);
  }
  const hostname = normalizedHostname(url.hostname);
  if (!hostname) throw new Error(`${options.useCase} URL egress requires a host.`);
  const explicitPort = url.port ? Number(url.port) : undefined;
  const port = explicitPort ?? (url.protocol === "https:" ? 443 : 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${options.useCase} URL egress blocked invalid port for ${redactedUrlForMessage(url)}.`);
  }
  if (explicitPort !== undefined && unsafePorts.has(explicitPort)) {
    throw new Error(`${options.useCase} URL egress blocked unsafe port ${explicitPort} for ${hostname}.`);
  }

  const hostKind = classifyEgressHost(hostname);
  const localDevLoopback = options.allowLocalDevLoopbackHttp === true && url.protocol === "http:" && hostKind === "loopback";
  if (hostKind !== "public" && !localDevLoopback) {
    throw new Error(`${options.useCase} URL egress blocked ${hostKind} network target ${hostname}.`);
  }
  if (url.protocol !== "https:" && !localDevLoopback) {
    throw new Error(`${options.useCase} URL egress requires HTTPS for public downloads and marketplace metadata.`);
  }
  return {
    url: url.toString(),
    hostname,
    protocol: url.protocol as "http:" | "https:",
    port,
  };
}

export async function assertAllowedUrlEgressWithDns(rawUrl: string | URL, options: UrlEgressPolicyOptions): Promise<UrlEgressValidation> {
  const validation = assertAllowedUrlEgress(rawUrl, options);
  if (!shouldRunDnsCheck(options)) return validation;
  const hostKind = classifyEgressHost(validation.hostname);
  if (hostKind !== "public") return validation;
  const addresses = await resolveHostAddressesWithTimeout(validation.hostname, options);
  assertResolvedAddressesAllowed(validation.hostname, addresses, options);
  return validation;
}

export async function fetchWithUrlEgressPolicy(
  rawUrl: string | URL,
  init: RequestInit | undefined,
  options: UrlEgressPolicyOptions & { fetchImpl?: typeof fetch },
): Promise<UrlEgressFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRedirects = Math.max(0, Math.floor(options.maxRedirects ?? defaultMaxRedirects));
  const dispatcher = fetchImpl === fetch ? createUrlEgressDispatcher(options) : undefined;
  let currentUrl = (await assertAllowedUrlEgressWithDns(rawUrl, options)).url;
  const redirects: string[] = [];

  try {
    for (let redirectIndex = 0; redirectIndex <= maxRedirects; redirectIndex += 1) {
      const response = await fetchWithPolicyErrorUnwrap(
        dispatcher ? undiciFetch as unknown as typeof fetch : fetchImpl,
        currentUrl,
        requestInitWithManualRedirect(init, dispatcher),
      );
      const redirected = redirectLocation(response, currentUrl);
      if (!redirected) {
        const finalUrl = response.url ? new URL(response.url, currentUrl).toString() : currentUrl;
        await assertAllowedUrlEgressWithDns(finalUrl, options);
        return {
          response,
          finalUrl,
          redirects,
          ...(dispatcher ? { cleanup: () => dispatcher.destroy() } : {}),
        };
      }
      await cancelUnusedResponseBody(response);
      if (redirectIndex >= maxRedirects) {
        throw new Error(`${options.useCase} URL egress exceeded ${maxRedirects} redirects for ${redactedUrlForMessage(currentUrl)}.`);
      }
      currentUrl = (await assertAllowedUrlEgressWithDns(redirected, options)).url;
      redirects.push(currentUrl);
    }

    throw new Error(`${options.useCase} URL egress exceeded redirect handling for ${redactedUrlForMessage(currentUrl)}.`);
  } catch (error) {
    await dispatcher?.destroy().catch(() => undefined);
    throw error;
  }
}

export function classifyEgressHost(hostname: string): UrlEgressHostKind {
  const host = normalizedHostname(hostname);
  if (!host) return "reserved";
  if (metadataHostnames.has(host)) return "metadata";
  const mapped = ipv4FromMappedIpv6(host);
  if (mapped) return classifyIpv4Host(mapped);
  if (isIPv4Literal(host)) return classifyIpv4Host(host);
  if (isIPv6Literal(host)) return classifyIpv6Host(host);
  if (host === "localhost" || host.endsWith(".localhost")) return "loopback";
  return "public";
}

function normalizeEgressUrl(rawUrl: string | URL): URL {
  const raw = rawUrl instanceof URL ? rawUrl.toString() : rawUrl.trim();
  if (!raw) throw new Error("URL egress target is required.");
  return new URL(raw);
}

function normalizedHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
}

function redirectLocation(response: Response, currentUrl: string): string | undefined {
  if (response.status < 300 || response.status > 399) return undefined;
  const location = response.headers.get("location");
  if (!location) throw new Error(`URL egress redirect from ${redactedUrlForMessage(currentUrl)} did not include a Location header.`);
  return new URL(location, currentUrl).toString();
}

function shouldRunDnsCheck(options: UrlEgressPolicyOptions): boolean {
  if (options.enableDnsCheck !== undefined) return options.enableDnsCheck;
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") return false;
  return process.env.AMBIENT_URL_EGRESS_DNS_CHECKS !== "0";
}

function createUrlEgressDispatcher(options: UrlEgressPolicyOptions): Agent | undefined {
  if (!shouldRunDnsCheck(options)) return undefined;
  return new Agent({
    connect: {
      lookup: createUrlEgressLookup(options),
    },
  });
}

function requestInitWithManualRedirect(init: RequestInit | undefined, dispatcher: Dispatcher | undefined): RequestInit {
  const next = { ...(init ?? {}), redirect: "manual" as const };
  if (!dispatcher) return next;
  return { ...next, dispatcher } as RequestInit;
}

async function fetchWithPolicyErrorUnwrap(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch (error) {
    const policyError = findUrlEgressError(error);
    if (policyError) throw policyError;
    throw error;
  }
}

async function cancelUnusedResponseBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

function createUrlEgressLookup(options: UrlEgressPolicyOptions): NonNullable<TcpNetConnectOpts["lookup"]> {
  return (hostname: string, lookupOptions: LookupOptions, callback) => {
    resolveConnectionLookupAddresses(hostname, lookupOptions, options)
      .then((addresses) => {
        if (lookupOptions.all) {
          callback(null, addresses);
          return;
        }
        const selected = selectLookupAddress(addresses, normalizedLookupFamily(lookupOptions.family));
        callback(null, selected.address, selected.family);
      })
      .catch((error) => callback(asLookupError(error), "", 0));
  };
}

async function resolveConnectionLookupAddresses(
  hostname: string,
  lookupOptions: LookupOptions,
  options: UrlEgressPolicyOptions,
): Promise<LookupAddress[]> {
  const addresses = await resolveHostAddressesWithTimeout(hostname, options, () => lookupAllWithCallback(hostname, lookupOptions));
  const normalized = addresses.map((address) => normalizeLookupAddress(address));
  assertResolvedAddressesAllowed(hostname, normalized, options);
  const family = normalizedLookupFamily(lookupOptions.family);
  const familyFiltered = family ? normalized.filter((address) => address.family === family) : normalized;
  if (!familyFiltered.length) {
    throw new Error(`${options.useCase} URL egress DNS resolution of ${hostname} did not return an address${family ? ` for IPv${family}` : ""}.`);
  }
  return familyFiltered;
}

function assertResolvedAddressesAllowed(
  hostname: string,
  addresses: UrlEgressHostAddress[],
  options: Pick<UrlEgressPolicyOptions, "allowLocalDevLoopbackHttp" | "useCase">,
): void {
  const allowedKinds = allowedResolvedAddressKinds(hostname, options);
  for (const address of addresses) {
    const addressKind = classifyEgressHost(address.address);
    if (!allowedKinds.has(addressKind)) {
      throw new Error(`${options.useCase} URL egress blocked DNS resolution of ${hostname} to ${addressKind} address ${address.address}.`);
    }
  }
}

function allowedResolvedAddressKinds(
  hostname: string,
  options: Pick<UrlEgressPolicyOptions, "allowLocalDevLoopbackHttp">,
): Set<UrlEgressHostKind> {
  if (options.allowLocalDevLoopbackHttp === true && classifyEgressHost(hostname) === "loopback") {
    return new Set<UrlEgressHostKind>(["loopback"]);
  }
  return new Set<UrlEgressHostKind>(["public"]);
}

async function resolveHostAddressesWithTimeout(
  hostname: string,
  options: UrlEgressPolicyOptions,
  fallbackResolver?: () => Promise<UrlEgressHostAddress[]>,
): Promise<UrlEgressHostAddress[]> {
  const resolver = options.resolveHostAddresses
    ? () => options.resolveHostAddresses!(hostname)
    : fallbackResolver ?? (() => defaultResolveHostAddresses(hostname));
  const timeoutMs = options.dnsTimeoutMs !== undefined ? Math.max(1, Math.floor(options.dnsTimeoutMs)) : undefined;
  if (!timeoutMs) return resolver();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolver(),
      new Promise<UrlEgressHostAddress[]>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${options.useCase} URL egress DNS resolution for ${hostname} did not finish within ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function lookupAllWithCallback(hostname: string, options: LookupOptions): Promise<LookupAddress[]> {
  return new Promise((resolveLookup, rejectLookup) => {
    lookupWithCallback(hostname, { ...options, all: true } as LookupAllOptions, (error, addresses) => {
      if (error) {
        rejectLookup(error);
        return;
      }
      resolveLookup(addresses);
    });
  });
}

function normalizeLookupAddress(address: UrlEgressHostAddress): LookupAddress {
  const family = address.family === 4 || address.family === 6 ? address.family : isIP(address.address);
  return {
    address: address.address,
    family,
  };
}

function selectLookupAddress(addresses: LookupAddress[], family: number | undefined): LookupAddress {
  const selected = family === 4 || family === 6
    ? addresses.find((address) => address.family === family)
    : addresses[0];
  if (!selected) throw new Error(`URL egress DNS resolution did not return a usable${family ? ` IPv${family}` : ""} address.`);
  return selected;
}

function normalizedLookupFamily(family: LookupOptions["family"]): 4 | 6 | undefined {
  if (family === 4 || family === "IPv4") return 4;
  if (family === 6 || family === "IPv6") return 6;
  return undefined;
}

function asLookupError(error: unknown): NodeJS.ErrnoException {
  return error instanceof Error ? error as NodeJS.ErrnoException : new Error(String(error)) as NodeJS.ErrnoException;
}

function findUrlEgressError(error: unknown, seen = new Set<unknown>()): Error | undefined {
  if (!error || seen.has(error)) return undefined;
  seen.add(error);
  if (error instanceof Error && /URL egress/i.test(error.message)) return error;
  if (error instanceof AggregateError) {
    for (const item of error.errors) {
      const found = findUrlEgressError(item, seen);
      if (found) return found;
    }
  }
  const cause = typeof error === "object" && "cause" in error ? (error as { cause?: unknown }).cause : undefined;
  return findUrlEgressError(cause, seen);
}

async function defaultResolveHostAddresses(hostname: string): Promise<UrlEgressHostAddress[]> {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((result) => ({ address: result.address, family: result.family }));
}

function redactedUrlForMessage(input: string | URL): string {
  try {
    const url = input instanceof URL ? new URL(input.toString()) : new URL(input);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return String(input);
  }
}

function isIPv4Literal(host: string): boolean {
  return isIP(host) === 4;
}

function isIPv6Literal(host: string): boolean {
  return isIP(host) === 6;
}

function classifyIpv4Host(host: string): UrlEgressHostKind {
  const octets = host.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return "reserved";
  const [a, b, c, d] = octets;
  if (a === 127) return "loopback";
  if (a === 10) return "private";
  if (a === 172 && b >= 16 && b <= 31) return "private";
  if (a === 192 && b === 168) return "private";
  if (a === 169 && b === 254 && c === 169 && d === 254) return "metadata";
  if (a === 169 && b === 254) return "link-local";
  if (a === 100 && b >= 64 && b <= 127) return "private";
  if (a === 0 || a >= 224 || (a === 192 && b === 0 && c === 0) || (a === 198 && (b === 18 || b === 19))) return "reserved";
  if ((a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) return "reserved";
  return "public";
}

function classifyIpv6Host(host: string): UrlEgressHostKind {
  if (host === "::1") return "loopback";
  if (host === "::") return "reserved";
  const transitionedIpv4 = ipv4FromIpv6Transition(host);
  if (transitionedIpv4) return classifyIpv4Host(transitionedIpv4);
  const first = firstIpv6Hextet(host);
  if (first === undefined) return "reserved";
  if ((first & 0xfe00) === 0xfc00) return "private";
  if ((first & 0xffc0) === 0xfe80) return "link-local";
  if ((first & 0xffc0) === 0xfec0) return "private";
  if ((first & 0xff00) === 0xff00) return "reserved";
  if (isConservativeIpv6TransitionPrefix(host)) return "reserved";
  if (host.startsWith("2001:db8:") || host === "2001:db8::") return "reserved";
  return "public";
}

function firstIpv6Hextet(host: string): number | undefined {
  const expanded = host.startsWith("::") ? host.slice(2) : host;
  const first = expanded.split(":").find((part) => part.length > 0);
  if (!first) return 0;
  const value = Number.parseInt(first, 16);
  return Number.isFinite(value) ? value : undefined;
}

function ipv4FromMappedIpv6(host: string): string | undefined {
  const mappedPrefix = "::ffff:";
  if (!host.startsWith(mappedPrefix)) return undefined;
  const suffix = host.slice(mappedPrefix.length);
  if (isIPv4Literal(suffix)) return suffix;
  const parts = suffix.split(":").filter(Boolean).map((part) => Number.parseInt(part, 16));
  if (parts.length !== 2 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) return undefined;
  return [
    (parts[0] >> 8) & 0xff,
    parts[0] & 0xff,
    (parts[1] >> 8) & 0xff,
    parts[1] & 0xff,
  ].join(".");
}

function ipv4FromIpv6Transition(host: string): string | undefined {
  const hextets = expandedIpv6Hextets(host);
  if (!hextets) return undefined;
  const firstSixZero = hextets.slice(0, 6).every((part) => part === 0);
  if (firstSixZero) return ipv4FromTwoHextets(hextets[6], hextets[7]);
  const nat64WellKnown = hextets[0] === 0x64 &&
    hextets[1] === 0xff9b &&
    hextets.slice(2, 6).every((part) => part === 0);
  if (nat64WellKnown) return ipv4FromTwoHextets(hextets[6], hextets[7]);
  if (hextets[0] === 0x2002) return ipv4FromTwoHextets(hextets[1], hextets[2]);
  return undefined;
}

function isConservativeIpv6TransitionPrefix(host: string): boolean {
  const hextets = expandedIpv6Hextets(host);
  if (!hextets) return true;
  if (hextets[0] === 0x64 && hextets[1] === 0xff9b && hextets[2] === 0x1) return true;
  if (hextets[0] === 0x2001 && hextets[1] === 0) return true;
  return false;
}

function expandedIpv6Hextets(host: string): number[] | undefined {
  if (host.includes(".")) return undefined;
  const pieces = host.split("::");
  if (pieces.length > 2) return undefined;
  const left = parseIpv6HextetSide(pieces[0] ?? "");
  const right = parseIpv6HextetSide(pieces[1] ?? "");
  if (!left || !right) return undefined;
  if (pieces.length === 1) return left.length === 8 ? left : undefined;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return undefined;
  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

function parseIpv6HextetSide(value: string): number[] | undefined {
  if (!value) return [];
  const parsed: number[] = [];
  for (const part of value.split(":")) {
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return undefined;
    const hextet = Number.parseInt(part, 16);
    if (!Number.isInteger(hextet) || hextet < 0 || hextet > 0xffff) return undefined;
    parsed.push(hextet);
  }
  return parsed;
}

function ipv4FromTwoHextets(high: number | undefined, low: number | undefined): string | undefined {
  if (high === undefined || low === undefined) return undefined;
  return [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff,
  ].join(".");
}
