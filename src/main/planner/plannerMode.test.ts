import { describe, expect, it } from "vitest";
import type { PlannerPlanArtifact } from "../../shared/types";
import {
  applyPlannerDurableRevisionResponse,
  classifyPlannerToolPermission,
  extractPlannerDurableRevisionResponse,
  extractPlannerPlanArtifactFields,
  isPlannerModeAllowedTool,
  isPlannerSafeBashCommand,
  plannerModeToolsForWorkflowPlanEditIntent,
  validatePlannerPlanArtifactContent,
} from "./plannerMode";

describe("isPlannerSafeBashCommand", () => {
  it("allows local read-only inspection commands", () => {
    expect(isPlannerSafeBashCommand("rg -n Planner src")).toBe(true);
    expect(isPlannerSafeBashCommand("git diff -- src/main/index.ts")).toBe(true);
    expect(isPlannerSafeBashCommand("sed -n '1,40p' src/main/index.ts")).toBe(true);
  });

  it("blocks mutation, network, test, and execution commands", () => {
    expect(isPlannerSafeBashCommand("npm test")).toBe(false);
    expect(isPlannerSafeBashCommand("curl https://example.test")).toBe(false);
    expect(isPlannerSafeBashCommand("node scripts/migrate.js")).toBe(false);
    expect(isPlannerSafeBashCommand("git checkout -b feature")).toBe(false);
    expect(isPlannerSafeBashCommand("echo value > file.txt")).toBe(false);
  });
});

describe("isPlannerModeAllowedTool", () => {
  it("allows read-only capability builder planning", () => {
    expect(isPlannerModeAllowedTool("ambient_capability_builder_plan")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_capability_builder_preview")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_capability_builder_history")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_capability_builder_update_plan")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_capability_builder_repair_plan")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_capability_builder_removal_plan")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_capability_builder_apply_repair")).toBe(false);
    expect(isPlannerModeAllowedTool("ambient_capability_builder_unregister")).toBe(false);
    expect(isPlannerModeAllowedTool("ambient_capability_builder_scaffold")).toBe(false);
    expect(isPlannerModeAllowedTool("ambient_capability_builder_install_deps")).toBe(false);
    expect(isPlannerModeAllowedTool("ambient_capability_builder_validate")).toBe(false);
    expect(isPlannerModeAllowedTool("ambient_capability_builder_register")).toBe(false);
  });

  it("allows read-only voice status and voice list tools", () => {
    expect(isPlannerModeAllowedTool("ambient_voice_status")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_voice_list_voices")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_voice_clone_plan")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_voice_refresh_voices")).toBe(false);
    expect(isPlannerModeAllowedTool("ambient_voice_select")).toBe(false);
    expect(isPlannerModeAllowedTool("ambient_voice_policy_update")).toBe(false);
    expect(isPlannerModeAllowedTool("ambient_voice_test")).toBe(false);
  });

  it("allows read-only STT status but blocks STT writes and provider tests", () => {
    expect(isPlannerModeAllowedTool("ambient_stt_status")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_stt_select")).toBe(false);
    expect(isPlannerModeAllowedTool("ambient_stt_policy_update")).toBe(false);
    expect(isPlannerModeAllowedTool("ambient_stt_test")).toBe(false);
  });

  it("allows MiniCPM-V visual analysis but blocks provider setup in Planner Mode", () => {
    expect(isPlannerModeAllowedTool("ambient_visual_minicpm_setup")).toBe(false);
    expect(isPlannerModeAllowedTool("ambient_visual_analyze")).toBe(true);
  });

  it("allows read-only Local Deep Research setup status in Planner Mode", () => {
    expect(isPlannerModeAllowedTool("ambient_local_deep_research_setup")).toBe(true);
  });

  it("allows read-only messaging runtime status tools", () => {
    expect(isPlannerModeAllowedTool("ambient_messaging_headless_ux_inventory")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_runtime_surface_snapshot")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_messaging_gateway_status")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_messaging_remote_surface_activation_plan")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_messaging_remote_surface_provider_support_plan")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_messaging_telegram_owner_loop_activation_plan")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_messaging_telegram_bridge_poll_preview")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_messaging_telegram_bridge_polling_status")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_messaging_telegram_bridge_polling_preview")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_messaging_telegram_bridge_poll_apply")).toBe(false);
    expect(isPlannerModeAllowedTool("ambient_messaging_telegram_bridge_polling_apply")).toBe(false);
    expect(isPlannerModeAllowedTool("ambient_messaging_remote_surface_command_apply")).toBe(false);
  });

  it("allows workflow-native inspection, review-only proposal tools, and foreground run-setting previews", () => {
    expect(isPlannerModeAllowedTool("workflow_current_context")).toBe(true);
    expect(isPlannerModeAllowedTool("workflow_get_artifact")).toBe(true);
    expect(isPlannerModeAllowedTool("workflow_get_source")).toBe(true);
    expect(isPlannerModeAllowedTool("workflow_get_run_trace")).toBe(true);
    expect(isPlannerModeAllowedTool("workflow_get_versions")).toBe(true);
    expect(isPlannerModeAllowedTool("workflow_capability_search")).toBe(true);
    expect(isPlannerModeAllowedTool("workflow_capability_describe")).toBe(true);
    expect(isPlannerModeAllowedTool("workflow_propose_manifest_revision")).toBe(true);
    expect(isPlannerModeAllowedTool("workflow_propose_revision")).toBe(true);
    expect(isPlannerModeAllowedTool("workflow_validate_revision")).toBe(true);
    expect(isPlannerModeAllowedTool("workflow_explain_revision_diff")).toBe(true);
    expect(isPlannerModeAllowedTool("workflow_update_run_settings")).toBe(true);
    expect(isPlannerModeAllowedTool("workflow_apply_revision")).toBe(false);
    expect(isPlannerModeAllowedTool("workflow_run_preview")).toBe(false);
    expect(isPlannerModeAllowedTool("workflow_run_version")).toBe(false);
    expect(isPlannerModeAllowedTool("workflow_restore_version")).toBe(false);
  });

  it("narrows workflow proposal and run-setting tools by Plan/Edit intent", () => {
    const tools = [
      "workflow_current_context",
      "workflow_get_artifact",
      "workflow_propose_manifest_revision",
      "workflow_propose_revision",
      "workflow_validate_revision",
      "workflow_explain_revision_diff",
      "workflow_update_run_settings",
    ];

    expect(plannerModeToolsForWorkflowPlanEditIntent(tools, "manifest_limits")).toEqual([
      "workflow_current_context",
      "workflow_get_artifact",
      "workflow_propose_manifest_revision",
      "workflow_validate_revision",
      "workflow_explain_revision_diff",
    ]);
    expect(plannerModeToolsForWorkflowPlanEditIntent(tools, "run_settings")).toEqual([
      "workflow_current_context",
      "workflow_get_artifact",
      "workflow_propose_manifest_revision",
      "workflow_validate_revision",
      "workflow_explain_revision_diff",
      "workflow_update_run_settings",
    ]);
    expect(plannerModeToolsForWorkflowPlanEditIntent(tools, "question")).toEqual([
      "workflow_current_context",
      "workflow_get_artifact",
      "workflow_validate_revision",
      "workflow_explain_revision_diff",
    ]);
    expect(plannerModeToolsForWorkflowPlanEditIntent(tools, "graph_source_change")).toEqual([
      "workflow_current_context",
      "workflow_get_artifact",
      "workflow_propose_manifest_revision",
      "workflow_propose_revision",
      "workflow_validate_revision",
      "workflow_explain_revision_diff",
    ]);
  });

  it("allows read-only search preference status but blocks search preference writes", () => {
    expect(isPlannerModeAllowedTool("ambient_provider_catalog")).toBe(true);
    expect(isPlannerModeAllowedTool("web_research_status")).toBe(true);
    expect(isPlannerModeAllowedTool("web_research_provider_search")).toBe(true);
    expect(isPlannerModeAllowedTool("web_research_provider_describe")).toBe(true);
    expect(isPlannerModeAllowedTool("web_research_search")).toBe(false);
    expect(isPlannerModeAllowedTool("web_research_fetch")).toBe(false);
    expect(isPlannerModeAllowedTool("web_research_preferences_update")).toBe(false);
    expect(isPlannerModeAllowedTool("ambient_search_preference_status")).toBe(true);
    expect(isPlannerModeAllowedTool("ambient_search_preference_update")).toBe(false);
  });
});

describe("classifyPlannerToolPermission", () => {
  it("allows foreground workflow run-setting previews but blocks persistent settings mutation", () => {
    expect(
      classifyPlannerToolPermission({
        threadId: "thread-1",
        toolName: "workflow_update_run_settings",
        toolInput: { workflowThreadId: "workflow-1", action: "preview_foreground", idleTimeoutMs: 300000 },
      }),
    ).toEqual({ action: "allow" });
    expect(
      classifyPlannerToolPermission({
        threadId: "thread-1",
        toolName: "workflow_update_run_settings",
        toolInput: { workflowThreadId: "workflow-1", action: "apply_persistent", idleTimeoutMs: 300000 },
      }),
    ).toMatchObject({ action: "deny" });
  });
});

describe("extractPlannerPlanArtifactFields", () => {
  it("extracts title, summary, steps, risks, questions, and verification from markdown plans", () => {
    const fields = extractPlannerPlanArtifactFields(`# Planner Mode

This plan adds a read-only planning mode.

## Stages
1. Add persisted thread mode.
2. Gate tools in the runtime.

## Risks
- Existing sessions may have stale active tools.

## Open Questions
- Should browser_search be enabled?

## Verification
- Run permission policy tests.

\`\`\`ambient-planner-questions
{
  "questions": [
    {
      "id": "browser-access",
      "question": "Should Planner Mode allow browser navigation?",
      "recommendedOptionId": "allow-browser-nav",
      "required": false,
      "options": [
        {
          "id": "allow-browser-nav",
          "label": "Allow browser_nav",
          "description": "Allows read-only website inspection while planning."
        },
        {
          "id": "block-browser-nav",
          "label": "Block browser_nav",
          "description": "Keeps planning local-only, but limits research."
        }
      ]
    }
  ]
}
\`\`\`
`);

    expect(fields.title).toBe("Planner Mode");
    expect(fields.summary).toBe("This plan adds a read-only planning mode.");
    expect(fields.steps.map((step) => step.title)).toEqual(["Add persisted thread mode.", "Gate tools in the runtime."]);
    expect(fields.risks).toEqual(["Existing sessions may have stale active tools."]);
    expect(fields.openQuestions).toEqual(["Should browser_search be enabled?"]);
    expect(fields.verification).toEqual(["Run permission policy tests."]);
    expect(fields.content).not.toContain("ambient-planner-questions");
    expect(fields.decisionQuestions).toEqual([
      {
        id: "browser-access",
        question: "Should Planner Mode allow browser navigation?",
        recommendedOptionId: "allow-browser-nav",
        required: false,
        options: [
          {
            id: "allow-browser-nav",
            label: "Allow browser_nav",
            description: "Allows read-only website inspection while planning.",
          },
          {
            id: "block-browser-nav",
            label: "Block browser_nav",
            description: "Keeps planning local-only, but limits research.",
          },
        ],
      },
    ]);
  });

  it("extracts and strips tag-wrapped planner questions from json fences", () => {
    const fields = extractPlannerPlanArtifactFields(`# Game Plan

Build the app in three stages.

## Plan
1. Scaffold the renderer.
2. Add game systems.

\`\`\`json
<ambient-planner-questions>
{
  "questions": [
    {
      "id": "build-tool",
      "question": "Which build tool and language should the project use?",
      "recommendedOptionId": "vite-ts",
      "required": true,
      "options": [
        {
          "id": "vite-ts",
          "label": "Vite + TypeScript",
          "description": "Fast HMR and type safety for structured game logic."
        },
        {
          "id": "vite-js",
          "label": "Vite + JavaScript",
          "description": "Simpler setup, but less protection for larger systems."
        }
      ]
    }
  ]
}
</ambient-planner-questions>
\`\`\`

Confirm the choices before implementation.`);

    expect(fields.content).not.toContain("```json");
    expect(fields.content).not.toContain("ambient-planner-questions");
    expect(fields.content).toContain("Confirm the choices before implementation.");
    expect(fields.decisionQuestions).toEqual([
      {
        id: "build-tool",
        question: "Which build tool and language should the project use?",
        recommendedOptionId: "vite-ts",
        required: true,
        options: [
          {
            id: "vite-ts",
            label: "Vite + TypeScript",
            description: "Fast HMR and type safety for structured game logic.",
          },
          {
            id: "vite-js",
            label: "Vite + JavaScript",
            description: "Simpler setup, but less protection for larger systems.",
          },
        ],
      },
    ]);
  });

  it("extracts and strips planner questions from plain json fences", () => {
    const fields = extractPlannerPlanArtifactFields(`# Reporting Plan

Build the report flow.

\`\`\`json
{
  "questions": [
    {
      "id": "export-format",
      "question": "Which export format should the first implementation target?",
      "recommendedOptionId": "html",
      "required": true,
      "options": [
        {
          "id": "html",
          "label": "HTML",
          "description": "Fastest to preview and validate in the internal browser."
        },
        {
          "id": "pdf",
          "label": "PDF",
          "description": "Closer to sharing workflows, but needs rendering/export work."
        }
      ]
    }
  ]
}
\`\`\``);

    expect(fields.content).toBe("# Reporting Plan\n\nBuild the report flow.");
    expect(fields.decisionQuestions).toEqual([
      expect.objectContaining({
        id: "export-format",
        question: "Which export format should the first implementation target?",
        recommendedOptionId: "html",
        required: true,
      }),
    ]);
  });

  it("extracts and strips planner questions from a bare marker followed by JSON", () => {
    const fields = extractPlannerPlanArtifactFields(`# PAC-MAN Modern Plan

Build a modern arcade update.

## Open Questions

ambient-planner-questions
{
  "questions": [
    {
      "id": "platform-target",
      "question": "What is the primary target platform?",
      "recommendedOptionId": "web-first",
      "required": true,
      "options": [
        {
          "id": "web-first",
          "label": "Web-first",
          "description": "Broadest reach and fastest iteration."
        },
        {
          "id": "desktop-first",
          "label": "Desktop-first",
          "description": "More native packaging work but better desktop distribution."
        }
      ]
    },
    {
      "id": "art-approach",
      "question": "What art asset approach should the game use?",
      "recommendedOptionId": "procedural-neon",
      "required": true,
      "options": [
        {
          "id": "procedural-neon",
          "label": "Procedural neon",
          "description": "Code-generated visuals with a smaller bundle."
        },
        {
          "id": "sprite-retro",
          "label": "Sprite retro",
          "description": "Classic look with more asset creation effort."
        }
      ]
    }
  ]
}

## Summary

Answer these before scaffolding.`);

    expect(fields.content).not.toContain("ambient-planner-questions");
    expect(fields.content).not.toContain("platform-target");
    expect(fields.content).toContain("## Summary");
    expect(fields.decisionQuestions.map((question) => question.id)).toEqual(["platform-target", "art-approach"]);
    expect(fields.decisionQuestions[0]).toEqual(
      expect.objectContaining({
        question: "What is the primary target platform?",
        recommendedOptionId: "web-first",
        required: true,
      }),
    );
  });

  it("extracts and strips bare-marker planner questions from json fences", () => {
    const fields = extractPlannerPlanArtifactFields(`# Planner Plan

\`\`\`json
ambient-planner-questions
{
  "questions": [
    {
      "id": "scope",
      "question": "Which scope should the plan optimize for?",
      "recommendedOptionId": "focused",
      "required": true,
      "options": [
        {
          "id": "focused",
          "label": "Focused",
          "description": "Keeps the first pass small."
        },
        {
          "id": "broad",
          "label": "Broad",
          "description": "Covers more cases with more risk."
        }
      ]
    }
  ]
}
\`\`\``);

    expect(fields.content).toBe("# Planner Plan");
    expect(fields.decisionQuestions).toEqual([
      expect.objectContaining({
        id: "scope",
        question: "Which scope should the plan optimize for?",
        recommendedOptionId: "focused",
      }),
    ]);
  });

  it("extracts decisionQuestions from a top-level json object and creates a plan placeholder", () => {
    const fields = extractPlannerPlanArtifactFields(`{
  "decisionQuestions": [
    {
      "question": "Should automatic finalization be enabled by default?",
      "recommendedOptionId": "enabled",
      "required": true,
      "options": [
        {
          "id": "enabled",
          "label": "Enabled",
          "description": "Keeps the planning flow moving after the last required answer."
        },
        {
          "id": "manual",
          "label": "Manual",
          "description": "Requires the user to explicitly request finalization."
        }
      ]
    }
  ]
}`);

    expect(fields.title).toBe("Planner Mode Plan");
    expect(fields.content).toBe("# Planner Mode Plan\n\nAnswer the planner decisions below before finalizing this plan.");
    expect(fields.decisionQuestions).toEqual([
      expect.objectContaining({
        id: "question-1",
        question: "Should automatic finalization be enabled by default?",
        recommendedOptionId: "enabled",
        required: true,
      }),
    ]);
  });

  it("extracts a top-level single planner question object", () => {
    const fields = extractPlannerPlanArtifactFields(`{
  "id": "diagram-format",
  "question": "Which diagram contract should Pi use?",
  "recommendedOptionId": "structured",
  "required": false,
  "options": [
    {
      "id": "structured",
      "label": "Structured spec",
      "description": "Easier for Ambient to validate and repair."
    },
    {
      "id": "svg",
      "label": "Inline SVG",
      "description": "Can look better, but needs stricter validation."
    }
  ]
}`);

    expect(fields.decisionQuestions).toEqual([
      expect.objectContaining({
        id: "diagram-format",
        question: "Which diagram contract should Pi use?",
        recommendedOptionId: "structured",
      }),
    ]);
  });

  it("does not strip unrelated json fences from planner content", () => {
    const fields = extractPlannerPlanArtifactFields(`# Config Plan

Keep this example visible:

\`\`\`json
{
  "name": "ambient",
  "enabled": true
}
\`\`\``);

    expect(fields.content).toContain('"name": "ambient"');
    expect(fields.decisionQuestions).toEqual([]);
  });

  it("extracts and strips planner diagram specs from canonical fences", () => {
    const fields = extractPlannerPlanArtifactFields(`# Durable Plan

Finalize the planning artifact.

\`\`\`ambient-planner-diagrams
{
  "diagrams": [
    {
      "id": "architecture",
      "title": "Architecture",
      "kind": "architecture",
      "purpose": "Show the main planning components.",
      "nodes": [
        { "id": "renderer", "label": "Renderer", "role": "Asks questions." },
        { "id": "main", "label": "Main Process", "role": "Persists artifacts." }
      ],
      "edges": [
        { "from": "renderer", "to": "main", "label": "IPC" }
      ],
      "layoutHint": "left-to-right",
      "fallbackSummary": "Renderer talks to main process."
    }
  ]
}
\`\`\``);

    expect(fields.content).toBe("# Durable Plan\n\nFinalize the planning artifact.");
    expect(fields.diagrams).toEqual([
      {
        id: "architecture",
        title: "Architecture",
        kind: "architecture",
        purpose: "Show the main planning components.",
        nodes: [
          { id: "renderer", label: "Renderer", role: "Asks questions." },
          { id: "main", label: "Main Process", role: "Persists artifacts." },
        ],
        edges: [{ from: "renderer", to: "main", label: "IPC" }],
        layoutHint: "left-to-right",
        fallbackSummary: "Renderer talks to main process.",
      },
    ]);
  });

  it("surfaces malformed canonical planner question JSON without stripping it", () => {
    const fields = extractPlannerPlanArtifactFields(`# Plan

\`\`\`ambient-planner-questions
{
  "questions": [
    {
      "question": "Which route should we take?",
      "options": [
        { "id": "a", "label": "A", "description": "First route." }
      ]
    }
  ]
\`\`\``);

    expect(fields.content).toContain("ambient-planner-questions");
    expect(fields.decisionQuestions).toEqual([]);
    expect(fields.warnings).toEqual([
      "Planner question block in ambient-planner-questions is not valid JSON, so Ambient could not turn it into native questions.",
    ]);
  });

  it("fails source-plan validation when native planner question JSON is truncated", () => {
    const fields = extractPlannerPlanArtifactFields(`# Plan

## Implementation Plan
1. Build the app.

\`\`\`ambient-planner-questions
{
  "questions": [
    {
      "id": "stack",
      "question": "Which stack?",
      "options": [
        { "id": "react", "label": "React", "description": "Use React." }
      ]
    }
  ]
\`\`\``);

    const validation = validatePlannerPlanArtifactContent(fields, new Date("2026-06-09T00:00:00.000Z"));

    expect(validation.ok).toBe(false);
    expect(validation.errors.map((issue) => issue.code)).toContain("planner-plan-invalid-question-block");
  });

  it("surfaces planner question blocks with invalid question shape", () => {
    const fields = extractPlannerPlanArtifactFields(`# Plan

\`\`\`json
{
  "questions": [
    {
      "question": "Which route should we take?",
      "options": [
        {
          "id": "a",
          "label": "A",
          "description": "Only one route."
        }
      ]
    }
  ]
}
\`\`\``);

    expect(fields.content).toContain('"questions"');
    expect(fields.decisionQuestions).toEqual([]);
    expect(fields.warnings).toEqual([
      "Planner question block in json did not contain any valid question with at least two options.",
    ]);
  });
});

describe("planner durable revision contract", () => {
  const artifact: PlannerPlanArtifact = {
    id: "plan-1",
    threadId: "thread-1",
    sourceMessageId: "message-1",
    status: "ready",
    workflowState: "durable_ready",
    durableArtifactPath: ".ambient/board/plans/example-DurablePlan.html",
    durableArtifactGeneratedAt: "2026-05-01T00:00:00.000Z",
    title: "Example Plan",
    summary: "Build the example.",
    content: [
      "# Example Plan",
      "",
      "## Architecture",
      "",
      "Old architecture text.",
      "",
      "## Program Flow",
      "",
      "Old code flow text.",
      "",
      "## Verification Plan",
      "",
      "- Run tests.",
    ].join("\n"),
    steps: [],
    openQuestions: [],
    risks: [],
    verification: ["Run tests."],
    diagrams: [
      {
        id: "architecture",
        title: "Architecture",
        kind: "architecture",
        nodes: [{ id: "old-runtime", label: "Old Runtime" }],
        edges: [],
      },
      {
        id: "program-flow",
        title: "Program Flow",
        kind: "program_flow",
        nodes: [{ id: "old-code", label: "Old Code" }],
        edges: [],
      },
      {
        id: "dependencies",
        title: "Dependencies",
        kind: "dependencies",
        nodes: [{ id: "dep", label: "Dependency" }],
        edges: [],
      },
    ],
    decisionQuestions: [],
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  };

  it("extracts targeted durable revision operations from the fenced contract", () => {
    const response = extractPlannerDurableRevisionResponse(`\`\`\`ambient-planner-revision
{
  "mode": "targeted_edit",
  "artifactId": "plan-1",
  "summary": "Separated architecture from code diagrams.",
  "operations": [
    {
      "op": "replace_diagrams",
      "scope": "provided",
      "diagrams": [
        {
          "id": "architecture",
          "title": "Runtime Architecture",
          "kind": "architecture",
          "nodes": [
            { "id": "app", "label": "Application" }
          ],
          "edges": []
        }
      ]
    },
    {
      "op": "replace_section",
      "heading": "Architecture",
      "markdown": "Runtime-only architecture text."
    }
  ]
}
\`\`\``);

    expect(response).toMatchObject({
      mode: "targeted_edit",
      artifactId: "plan-1",
      summary: "Separated architecture from code diagrams.",
      operations: [
        {
          op: "replace_diagrams",
          scope: "provided",
          diagrams: [{ id: "architecture", title: "Runtime Architecture", kind: "architecture" }],
        },
        {
          op: "replace_section",
          heading: "Architecture",
          markdown: "Runtime-only architecture text.",
        },
      ],
    });
  });

  it("applies targeted section and diagram revisions without replacing the whole plan", () => {
    const response = extractPlannerDurableRevisionResponse(`{
      "mode": "targeted_edit",
      "artifactId": "plan-1",
      "summary": "Cleaned up diagram boundaries.",
      "operations": [
        {
          "op": "replace_section",
          "heading": "Architecture",
          "markdown": "Runtime architecture, no code-level module detail."
        },
        {
          "op": "replace_diagrams",
          "diagrams": [
            {
              "id": "architecture",
              "title": "Runtime Architecture",
              "kind": "architecture",
              "nodes": [{ "id": "runtime", "label": "Runtime" }],
              "edges": []
            },
            {
              "id": "program-flow",
              "title": "Code Flow",
              "kind": "program_flow",
              "nodes": [{ "id": "module", "label": "Module" }],
              "edges": []
            }
          ]
        }
      ]
    }`);
    expect(response?.mode).toBe("targeted_edit");
    const applied = applyPlannerDurableRevisionResponse(artifact, "message-2", response!);

    expect(applied.fullRewrite).toBe(false);
    expect(applied.fields.sourceMessageId).toBe("message-2");
    expect(applied.fields.content).toContain("Runtime architecture, no code-level module detail.");
    expect(applied.fields.content).toContain("## Program Flow\n\nOld code flow text.");
    expect(applied.fields.diagrams?.map((diagram) => [diagram.kind, diagram.title])).toEqual([
      ["dependencies", "Dependencies"],
      ["architecture", "Runtime Architecture"],
      ["program_flow", "Code Flow"],
    ]);
    expect(applied.messageContent).toContain("Plan revision applied");
    expect(applied.messageContent).toContain("Cleaned up diagram boundaries.");
  });

  it("accepts explicit full rewrites only when declared", () => {
    const response = extractPlannerDurableRevisionResponse(`\`\`\`ambient-planner-revision
{
  "mode": "full_rewrite",
  "artifactId": "plan-1",
  "reason": "The user changed the full plan structure.",
  "content": "# Rewritten Plan\\n\\nNew plan content."
}
\`\`\``);
    expect(response).toMatchObject({ mode: "full_rewrite", artifactId: "plan-1" });
    const applied = applyPlannerDurableRevisionResponse(artifact, "message-3", response!);
    expect(applied.fullRewrite).toBe(true);
    expect(applied.fields.title).toBe("Rewritten Plan");
    expect(applied.fields.content).toBe("# Rewritten Plan\n\nNew plan content.");
  });

  it("does not treat an untyped complete plan as a durable revision contract", () => {
    expect(extractPlannerDurableRevisionResponse("# Rewritten Plan\n\nA full plan without the typed contract.")).toBeUndefined();
  });
});
