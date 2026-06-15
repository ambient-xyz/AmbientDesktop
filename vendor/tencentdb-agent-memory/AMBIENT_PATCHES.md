# Ambient Patch Manifest

Upstream: TencentCloud/TencentDB-Agent-Memory
Commit: a21ef3f66aebd549dcccc63084c572231b62d245
Package: @tencentdb-agent-memory/memory-tencentdb@0.3.6

Ambient keeps this subtree as a reviewed package boundary for the default-off
TencentDB Agent Memory experiment. The upstream source under `src/` is preserved
and should be rebased mechanically from the pinned upstream commit.

## Package Boundary Patches

- `package.json`: rename the local reviewed package to
  `@ambient-reviewed/tencentdb-agent-memory`, point the package entry at
  `src/ambient-entry.ts`, and remove upstream install/build scripts so Ambient
  never runs the OpenClaw `postinstall` host patch.
- `src/ambient-entry.ts`: expose only the host-neutral Tencent core and Ambient
  admin boundary. It intentionally does not export the OpenClaw plugin shell.
- `src/ambient-admin.ts`: add a small admin wrapper over Tencent `IMemoryStore`,
  L1 reader/writer, profile sync, and scene-index utilities so Ambient can build
  inspect/edit/delete tools without reimplementing Tencent storage.
- `src/core/tdai-core.ts`: expose a narrow store-init/reindex status boundary
  and a `reindexAllEmbeddings()` helper that delegates to Tencent's existing
  `IMemoryStore.reindexAll()` path. Ambient uses this to report and run vector
  migration after embeddings are enabled without opening SQLite or reimplementing
  Tencent indexing logic.

## Rebase Rule

When rebasing, copy upstream source changes first, then re-apply the package
boundary patches above. Do not move Tencent L0/L1/L2/L3, recall/capture/search,
or offload algorithms into Ambient-owned modules.
