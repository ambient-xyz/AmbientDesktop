import type {
  TencentMemoryAdminServiceFactory,
  TencentMemoryCoreConstructor,
} from "./upstreamContracts";

export interface TencentMemoryCoreModuleShape {
  TdaiCore?: TencentMemoryCoreConstructor;
  TencentMemoryCore?: TencentMemoryCoreConstructor;
  createMemoryAdminService?: TencentMemoryAdminServiceFactory;
  default?: unknown;
}

export interface TencentMemoryCoreLoadResult {
  Core?: TencentMemoryCoreConstructor;
  createMemoryAdminService?: TencentMemoryAdminServiceFactory;
  moduleSpecifier?: string;
  unavailableReason?: string;
}

export type TencentMemoryCoreConstructorLoader =
  () => Promise<TencentMemoryCoreLoadResult> | TencentMemoryCoreLoadResult;

const TENCENT_MEMORY_CORE_MODULE_ENV = "AMBIENT_TENCENTDB_MEMORY_CORE_MODULE";
export const AMBIENT_REVIEWED_TENCENT_MEMORY_MODULE = "../../../../vendor/tencentdb-agent-memory/src/ambient-entry";

function isConstructor(value: unknown): value is TencentMemoryCoreConstructor {
  return typeof value === "function";
}

function constructorFromModule(moduleShape: TencentMemoryCoreModuleShape): TencentMemoryCoreConstructor | undefined {
  if (isConstructor(moduleShape.TdaiCore)) return moduleShape.TdaiCore;
  if (isConstructor(moduleShape.TencentMemoryCore)) return moduleShape.TencentMemoryCore;
  if (isConstructor(moduleShape.default)) return moduleShape.default;
  if (
    moduleShape.default &&
    typeof moduleShape.default === "object" &&
    isConstructor((moduleShape.default as TencentMemoryCoreModuleShape).TdaiCore)
  ) {
    return (moduleShape.default as TencentMemoryCoreModuleShape).TdaiCore;
  }
  return undefined;
}

function adminFactoryFromModule(moduleShape: TencentMemoryCoreModuleShape): TencentMemoryAdminServiceFactory | undefined {
  if (typeof moduleShape.createMemoryAdminService === "function") return moduleShape.createMemoryAdminService;
  if (
    moduleShape.default &&
    typeof moduleShape.default === "object" &&
    typeof (moduleShape.default as TencentMemoryCoreModuleShape).createMemoryAdminService === "function"
  ) {
    return (moduleShape.default as TencentMemoryCoreModuleShape).createMemoryAdminService;
  }
  return undefined;
}

export async function loadAmbientReviewedTencentMemoryCore(): Promise<TencentMemoryCoreLoadResult> {
  const moduleSpecifier = process.env[TENCENT_MEMORY_CORE_MODULE_ENV]?.trim();
  if (moduleSpecifier) {
    return loadTencentMemoryCoreModule(moduleSpecifier, () => dynamicImportModule(moduleSpecifier));
  }

  return loadTencentMemoryCoreModule(
    AMBIENT_REVIEWED_TENCENT_MEMORY_MODULE,
    () => import("../../../../vendor/tencentdb-agent-memory/src/ambient-entry") as unknown as Promise<TencentMemoryCoreModuleShape>,
  );
}

async function loadTencentMemoryCoreModule(
  moduleSpecifier: string,
  load: () => Promise<TencentMemoryCoreModuleShape>,
): Promise<TencentMemoryCoreLoadResult> {
  try {
    const loaded = await load();
    const Core = constructorFromModule(loaded);
    if (!Core) {
      return {
        moduleSpecifier,
        unavailableReason: `Module ${moduleSpecifier} did not export TdaiCore or TencentMemoryCore.`,
      };
    }
    return {
      Core,
      createMemoryAdminService: adminFactoryFromModule(loaded),
      moduleSpecifier,
    };
  } catch (error) {
    return {
      moduleSpecifier,
      unavailableReason: `Failed to load ${moduleSpecifier}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function dynamicImportModule(moduleSpecifier: string): Promise<TencentMemoryCoreModuleShape> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<TencentMemoryCoreModuleShape>;
  return dynamicImport(moduleSpecifier);
}
