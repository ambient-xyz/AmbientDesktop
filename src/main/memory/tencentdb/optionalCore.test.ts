import { afterEach, describe, expect, it } from "vitest";

import {
  AMBIENT_REVIEWED_TENCENT_MEMORY_MODULE,
  loadAmbientReviewedTencentMemoryCore,
} from "./optionalCore";

const originalCoreModule = process.env.AMBIENT_TENCENTDB_MEMORY_CORE_MODULE;

afterEach(() => {
  if (originalCoreModule == null) {
    delete process.env.AMBIENT_TENCENTDB_MEMORY_CORE_MODULE;
  } else {
    process.env.AMBIENT_TENCENTDB_MEMORY_CORE_MODULE = originalCoreModule;
  }
});

describe("TencentDB reviewed core loader", () => {
  it("loads the vendored reviewed Tencent core and admin export by default", async () => {
    delete process.env.AMBIENT_TENCENTDB_MEMORY_CORE_MODULE;

    const result = await loadAmbientReviewedTencentMemoryCore();

    expect(result.moduleSpecifier).toBe(AMBIENT_REVIEWED_TENCENT_MEMORY_MODULE);
    expect(result.unavailableReason).toBeUndefined();
    expect(result.Core?.name).toBe("TdaiCore");
    expect(typeof result.createMemoryAdminService).toBe("function");
  });

  it("keeps the environment override for explicit diagnostics", async () => {
    process.env.AMBIENT_TENCENTDB_MEMORY_CORE_MODULE = "missing:tencent-core";

    const result = await loadAmbientReviewedTencentMemoryCore();

    expect(result.Core).toBeUndefined();
    expect(result.moduleSpecifier).toBe("missing:tencent-core");
    expect(result.unavailableReason).toContain("Failed to load missing:tencent-core");
  });
});
