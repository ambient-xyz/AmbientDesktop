import { describe, expect, it } from "vitest";
import { AmbientProjectBoardSynthesisProvider } from "./projectBoardSynthesisProvider";

describe("AmbientProjectBoardSynthesisProvider direct transport", () => {
  it("calls Ambient chat completions and normalizes a synthesis draft", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const progress: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Live refined board.",
                    goal: "Build a playable WebGL spaceship slice.",
                    currentState: "The project has architecture, gameplay notes, and tests.",
                    targetUser: "Browser game prototype developer.",
                    qualityBar: "Each card needs proof.",
                    assumptions: ["Keyboard first."],
                    questions: ["Should mobile touch controls ship in the first slice?"],
                    sourceNotes: ["architecture.md defines state/render separation."],
                    cards: [
                      {
                        sourceId: "shell-bootstrap",
                        title: "Bootstrap Three.js shell",
                        description: "Create a nonblank canvas and render loop.",
                        candidateStatus: "ready",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["webgl"],
                        blockedBy: [],
                        acceptanceCriteria: ["Canvas renders a nonblank scene."],
                        testPlan: {
                          unit: [],
                          integration: ["Run the app."],
                          visual: ["Capture a canvas screenshot."],
                          manual: ["Resize the window."],
                        },
                        sourceRefs: ["docs/architecture.md"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Starfall Courier",
      sources: [
        {
          kind: "architecture_artifact",
          title: "Architecture",
          summary: "Three.js render loop and state boundaries.",
          path: "docs/architecture.md",
          relevance: 92,
        },
      ],
      refinement: {
        previousDraft: {
          summary: "Previous board.",
          goal: "Build a WebGL spaceship game.",
          currentState: "Ambiguous controls and pacing.",
          targetUser: "Browser players.",
          qualityBar: "Proof required.",
          assumptions: ["Controls are undecided."],
          questions: ["Arcade or inertia controls?"],
          sourceNotes: ["gameplay-notes.md conflicts."],
          cards: [
            {
              sourceId: "synthesis:controls",
              title: "Implement controls",
              description: "Choose and implement ship controls.",
              candidateStatus: "needs_clarification",
              priority: 2,
              phase: "Gameplay",
              labels: ["controls"],
              blockedBy: [],
              acceptanceCriteria: ["Ship movement is playable."],
              testPlan: { unit: ["Test controls."], integration: [], visual: [], manual: [] },
              sourceRefs: ["docs/gameplay-notes.md"],
            },
          ],
        },
        answers: [{ question: "Arcade or inertia controls?", answer: "Use arcade controls for the first playable slice." }],
      },
      onProgress: (event) => progress.push(event.stage),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://ambient.example/v1/chat/completions");
    expect(calls[0].body.stream).toBe(true);
    expect(calls[0].body).not.toHaveProperty("reasoning");
    expect(JSON.stringify(calls[0].body)).toContain("project-board planning contract");
    expect(JSON.stringify(calls[0].body)).toContain("Project: Starfall Courier");
    expect(JSON.stringify(calls[0].body)).toContain("Previous PM Review proposal or deterministic baseline to refine");
    expect(JSON.stringify(calls[0].body)).toContain("Use arcade controls for the first playable slice.");
    expect(JSON.stringify(calls[0].body)).toContain("Operation overlay: Whole Board Synthesis");
    expect(result.draft.cards[0]).toMatchObject({
      sourceId: "synthesis:ux-mock-approval",
      title: "Create UX mock for approval",
      candidateStatus: "ready_to_create",
      testPlan: expect.objectContaining({ visual: ["Capture desktop and narrow viewport screenshots of the mock for review."] }),
    });
    expect(result.draft.cards[1]).toMatchObject({
      sourceId: "synthesis:shell-bootstrap",
      title: "Bootstrap Three.js shell",
      candidateStatus: "needs_clarification",
      blockedBy: expect.arrayContaining(["synthesis:ux-mock-approval"]),
      testPlan: expect.objectContaining({ visual: ["Capture a canvas screenshot."] }),
    });
    expect(progress).toEqual(["model_request", "model_response", "schema_validation"]);
    expect(result.telemetry).toMatchObject({
      promptCharCount: expect.any(Number),
      responseCharCount: expect.any(Number),
      cardCount: 2,
      questionCount: 1,
    });
    expect(result.telemetry.promptCharCount).toBeGreaterThan(1000);
    expect(result.telemetry.responseCharCount).toBeGreaterThan(100);
  });

  it("aborts direct-chat compatibility requests from the caller signal", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        requestSignal = init?.signal as AbortSignal | undefined;
        controller.abort(new Error("Direct pause abort"));
        if (requestSignal?.aborted) throw requestSignal.reason;
        throw new Error("Expected direct request signal to abort.");
      },
    });

    await expect(
      provider.synthesizeWithTelemetry({
        projectName: "Abort Board",
        signal: controller.signal,
        sources: [
          {
            kind: "functional_spec",
            title: "Spec",
            summary: "Create a simple board.",
            path: "SPEC.md",
            relevance: 90,
          },
        ],
      }),
    ).rejects.toThrow("Direct pause abort");
    expect(requestSignal?.aborted).toBe(true);
  });

  it("streams response character progress before validating the final draft", async () => {
    const draft = JSON.stringify({
      summary: "Streamed board.",
      goal: "Build the game.",
      currentState: "Spec exists.",
      targetUser: "Player.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: ["README contains the design."],
      cards: [
        {
          sourceId: "synthesis:streamed-card",
          title: "Implement streamed card",
          description: "Card arrived over SSE.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["game"],
          blockedBy: [],
          acceptanceCriteria: ["Done condition exists."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
          sourceRefs: ["README.md"],
        },
      ],
    });
    const chunks = [draft.slice(0, 80), draft.slice(80)];
    const progress: Array<{ stage: string; chars?: number }> = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              for (const chunk of chunks) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`));
              }
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Stream Test",
      sources: [{ kind: "functional_spec", title: "README", summary: "Game spec.", path: "README.md", relevance: 90 }],
      onProgress: (event) => progress.push({ stage: event.stage, chars: event.responseCharCount }),
    });

    expect(result.draft.cards[0].title).toBe("Implement streamed card");
    expect(result.telemetry.responseCharCount).toBe(draft.length);
    expect(progress.some((event) => event.stage === "model_response" && event.chars === draft.length)).toBe(true);
  });

  it("can disable Ambient reasoning with the official reasoning configuration", async () => {
    const bodies: Record<string, unknown>[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      reasoning: false,
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Fast board.",
                    goal: "Build the game.",
                    currentState: "Spec exists.",
                    targetUser: "Player.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: [],
                    cards: [
                      {
                        sourceId: "synthesis:fast-card",
                        title: "Implement fast card",
                        description: "Card generated without reasoning.",
                        candidateStatus: "ready_to_create",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["fast"],
                        blockedBy: [],
                        acceptanceCriteria: ["Done condition exists."],
                        testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["README.md"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    await provider.synthesizeWithTelemetry({
      projectName: "No Reasoning Test",
      sources: [{ kind: "functional_spec", title: "README", summary: "Game spec.", path: "README.md", relevance: 90 }],
    });

    expect(bodies[0]).toMatchObject({ reasoning: { effort: "none", enabled: false, exclude: true }, stream: true });
    expect(bodies[0]).not.toHaveProperty("enable_thinking");
  });

  it("can cap Ambient reasoning effort and reasoning tokens for faster board synthesis experiments", async () => {
    const bodies: Record<string, unknown>[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      reasoning: { effort: "low", max_tokens: 750, exclude: true, enabled: true },
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Capped board.",
                    goal: "Build the game.",
                    currentState: "Spec exists.",
                    targetUser: "Player.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: [],
                    cards: [
                      {
                        sourceId: "synthesis:capped-card",
                        title: "Implement capped card",
                        description: "Card generated with capped reasoning.",
                        candidateStatus: "ready_to_create",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["fast"],
                        blockedBy: [],
                        acceptanceCriteria: ["Done condition exists."],
                        testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["README.md"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    await provider.synthesizeWithTelemetry({
      projectName: "Capped Reasoning Test",
      sources: [{ kind: "functional_spec", title: "README", summary: "Game spec.", path: "README.md", relevance: 90 }],
    });

    expect(bodies[0]).toMatchObject({ reasoning: { effort: "low", max_tokens: 750, exclude: true, enabled: true }, stream: true });
    expect(bodies[0]).not.toHaveProperty("thinking_budget");
  });

  it("treats Ambient streaming activity as the synthesis timeout heartbeat", async () => {
    const draft = JSON.stringify({
      summary: "Idle-timeout board.",
      goal: "Build the game.",
      currentState: "Spec exists.",
      targetUser: "Player.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:heartbeat-card",
          title: "Implement heartbeat card",
          description: "Card arrived across multiple active stream events.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["game"],
          blockedBy: [],
          acceptanceCriteria: ["Done condition exists."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
          sourceRefs: ["README.md"],
        },
      ],
    });
    const chunks = [draft.slice(0, 60), draft.slice(60, 120), draft.slice(120)];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      streamIdleTimeoutMs: 100,
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              void (async () => {
                for (const chunk of chunks) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`));
                  await new Promise((resolve) => setTimeout(resolve, 45));
                }
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
              })().catch((error) => controller.error(error));
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Heartbeat Test",
      sources: [{ kind: "functional_spec", title: "README", summary: "Game spec.", path: "README.md", relevance: 90 }],
    });

    expect(result.draft.cards[0].title).toBe("Implement heartbeat card");
    expect(result.telemetry.responseCharCount).toBe(draft.length);
  });

  it("fails with a clear idle-timeout error when Ambient streaming stalls", async () => {
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      streamIdleTimeoutMs: 10,
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: '{"summary":' } }] })}\n\n`));
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
    });

    await expect(
      provider.synthesizeWithTelemetry({
        projectName: "Stall Test",
        sources: [{ kind: "functional_spec", title: "README", summary: "Game spec.", path: "README.md", relevance: 90 }],
      }),
    ).rejects.toThrow(/stream stalled/);
  });

  it("fails when Ambient never starts a project-board synthesis stream", async () => {
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      streamIdleTimeoutMs: 10,
      fetchImpl: async () => new Promise<Response>(() => undefined),
    });

    await expect(
      provider.synthesizeWithTelemetry({
        projectName: "No Stream Test",
        sources: [{ kind: "functional_spec", title: "README", summary: "Game spec.", path: "README.md", relevance: 90 }],
      }),
    ).rejects.toThrow(/stalled before streaming began/);
  });
});
