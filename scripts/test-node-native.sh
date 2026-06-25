#!/usr/bin/env bash
set -euo pipefail

test_files=("$@")
if [[ ${#test_files[@]} -eq 0 ]]; then
  test_files=(
    src/main/projectStore/projectStore.test.ts
    src/main/workflow/workflowDashboard.test.ts
    src/main/workflow-compiler/workflowCompilerService.test.ts
    src/main/workflow-compiler/workflowCompilerServicePromptTransport.test.ts
    src/main/workflow/workflowRunService.test.ts
    src/main/workflow/workflowDogfood.test.ts
    src/main/plugins/pluginDogfood.test.ts
    src/main/plugins/pluginProviderCatalogDogfood.test.ts
  )
fi

pnpm run prepare:node-native >/dev/null
AMBIENT_TEST_NATIVE=1 pnpm exec vitest run "${test_files[@]}"
