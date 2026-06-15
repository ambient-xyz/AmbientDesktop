import { describe, expect, it } from "vitest";
import { inspectTencentDbMemoryNativePreflight } from "./preflight";

describe("TencentDB memory native preflight", () => {
  it("reports needs_attention when the reviewed core is configured but native packages are missing", () => {
    const preflight = inspectTencentDbMemoryNativePreflight({
      now: new Date("2026-06-13T00:00:00.000Z"),
      requireResolve: () => {
        throw new Error("missing");
      },
      platform: "darwin",
      arch: "arm64",
      nodeModuleVersion: "141",
    });

    expect(preflight).toMatchObject({
      schemaVersion: "ambient-agent-memory-native-preflight-v1",
      checkedAt: "2026-06-13T00:00:00.000Z",
      platform: "darwin",
      arch: "arm64",
      nodeModuleVersion: "141",
      coreModuleConfigured: true,
      coreModuleSpecifier: "../../../../vendor/tencentdb-agent-memory/src/ambient-entry",
      status: "needs_attention",
    });
    expect(preflight.dependencies.map((dependency) => dependency.name)).toEqual([
      "@node-rs/jieba",
      "sqlite-vec",
    ]);
    expect(preflight.dependencies.every((dependency) => dependency.resolvable === false)).toBe(true);
  });

  it("resolves package metadata without importing native bindings", () => {
    const preflight = inspectTencentDbMemoryNativePreflight({
      now: new Date("2026-06-13T00:00:00.000Z"),
      coreModuleSpecifier: "@ambient/reviewed-tencent-memory",
      requireResolve: (specifier) => `/tmp/node_modules/${specifier}`,
      readPackageJson: (path) => ({
        version: path.includes("sqlite-vec") ? "0.1.7-alpha.2" : "1.0.0",
      }),
      platform: "darwin",
      arch: "arm64",
      nodeModuleVersion: "141",
    });

    expect(preflight.status).toBe("healthy");
    expect(preflight.coreModuleConfigured).toBe(true);
    expect(preflight.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "sqlite-vec",
        resolvable: true,
        version: "0.1.7-alpha.2",
      }),
    ]));
  });
});
