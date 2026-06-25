import { once } from "node:events";
import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  assertAllowedUrlEgress,
  assertAllowedUrlEgressWithDns,
  classifyEgressHost,
  fetchWithUrlEgressPolicy,
} from "./urlEgressPolicy";

describe("urlEgressPolicy", () => {
  it("allows ordinary public HTTPS targets", () => {
    expect(assertAllowedUrlEgress("https://example.com/downloads/archive.tar.gz", { useCase: "managed-download" })).toMatchObject({
      hostname: "example.com",
      protocol: "https:",
      port: 443,
    });
  });

  it("blocks credential-bearing, non-web, public HTTP, private, metadata, and unsafe-port targets", () => {
    for (const url of [
      "https://user:secret@example.com/archive.tar.gz",
      "file:///Users/example/.ssh/id_rsa",
      "ftp://example.com/archive.tar.gz",
      "http://example.com/archive.tar.gz",
      "http://127.0.0.1:8080/fixture",
      "http://127.1/fixture",
      "http://2130706433/fixture",
      "http://0x7f000001/fixture",
      "https://[::ffff:127.0.0.1]/fixture",
      "https://[64:ff9b::a9fe:a9fe]/latest/meta-data",
      "https://[2002:a9fe:a9fe::1]/latest/meta-data",
      "https://[fec0::1]/internal",
      "https://10.0.0.5/package",
      "https://172.16.4.5/package",
      "https://192.168.1.10/package",
      "https://169.254.169.254/latest/meta-data",
      "https://metadata.google.internal/computeMetadata/v1/",
      "https://example.com:22/archive.tar.gz",
    ]) {
      expect(() => assertAllowedUrlEgress(url, { useCase: "plugin-preview" }), url).toThrow();
    }
  });

  it("allows only loopback HTTP when the explicit local-dev mode is set", () => {
    expect(() =>
      assertAllowedUrlEgress("http://127.0.0.1:4173/fixture", {
        useCase: "managed-download",
        allowLocalDevLoopbackHttp: true,
      }),
    ).not.toThrow();
    expect(() =>
      assertAllowedUrlEgress("http://192.168.1.5:4173/fixture", {
        useCase: "managed-download",
        allowLocalDevLoopbackHttp: true,
      }),
    ).toThrow(/private/);
    expect(() =>
      assertAllowedUrlEgress("http://example.com/fixture", {
        useCase: "managed-download",
        allowLocalDevLoopbackHttp: true,
      }),
    ).toThrow(/HTTPS/);
  });

  it("classifies literal host forms before DNS", () => {
    expect(classifyEgressHost("127.0.0.1")).toBe("loopback");
    expect(classifyEgressHost("::ffff:7f00:1")).toBe("loopback");
    expect(classifyEgressHost("64:ff9b::a9fe:a9fe")).toBe("metadata");
    expect(classifyEgressHost("2002:a9fe:a9fe::1")).toBe("metadata");
    expect(classifyEgressHost("fd00::1")).toBe("private");
    expect(classifyEgressHost("fec0::1")).toBe("private");
    expect(classifyEgressHost("fe80::1")).toBe("link-local");
    expect(classifyEgressHost("metadata")).toBe("metadata");
    expect(classifyEgressHost("example.com")).toBe("public");
  });

  it("blocks DNS resolutions into private network space", async () => {
    await expect(
      assertAllowedUrlEgressWithDns("https://downloads.example.test/archive.tgz", {
        useCase: "managed-download",
        enableDnsCheck: true,
        resolveHostAddresses: async () => [{ address: "10.0.0.7", family: 4 }],
      }),
    ).rejects.toThrow(/DNS resolution.*private/);
  });

  it("blocks DNS rebinding in the native fetch connection lookup", async () => {
    let lookupCount = 0;

    await expect(
      fetchWithUrlEgressPolicy("https://downloads.example.test/archive.tgz", undefined, {
        useCase: "managed-download",
        enableDnsCheck: true,
        resolveHostAddresses: async () => {
          lookupCount += 1;
          return lookupCount === 1
            ? [{ address: "93.184.216.34", family: 4 }]
            : [{ address: "169.254.169.254", family: 4 }];
        },
      }),
    ).rejects.toThrow(/DNS resolution.*metadata/);

    expect(lookupCount).toBe(2);
  });

  it("bounds DNS checks with the configured timeout", async () => {
    await expect(
      assertAllowedUrlEgressWithDns("https://slow.example.test/archive.tgz", {
        useCase: "managed-download",
        enableDnsCheck: true,
        dnsTimeoutMs: 5,
        resolveHostAddresses: async () => new Promise(() => undefined),
      }),
    ).rejects.toThrow(/DNS resolution.*did not finish within 5ms/);
  });

  it("allows localhost loopback resolution only in explicit local-dev native fetch mode", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("loopback ok");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port.");

    try {
      const result = await fetchWithUrlEgressPolicy(`http://localhost:${address.port}/fixture.txt`, undefined, {
        useCase: "managed-download",
        allowLocalDevLoopbackHttp: true,
        enableDnsCheck: true,
        resolveHostAddresses: async () => [{ address: "127.0.0.1", family: 4 }],
      });
      try {
        await expect(result.response.text()).resolves.toBe("loopback ok");
      } finally {
        await result.cleanup?.();
      }
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("rejects local-dev localhost when DNS resolves outside loopback", async () => {
    await expect(
      fetchWithUrlEgressPolicy("http://localhost:4173/fixture.txt", undefined, {
        useCase: "managed-download",
        allowLocalDevLoopbackHttp: true,
        enableDnsCheck: true,
        resolveHostAddresses: async () => [{ address: "93.184.216.34", family: 4 }],
      }),
    ).rejects.toThrow(/DNS resolution.*public/);
  });

  it("destroys the native dispatcher without waiting for an unread response body", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(500, { "content-type": "text/plain" });
      response.write("partial error body");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port.");

    try {
      const result = await fetchWithUrlEgressPolicy(`http://localhost:${address.port}/never-finishes.txt`, undefined, {
        useCase: "managed-download",
        allowLocalDevLoopbackHttp: true,
        enableDnsCheck: true,
        resolveHostAddresses: async () => [{ address: "127.0.0.1", family: 4 }],
      });
      expect(result.response.status).toBe(500);
      await Promise.race([
        result.cleanup?.(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("cleanup timed out")), 250)),
      ]);
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("revalidates redirects before the redirected request is sent", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      }),
    );

    await expect(
      fetchWithUrlEgressPolicy("https://downloads.example.test/archive.tgz", undefined, {
        useCase: "managed-download",
        fetchImpl: fetchImpl as typeof fetch,
        enableDnsCheck: false,
      }),
    ).rejects.toThrow(/metadata|link-local/);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
