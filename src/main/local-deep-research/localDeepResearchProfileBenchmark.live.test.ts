import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runLocalDeepResearchProfileBenchmark } from "./localDeepResearchProfileBenchmark";

const runLive = process.env.AMBIENT_LOCAL_DEEP_RESEARCH_PROFILE_BENCHMARK === "1";
const describeLive = runLive ? describe : describe.skip;

describeLive("Local Deep Research Q4/Q8 profile benchmark", () => {
  it("runs the same mixed-source benchmark against Q4 and Q8", async () => {
    const workspacePath = resolve(process.env.AMBIENT_LOCAL_DEEP_RESEARCH_PROFILE_BENCHMARK_WORKSPACE?.trim() || process.cwd());
    const report = await runLocalDeepResearchProfileBenchmark({
      workspacePath,
      env: process.env,
      runOptions: {
        maxToolCalls: Number(process.env.AMBIENT_LOCAL_DEEP_RESEARCH_PROFILE_BENCHMARK_MAX_TOOL_CALLS ?? 8),
        maxTurns: Number(process.env.AMBIENT_LOCAL_DEEP_RESEARCH_PROFILE_BENCHMARK_MAX_TURNS ?? 10),
        serverOptions: {
          startupTimeoutMs: Number(process.env.AMBIENT_LOCAL_DEEP_RESEARCH_PROFILE_BENCHMARK_STARTUP_TIMEOUT_MS ?? 300_000),
          idleTimeoutMs: 0,
        },
        chatOptions: {
          requestTimeoutMs: Number(process.env.AMBIENT_LOCAL_DEEP_RESEARCH_PROFILE_BENCHMARK_REQUEST_TIMEOUT_MS ?? 240_000),
        },
      },
    });

    expect(report.status).toBe("passed");
    expect(report.profiles.map((profile) => profile.profileId)).toEqual([
      "literesearcher-4b-q4-k-m",
      "literesearcher-4b-q8-0",
    ]);
    expect(report.profiles.every((profile) => profile.contextTokens === 16384)).toBe(true);
    expect(report.comparison?.baselineProfileId).toBe("literesearcher-4b-q4-k-m");
    expect(report.comparison?.candidateProfileId).toBe("literesearcher-4b-q8-0");
    console.log(JSON.stringify({
      status: report.status,
      artifactPath: report.artifactPath,
      markdownPath: report.markdownPath,
      comparison: report.comparison,
      profiles: report.profiles.map((profile) => ({
        profileId: profile.profileId,
        status: profile.status,
        score: profile.quality.score,
        durationMs: profile.durationMs,
        toolCallCount: profile.quality.toolCallCount,
        citationUrls: profile.quality.citationUrls,
        failureMode: profile.failureMode,
        runArtifact: profile.run?.artifacts.jsonPath,
      })),
    }, null, 2));
  }, Number(process.env.AMBIENT_LOCAL_DEEP_RESEARCH_PROFILE_BENCHMARK_TIMEOUT_MS ?? 60 * 60_000));
});
