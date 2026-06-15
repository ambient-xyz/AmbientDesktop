export interface OciImagePlatform {
  os: "linux";
  architecture: "amd64" | "arm64";
}

export type OciImageResolutionStatus = "index-resolved" | "single-manifest";

export interface OciImageResolution {
  status: OciImageResolutionStatus;
  originalImage: string;
  resolvedImage: string;
  registry: string;
  repository: string;
  targetPlatform: OciImagePlatform;
  indexDigest?: string;
  platformDigest?: string;
  mediaType?: string;
}

export interface ResolveOciImageInput {
  image: string;
  platform?: NodeJS.Platform | string;
  arch?: NodeJS.Architecture | string;
  fetchImpl?: typeof fetch;
}

interface ParsedOciDigestRef {
  registry: string;
  repository: string;
  reference: string;
}

const indexMediaTypes = new Set([
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
]);

const manifestAcceptHeader = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

export async function resolveOciImageForRuntimePlatform(input: ResolveOciImageInput): Promise<OciImageResolution> {
  const parsed = parseOciDigestRef(input.image);
  const targetPlatform = runtimeOciPlatform({ platform: input.platform, arch: input.arch });
  const fetchImpl = input.fetchImpl ?? fetch;
  const manifest = await fetchManifestJson({ ...parsed, fetchImpl });
  const mediaType = stringField(manifest, "mediaType");
  const manifests = Array.isArray(manifest.manifests) ? manifest.manifests : undefined;

  if (!manifests || !indexMediaTypes.has(mediaType ?? "")) {
    return {
      status: "single-manifest",
      originalImage: input.image,
      resolvedImage: input.image,
      registry: parsed.registry,
      repository: parsed.repository,
      targetPlatform,
      mediaType,
    };
  }

  const selected = manifests.find((entry) => {
    if (!isRecord(entry)) return false;
    const platform = isRecord(entry.platform) ? entry.platform : {};
    return platform.os === targetPlatform.os && platform.architecture === targetPlatform.architecture;
  });
  const platformDigest = isRecord(selected) ? stringField(selected, "digest") : undefined;
  if (!platformDigest) {
    const available = manifests
      .filter(isRecord)
      .map((entry) => {
        const platform = isRecord(entry.platform) ? entry.platform : {};
        return [platform.os, platform.architecture].filter(Boolean).join("/") || "unknown";
      })
      .join(", ");
    throw new Error(`Pinned OCI image ${input.image} does not include ${targetPlatform.os}/${targetPlatform.architecture}. Available platforms: ${available || "none"}.`);
  }

  return {
    status: "index-resolved",
    originalImage: input.image,
    resolvedImage: `${parsed.registry}/${parsed.repository}@${platformDigest}`,
    registry: parsed.registry,
    repository: parsed.repository,
    targetPlatform,
    indexDigest: parsed.reference,
    platformDigest,
    mediaType,
  };
}

export function runtimeOciPlatform(input: {
  platform?: NodeJS.Platform | string;
  arch?: NodeJS.Architecture | string;
} = {}): OciImagePlatform {
  const arch = input.arch ?? process.arch;
  if (arch === "arm64") return { os: "linux", architecture: "arm64" };
  return { os: "linux", architecture: "amd64" };
}

export function ociImageResolutionSummary(resolution: OciImageResolution): string {
  const target = `${resolution.targetPlatform.os}/${resolution.targetPlatform.architecture}`;
  if (resolution.status === "index-resolved") {
    return `Resolved reviewed OCI index ${resolution.indexDigest} to ${target} manifest ${resolution.platformDigest}.`;
  }
  return `Verified reviewed OCI image manifest for ${target}.`;
}

function parseOciDigestRef(image: string): ParsedOciDigestRef {
  const at = image.lastIndexOf("@");
  if (at === -1) throw new Error(`OCI image must be pinned by digest: ${image}`);
  const name = image.slice(0, at);
  const reference = image.slice(at + 1);
  if (!/^sha256:[A-Fa-f0-9]{64}$/.test(reference)) throw new Error(`OCI image digest must be a sha256 digest: ${image}`);
  const slash = name.indexOf("/");
  if (slash === -1) throw new Error(`OCI image must include registry and repository: ${image}`);
  return {
    registry: name.slice(0, slash),
    repository: name.slice(slash + 1),
    reference,
  };
}

async function fetchManifestJson(input: ParsedOciDigestRef & { fetchImpl: typeof fetch }): Promise<Record<string, unknown>> {
  const url = `https://${input.registry}/v2/${input.repository}/manifests/${input.reference}`;
  let response = await input.fetchImpl(url, {
    headers: { Accept: manifestAcceptHeader },
  });
  if (response.status === 401) {
    const token = await fetchRegistryToken(input, response, input.fetchImpl);
    response = await input.fetchImpl(url, {
      headers: {
        Accept: manifestAcceptHeader,
        Authorization: `Bearer ${token}`,
      },
    });
  }
  if (!response.ok) {
    throw new Error(`OCI registry manifest request failed for ${input.registry}/${input.repository}@${input.reference}: HTTP ${response.status} ${response.statusText}`.trim());
  }
  const parsed = await response.json();
  if (!isRecord(parsed)) throw new Error(`OCI registry manifest response was not an object for ${input.registry}/${input.repository}@${input.reference}.`);
  return parsed;
}

async function fetchRegistryToken(input: ParsedOciDigestRef, response: Response, fetchImpl: typeof fetch): Promise<string> {
  const auth = response.headers.get("www-authenticate") ?? "";
  const realm = authParam(auth, "realm") ?? `https://${input.registry}/token`;
  const service = authParam(auth, "service") ?? input.registry;
  const scope = authParam(auth, "scope") ?? `repository:${input.repository}:pull`;
  const url = new URL(realm);
  if (!url.searchParams.has("service")) url.searchParams.set("service", service);
  if (!url.searchParams.has("scope")) url.searchParams.set("scope", scope);
  const tokenResponse = await fetchImpl(url.toString());
  if (!tokenResponse.ok) {
    throw new Error(`OCI registry token request failed for ${input.registry}/${input.repository}: HTTP ${tokenResponse.status} ${tokenResponse.statusText}`.trim());
  }
  const parsed = await tokenResponse.json();
  const token = isRecord(parsed) ? stringField(parsed, "token") ?? stringField(parsed, "access_token") : undefined;
  if (!token) throw new Error(`OCI registry token response did not include a token for ${input.registry}/${input.repository}.`);
  return token;
}

function authParam(header: string, key: string): string | undefined {
  const match = header.match(new RegExp(`${key}="([^"]+)"`));
  return match?.[1];
}

function stringField(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "string" && field.trim() ? field.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
