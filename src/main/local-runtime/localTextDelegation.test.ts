import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AmbientModelRuntimeProfile } from "../../shared/ambientModels";
import type { LocalModelResourcePolicyDecision, LocalModelResourceRegistryEntry, LocalModelResourceRegistrySnapshot } from "../../shared/types";
import type { LocalModelRuntimeLease, LocalModelRuntimeReleaseResult } from "./localModelRuntimeManager";
import {
  acquireLocalTextDelegationRuntime,
  completeLocalTextDelegation,
  extractLocalTextCompletionOutput,
  isLocalTextDelegationRuntimeFailureError,
  LOCAL_TEXT_RUNTIME_STATE_ROOT,
  planLocalTextDelegationRuntime,
  preflightLocalTextDelegation,
  validateLocalTextRuntimeLaunchDescriptor,
} from "./localTextDelegation";

const gib = 1024 ** 3;

describe("local text delegation preflight", () => {
  it("allows a local text-only sub-agent model within memory policy", () => {
    expect(preflightLocalTextDelegation({
      model: localTextModel(),
      resourceRegistry: registry(policy({
        outcome: "within-limit",
        reason: "Within limit.",
      })),
    })).toMatchObject({
      schemaVersion: "ambient-local-text-delegation-preflight-v1",
      allowed: true,
      blockers: [],
      warnings: [],
      model: {
        modelId: "local/text-4b",
        locality: "local",
        toolUse: "none",
        selectableAsSubagent: true,
      },
      resourcePolicy: {
        outcome: "within-limit",
      },
    });
  });

  it("allows warning-only memory ceiling outcomes but preserves the warning", () => {
    expect(preflightLocalTextDelegation({
      model: localTextModel(),
      resourceRegistry: registry(policy({
        outcome: "warn",
        reason: "Projected local-model resident memory exceeds the configured ceiling.",
        exceededByBytes: 2 * gib,
      })),
    })).toMatchObject({
      allowed: true,
      blockers: [],
      warnings: ["Projected local-model resident memory exceeds the configured ceiling."],
    });
  });

  it("blocks local invocations that cannot fit the model context window", () => {
    const result = preflightLocalTextDelegation({
      model: localTextModel({
        contextWindowTokens: 16,
        maxOutputTokens: 8,
      }),
      resourceRegistry: registry(policy({
        outcome: "within-limit",
        reason: "Within limit.",
      })),
      invocation: {
        prompt: "x".repeat(100),
        requestedOutputTokens: 8,
        structuredOutputRequired: true,
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "Local text prompt is estimated at 25 tokens plus 8 output tokens, exceeding model local/text-4b context window 16 tokens.",
    ]));
    expect(result.invocationLimits).toMatchObject({
      schemaVersion: "ambient-local-text-delegation-invocation-limits-v1",
      tokenEstimateMethod: "chars_div_4",
      contextWindowTokens: 16,
      maxOutputTokens: 8,
      promptTokenEstimate: 25,
      outputReserveTokens: 8,
      projectedContextTokens: 33,
      contextFits: false,
      structuredOutputRequired: true,
      structuredOutputMode: "ambient_synthesized",
      structuredOutputSupport: "none",
    });
  });

  it("blocks cloud, toolful, unavailable, and resource-refused models", () => {
    const result = preflightLocalTextDelegation({
      model: {
        ...localTextModel(),
        locality: "cloud",
        available: false,
        unavailableReason: "Local server is not installed.",
        toolUse: "ambient-tools",
      },
      resourceRegistry: registry(policy({
        outcome: "refuse",
        reason: "Projected local-model resident memory exceeds the configured ceiling.",
        maxResidentMemoryBytes: 8 * gib,
        exceededByBytes: 4 * gib,
      })),
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "Model local/text-4b is cloud; local text delegation requires a local model profile.",
      "Local server is not installed.",
      "Model local/text-4b advertises tool use; Phase 3 local text delegation is text-only.",
      "Projected local-model resident memory exceeds the configured ceiling.",
    ]));
  });

  it("plans a local runtime acquisition from an eligible local text model", () => {
    const plan = planLocalTextDelegationRuntime({
      workspacePath: "/workspace",
      ownerThreadId: "thread-1",
      model: localTextModel({ contextWindowTokens: 8192 }),
      resourceRegistry: registry(policy({
        outcome: "within-limit",
        reason: "Within limit.",
      })),
      launch: {
        runtimeId: "local-text-runtime",
        command: "/runtime/local-text",
        args: ["serve", "--port", "43123"],
        healthUrl: "http://127.0.0.1:43123/health",
        idleTimeoutMs: 300000,
        estimatedResidentMemoryBytes: 6 * gib,
      },
    });

    expect(plan).toMatchObject({
      schemaVersion: "ambient-local-text-delegation-runtime-plan-v1",
      requestedLaunch: {
        capability: "local-text",
        id: "local-text:local:local/text-4b:requested",
        ownerThreadId: "thread-1",
        modelId: "local/text-4b",
        profileId: "local:local/text-4b",
        contextTokens: 8192,
        estimatedResidentMemoryBytes: 6 * gib,
      },
      acquireInput: {
        runtimeId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        profileId: "local:local/text-4b",
        stateRootPath: `/workspace/${LOCAL_TEXT_RUNTIME_STATE_ROOT}`,
        command: "/runtime/local-text",
        args: ["serve", "--port", "43123"],
        cwd: "/workspace",
        healthUrl: "http://127.0.0.1:43123/health",
        ownerThreadId: "thread-1",
        idleTimeoutMs: 300000,
        estimatedResidentMemoryBytes: 6 * gib,
      },
      preflight: {
        allowed: true,
        launchReadiness: {
          schemaVersion: "ambient-local-text-runtime-launch-readiness-v1",
          ready: true,
          descriptor: {
            runtimeId: "local-text-runtime",
            command: "/runtime/local-text",
            args: ["serve", "--port", "43123"],
            cwd: "/workspace",
            stateRootPath: `/workspace/${LOCAL_TEXT_RUNTIME_STATE_ROOT}`,
            healthUrl: "http://127.0.0.1:43123/health",
            idleTimeoutMs: 300000,
            estimatedResidentMemoryBytes: 6 * gib,
          },
        },
      },
    });
  });

  it("reports launch descriptor readiness before runtime acquisition", () => {
    expect(validateLocalTextRuntimeLaunchDescriptor({
      workspacePath: "/workspace",
      model: localTextModel(),
      launch: {
        runtimeId: "local-text-runtime",
        command: "  ",
        args: ["serve", "bad\0arg"],
        healthUrl: "file:///tmp/health",
        startupTimeoutMs: 0,
        idleTimeoutMs: Number.NaN,
        estimatedResidentMemoryBytes: -1,
      },
    })).toMatchObject({
      schemaVersion: "ambient-local-text-runtime-launch-readiness-v1",
      ready: false,
      blockers: expect.arrayContaining([
        "Local text runtime launch descriptor requires a non-empty command before scheduler launch.",
        "Local text runtime launch arg 1 must not contain NUL characters.",
        "Local text runtime healthUrl must be an absolute http(s) URL.",
        "Local text runtime startupTimeoutMs must be positive when healthUrl is configured.",
        "Local text runtime idleTimeoutMs must be a non-negative finite integer.",
        "Local text runtime estimatedResidentMemoryBytes must be a non-negative finite integer.",
      ]),
      descriptor: {
        runtimeId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        command: "",
        args: ["serve", "bad\0arg"],
        cwd: "/workspace",
        stateRootPath: `/workspace/${LOCAL_TEXT_RUNTIME_STATE_ROOT}`,
        healthUrl: "file:///tmp/health",
        startupTimeoutMs: 0,
        estimatedResidentMemoryBytes: -1,
      },
    });
  });

  it("acquires a runtime lease only after local text preflight passes", async () => {
    const lease = runtimeLease();
    const runtimeManager = { acquire: vi.fn(async () => lease) };

    const result = await acquireLocalTextDelegationRuntime({
      runtimeManager,
      workspacePath: "/workspace",
      ownerThreadId: "thread-1",
      model: localTextModel(),
      resourceRegistry: registry(policy({
        outcome: "within-limit",
        reason: "Within limit.",
      })),
      launch: {
        runtimeId: "local-text-runtime",
        command: "/runtime/local-text",
        args: ["serve"],
        healthUrl: "http://127.0.0.1:43123/health",
      },
    });

    expect(result).toMatchObject({
      schemaVersion: "ambient-local-text-delegation-runtime-acquire-v1",
      lease,
      plan: {
        acquireInput: {
          runtimeId: "local-text-runtime",
          command: "/runtime/local-text",
        },
      },
    });
    expect(runtimeManager.acquire).toHaveBeenCalledTimes(1);
    expect(runtimeManager.acquire).toHaveBeenCalledWith(result.plan.acquireInput);
  });

  it("unloads idle local model runtimes before acquiring when memory policy requires cleanup", async () => {
    const lease = runtimeLease();
    const runtimeManager = { acquire: vi.fn(async () => lease) };
    const killLocalModelProcess = vi.fn();
    const resourceRegistry = registry(policy({
      outcome: "unload-idle",
      reason: "Projected local-model resident memory exceeds the configured ceiling by 2.0 GiB; unload idle local models before launch.",
      requestedEstimatedResidentMemoryBytes: 6 * gib,
      activeEstimatedResidentMemoryBytes: 12 * gib,
      projectedEstimatedResidentMemoryBytes: 18 * gib,
      maxResidentMemoryBytes: 16 * gib,
      exceededByBytes: 2 * gib,
      unloadCandidateIds: ["idle-local-text"],
    }), [
      idleLocalTextResourceEntry("idle-local-text", 7001),
    ]);

    const result = await acquireLocalTextDelegationRuntime({
      runtimeManager,
      workspacePath: "/workspace",
      ownerThreadId: "thread-1",
      model: localTextModel(),
      resourceRegistry,
      launch: {
        runtimeId: "local-text-runtime",
        command: "/runtime/local-text",
        estimatedResidentMemoryBytes: 6 * gib,
      },
      killLocalModelProcess,
    });

    expect(killLocalModelProcess).toHaveBeenCalledWith(7001, "SIGTERM");
    expect(runtimeManager.acquire).toHaveBeenCalledTimes(1);
    expect(result.plan.preflight).toMatchObject({
      allowed: true,
      blockers: [],
      warnings: expect.arrayContaining(["Unloaded 1 idle local model server before launch."]),
      resourcePolicy: {
        outcome: "unload-idle",
      },
      resourcePolicyEnforcement: {
        allowed: true,
        outcome: "unloaded-idle",
        unload: {
          attemptedIds: ["idle-local-text"],
          stoppedIds: ["idle-local-text"],
          failed: [],
        },
      },
    });
    expect(result.plan.resourcePolicyEnforcement).toMatchObject({
      allowed: true,
      outcome: "unloaded-idle",
    });
  });

  it("keeps approval-gated memory overruns blocked unless an approval callback allows the launch", async () => {
    const resourceRegistry = registry(policy({
      outcome: "ask-to-exceed",
      reason: "Projected local-model resident memory exceeds the configured ceiling by 2.0 GiB; user approval is required to exceed it.",
      requestedEstimatedResidentMemoryBytes: 6 * gib,
      activeEstimatedResidentMemoryBytes: 12 * gib,
      projectedEstimatedResidentMemoryBytes: 18 * gib,
      maxResidentMemoryBytes: 16 * gib,
      exceededByBytes: 2 * gib,
    }));
    const blockedRuntimeManager = { acquire: vi.fn(async () => runtimeLease()) };

    await expect(acquireLocalTextDelegationRuntime({
      runtimeManager: blockedRuntimeManager,
      workspacePath: "/workspace",
      model: localTextModel(),
      resourceRegistry,
      launch: {
        command: "/runtime/local-text",
        estimatedResidentMemoryBytes: 6 * gib,
      },
    })).rejects.toThrow(/user approval is required/);
    expect(blockedRuntimeManager.acquire).not.toHaveBeenCalled();

    const approvedRuntimeManager = { acquire: vi.fn(async () => runtimeLease()) };
    const approveResourceLimitExceed = vi.fn(() => true);
    const approved = await acquireLocalTextDelegationRuntime({
      runtimeManager: approvedRuntimeManager,
      workspacePath: "/workspace",
      model: localTextModel(),
      resourceRegistry,
      launch: {
        command: "/runtime/local-text",
        estimatedResidentMemoryBytes: 6 * gib,
      },
      approveResourceLimitExceed,
    });

    expect(approveResourceLimitExceed).toHaveBeenCalledWith(resourceRegistry.policyDecision);
    expect(approvedRuntimeManager.acquire).toHaveBeenCalledTimes(1);
    expect(approved.plan.preflight).toMatchObject({
      allowed: true,
      warnings: expect.arrayContaining(["User approved exceeding the configured local-model resident-memory ceiling for this launch."]),
      resourcePolicyEnforcement: {
        allowed: true,
        outcome: "ask-to-exceed",
      },
    });
  });

  it("does not acquire a runtime when requested local output exceeds the model max output limit", async () => {
    const runtimeManager = { acquire: vi.fn(async () => runtimeLease()) };

    await expect(acquireLocalTextDelegationRuntime({
      runtimeManager,
      workspacePath: "/workspace",
      model: localTextModel({ maxOutputTokens: 512 }),
      resourceRegistry: registry(policy({
        outcome: "within-limit",
        reason: "Within limit.",
      })),
      launch: {
        command: "/runtime/local-text",
      },
      invocation: {
        prompt: "Summarize briefly.",
        requestedOutputTokens: 1024,
      },
    })).rejects.toThrow(/exceeds model local\/text-4b max output 512 tokens/);
    expect(runtimeManager.acquire).not.toHaveBeenCalled();
  });

  it("does not acquire a runtime when the local launch descriptor is malformed", async () => {
    const runtimeManager = { acquire: vi.fn(async () => runtimeLease()) };

    await expect(acquireLocalTextDelegationRuntime({
      runtimeManager,
      workspacePath: "/workspace",
      model: localTextModel(),
      resourceRegistry: registry(policy({
        outcome: "within-limit",
        reason: "Within limit.",
      })),
      launch: {
        command: "  ",
        healthUrl: "file:///tmp/health",
        startupTimeoutMs: 0,
      },
    })).rejects.toThrow(/requires a non-empty command/);
    expect(runtimeManager.acquire).not.toHaveBeenCalled();

    const plan = planLocalTextDelegationRuntime({
      workspacePath: "/workspace",
      model: localTextModel(),
      resourceRegistry: registry(policy({
        outcome: "within-limit",
        reason: "Within limit.",
      })),
      launch: {
        command: "  ",
        healthUrl: "file:///tmp/health",
        startupTimeoutMs: 0,
      },
    });
    expect(plan.preflight).toMatchObject({
      allowed: false,
      launchReadiness: {
        schemaVersion: "ambient-local-text-runtime-launch-readiness-v1",
        ready: false,
        blockers: expect.arrayContaining([
          "Local text runtime launch descriptor requires a non-empty command before scheduler launch.",
          "Local text runtime healthUrl must be an absolute http(s) URL.",
          "Local text runtime startupTimeoutMs must be positive when healthUrl is configured.",
        ]),
      },
    });
  });

  it("does not acquire a runtime when local text preflight fails", async () => {
    const runtimeManager = { acquire: vi.fn(async () => runtimeLease()) };

    await expect(acquireLocalTextDelegationRuntime({
      runtimeManager,
      workspacePath: "/workspace",
      model: localTextModel({
        locality: "cloud",
      }),
      resourceRegistry: registry(policy({
        outcome: "refuse",
        reason: "Projected local-model resident memory exceeds the configured ceiling.",
      })),
      launch: {
        command: "/runtime/local-text",
      },
    })).rejects.toThrow(/preflight failed/);
    expect(runtimeManager.acquire).not.toHaveBeenCalled();
  });

  it("preserves local text output validation evidence with completion results", async () => {
    const artifactRootPath = await mkdtemp(join(tmpdir(), "ambient-local-text-artifacts-"));
    const release = vi.fn(async () => runtimeRelease());
    const lease = runtimeLease({ release });
    const runtimeManager = { acquire: vi.fn(async () => lease) };
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        model: "local/text-4b",
        messages: [{ role: "user", content: "Summarize the evidence." }],
        stream: false,
        max_tokens: 4096,
      });
      return jsonResponse({
        choices: [
          { message: { content: "Local summary." } },
        ],
      });
    });

    try {
      const result = await completeLocalTextDelegation({
        runtimeManager,
        workspacePath: "/workspace",
        ownerThreadId: "thread-1",
        model: localTextModel(),
        resourceRegistry: registry(policy({
          outcome: "within-limit",
          reason: "Within limit.",
        })),
        launch: {
          runtimeId: "local-text-runtime",
          command: "/runtime/local-text",
          args: ["serve"],
          healthUrl: "http://127.0.0.1:43123/health",
        },
        completion: {
          runId: "run-small",
          prompt: "Summarize the evidence.",
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          artifactRootPath,
        },
        fetchImpl: fetchImpl as typeof fetch,
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-local-text-delegation-completion-v1",
        runtimeAcquisition: {
          schemaVersion: "ambient-local-model-runtime-acquisition-v1",
          source: "started",
          leaseId: "lease-1",
          runtimeId: "local-text-runtime",
          pid: 5001,
          activeLeases: 1,
        },
        runtimeState: {
          pid: 5001,
        },
        runtimeRelease: {
          status: "released",
          leaseId: "lease-1",
          pid: 5001,
          remainingLeases: 0,
        },
        completion: {
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          statusCode: 200,
          outputCharCount: "Local summary.".length,
        },
        outputValidation: {
          schemaVersion: "ambient-local-text-output-validation-v1",
          valid: true,
          contentType: "text/plain",
          outputCharCount: "Local summary.".length,
          previewCharCount: "Local summary.".length,
          textPreview: "Local summary.",
          requiresFullOutputArtifact: false,
          maxInlineChars: 8000,
        },
        artifact: {
          schemaVersion: "ambient-local-text-result-v1",
          runId: "run-small",
          status: "completed",
          partial: false,
          textPreview: "Local summary.",
        },
      });
      expect(result.artifact.fullOutputPath).toBeUndefined();
      expect(runtimeManager.acquire).toHaveBeenCalledTimes(1);
      expect(fetchImpl).toHaveBeenCalledWith(
        "http://127.0.0.1:43123/v1/chat/completions",
        expect.objectContaining({ method: "POST" }),
      );
      expect(release).toHaveBeenCalledTimes(1);
    } finally {
      await rm(artifactRootPath, { recursive: true, force: true });
    }
  });

  it("heartbeats the runtime lease while local text completion is in flight", async () => {
    const artifactRootPath = await mkdtemp(join(tmpdir(), "ambient-local-text-artifacts-"));
    const release = vi.fn(async () => runtimeRelease());
    let lease: LocalModelRuntimeLease;
    const touch = vi.fn(async () => lease.state);
    lease = runtimeLease({ release, touch });
    const runtimeManager = { acquire: vi.fn(async () => lease) };
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchImpl = vi.fn(async () => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));

    vi.useFakeTimers();
    try {
      const resultPromise = completeLocalTextDelegation({
        runtimeManager,
        workspacePath: "/workspace",
        model: localTextModel(),
        resourceRegistry: registry(policy({
          outcome: "within-limit",
          reason: "Within limit.",
        })),
        launch: {
          runtimeId: "local-text-runtime",
          command: "/runtime/local-text",
        },
        completion: {
          runId: "run-heartbeat",
          prompt: "Summarize the evidence.",
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          artifactRootPath,
          runtimeLeaseHeartbeatIntervalMs: 10,
        },
        fetchImpl: fetchImpl as typeof fetch,
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(25);
      expect(touch).toHaveBeenCalledTimes(2);
      resolveFetch?.(jsonResponse({ output_text: "Valid local output." }));
      await expect(resultPromise).resolves.toMatchObject({
        artifact: {
          runId: "run-heartbeat",
          status: "completed",
          textPreview: "Valid local output.",
        },
      });
      expect(release).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      await rm(artifactRootPath, { recursive: true, force: true });
    }
  });

  it("preserves completed local text output when runtime release fails", async () => {
    const artifactRootPath = await mkdtemp(join(tmpdir(), "ambient-local-text-artifacts-"));
    const release = vi.fn(async () => {
      throw new Error("release store unavailable");
    });
    const runtimeManager = { acquire: vi.fn(async () => runtimeLease({ release })) };
    try {
      const result = await completeLocalTextDelegation({
        runtimeManager,
        workspacePath: "/workspace",
        model: localTextModel(),
        resourceRegistry: registry(policy({
          outcome: "within-limit",
          reason: "Within limit.",
        })),
        launch: {
          runtimeId: "local-text-runtime",
          command: "/runtime/local-text",
        },
        completion: {
          runId: "run-release-failed",
          prompt: "Summarize the evidence.",
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          artifactRootPath,
        },
        fetchImpl: async () => jsonResponse({ output_text: "Valid local output." }),
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-local-text-delegation-completion-v1",
        runtimeRelease: {
          status: "failed",
          leaseId: "lease-1",
          pid: 5001,
          error: "release store unavailable",
        },
        outputValidation: {
          valid: true,
          textPreview: "Valid local output.",
        },
        artifact: {
          status: "completed",
          textPreview: "Valid local output.",
        },
      });
      expect(release).toHaveBeenCalledTimes(1);
    } finally {
      await rm(artifactRootPath, { recursive: true, force: true });
    }
  });

  it("writes large local text output as a full artifact under the run root", async () => {
    const artifactRootPath = await mkdtemp(join(tmpdir(), "ambient-local-text-artifacts-"));
    const output = "x".repeat(600);
    const runtimeManager = { acquire: vi.fn(async () => runtimeLease()) };
    try {
      const result = await completeLocalTextDelegation({
        runtimeManager,
        workspacePath: "/workspace",
        model: localTextModel(),
        resourceRegistry: registry(policy({
          outcome: "within-limit",
          reason: "Within limit.",
        })),
        launch: {
          command: "/runtime/local-text",
        },
        completion: {
          runId: "run/large",
          prompt: "Write a long answer.",
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          artifactRootPath,
          maxInlineChars: 256,
        },
        fetchImpl: async () => jsonResponse({ output_text: output }),
      });

      expect(result.artifact).toMatchObject({
        outputCharCount: 600,
        textPreview: `${"x".repeat(253)}...`,
      });
      expect(result.outputValidation).toMatchObject({
        schemaVersion: "ambient-local-text-output-validation-v1",
        valid: true,
        outputCharCount: 600,
        previewCharCount: 256,
        requiresFullOutputArtifact: true,
        maxInlineChars: 256,
      });
      expect(result.artifact.fullOutputPath).toMatch(/run--large\.local-text\.txt$/);
      await expect(readFile(result.artifact.fullOutputPath ?? "", "utf8")).resolves.toBe(output);
    } finally {
      await rm(artifactRootPath, { recursive: true, force: true });
    }
  });

  it("rejects large output artifact paths outside the run root and still releases the lease", async () => {
    const artifactRootPath = await mkdtemp(join(tmpdir(), "ambient-local-text-artifacts-"));
    const release = vi.fn(async () => runtimeRelease());
    const runtimeManager = { acquire: vi.fn(async () => runtimeLease({ release })) };
    try {
      let thrown: unknown;
      try {
        await completeLocalTextDelegation({
          runtimeManager,
          workspacePath: "/workspace",
          model: localTextModel(),
          resourceRegistry: registry(policy({
            outcome: "within-limit",
            reason: "Within limit.",
          })),
          launch: {
            command: "/runtime/local-text",
          },
          completion: {
            runId: "run-escape",
            prompt: "Write a long answer.",
            completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
            artifactRootPath,
            fullOutputPath: join(artifactRootPath, "..", "escaped.txt"),
            maxInlineChars: 256,
          },
          fetchImpl: async () => jsonResponse({ output_text: "x".repeat(600) }),
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).toMatchObject({
        message: expect.stringMatching(/inside the run artifact root/),
      });
      expect(isLocalTextDelegationRuntimeFailureError(thrown)).toBe(true);
      if (!isLocalTextDelegationRuntimeFailureError(thrown)) throw new Error("Expected structured local text failure evidence.");
      expect(thrown.evidence).toMatchObject({
        schemaVersion: "ambient-local-text-delegation-failure-v1",
        runtimeAcquisition: {
          schemaVersion: "ambient-local-model-runtime-acquisition-v1",
          source: "started",
          leaseId: "lease-1",
          runtimeId: "local-text-runtime",
          pid: 5001,
          activeLeases: 1,
        },
        runtimeState: {
          pid: 5001,
        },
        runtimeRelease: {
          status: "released",
          leaseId: "lease-1",
          pid: 5001,
          remainingLeases: 0,
        },
        completion: {
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          statusCode: 200,
          outputCharCount: 600,
        },
        outputValidation: {
          schemaVersion: "ambient-local-text-output-validation-v1",
          valid: true,
          outputCharCount: 600,
          requiresFullOutputArtifact: true,
          maxInlineChars: 256,
        },
      });
      expect(release).toHaveBeenCalledTimes(1);
    } finally {
      await rm(artifactRootPath, { recursive: true, force: true });
    }
  });

  it("rejects invalid local text output with release evidence after acquire", async () => {
    const artifactRootPath = await mkdtemp(join(tmpdir(), "ambient-local-text-artifacts-"));
    const release = vi.fn(async () => runtimeRelease());
    const runtimeManager = { acquire: vi.fn(async () => runtimeLease({ release })) };
    try {
      let thrown: unknown;
      try {
        await completeLocalTextDelegation({
          runtimeManager,
          workspacePath: "/workspace",
          model: localTextModel(),
          resourceRegistry: registry(policy({
            outcome: "within-limit",
            reason: "Within limit.",
          })),
          launch: {
            command: "/runtime/local-text",
          },
          completion: {
            runId: "run-empty",
            prompt: "Write an answer.",
            completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
            artifactRootPath,
          },
          fetchImpl: async () => jsonResponse({ output_text: "   " }),
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).toMatchObject({
        message: "Local text delegation output is empty.",
      });
      expect(isLocalTextDelegationRuntimeFailureError(thrown)).toBe(true);
      if (!isLocalTextDelegationRuntimeFailureError(thrown)) throw new Error("Expected structured local text failure evidence.");
      expect(thrown.evidence).toMatchObject({
        schemaVersion: "ambient-local-text-delegation-failure-v1",
        runtimeRelease: {
          status: "released",
          leaseId: "lease-1",
        },
        outputValidation: {
          schemaVersion: "ambient-local-text-output-validation-v1",
          valid: false,
          reason: "Local text delegation output is empty.",
        },
      });
      expect(release).toHaveBeenCalledTimes(1);
    } finally {
      await rm(artifactRootPath, { recursive: true, force: true });
    }
  });

  it("preserves invalid-output failure evidence when runtime release also fails", async () => {
    const artifactRootPath = await mkdtemp(join(tmpdir(), "ambient-local-text-artifacts-"));
    const release = vi.fn(async () => {
      throw new Error("release store unavailable");
    });
    const runtimeManager = { acquire: vi.fn(async () => runtimeLease({ release })) };
    try {
      let thrown: unknown;
      try {
        await completeLocalTextDelegation({
          runtimeManager,
          workspacePath: "/workspace",
          model: localTextModel(),
          resourceRegistry: registry(policy({
            outcome: "within-limit",
            reason: "Within limit.",
          })),
          launch: {
            command: "/runtime/local-text",
          },
          completion: {
            runId: "run-empty-release-failed",
            prompt: "Write an answer.",
            completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
            artifactRootPath,
          },
          fetchImpl: async () => jsonResponse({ output_text: "   " }),
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).toMatchObject({
        message: "Local text delegation output is empty.",
      });
      expect(isLocalTextDelegationRuntimeFailureError(thrown)).toBe(true);
      if (!isLocalTextDelegationRuntimeFailureError(thrown)) throw new Error("Expected structured local text failure evidence.");
      expect(thrown.evidence).toMatchObject({
        runtimeRelease: {
          status: "failed",
          leaseId: "lease-1",
          pid: 5001,
          error: "release store unavailable",
        },
        outputValidation: {
          valid: false,
          reason: "Local text delegation output is empty.",
        },
      });
      expect(release).toHaveBeenCalledTimes(1);
    } finally {
      await rm(artifactRootPath, { recursive: true, force: true });
    }
  });

  it("extracts local text from common completion response shapes", () => {
    expect(extractLocalTextCompletionOutput({ text: "plain text" })).toBe("plain text");
    expect(extractLocalTextCompletionOutput({ choices: [{ text: "choice text" }] })).toBe("choice text");
    expect(extractLocalTextCompletionOutput({
      output: [
        { content: [{ text: "part one " }, { text: "part two" }] },
      ],
    })).toBe("part one part two");
  });
});

function localTextModel(overrides: Partial<AmbientModelRuntimeProfile> = {}): AmbientModelRuntimeProfile {
  return {
    schemaVersion: "ambient-model-runtime-profile-v1",
    profileId: "local:local/text-4b",
    providerId: "local",
    modelId: "local/text-4b",
    label: "Local Text 4B",
    selectableAsMain: true,
    selectableAsSubagent: true,
    available: true,
    contextWindowTokens: 16_384,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    toolUse: "none",
    structuredOutput: "none",
    supportsVision: false,
    supportsAudio: false,
    locality: "local",
    costClass: "local",
    trustClass: "local-user-managed",
    privacyLabel: "Local user-managed text model",
    memoryClass: "small-local",
    providerQuirks: [],
    ...overrides,
  };
}

function registry(
  decision: LocalModelResourcePolicyDecision,
  entries: LocalModelResourceRegistryEntry[] = [],
): LocalModelResourceRegistrySnapshot {
  const maxResidentMemoryBytes = decision.maxResidentMemoryBytes ?? (decision.outcome === "unlimited" ? undefined : decision.outcome === "within-limit" ? 16 * gib : 10 * gib);
  const memoryLimitBehavior = decision.outcome === "warn" || decision.outcome === "refuse" || decision.outcome === "unload-idle" || decision.outcome === "ask-to-exceed"
    ? decision.outcome
    : "warn";
  return {
    schemaVersion: "ambient-local-model-resource-registry-v1",
    capturedAt: "2026-06-05T00:00:00.000Z",
    settings: {
      schemaVersion: "ambient-local-model-resource-settings-v1",
      ...(maxResidentMemoryBytes !== undefined ? { maxResidentMemoryBytes } : {}),
      memoryLimitBehavior,
    },
    entries,
    activeCount: entries.filter((entry) => entry.running).length,
    activeEstimatedResidentMemoryBytes: decision.activeEstimatedResidentMemoryBytes,
    ...(decision.activeActualResidentMemoryBytes !== undefined ? { activeActualResidentMemoryBytes: decision.activeActualResidentMemoryBytes } : {}),
    policyDecision: decision,
  };
}

function idleLocalTextResourceEntry(id: string, pid: number): LocalModelResourceRegistryEntry {
  return {
    capability: "local-text",
    id,
    pid,
    running: true,
    statePath: `/workspace/.ambient/local-model-runtime/${id}/state.json`,
    ownerThreadId: "previous-thread",
    modelId: "local/text-4b",
    profileId: "local:local/text-4b",
    estimatedResidentMemoryBytes: 8 * gib,
    startedAt: "2026-06-05T00:00:00.000Z",
    lastUsedAt: "2026-06-05T00:10:00.000Z",
    idleTimeMs: 600000,
  };
}

function policy(input: Partial<LocalModelResourcePolicyDecision> & {
  outcome: LocalModelResourcePolicyDecision["outcome"];
  reason: string;
}): LocalModelResourcePolicyDecision {
  const activeEstimatedResidentMemoryBytes = input.activeEstimatedResidentMemoryBytes ?? 8 * gib;
  const requestedEstimatedResidentMemoryBytes = input.requestedEstimatedResidentMemoryBytes ?? 4 * gib;
  const projectedEstimatedResidentMemoryBytes = input.projectedEstimatedResidentMemoryBytes ?? activeEstimatedResidentMemoryBytes + requestedEstimatedResidentMemoryBytes;
  const maxResidentMemoryBytes = input.maxResidentMemoryBytes ?? (input.outcome === "unlimited" ? undefined : input.outcome === "within-limit" ? 16 * gib : 10 * gib);
  const exceededByBytes = input.exceededByBytes ?? (maxResidentMemoryBytes !== undefined && projectedEstimatedResidentMemoryBytes > maxResidentMemoryBytes
    ? projectedEstimatedResidentMemoryBytes - maxResidentMemoryBytes
    : undefined);
  return {
    requestedEstimatedResidentMemoryBytes,
    activeEstimatedResidentMemoryBytes,
    projectedEstimatedResidentMemoryBytes,
    ...(maxResidentMemoryBytes !== undefined ? { maxResidentMemoryBytes } : {}),
    ...(exceededByBytes !== undefined ? { exceededByBytes } : {}),
    unloadCandidateIds: [],
    ...input,
  };
}

function runtimeRelease(overrides: Partial<LocalModelRuntimeReleaseResult> = {}): LocalModelRuntimeReleaseResult {
  return {
    status: "released",
    leaseId: "lease-1",
    pid: 5001,
    remainingLeases: 0,
    ...overrides,
  };
}

function runtimeLease(options: {
  release?: () => Promise<LocalModelRuntimeReleaseResult>;
  touch?: () => Promise<LocalModelRuntimeLease["state"]>;
} = {}): LocalModelRuntimeLease {
  const state = {
    schemaVersion: "ambient-local-model-runtime-state-v1" as const,
    runtimeId: "local-text-runtime",
    providerId: "local",
    modelId: "local/text-4b",
    pid: 5001,
    status: "running" as const,
    command: ["/runtime/local-text", "serve"],
    cwd: "/workspace",
    stateDir: "/workspace/.ambient/local-model-runtime/local-text-runtime",
    stdoutPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stdout.log",
    stderrPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stderr.log",
    startedAt: "2026-06-05T00:00:00.000Z",
    lastUsedAt: "2026-06-05T00:00:00.000Z",
    idleTimeoutMs: 300000,
  };
  const runtimeLeaseRecord = {
    schemaVersion: "ambient-local-runtime-lease-v1" as const,
    leaseId: "lease-1",
    modelRuntimeId: state.runtimeId,
    modelId: state.modelId,
    providerId: state.providerId,
    capabilityKind: "local-text" as const,
    pid: state.pid,
    acquiredAt: state.lastUsedAt,
    lastHeartbeatAt: state.lastUsedAt,
    status: "running" as const,
  };
  return {
    leaseId: "lease-1",
    state,
    acquisition: {
      schemaVersion: "ambient-local-model-runtime-acquisition-v1",
      source: "started",
      leaseId: "lease-1",
      runtimeId: state.runtimeId,
      providerId: state.providerId,
      modelId: state.modelId,
      pid: state.pid,
      acquiredAt: state.lastUsedAt,
      activeLeases: 1,
      runtimeLease: runtimeLeaseRecord,
    },
    runtimeLease: runtimeLeaseRecord,
    release: options.release ?? (async () => runtimeRelease()),
    touch: options.touch ?? (async () => state),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
