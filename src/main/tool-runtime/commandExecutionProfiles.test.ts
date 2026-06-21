import { describe, expect, it } from "vitest";

import {
  applyCommandDevicePolicy,
  commandTimeoutProfileConfigs,
  executeProfiledCommand,
  ProfiledCommandError,
} from "./commandExecutionProfiles";

describe("command execution profiles", () => {
  it("prevents unexplained CPU forcing when an accelerated device is recommended", () => {
    const result = applyCommandDevicePolicy(["--device", "cpu", "--health"], {
      prefer: ["mps", "cpu"],
      requireReasonWhenCpuForced: true,
    }, {
      AMBIENT_COMMAND_AVAILABLE_DEVICES: "mps,cpu",
      AMBIENT_COMMAND_RECOMMENDED_DEVICE: "mps",
    });

    expect(result.args).toEqual(["--device", "mps", "--health"]);
    expect(result.deviceSelection).toMatchObject({
      availableDevices: ["mps", "cpu"],
      recommendedDevice: "mps",
      requestedDevice: "cpu",
      selectedDevice: "mps",
      cpuOverridePrevented: true,
    });
  });

  it("rewrites duplicate unexplained CPU device flags", () => {
    const result = applyCommandDevicePolicy(["--device", "mps", "--batch", "1", "--device=cpu"], {
      prefer: ["mps", "cpu"],
      requireReasonWhenCpuForced: true,
    }, {
      AMBIENT_COMMAND_AVAILABLE_DEVICES: "mps,cpu",
      AMBIENT_COMMAND_RECOMMENDED_DEVICE: "mps",
    });

    expect(result.args).toEqual(["--device", "mps", "--batch", "1", "--device=mps"]);
    expect(result.args).not.toContain("cpu");
    expect(result.deviceSelection).toMatchObject({
      requestedDevice: "cpu",
      selectedDevice: "mps",
      cpuOverridePrevented: true,
    });
  });

  it("keeps an explicitly justified CPU selection", () => {
    const result = applyCommandDevicePolicy(["--device=cpu"], {
      prefer: ["mps", "cpu"],
      requireReasonWhenCpuForced: true,
      cpuReason: "The selected model only ships CPU kernels.",
    }, {
      AMBIENT_COMMAND_AVAILABLE_DEVICES: "mps,cpu",
      AMBIENT_COMMAND_RECOMMENDED_DEVICE: "mps",
    });

    expect(result.args).toEqual(["--device=cpu"]);
    expect(result.deviceSelection).toMatchObject({
      requestedDevice: "cpu",
      selectedDevice: "cpu",
      cpuForcedReason: "The selected model only ships CPU kernels.",
    });
  });

  it("uses process device control vars even when the child env is sanitized", async () => {
    const previousDevices = process.env.AMBIENT_COMMAND_AVAILABLE_DEVICES;
    const previousRecommended = process.env.AMBIENT_COMMAND_RECOMMENDED_DEVICE;
    process.env.AMBIENT_COMMAND_AVAILABLE_DEVICES = "mps,cpu";
    process.env.AMBIENT_COMMAND_RECOMMENDED_DEVICE = "mps";
    try {
      const result = await executeProfiledCommand({
        command: process.execPath,
        args: ["-e", "process.stdout.write(process.argv.slice(2).join(' '))", "--", "--device", "cpu"],
        env: { PATH: process.env.PATH },
        devicePolicy: {
          prefer: ["mps", "cpu"],
          requireReasonWhenCpuForced: true,
        },
        timeoutMs: 1_000,
        idleTimeoutMs: 1_000,
      });

      expect(result.args).toContain("mps");
      expect(result.args).not.toContain("cpu");
      expect(result.deviceSelection).toMatchObject({
        selectedDevice: "mps",
        cpuOverridePrevented: true,
      });
    } finally {
      if (previousDevices === undefined) delete process.env.AMBIENT_COMMAND_AVAILABLE_DEVICES;
      else process.env.AMBIENT_COMMAND_AVAILABLE_DEVICES = previousDevices;
      if (previousRecommended === undefined) delete process.env.AMBIENT_COMMAND_RECOMMENDED_DEVICE;
      else process.env.AMBIENT_COMMAND_RECOMMENDED_DEVICE = previousRecommended;
    }
  });

  it("uses long budgets for model cold starts", () => {
    expect(commandTimeoutProfileConfigs.modelColdStart.timeoutMs).toBeGreaterThan(120_000);
    expect(commandTimeoutProfileConfigs.liveGeneration.timeoutMs).toBeGreaterThan(120_000);
  });

  it("reports timeout phase, profile, last progress, and retry profile", async () => {
    await expect(executeProfiledCommand({
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 1000)"],
      timeoutProfile: "modelColdStart",
      timeoutMs: 500,
      idleTimeoutMs: 25,
      phase: "unit-test idle stall",
    })).rejects.toMatchObject({
      name: "ProfiledCommandError",
      timeoutProfile: "modelColdStart",
      timeoutPhase: "process-idle",
      recommendedRetryProfile: "liveGeneration",
    });

    try {
      await executeProfiledCommand({
        command: process.execPath,
        args: ["-e", "setTimeout(() => {}, 1000)"],
        timeoutProfile: "modelColdStart",
        timeoutMs: 500,
        idleTimeoutMs: 25,
        phase: "unit-test idle stall",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ProfiledCommandError);
      expect((error as ProfiledCommandError).message).toContain("timeoutPhase=process-idle");
      expect((error as ProfiledCommandError).message).toContain("recommendedRetryProfile=liveGeneration");
    }
  });

  it("settles after escalating when a timed-out child ignores SIGTERM", async () => {
    const startedAt = Date.now();
    await expect(executeProfiledCommand({
      command: process.execPath,
      args: ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"],
      timeoutProfile: "quickProbe",
      timeoutMs: 50,
      idleTimeoutMs: 25,
      phase: "unit-test sigterm ignored",
    })).rejects.toBeInstanceOf(ProfiledCommandError);
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });

  it("redacts secret-shaped output from nonzero-exit error messages", async () => {
    const secret = "sk-abcdefghijklmnopqrstuvwxyz";
    try {
      await executeProfiledCommand({
        command: process.execPath,
        args: ["-e", `process.stderr.write(${JSON.stringify(`token ${secret}`)}); process.exit(7);`],
        timeoutMs: 1_000,
        idleTimeoutMs: 1_000,
      });
      throw new Error("expected command to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ProfiledCommandError);
      expect((error as Error).message).not.toContain(secret);
      expect((error as Error).message).toContain("[REDACTED]");
      expect((error as ProfiledCommandError).stderr).toContain(secret);
    }
  });
});
