export const TENCENT_MEMORY_UPSTREAM = {
  repository: "https://github.com/TencentCloud/TencentDB-Agent-Memory",
  commit: "a21ef3f66aebd549dcccc63084c572231b62d245",
  packageName: "@tencentdb-agent-memory/memory-tencentdb",
} as const;

export const TENCENT_MEMORY_UPSTREAM_PACKAGE_AUDIT_MANIFEST = {
  name: "@tencentdb-agent-memory/memory-tencentdb",
  version: "0.3.6",
  engines: { node: ">=22.16.0" },
  scripts: {
    postinstall: "bash scripts/openclaw-after-tool-call-messages.patch.sh 2>/dev/null || true",
  },
  dependencies: {
    "@node-rs/jieba": "^2.0.1",
    "@tencentdb-agent-memory/tcvdb-text": "^0.1.1",
    "sqlite-vec": "0.1.7-alpha.2",
    "tsx": "^4.21.0",
  },
  optionalDependencies: {
    opik: "^1.0.0",
  },
  peerDependencies: {
    "node-llama-cpp": "^3.16.2",
    openclaw: ">=2026.3.7",
  },
} as const;

export type TencentMemoryIntegrationDecision =
  | "pinned-package-import"
  | "minimal-fork-or-subtree";

export interface TencentMemoryUnsafeInstallScript {
  name: string;
  command: string;
  reason: string;
}

export interface TencentMemoryPackageAudit {
  upstreamRepository: string;
  upstreamCommit: string;
  packageName?: string;
  packageVersion?: string;
  nodeEngine?: string;
  installScripts: Record<string, string>;
  unsafeInstallScripts: TencentMemoryUnsafeInstallScript[];
  nativeDependencies: string[];
  hasOpenClawPeerDependency: boolean;
  hasNodeLlamaCppPeerDependency: boolean;
  recommendedIntegration: TencentMemoryIntegrationDecision;
  packageImportAllowedWithoutPatch: boolean;
  reason: string;
}

export function auditTencentMemoryPackageManifest(
  manifest: unknown,
  upstream = TENCENT_MEMORY_UPSTREAM,
): TencentMemoryPackageAudit {
  const record = objectRecord(manifest);
  const scripts = stringRecord(record.scripts);
  const dependencies = stringRecord(record.dependencies);
  const optionalDependencies = stringRecord(record.optionalDependencies);
  const peerDependencies = stringRecord(record.peerDependencies);
  const engines = stringRecord(record.engines);
  const installScripts = pickInstallScripts(scripts);
  const unsafeInstallScripts = unsafeTencentMemoryInstallScripts(installScripts);
  const nativeDependencies = nativeTencentMemoryDependencyNames({
    ...dependencies,
    ...optionalDependencies,
    ...peerDependencies,
  });
  const hasOpenClawPeerDependency = Object.hasOwn(peerDependencies, "openclaw");
  const hasNodeLlamaCppPeerDependency = Object.hasOwn(peerDependencies, "node-llama-cpp");
  const packageImportAllowedWithoutPatch = unsafeInstallScripts.length === 0;
  const recommendedIntegration: TencentMemoryIntegrationDecision = packageImportAllowedWithoutPatch
    ? "pinned-package-import"
    : "minimal-fork-or-subtree";

  return {
    upstreamRepository: upstream.repository,
    upstreamCommit: upstream.commit,
    packageName: stringValue(record.name),
    packageVersion: stringValue(record.version),
    nodeEngine: engines.node,
    installScripts,
    unsafeInstallScripts,
    nativeDependencies,
    hasOpenClawPeerDependency,
    hasNodeLlamaCppPeerDependency,
    recommendedIntegration,
    packageImportAllowedWithoutPatch,
    reason: packageImportAllowedWithoutPatch
      ? "The upstream package manifest has no install script that mutates host runtimes."
      : "The upstream package manifest runs an OpenClaw patch script during install, so Ambient should use a minimal fork/subtree or patched package boundary before importing it.",
  };
}

export const PHASE0_TENCENT_MEMORY_PACKAGE_AUDIT = auditTencentMemoryPackageManifest(
  TENCENT_MEMORY_UPSTREAM_PACKAGE_AUDIT_MANIFEST,
);

function pickInstallScripts(scripts: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    ["preinstall", "install", "postinstall"].flatMap((name) => {
      const command = scripts[name];
      return command ? [[name, command]] : [];
    }),
  );
}

function unsafeTencentMemoryInstallScripts(
  scripts: Record<string, string>,
): TencentMemoryUnsafeInstallScript[] {
  return Object.entries(scripts).flatMap(([name, command]) => {
    const normalized = command.toLowerCase();
    const patchesOpenClaw = normalized.includes("openclaw") && normalized.includes("patch");
    if (!patchesOpenClaw) return [];
    return [{
      name,
      command,
      reason: "Install script can patch an OpenClaw runtime; Ambient must not run host mutation scripts as a package side effect.",
    }];
  });
}

function nativeTencentMemoryDependencyNames(dependencies: Record<string, string>): string[] {
  const nativeNames = new Set(["sqlite-vec", "@node-rs/jieba", "node-llama-cpp"]);
  return Object.keys(dependencies)
    .filter((name) => nativeNames.has(name))
    .sort();
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(objectRecord(value)).flatMap(([key, item]) => (
      typeof item === "string" ? [[key, item]] : []
    )),
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
