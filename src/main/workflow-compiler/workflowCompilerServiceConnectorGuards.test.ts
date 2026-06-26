import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { firstPartyDesktopToolDescriptors } from "./workflowCompilerDesktopToolFacade";
import { ProjectStore } from "./workflowCompilerProjectStoreFacade";
import { compileWorkflowArtifact } from "./workflowCompilerService";
import { finalOnlyProgram } from "./workflowCompilerServiceTestSupport";
import { fixtureWorkflowConnector, workspaceInventoryConnectorDescriptor } from "./workflowCompilerWorkflowFacade";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("compileWorkflowArtifact connector guards", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-compile-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("fails explicit Gmail workflow requests before compiling against an unrelated connector", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Unavailable Gmail",
      initialRequest: "Read the latest 300 Gmail messages and categorize them.",
      projectPath: workspacePath,
      phase: "planned",
    });
    let compileCalled = false;

    await expect(
      compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: "Read the latest 300 Gmail messages and categorize them into up to 7 read-only buckets.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [workspaceInventoryConnectorDescriptor()],
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          compileProgramIr: async () => {
            compileCalled = true;
            return finalOnlyProgram("Should not compile");
          },
        },
      }),
    ).rejects.toThrow(/Workflow connector is not available: Gmail \(google\.gmail\).*workspace\.inventory/);
    expect(compileCalled).toBe(false);
  });

  it("fails explicit Slack workflow requests before compiling against unrelated connectors", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Unavailable Slack",
      initialRequest: "Search Slack channel messages and summarize blockers.",
      projectPath: workspacePath,
      phase: "planned",
    });
    let compileCalled = false;

    await expect(
      compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: "Search Slack channel messages from this week and summarize blockers by owner.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [workspaceInventoryConnectorDescriptor()],
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          compileProgramIr: async () => {
            compileCalled = true;
            return finalOnlyProgram("Should not compile");
          },
        },
      }),
    ).rejects.toThrow(/Workflow connector is not available: Slack \(slack\.workspace\).*workspace\.inventory/);
    expect(compileCalled).toBe(false);
  });

  it("fails explicit GitHub workflow requests before compiling against unrelated connectors", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Unavailable GitHub",
      initialRequest: "Triage GitHub pull requests.",
      projectPath: workspacePath,
      phase: "planned",
    });
    let compileCalled = false;

    await expect(
      compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: "Review GitHub pull requests assigned to me and summarize merge blockers.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [workspaceInventoryConnectorDescriptor()],
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          compileProgramIr: async () => {
            compileCalled = true;
            return finalOnlyProgram("Should not compile");
          },
        },
      }),
    ).rejects.toThrow(/Workflow connector is not available: GitHub \(github\.repository\).*workspace\.inventory/);
    expect(compileCalled).toBe(false);
  });

  it("fails known connector intents across auth and account availability jitter", async () => {
    const baseDescriptor = fixtureWorkflowConnector().descriptor;
    const cases = [
      {
        title: "Gmail auth unavailable",
        connectorId: "google.gmail",
        label: "Gmail",
        providerId: "google.workspace",
        userRequest: "Review Gmail messages from this week and group them by action required.",
        authStatus: "not_configured" as const,
        accounts: [{ id: "primary", label: "Primary Gmail" }],
        expected: /Gmail \(google\.gmail\) is not_configured/,
      },
      {
        title: "Slack missing account",
        connectorId: "slack.workspace",
        label: "Slack",
        providerId: "slack",
        userRequest: "Summarize Slack messages from the launch channel.",
        authStatus: "available" as const,
        accounts: [],
        expected: /Slack \(slack\.workspace\) has no connected account/,
      },
      {
        title: "GitHub expired auth",
        connectorId: "github.repository",
        label: "GitHub",
        providerId: "github",
        userRequest: "Review GitHub issues assigned to me and summarize stale blockers.",
        authStatus: "expired" as const,
        accounts: [{ id: "primary", label: "Primary GitHub" }],
        expected: /GitHub \(github\.repository\) is expired/,
      },
    ];

    for (const [index, testCase] of cases.entries()) {
      const thread = store.createWorkflowAgentThreadSummary({
        title: testCase.title,
        initialRequest: testCase.userRequest,
        projectPath: workspacePath,
        phase: "planned",
      });
      const descriptor = {
        ...baseDescriptor,
        id: testCase.connectorId,
        label: testCase.label,
        description: `${testCase.label} connector descriptor with jittered auth/account state.`,
        auth: { type: "oauth2" as const, providerId: testCase.providerId, status: testCase.authStatus },
        accounts: testCase.accounts,
      };
      const connectorDescriptors =
        index % 2 === 0 ? [workspaceInventoryConnectorDescriptor(), descriptor] : [descriptor, workspaceInventoryConnectorDescriptor()];
      let compileCalled = false;

      await expect(
        compileWorkflowArtifact({
          store,
          workflowThreadId: thread.id,
          userRequest: testCase.userRequest,
          workspaceSummary: "Temp workspace",
          toolDescriptors: index === 1 ? [] : firstPartyDesktopToolDescriptors(),
          connectorDescriptors,
          stateRoot: store.getWorkspace().statePath,
          model: AMBIENT_DEFAULT_MODEL,
          provider: {
            compileProgramIr: async () => {
              compileCalled = true;
              return finalOnlyProgram("Should not compile");
            },
          },
        }),
      ).rejects.toThrow(testCase.expected);
      expect(compileCalled).toBe(false);
    }
  });

  it("fails provider-required connector ids before compiling when the connector is unavailable", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Unavailable provider-required calendar",
      initialRequest: "Create an agenda digest from upcoming events.",
      projectPath: workspacePath,
      phase: "planned",
    });
    let compileCalled = false;

    await expect(
      compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: "Create an agenda digest from upcoming events.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [workspaceInventoryConnectorDescriptor()],
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          discoverCapabilities: async () => ({
            queries: [{ query: "calendar event read", reason: "Agenda source." }],
            requiredConnectorIds: ["google.calendar"],
            requiredToolNames: [],
            openQuestions: [],
          }),
          compileProgramIr: async () => {
            compileCalled = true;
            return finalOnlyProgram("Should not compile");
          },
        },
      }),
    ).rejects.toThrow(/Workflow connector is not available: Google Calendar \(google\.calendar\) is not registered/);
    expect(compileCalled).toBe(false);
  });

  it("honors explicit connector exclusions over provider-required connector ids", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Excluded provider connector",
      initialRequest: "Build a model-only summary without Gmail.",
      projectPath: workspacePath,
      phase: "planned",
    });

    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Create a model-only summary. Do not use Gmail or Google Workspace connectors.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      connectorDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        discoverCapabilities: async () => ({
          queries: [{ query: "model summary", reason: "No external source required." }],
          requiredConnectorIds: ["google.gmail"],
          requiredToolNames: [],
          openQuestions: [],
        }),
        compileProgramIr: async () => finalOnlyProgram("Model-only excluded connector summary"),
      },
    });

    expect(dashboard.artifacts[0].title).toBe("Model-only excluded connector summary");
    const modelCall = store
      .listWorkflowModelCalls({ artifactId: dashboard.artifacts[0].id })
      .find((call) => call.task === "workflow.compiler");
    expect(modelCall?.input).toMatchObject({ selectedConnectorIds: [] });
  });

  it("honors forbidden-source connector exclusions over provider-required connector ids", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Forbidden provider connector",
      initialRequest: "Build a local file report without Google Workspace.",
      projectPath: workspacePath,
      phase: "planned",
    });

    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: [
        "Create a Workflow Agent that uses Ambient Desktop's local/workspace file_read workflow tool directly to read dogfood-notes/admin.md.",
        "The only permitted read tool is file_read. Forbidden external sources: Google Drive, Google Workspace, google.drive, connector content, connector account data, cloud accounts, and external accounts.",
      ].join(" "),
      workspaceSummary: "Temp workspace",
      toolDescriptors: firstPartyDesktopToolDescriptors().filter((tool) => tool.name === "file_read"),
      connectorDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        discoverCapabilities: async () => ({
          queries: [{ query: "Google Drive read", reason: "Provider incorrectly treated forbidden source text as a source requirement." }],
          requiredConnectorIds: ["google.drive"],
          requiredToolNames: ["file_read"],
          openQuestions: [],
        }),
        compileProgramIr: async () => finalOnlyProgram("Forbidden connector exclusion summary"),
      },
    });

    expect(dashboard.artifacts[0].title).toBe("Forbidden connector exclusion summary");
    const modelCall = store
      .listWorkflowModelCalls({ artifactId: dashboard.artifacts[0].id })
      .find((call) => call.task === "workflow.compiler");
    expect(modelCall?.input).toMatchObject({ selectedConnectorIds: [] });
  });

  it("fails when too many provider-required connectors exceed the selected connector budget", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Required connector budget",
      initialRequest: "Create a cross-app project digest.",
      projectPath: workspacePath,
      phase: "planned",
    });
    const baseDescriptor = fixtureWorkflowConnector().descriptor;
    const connector = (id: string, label: string) => ({
      ...baseDescriptor,
      id,
      label,
      description: `${label} read connector.`,
      auth: { type: "oauth2" as const, providerId: id.split(".")[0] ?? id, status: "available" as const },
      accounts: [{ id: "primary", label: `Primary ${label}` }],
    });
    let compileCalled = false;

    await expect(
      compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: "Create a cross-app project digest from the required connected apps.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [
          connector("google.gmail", "Gmail"),
          connector("google.calendar", "Google Calendar"),
          connector("google.drive", "Google Drive"),
          connector("slack.workspace", "Slack"),
          connector("github.repository", "GitHub"),
        ],
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          discoverCapabilities: async () => ({
            queries: [{ query: "cross app project digest", reason: "User asked for connected apps." }],
            requiredConnectorIds: ["google.gmail", "google.calendar", "google.drive", "slack.workspace", "github.repository"],
            requiredToolNames: [],
            openQuestions: [],
          }),
          compileProgramIr: async () => {
            compileCalled = true;
            return finalOnlyProgram("Should not compile");
          },
        },
      }),
    ).rejects.toThrow(/Workflow connector is not available: GitHub \(github\.repository\) was not selected for this compile/);
    expect(compileCalled).toBe(false);
  });

  it("does not require a connector that the workflow request explicitly excludes", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Connector exclusions",
      initialRequest: "Build a model-only report without personal connectors.",
      projectPath: workspacePath,
      phase: "planned",
    });

    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest:
        "Create a model-only summary card. Do not use Gmail, Slack, GitHub, Google Calendar, Google Drive, browser tools, local files, or external connectors.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      connectorDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async () => finalOnlyProgram("Model-only connector exclusion summary"),
      },
    });

    expect(dashboard.artifacts[0].title).toBe("Model-only connector exclusion summary");
    const modelCall = store
      .listWorkflowModelCalls({ artifactId: dashboard.artifacts[0].id })
      .find((call) => call.task === "workflow.compiler");
    expect(modelCall?.input).toMatchObject({ selectedConnectorIds: [] });
  });

  it("fails Google meeting transcript requests before compiling against unrelated connectors", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Unavailable Google transcripts",
      initialRequest: "Pull Google meeting transcripts from the last two weeks and extract action items.",
      projectPath: workspacePath,
      phase: "planned",
    });
    let compileCalled = false;

    await expect(
      compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: "Pull Google meeting transcripts from the last two weeks and extract action items with owners and due dates.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [workspaceInventoryConnectorDescriptor()],
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          compileProgramIr: async () => {
            compileCalled = true;
            return finalOnlyProgram("Should not compile");
          },
        },
      }),
    ).rejects.toThrow(
      /Workflow connector is not available: .*Google Calendar \(google\.calendar\).*Google Drive \(google\.drive\).*workspace\.inventory/,
    );
    expect(compileCalled).toBe(false);
  });
});
