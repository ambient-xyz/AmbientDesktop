import { describe, expect, it } from "vitest";
import { collectVoiceOnboardingHostFacts } from "./voiceOnboardingHostFacts";

describe("voice onboarding host facts", () => {
  it("collects bounded deterministic host facts without requiring optional runtimes", async () => {
    const facts = await collectVoiceOnboardingHostFacts({ isPackaged: false });
    expect(facts.os.platform).toBe(process.platform);
    expect(facts.os.arch).toBe(process.arch);
    expect(facts.os.appMode).toBe("development");
    expect(facts.hardware.memoryBytes).toBeGreaterThan(0);
    expect(facts.runtimes.map((runtime) => runtime.name)).toEqual(["Node.js", "npm", "Python 3", "Python", "Homebrew", "uv", "ffmpeg"]);
    expect(facts.runtimes.find((runtime) => runtime.name === "Node.js")).toMatchObject({
      command: "node",
      available: true,
    });
    for (const runtime of facts.runtimes) {
      expect(runtime).not.toHaveProperty("value");
      expect(runtime.detail ?? "").not.toMatch(/api[_-]?key|token|secret/i);
    }
  });
});
