import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AmbientPluginRegistry, WorkflowConnectorManifestGrant, WorkflowModelCallRecord, WorkflowRunEvent } from "../../shared/types";
import {
  WorkflowConnectorGrantList,
  WorkflowEventList,
  WorkflowModelCallList,
  WorkflowStepList,
  workflowConnectorAccountsByConnector,
} from "./AutomationsWorkflowEvidenceViews";

describe("Automations workflow evidence views", () => {
  it("renders connector grants through the moved owner", () => {
    const markup = renderToStaticMarkup(
      <WorkflowConnectorGrantList
        connectors={[
          {
            connectorId: "gmail",
            accountId: "primary",
            scopes: ["gmail.readonly"],
            operations: ["search"],
            dataRetention: "redacted_audit",
          } satisfies WorkflowConnectorManifestGrant,
        ]}
      />,
    );

    expect(markup).toContain("Connector Consent");
    expect(markup).toContain("gmail");
    expect(markup).toContain("gmail.readonly");
  });

  it("groups connector auth accounts by connector id", () => {
    const registry = {
      capabilities: [
        {
          id: "capability-gmail-primary",
          kind: "app",
          connectorId: "gmail",
          authAccounts: [
            {
              id: "gmail-primary",
              label: "Primary Gmail",
              status: "connected",
              scopes: ["gmail.readonly"],
            },
          ],
        },
        {
          id: "capability-slack",
          kind: "app",
          connectorId: "slack",
          authAccounts: [
            {
              id: "slack-workspace",
              label: "Workspace Slack",
              status: "connected",
              scopes: ["channels:read"],
            },
          ],
        },
        {
          id: "capability-gmail-secondary",
          kind: "app",
          connectorId: "gmail",
          authAccounts: [
            {
              id: "gmail-secondary",
              label: "Secondary Gmail",
              status: "expired",
              scopes: ["gmail.readonly"],
            },
          ],
        },
        {
          id: "capability-plugin-only",
          kind: "plugin",
          authAccounts: [
            {
              id: "ignored-plugin-account",
              label: "Ignored plugin account",
              status: "connected",
              scopes: [],
            },
          ],
        },
        {
          id: "capability-no-accounts",
          kind: "app",
          connectorId: "drive",
          authAccounts: [],
        },
      ],
    } as unknown as AmbientPluginRegistry;

    expect(workflowConnectorAccountsByConnector(registry)).toEqual({
      gmail: [
        {
          id: "gmail-primary",
          label: "Primary Gmail",
          status: "connected",
          scopes: ["gmail.readonly"],
        },
        {
          id: "gmail-secondary",
          label: "Secondary Gmail",
          status: "expired",
          scopes: ["gmail.readonly"],
        },
      ],
      slack: [
        {
          id: "slack-workspace",
          label: "Workspace Slack",
          status: "connected",
          scopes: ["channels:read"],
        },
      ],
    });
  });

  it("renders workflow runtime evidence lists", () => {
    const events: WorkflowRunEvent[] = [
      {
        id: "event-1",
        runId: "run-1",
        artifactId: "artifact-1",
        seq: 1,
        type: "step.start",
        createdAt: "2026-06-14T10:00:00.000Z",
        message: "Started collect sources",
        data: { stepName: "Collect sources" },
      },
    ];
    const modelCalls: WorkflowModelCallRecord[] = [
      {
        id: "call-1",
        task: "plan_workflow",
        status: "succeeded",
        input: { prompt: "Plan" },
        output: { answer: "Done" },
        startedAt: "2026-06-14T10:00:00.000Z",
        completedAt: "2026-06-14T10:00:02.000Z",
        latencyMs: 2000,
      },
    ];

    expect(renderToStaticMarkup(<WorkflowEventList events={events} />)).toContain("Started collect sources");
    expect(renderToStaticMarkup(<WorkflowStepList events={events} />)).toContain("Started collect sources");
    expect(renderToStaticMarkup(<WorkflowModelCallList modelCalls={modelCalls} />)).toContain("plan_workflow");
  });
});
