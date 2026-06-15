import { describe, expect, it } from "vitest";
import {
  createLocalDeepResearchBenchmarkBroker,
  evaluateLocalDeepResearchProfileBenchmarkRun,
  localDeepResearchMixedSourceBenchmarkTask,
} from "./localDeepResearchProfileBenchmark";
import type { LocalDeepResearchRunServiceResult } from "./localDeepResearchRunService";

describe("Local Deep Research profile benchmark", () => {
  it("scores a grounded mixed-source run with citations and tool coverage", () => {
    const quality = evaluateLocalDeepResearchProfileBenchmarkRun({
      task: localDeepResearchMixedSourceBenchmarkTask,
      result: runResult({
        finalText: [
          "Node.js uses an LTS line for production stability, while Python labels the current production-ready feature line as stable.",
          "The Node.js evidence identifies the Node.js 24 active LTS line at https://nodejs.org/en/about/previous-releases.",
          "The Python evidence identifies the current stable Python 3 release line at https://www.python.org/downloads/.",
          "\nSources: https://nodejs.org/en/about/previous-releases, https://www.python.org/downloads/",
        ].join(" "),
      }),
    });

    expect(quality.status).toBe("passed");
    expect(quality.score).toBe(1);
    expect(quality.searchCallCount).toBe(1);
    expect(quality.visitCallCount).toBe(2);
    expect(quality.coveredRequiredCitationPrefixes).toEqual([
      "https://nodejs.org/",
      "https://www.python.org/",
    ]);
    expect(quality.checks.find((check) => check.id === "citation-validation")).toMatchObject({
      status: "passed",
    });
  });

  it("fails when a run omits a required source family citation", () => {
    const quality = evaluateLocalDeepResearchProfileBenchmarkRun({
      task: localDeepResearchMixedSourceBenchmarkTask,
      result: runResult({
        finalText: "Node.js LTS and Python stable releases are different. Source: https://nodejs.org/en/about/previous-releases",
      }),
    });

    expect(quality.status).toBe("failed");
    expect(quality.missingRequiredCitationPrefixes).toEqual(["https://www.python.org/"]);
    expect(quality.checks.find((check) => check.id === "source-coverage")).toMatchObject({
      status: "failed",
    });
  });

  it("routes benchmark search and visit calls through deterministic mixed-source fixtures", async () => {
    const broker = createLocalDeepResearchBenchmarkBroker(localDeepResearchMixedSourceBenchmarkTask);

    const search = await broker.search({ query: "latest Node.js LTS release", maxResults: 5 });
    const visit = await broker.visit({ url: "https://www.python.org/downloads/", maxCharacters: 4000 });

    expect(search.selectedProvider).toBe("benchmark-fixture-search");
    expect(search.text).toContain("Node.js Previous Releases");
    expect(search.text).not.toContain("Python Downloads");
    expect(visit.selectedProvider).toBe("benchmark-fixture-fetch");
    expect(visit.text).toContain("Stable Python releases are production-ready");
  });
});

function runResult(input: { finalText: string }): LocalDeepResearchRunServiceResult {
  return {
    schemaVersion: "ambient-local-deep-research-service-result-v1",
    status: "completed",
    finalText: input.finalText,
    run: {
      schemaVersion: "ambient-local-deep-research-run-v1",
      status: "completed",
      question: localDeepResearchMixedSourceBenchmarkTask.question,
      setupStatus: "ready",
      modelProfileId: "literesearcher-4b-q4-k-m",
      contextTokens: 16384,
      providerSnapshot: {
        schemaVersion: "ambient-local-deep-research-provider-snapshot-v1",
        capturedAt: "2026-05-28T15:00:00.000Z",
        providerOrder: ["benchmark-fixture-research"],
        skippedProviders: [],
        providers: [],
        searchOrder: ["benchmark-fixture-search"],
        fetchOrder: ["benchmark-fixture-fetch"],
        skippedSearchProviders: [],
        skippedFetchProviders: [],
        fallbackPolicy: { allowBrowserFallback: true },
      },
      finalSynthesis: {
        schemaVersion: "ambient-local-deep-research-final-synthesis-v1",
        mode: "local",
        sourceLimit: 12,
        evidencePreviewChars: 1200,
      },
      messages: [],
      toolExecutions: [
        {
          schemaVersion: "ambient-local-deep-research-tool-execution-v1",
          call: { id: "search-1", name: "search", arguments: { query: "Node.js Python releases", maxResults: 5 } },
          observation: "Search results",
          result: {
            text: "Search results",
            selectedProvider: "benchmark-fixture-search",
            attempts: [{ providerId: "benchmark-fixture-search", status: "succeeded" }],
          },
        },
        {
          schemaVersion: "ambient-local-deep-research-tool-execution-v1",
          call: { id: "visit-1", name: "visit", arguments: { url: "https://nodejs.org/en/about/previous-releases" } },
          observation: "Node source",
          result: {
            text: "Node source",
            selectedProvider: "benchmark-fixture-fetch",
            attempts: [{ providerId: "benchmark-fixture-fetch", status: "succeeded" }],
          },
        },
        {
          schemaVersion: "ambient-local-deep-research-tool-execution-v1",
          call: { id: "visit-2", name: "visit", arguments: { url: "https://www.python.org/downloads/" } },
          observation: "Python source",
          result: {
            text: "Python source",
            selectedProvider: "benchmark-fixture-fetch",
            attempts: [{ providerId: "benchmark-fixture-fetch", status: "succeeded" }],
          },
        },
      ],
      finalText: input.finalText,
    },
    artifacts: {
      jsonPath: ".ambient/local-deep-research/runs/synthetic.json",
      markdownPath: ".ambient/local-deep-research/runs/synthetic.md",
      jsonBytes: 100,
      markdownBytes: 100,
    },
    localModelResourcePreflight: {
      allowed: true,
      outcome: "unlimited",
      reason: "No local-model resident-memory ceiling is configured.",
      registry: {
        schemaVersion: "ambient-local-model-resource-registry-v1",
        capturedAt: "2026-05-28T15:00:00.000Z",
        settings: {
          schemaVersion: "ambient-local-model-resource-settings-v1",
          memoryLimitBehavior: "warn",
        },
        entries: [],
        activeCount: 0,
        activeEstimatedResidentMemoryBytes: 0,
        policyDecision: {
          outcome: "unlimited",
          reason: "No local-model resident-memory ceiling is configured.",
          activeEstimatedResidentMemoryBytes: 0,
          projectedEstimatedResidentMemoryBytes: 0,
          unloadCandidateIds: [],
        },
      },
    },
    llamaServer: {
      endpointUrl: "http://127.0.0.1:43123",
      pid: 1234,
      profileId: "literesearcher-4b-q4-k-m",
      modelPath: "/tmp/model.gguf",
      runtimeBinaryPath: "/tmp/llama-server",
      stateDir: "/tmp/state",
      logPath: "/tmp/log",
      stdoutPath: "/tmp/stdout",
      stderrPath: "/tmp/stderr",
    },
    release: {
      status: "released",
    },
  };
}
