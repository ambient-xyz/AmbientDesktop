import { describe, expect, it } from "vitest";
import {
  ociImageResolutionSummary,
  resolveOciImageForRuntimePlatform,
  runtimeOciPlatform,
} from "./ociImageResolver";

describe("OCI image resolver", () => {
  it("resolves a reviewed multi-arch index to the Linux arm64 child digest on Apple Silicon", async () => {
    const fetchImpl = fakeFetch({
      "https://ghcr.io/v2/d4vinci/scrapling/manifests/sha256:bc71e9132fe4289b97da720dabb626599d090892b5eae7378bf9204918c0e9a3": [
        unauthorized('Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:d4vinci/scrapling:pull"'),
        jsonResponse(indexManifest()),
      ],
      "https://ghcr.io/token?service=ghcr.io&scope=repository%3Ad4vinci%2Fscrapling%3Apull": [
        jsonResponse({ token: "anon" }),
      ],
    });

    const resolution = await resolveOciImageForRuntimePlatform({
      image: scraplingIndexRef,
      platform: "darwin",
      arch: "arm64",
      fetchImpl,
    });

    expect(resolution).toMatchObject({
      status: "index-resolved",
      originalImage: scraplingIndexRef,
      resolvedImage: "ghcr.io/d4vinci/scrapling@sha256:985d67067bd74bef4bea6bb8da6da666b6d063b151284b2d85485c1599460862",
      targetPlatform: { os: "linux", architecture: "arm64" },
      indexDigest: "sha256:bc71e9132fe4289b97da720dabb626599d090892b5eae7378bf9204918c0e9a3",
      platformDigest: "sha256:985d67067bd74bef4bea6bb8da6da666b6d063b151284b2d85485c1599460862",
    });
    expect(ociImageResolutionSummary(resolution)).toContain("linux/arm64");
  });

  it("resolves Windows x64 to the Linux amd64 child digest because ToolHive runs Linux containers", async () => {
    const resolution = await resolveOciImageForRuntimePlatform({
      image: scraplingIndexRef,
      platform: "win32",
      arch: "x64",
      fetchImpl: fakeFetch({
        "https://ghcr.io/v2/d4vinci/scrapling/manifests/sha256:bc71e9132fe4289b97da720dabb626599d090892b5eae7378bf9204918c0e9a3": [
          jsonResponse(indexManifest()),
        ],
      }),
    });

    expect(resolution).toMatchObject({
      status: "index-resolved",
      resolvedImage: "ghcr.io/d4vinci/scrapling@sha256:d1666460c0629c53ac2f6cf99555c8cde26e31e6fb973d17cb6a21f55e7ffa08",
      targetPlatform: { os: "linux", architecture: "amd64" },
    });
  });

  it("rejects an index with no matching platform instead of letting ToolHive fail opaquely", async () => {
    await expect(resolveOciImageForRuntimePlatform({
      image: scraplingIndexRef,
      platform: "darwin",
      arch: "arm64",
      fetchImpl: fakeFetch({
        "https://ghcr.io/v2/d4vinci/scrapling/manifests/sha256:bc71e9132fe4289b97da720dabb626599d090892b5eae7378bf9204918c0e9a3": [
          jsonResponse({ ...indexManifest(), manifests: [indexManifest().manifests[0]] }),
        ],
      }),
    })).rejects.toThrow("does not include linux/arm64");
  });

  it("maps host architectures to Linux container platforms", () => {
    expect(runtimeOciPlatform({ platform: "darwin", arch: "arm64" })).toEqual({ os: "linux", architecture: "arm64" });
    expect(runtimeOciPlatform({ platform: "win32", arch: "x64" })).toEqual({ os: "linux", architecture: "amd64" });
  });
});

const scraplingIndexRef = "ghcr.io/d4vinci/scrapling@sha256:bc71e9132fe4289b97da720dabb626599d090892b5eae7378bf9204918c0e9a3";

function indexManifest() {
  return {
    mediaType: "application/vnd.oci.image.index.v1+json",
    manifests: [
      {
        mediaType: "application/vnd.oci.image.manifest.v1+json",
        digest: "sha256:d1666460c0629c53ac2f6cf99555c8cde26e31e6fb973d17cb6a21f55e7ffa08",
        platform: { os: "linux", architecture: "amd64" },
      },
      {
        mediaType: "application/vnd.oci.image.manifest.v1+json",
        digest: "sha256:985d67067bd74bef4bea6bb8da6da666b6d063b151284b2d85485c1599460862",
        platform: { os: "linux", architecture: "arm64" },
      },
    ],
  };
}

function fakeFetch(responses: Record<string, Response[]>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const key = url.toString();
    const queue = responses[key];
    const response = queue?.shift();
    if (!response) throw new Error(`Unexpected fetch: ${key}`);
    return response;
  }) as typeof fetch;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
}

function unauthorized(wwwAuthenticate: string): Response {
  return new Response("", {
    status: 401,
    statusText: "Unauthorized",
    headers: { "www-authenticate": wwwAuthenticate },
  });
}
