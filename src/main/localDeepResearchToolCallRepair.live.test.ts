import { arch, platform, totalmem } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { detectLocalDeepResearchManagedAssets } from "./localDeepResearchManagedAssets";
import {
  createLocalDeepResearchBenchmarkBroker,
  type LocalDeepResearchProfileBenchmarkTask,
} from "./localDeepResearchProfileBenchmark";
import {
  runLocalDeepResearchWithManagedLlama,
  type LocalDeepResearchRunServiceProgressEvent,
} from "./localDeepResearchRunService";
import { buildLocalDeepResearchSetupContract } from "./localDeepResearchSetup";

const runLive = process.env.AMBIENT_LOCAL_DEEP_RESEARCH_TOOL_CALL_REPAIR_LIVE === "1";
const describeLive = runLive ? describe : describe.skip;

const styleResearchTask: LocalDeepResearchProfileBenchmarkTask = {
  id: "style-imitation-tool-call-repair",
  title: "Writing style imitation synthesis",
  question: [
    "Research techniques to make LLMs sound like different authors or take on different writing styles using the supplied public-source evidence.",
    "Search first, then visit at least two relevant sources.",
    "Produce a concise synthesis with a Sources line that includes literal citation URLs.",
  ].join(" "),
  requiredCitationPrefixes: [
    "https://blog.ninapanickssery.com/",
    "https://aclanthology.org/",
  ],
  requiredTerms: ["few-shot", "style", "LoRA"],
  sources: [
    {
      url: "https://blog.ninapanickssery.com/p/how-to-make-an-llm-write-like-someone",
      title: "How to make an LLM write like someone else",
      providerId: "tool-call-repair-fixture-search",
      snippet: "Describes building a many-shot style prompt from target writing samples and style descriptions.",
      content: [
        "The approach selects multiple pieces in the target style, converts them to clean markdown, and asks an LLM to describe the style.",
        "It then generates prompts for each source text and builds a conversation history where user prompts are paired with target-style assistant responses.",
        "The core technique is in-context conditioning: show the assistant repeatedly answering in the desired style and add explicit style guidance.",
      ].join("\n"),
    },
    {
      url: "https://aclanthology.org/2024.inlg-main.34.pdf",
      title: "Customizing Large Language Model Generation Style using Parameter-Efficient Finetuning",
      providerId: "tool-call-repair-fixture-search",
      snippet: "ACL paper on StyleTunedLM using LoRA adapters for author-level style customization.",
      content: [
        "StyleTunedLM explores parameter-efficient finetuning with LoRA to customize LLaMA-2 generations to ten authors.",
        "The method can capture lexical, syntactic, and surface style features while preserving instruction following by merging style and instruction adapters.",
        "It is more persistent than prompting and useful when a user has a corpus of prior writing.",
      ].join("\n"),
    },
    {
      url: "https://aclanthology.org/2024.emnlp-main.123.pdf",
      title: "TINYSTYLER: Efficient Few-Shot Text Style Transfer with Authorship Embeddings",
      providerId: "tool-call-repair-fixture-search",
      snippet: "Uses authorship style embeddings and lightweight generation for efficient text style transfer.",
      content: [
        "TINYSTYLER conditions a smaller model on authorship style embeddings, allowing style transfer without full retraining.",
        "It can use few-shot author examples, candidate generation, reranking, filtering, and self-distillation to improve style fidelity.",
      ].join("\n"),
    },
  ],
};

describeLive("Local Deep Research tool-call repair live", () => {
  it("runs the real LiteResearcher engine through repaired local tool-call wrappers", async () => {
    const workspacePath = resolve(process.env.AMBIENT_LOCAL_DEEP_RESEARCH_TOOL_CALL_REPAIR_WORKSPACE?.trim() || process.cwd());
    const managedAssets = await detectLocalDeepResearchManagedAssets(workspacePath, {
      env: process.env,
      platform: platform(),
      arch: arch(),
    });
    const setup = buildLocalDeepResearchSetupContract({
      machineFacts: {
        platform: platform(),
        arch: arch(),
        memoryBytes: totalmem(),
        memoryPressure: "normal",
        activeLocalModelCount: 0,
      },
      modelInstallState: managedAssets.model.status === "present" ? "installed" : "missing",
      runtimeInstalled: managedAssets.runtime.status === "present",
      ...(managedAssets.runtime.artifactId ? { runtimeArtifactId: managedAssets.runtime.artifactId } : {}),
      ...(managedAssets.runtime.binaryPath ? { runtimeBinaryPath: managedAssets.runtime.binaryPath } : {}),
    });

    expect(managedAssets.model.status).toBe("present");
    expect(managedAssets.runtime.status).toBe("present");
    expect(setup.status).toBe("ready");

    const progressEvents: LocalDeepResearchRunServiceProgressEvent[] = [];
    const result = await runLocalDeepResearchWithManagedLlama({
      workspacePath,
      question: styleResearchTask.question,
      setup,
      managedAssets,
      broker: createLocalDeepResearchBenchmarkBroker(styleResearchTask),
      maxToolCalls: Number(process.env.AMBIENT_LOCAL_DEEP_RESEARCH_TOOL_CALL_REPAIR_MAX_TOOL_CALLS ?? 8),
      maxTurns: Number(process.env.AMBIENT_LOCAL_DEEP_RESEARCH_TOOL_CALL_REPAIR_MAX_TURNS ?? 10),
      serverOptions: {
        startupTimeoutMs: Number(process.env.AMBIENT_LOCAL_DEEP_RESEARCH_TOOL_CALL_REPAIR_STARTUP_TIMEOUT_MS ?? 300_000),
        idleTimeoutMs: 0,
      },
      chatOptions: {
        temperature: 0,
        requestTimeoutMs: Number(process.env.AMBIENT_LOCAL_DEEP_RESEARCH_TOOL_CALL_REPAIR_REQUEST_TIMEOUT_MS ?? 240_000),
      },
      onProgress: (progress) => progressEvents.push(progress),
    });

    const searchCalls = result.run.toolExecutions.filter((execution) => execution.call.name === "search").length;
    const visitCalls = result.run.toolExecutions.filter((execution) => execution.call.name === "visit").length;
    const terminalProgressIndex = progressEvents.findIndex((event) => event.stage === "completed" || event.stage === "failed");
    const preCompletionEvents = terminalProgressIndex >= 0 ? progressEvents.slice(0, terminalProgressIndex) : progressEvents;

    expect(result.status).toBe("completed");
    expect(searchCalls).toBeGreaterThanOrEqual(1);
    expect(visitCalls).toBeGreaterThanOrEqual(1);
    expect(result.finalText).toContain("Sources:");
    expect(result.finalText).not.toContain("<think>");
    expect(result.run.citationValidation?.status).toBe("passed");
    expect(preCompletionEvents.some((event) => event.stage === "resource-policy" && event.memory?.policyOutcome)).toBe(true);
    expect(preCompletionEvents.some((event) => event.stage === "server-ready" && event.llamaServer?.pid && event.llamaServer.endpointUrl)).toBe(true);
    expect(preCompletionEvents.some((event) => event.stage === "model-turn" && event.turn?.maxTurns)).toBe(true);
    expect(preCompletionEvents.some((event) => event.stage === "tool-dispatch" && event.retrieval?.role)).toBe(true);
    expect(preCompletionEvents.some((event) => event.stage === "tool-complete" && event.retrieval?.outputChars !== undefined)).toBe(true);

    console.log(JSON.stringify({
      status: result.status,
      toolCalls: result.run.toolExecutions.map((execution) => execution.call),
      citationValidation: result.run.citationValidation,
      artifacts: result.artifacts,
      progress: progressEvents.map((event) => ({
        stage: event.stage,
        message: event.message,
        turn: event.turn,
        retrieval: event.retrieval,
        memoryPolicy: event.memory?.policyOutcome,
        llamaServer: event.llamaServer ? {
          pid: event.llamaServer.pid,
          endpointUrl: event.llamaServer.endpointUrl,
          healthy: event.llamaServer.healthy,
          rssBytes: event.llamaServer.rssBytes,
        } : undefined,
      })),
    }, null, 2));
  }, Number(process.env.AMBIENT_LOCAL_DEEP_RESEARCH_TOOL_CALL_REPAIR_TIMEOUT_MS ?? 20 * 60_000));
});
