import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firstPartyDesktopToolDescriptors } from "./workflowDesktopToolFacade";
import { ProjectStore } from "./workflowProjectStoreFacade";
import type { WorkflowGraphDiff } from "../../shared/workflowGraphDiff";
import { AmbientWorkflowRunProvider } from "./workflowAmbientProvider";
import { AmbientWorkflowCompilerProvider, compileWorkflowArtifact } from "./workflowWorkflowCompilerServiceFacade";
import { readWorkflowRunDetail, reviewWorkflowArtifact } from "./workflowDashboard";
import { googleWorkspaceConnectorDescriptors } from "./workflowGoogleWorkspaceFacade";
import { fixtureWorkflowConnector } from "./workflowConnectors";
import {
  buildWorkflowDebugRewriteContext,
  buildWorkflowDebugRewritePromptSection,
  createWorkflowDebugRewriteRevision,
  workflowDebugRewriteUserRequest,
} from "./workflowDebugRewrite";
import { runWorkflowArtifact } from "./workflowRunService";
import { runDueWorkflowArtifactSchedules, workflowScheduleRunStartedEventData } from "./workflowScheduleDispatch";
import { workflowPermissionGrantRegistryModel, workflowRemoveTotalRunLimitOverrides, workflowRunOutputCards, workflowScheduleRunHistoryItems, workflowThreadComposerModel, workflowTotalRuntimePauseModel } from "../../renderer/src/workflowTestUiModelContract";
import { registerWorkflowLiveGoogleWorkspaceRunDogfoodTests } from "./workflowLiveGoogleWorkspaceRunDogfoodCases";
import {
  liveAmbientApiKey,
  liveAmbientBaseUrl,
  liveWorkflowModel,
  latestRunForArtifact,
  eventCountsByType,
  writeGmailGrantReviewDogfoodArtifact,
  writeLiveDebugRewriteDogfoodArtifact,
  writeScheduledLocalTimeoutRecoveryDogfoodArtifact,
  scottsdaleWeekendRequest,
  scottsdaleFamilyActivitiesRequest,
  scheduledLocalFileTimeoutRecoveryCompilerOutput,
} from "./workflowDogfoodFixtures";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const itLive = process.env.AMBIENT_WORKFLOW_LIVE === "1" ? it : it.skip;
const LIVE_WORKFLOW_COMPILE_TIMEOUT_MS = Math.max(240_000, Number(process.env.AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS ?? "480000"));
describeNative("Workflow Agent live dogfood", () => {
  let workspacePath = "";

  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-dogfood-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
    await writeFile(
      join(workspacePath, "qa-fixture.html"),
      [
        "<!doctype html>",
        "<html>",
        "  <head><title>Dogfood QA Fixture</title></head>",
        "  <body>",
        "    <main>",
        "      <h1>Dogfood QA Fixture</h1>",
        '      <button aria-label="Run report">Run report</button>',
        "      <p>Status: ready</p>",
        "    </main>",
        "  </body>",
        "</html>",
      ].join("\n"),
      "utf8",
    );
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  itLive(
    "compiles the canonical Scottsdale weekend activities workflow with live Ambient when explicitly enabled",
    async () => {
      const apiKey = liveAmbientApiKey();

      const repeatCount = Math.max(1, Number(process.env.AMBIENT_WORKFLOW_LIVE_REPEAT ?? "1"));
      for (let attempt = 0; attempt < repeatCount; attempt += 1) {
        const dashboard = await compileWorkflowArtifact({
          store,
          userRequest: scottsdaleWeekendRequest(),
          workspaceSummary: `Canonical Scottsdale dogfood compile attempt ${attempt + 1} of ${repeatCount}.`,
          toolDescriptors: firstPartyDesktopToolDescriptors(),
          stateRoot: store.getWorkspace().statePath,
          model: liveWorkflowModel(),
          baseUrl: liveAmbientBaseUrl(),
          provider: new AmbientWorkflowCompilerProvider({
            apiKey,
            baseUrl: liveAmbientBaseUrl(),
            timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
          }),
        });
        const artifact = dashboard.artifacts[0];
        const source = await readFile(artifact.sourcePath, "utf8");

        expect(artifact).toMatchObject({ status: "ready_for_preview" });
        expect(artifact.spec.goal).toMatch(/Scottsdale|weekend|activities/i);
        expect(artifact.manifest.tools.length).toBeGreaterThan(0);
        expect(source).toContain("export");
        expect(source).toContain("workflow");
      }
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "compiles the four-year-old Scottsdale activity workflow with live Ambient when explicitly enabled",
    async () => {
      const apiKey = liveAmbientApiKey();

      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest: scottsdaleFamilyActivitiesRequest(),
        workspaceSummary: "Live UI-reported compile failure repro: family activity workflow for next week in Scottsdale.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.spec.goal).toMatch(/Scottsdale|activities|family|child|4/i);
      expect(source).toContain("workflow");
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "compiles a Gmail last-100-emails categorization report workflow with live Ambient",
    async () => {
      const apiKey = liveAmbientApiKey();

      const connectorDescriptors = googleWorkspaceConnectorDescriptors({
        adapter: "gws",
        states: {
          "google.gmail": {
            status: "available",
            accounts: [{ id: "default", label: "Default Google account" }],
          },
        },
      }).filter((descriptor) => descriptor.id === "google.gmail");

      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest:
          "Review the last 100 emails in Gmail and write a concise report categorizing them by action required, urgency, sender/domain, and recurring themes. The workflow must be read-only, fetch enough message or thread detail to support the categorization, ask Ambient to synthesize the report, and preserve a redacted audit trail.",
        workspaceSummary:
          "Live Google Workspace dogfood prompt for a Gmail categorization workflow. A GWS Gmail connector account named default is available.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors,
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");
      const gmailGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.gmail");
      const graphSnapshot = store.listWorkflowGraphSnapshots(artifact.workflowThreadId!)[0];

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.spec.goal).toMatch(/gmail|email|categor/i);
      expect(["read_only", "staged_until_approved"]).toContain(artifact.manifest.mutationPolicy);
      if (artifact.manifest.mutationPolicy === "staged_until_approved") {
        expect(artifact.manifest.tools).toContain("file_write");
      }
      expect(artifact.manifest.tools).toContain("ambient.responses");
      expect(gmailGrant).toMatchObject({
        connectorId: "google.gmail",
        scopes: expect.arrayContaining(["gmail.readonly"]),
        operations: expect.arrayContaining(["search", "readThread"]),
        dataRetention: "redacted_audit",
      });
      expect(artifact.manifest.maxConnectorCalls ?? 101).toBeGreaterThanOrEqual(101);
      expect(artifact.manifest.maxRunMs ?? 900_000).toBeGreaterThanOrEqual(900_000);
      expect(source).toContain("connectors.call");
      expect(source).toMatch(/connectorId:\s*['"]google\.gmail['"]/);
      expect(source).toMatch(/["']?operation["']?\s*:\s*['"]search['"]/);
      expect(source).toMatch(/["']?operation["']?\s*:\s*['"]readThread['"]/);
      expect(source).toMatch(/["']?maxResults["']?\s*:\s*100|["']?max["']?\s*:\s*100/);
      expect(source).toContain("ambient.call");
      expect(source).toMatch(/task:\s*['"][^'"]+['"]/);
      if (process.env.AMBIENT_WORKFLOW_LIVE_LOG_SOURCE === "1") {
        console.info(
          JSON.stringify(
            {
              title: artifact.title,
              mutationPolicy: artifact.manifest.mutationPolicy,
              maxConnectorCalls: artifact.manifest.maxConnectorCalls,
              connectors: artifact.manifest.connectors,
              graphNodes: graphSnapshot?.nodes.map((node) => ({ id: node.id, type: node.type, label: node.label })),
            },
            null,
            2,
          ),
        );
        console.info(`\n--- Gmail workflow source ---\n${source}`);
      }
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "compiles a document render PDF workflow with live Ambient",
    async () => {
      const apiKey = liveAmbientApiKey();

      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest: [
          "Create a workflow that drafts a concise two-section report from these fixture notes: Alpha shipped the pagination primitive, Beta added chunked model-map coverage, Gamma still needs PDF artifact output validation.",
          "The workflow must use document.render with format pdf and path reports/document-render-dogfood.pdf.",
          "After document.render, stage a file_write mutation that writes the render node's content to the render node's artifactPath.",
          "Do not use browser, shell, Google, or external connectors for this task.",
        ].join(" "),
        workspaceSummary:
          "Live document.render compiler dogfood. Selected capabilities include file_write for staged workspace output and Ambient model calls for drafting the report.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.tools).toEqual(expect.arrayContaining(["file_write"]));
      expect(artifact.manifest.mutationPolicy).toBe("staged_until_approved");
      expect(source).toContain("workflow.renderDocument");
      expect(source).toContain("workflow.stageMutation");
      expect(source).toContain("tools.file_write");
      expect(source).toContain('"format": "pdf"');
      expect(source).toContain("reports/document-render-dogfood.pdf");
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "compiles a Gmail 300-message pagination workflow with live Ambient",
    async () => {
      const apiKey = liveAmbientApiKey();

      const connectorDescriptors = googleWorkspaceConnectorDescriptors({
        adapter: "gws",
        states: {
          "google.gmail": {
            status: "available",
            accounts: [{ id: "default", label: "Default Google account" }],
          },
        },
      }).filter((descriptor) => descriptor.id === "google.gmail");

      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest: [
          "Create a read-only workflow that searches exactly the most recent 300 Gmail message metadata rows and summarizes page coverage.",
          "Use the Gmail connector pagination primitive rather than an ad hoc loop: pageSize 100, maxItems 300, maxPages 3.",
          "Do not modify Gmail data and do not fetch full thread bodies unless the compiler needs a separate bounded detail step.",
        ].join(" "),
        workspaceSummary:
          "Live Gmail pagination compiler dogfood. A GWS Gmail connector account named default is available. The Gmail search operation descriptor declares messages, nextPageToken, pageToken, and maxResults pagination fields.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors,
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");
      const gmailGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.gmail");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(["read_only", "staged_until_approved"]).toContain(artifact.manifest.mutationPolicy);
      if (artifact.manifest.mutationPolicy === "staged_until_approved") {
        expect(artifact.manifest.tools).toContain("file_write");
      }
      expect(gmailGrant).toMatchObject({
        connectorId: "google.gmail",
        scopes: expect.arrayContaining(["gmail.readonly"]),
        operations: expect.arrayContaining(["search"]),
        dataRetention: "redacted_audit",
      });
      expect(gmailGrant?.operations).not.toEqual(expect.arrayContaining(["createDraft", "updateDraft", "deleteDraft", "sendDraft"]));
      expect(artifact.manifest.maxConnectorCalls ?? 0).toBeGreaterThanOrEqual(3);
      expect(source).toContain("workflow.paginateConnector");
      expect(source).toContain('"maxItems": 300');
      expect(source).toContain('"maxPages": 3');
      expect(source).toContain('"pageSize": 100');
      expect(source).toContain('"itemsPath": "messages"');
      expect(source).toContain('"nextPageTokenPath": "nextPageToken"');
      expect(source).toContain('"pageTokenInputPath": "pageToken"');
      expect(source).toContain('"pageSizeInputPath": "maxResults"');
      expect(source).toMatch(/["']?operation["']?\s*:\s*['"]search['"]/);
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "compiles Google Drive and Calendar transcript pagination workflow with live Ambient",
    async () => {
      const apiKey = liveAmbientApiKey();

      const connectorDescriptors = googleWorkspaceConnectorDescriptors({
        adapter: "gws",
        states: {
          "google.drive": {
            status: "available",
            accounts: [{ id: "default", label: "Default Google account" }],
          },
          "google.calendar": {
            status: "available",
            accounts: [{ id: "default", label: "Default Google account" }],
          },
        },
      }).filter((descriptor) => descriptor.id === "google.drive" || descriptor.id === "google.calendar");

      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest: [
          "Create a read-only workflow that finds Google meeting recording transcripts from the last two weeks and prepares an action-item extraction plan.",
          "Use connector.paginate for Google Drive search to collect transcript-like Drive files, with pageSize 50, maxItems 100, and maxPages 2.",
          "Use connector.paginate for Google Calendar listEvents over an explicit two-week RFC3339 window with timeZone America/Phoenix, pageSize 50, maxItems 100, and maxPages 2.",
          "Use only Google read operations. Do not create, update, label, move, share, or delete Google data.",
          "After paginated collection, use collection.chunk plus model.map/model.reduce or model.reduce to identify likely transcripts and action-item extraction coverage.",
        ].join(" "),
        workspaceSummary:
          "Live Google transcript pagination compiler dogfood. GWS Google Drive and Calendar connector accounts named default are available. Drive search declares files/nextPageToken/pageToken/pageSize pagination. Calendar listEvents declares items/nextPageToken/pageToken/maxResults pagination and requires explicit timeMin, timeMax, and timeZone.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors,
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");
      const driveGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.drive");
      const calendarGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.calendar");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.mutationPolicy).toBe("read_only");
      expect(driveGrant).toMatchObject({
        connectorId: "google.drive",
        scopes: expect.arrayContaining(["drive.readonly"]),
        operations: expect.arrayContaining(["search"]),
        dataRetention: "redacted_audit",
      });
      expect(calendarGrant).toMatchObject({
        connectorId: "google.calendar",
        scopes: expect.arrayContaining(["calendar.readonly"]),
        operations: expect.arrayContaining(["listEvents"]),
        dataRetention: "redacted_audit",
      });
      expect(driveGrant?.operations.join(" ")).not.toMatch(/create|update|copy|trash|permission|delete/i);
      expect(calendarGrant?.operations.join(" ")).not.toMatch(/create|update|delete/i);
      expect(artifact.manifest.maxConnectorCalls ?? 0).toBeGreaterThanOrEqual(4);
      expect(source).toContain("workflow.paginateConnector");
      expect(source).toMatch(/connectorId:\s*["']google\.drive["']/);
      expect(source).toMatch(/connectorId:\s*["']google\.calendar["']/);
      expect(source).toMatch(/operation:\s*["']search["']/);
      expect(source).toMatch(/operation:\s*["']listEvents["']/);
      expect(source).toContain('"itemsPath": "files"');
      expect(source).toContain('"itemsPath": "items"');
      expect(source).toContain('"pageSizeInputPath": "pageSize"');
      expect(source).toContain('"pageSizeInputPath": "maxResults"');
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "compiles Google meeting transcript action-item extraction workflow with live Ambient",
    async () => {
      const apiKey = liveAmbientApiKey();

      const connectorDescriptors = googleWorkspaceConnectorDescriptors({
        adapter: "gws",
        states: {
          "google.drive": {
            status: "available",
            accounts: [{ id: "default", label: "Default Google account" }],
          },
          "google.calendar": {
            status: "available",
            accounts: [{ id: "default", label: "Default Google account" }],
          },
        },
      }).filter((descriptor) => descriptor.id === "google.drive" || descriptor.id === "google.calendar");

      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest: [
          "Create a read-only workflow that pulls Google meeting recording transcripts from the last two weeks and analyzes them for action items, owners, due dates, decisions, and unresolved questions.",
          "Use the exact two-week window from 2026-05-02T00:00:00-07:00 through 2026-05-16T23:59:59-07:00 with timeZone America/Phoenix.",
          "Use connector.paginate for Google Calendar listEvents with pageSize 50, maxItems 100, maxPages 2, and read-only fields for event provenance.",
          "Use connector.paginate for Google Drive search with pageSize 50, maxItems 100, maxPages 2, looking for transcript-like Google Docs with mimeType = 'application/vnd.google-apps.document'.",
          "Use collection.map to select at most 6 candidate transcript files, then connector.map over google.drive readFile with maxItems 6, maxConcurrency 3, exportMimeType text/plain, and maxContentChars 4000.",
          "Because transcript files may be long, call long_context_process with taskType extraction over the Drive readFile results plus calendar events before the final model.call.",
          "The final model.call must consume the long_context_process response and counts only, not the raw read-transcript-files.items or calendar-event-pages.items collection.",
          "Do not create, update, label, share, move, delete, or write any Google data.",
        ].join(" "),
        workspaceSummary:
          "Live Google transcript action-item compiler dogfood. GWS Google Drive and Calendar connector accounts named default are available. Drive search and Calendar listEvents declare pagination metadata. Drive readFile exports Google Docs as text/plain. long_context_process is selected and should preprocess transcript-sized evidence before final Ambient model shaping.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors,
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");
      const driveGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.drive");
      const calendarGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.calendar");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.mutationPolicy).toBe("read_only");
      expect(artifact.manifest.tools).toEqual(expect.arrayContaining(["long_context_process", "ambient.responses"]));
      expect(driveGrant).toMatchObject({
        connectorId: "google.drive",
        scopes: expect.arrayContaining(["drive.readonly"]),
        operations: expect.arrayContaining(["search", "readFile"]),
        dataRetention: "redacted_audit",
      });
      expect(calendarGrant).toMatchObject({
        connectorId: "google.calendar",
        scopes: expect.arrayContaining(["calendar.readonly"]),
        operations: expect.arrayContaining(["listEvents"]),
        dataRetention: "redacted_audit",
      });
      expect(driveGrant?.operations.join(" ")).not.toMatch(/create|update|copy|trash|permission|delete/i);
      expect(calendarGrant?.operations.join(" ")).not.toMatch(/create|update|delete/i);
      expect(artifact.manifest.maxConnectorCalls ?? 0).toBeGreaterThanOrEqual(10);
      expect(artifact.manifest.maxToolCalls ?? 0).toBeGreaterThanOrEqual(1);
      expect(artifact.manifest.maxModelCalls ?? 0).toBeGreaterThanOrEqual(1);
      expect(source).toContain("workflow.paginateConnector");
      expect(source).toContain("workflow.batch");
      expect(source).toContain("tools.long_context_process");
      expect(source).toContain("ambient.call");
      expect(source.indexOf("tools.long_context_process")).toBeLessThan(source.indexOf("ambient.call"));
      expect(source).toMatch(/connectorId:\s*["']google\.drive["']/);
      expect(source).toMatch(/connectorId:\s*["']google\.calendar["']/);
      expect(source).toMatch(/["']?operation["']?\s*:\s*["']search["']/);
      expect(source).toMatch(/["']?operation["']?\s*:\s*["']readFile["']/);
      expect(source).toContain('"exportMimeType": "text/plain"');
      expect(source).toContain('"maxContentChars": 4000');
      expect(source).toMatch(/["']?operation["']?\s*:\s*["']listEvents["']/);
      expect(source).toContain("2026-05-02T00:00:00-07:00");
      expect(source).toContain("America/Phoenix");
      expect(source).not.toContain('operation: "createEvent"');
      expect(source).not.toContain('operation: "updateEvent"');
      expect(source).not.toContain('operation: "deleteEvent"');
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "compiles a Gmail 300-message chunked categorization workflow with live Ambient",
    async () => {
      const apiKey = liveAmbientApiKey();

      const connectorDescriptors = googleWorkspaceConnectorDescriptors({
        adapter: "gws",
        states: {
          "google.gmail": {
            status: "available",
            accounts: [{ id: "default", label: "Default Google account" }],
          },
        },
      }).filter((descriptor) => descriptor.id === "google.gmail");

      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest: [
          "Create a read-only workflow that categorizes the most recent 300 Gmail messages into up to 7 categories.",
          "Use connector.paginate for Gmail search with pageSize 100, maxItems 300, and maxPages 3.",
          "Use connector.map to read Gmail thread details with maxItems 300 and maxConcurrency 4.",
          "Use collection.map to keep only bounded categorization fields, collection.chunk with chunks of about 25, model.map over those chunks, and model.reduce for the final category synthesis.",
          "Do not modify Gmail data, labels, drafts, or messages.",
        ].join(" "),
        workspaceSummary:
          "Live Gmail large-collection compiler dogfood. A GWS Gmail connector account named default is available. The compiler supports connector.paginate, connector.map, collection.map, collection.chunk, model.map, and model.reduce.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors,
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");
      const gmailGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.gmail");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.mutationPolicy).toBe("read_only");
      expect(gmailGrant).toMatchObject({
        connectorId: "google.gmail",
        scopes: expect.arrayContaining(["gmail.readonly"]),
        operations: expect.arrayContaining(["search", "readThread"]),
        dataRetention: "redacted_audit",
      });
      expect(gmailGrant?.operations).not.toEqual(expect.arrayContaining(["createDraft", "updateDraft", "deleteDraft", "sendDraft"]));
      expect(artifact.manifest.maxConnectorCalls ?? 0).toBeGreaterThanOrEqual(303);
      expect(artifact.manifest.maxModelCalls ?? 0).toBeGreaterThanOrEqual(13);
      expect(source).toContain("workflow.paginateConnector");
      expect(source).toContain("workflow.mapCollection");
      expect(source).toContain("workflow.chunkCollection");
      expect(source).toContain("workflow.mapModel");
      expect(source).toContain("workflow.reduceModel");
      expect(source).toContain('"maxItems": 300');
      expect(source).toMatch(/["']?operation["']?\s*:\s*['"]search['"]/);
      expect(source).toMatch(/["']?operation["']?\s*:\s*['"]readThread['"]/);
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "compiles a Gmail 1000-message metadata-first categorization workflow with live Ambient",
    async () => {
      const apiKey = liveAmbientApiKey();

      const connectorDescriptors = googleWorkspaceConnectorDescriptors({
        adapter: "gws",
        states: {
          "google.gmail": {
            status: "available",
            accounts: [{ id: "default", label: "Default Google account" }],
          },
        },
      }).filter((descriptor) => descriptor.id === "google.gmail");

      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest: [
          "Create a read-only metadata-first workflow that categorizes the most recent 1000 Gmail messages into up to 7 categories.",
          "Stay under the single-workflow static connector-call ceiling: use connector.paginate for Gmail search metadata with maxItems 1000, maxPages 10, and pageSize 100.",
          "Do not use google.gmail.readThread in this workflow; if some messages need full body detail, return a bounded follow-up detail-read candidate list in the final output.",
          "Use collection.map to keep metadata fields, collection.chunk with chunks of about 25, model.map over chunks, and tree model.reduce for the final synthesis.",
          "After metadata synthesis, include a review.input gate asking whether to plan a separate bounded full-body follow-up. This workflow must stay metadata-only.",
          "Do not modify Gmail data, labels, drafts, or messages.",
        ].join(" "),
        workspaceSummary:
          "Live Gmail 1000 metadata-first compiler dogfood. A GWS Gmail connector account named default is available. The compiler supports a hard 1000 static call ceiling; a 1000-item readThread fan-out plus search pagination is over budget, so this workflow should use search metadata only, include a review.input gate after metadata synthesis, and produce a follow-up detail-read recommendation.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors,
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");
      const gmailGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.gmail");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.mutationPolicy).toBe("read_only");
      expect(gmailGrant).toMatchObject({
        connectorId: "google.gmail",
        scopes: expect.arrayContaining(["gmail.readonly"]),
        operations: ["search"],
        dataRetention: "redacted_audit",
      });
      expect(artifact.manifest.maxConnectorCalls ?? 1001).toBeLessThanOrEqual(10);
      expect(source).toContain("workflow.paginateConnector");
      expect(source).toContain("workflow.mapCollection");
      expect(source).toContain("workflow.chunkCollection");
      expect(source).toContain("workflow.mapModel");
      expect(source).toContain("workflow.reduceModel");
      expect(source).toContain("workflow.askUser");
      expect(source).toContain('"maxItems": 1000');
      expect(source).toMatch(/["']?operation["']?\s*:\s*['"]search['"]/);
      expect(source).not.toMatch(/["']?operation["']?\s*:\s*['"]readThread['"]/);
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "compiles a tree model-reduce workflow with live Ambient",
    async () => {
      const apiKey = liveAmbientApiKey();
      const records = Array.from({ length: 64 }, (_, index) => ({
        id: `record-${index + 1}`,
        title: `Research note ${index + 1}`,
        summary: `Scottsdale market evidence note ${index + 1}`,
      }));
      const connectorDescriptors = [fixtureWorkflowConnector(records).descriptor];

      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest: [
          "Create a read-only workflow that retrieves 64 fixture research records and synthesizes them into a final brief.",
          "Use connector.paginate on fixture.readonly listRecords with pageSize 16, maxItems 64, maxPages 4, itemsPath records, nextPageTokenPath nextCursor, pageTokenInputPath cursor, and pageSizeInputPath limit.",
          "Use collection.chunk with chunkSize 8 and maxChunks 8, then model.map over chunks.",
          'Use model.reduce with strategy:"tree", maxFanIn 4, maxLevels 3 for final synthesis. Do not use a single model.call for the final fan-in.',
        ].join(" "),
        workspaceSummary:
          'Live tree-reduce compiler dogfood. The fixture.readonly connector account "fixture" is available. The compiler supports connector.paginate, collection.chunk, model.map, and model.reduce with strategy:"tree", maxFanIn, and maxLevels.',
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors,
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");
      const fixtureGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "fixture.readonly");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.mutationPolicy).toBe("read_only");
      expect(fixtureGrant).toMatchObject({
        connectorId: "fixture.readonly",
        scopes: expect.arrayContaining(["fixture.records.read"]),
        operations: expect.arrayContaining(["listRecords"]),
        dataRetention: "redacted_audit",
      });
      expect(artifact.manifest.maxConnectorCalls ?? 0).toBeGreaterThanOrEqual(4);
      expect(artifact.manifest.maxModelCalls ?? 0).toBeGreaterThanOrEqual(11);
      expect(source).toContain("workflow.paginateConnector");
      expect(source).toContain("workflow.chunkCollection");
      expect(source).toContain("workflow.mapModel");
      expect(source).toContain("workflow.reduceModel");
      expect(source).toContain('"strategy": "tree"');
      expect(source).toContain('"maxFanIn": 4');
      expect(source).toContain('"maxLevels": 3');
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "compiles a browser_search pagination collection workflow with live Ambient",
    async () => {
      const apiKey = liveAmbientApiKey();

      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest: [
          "Create a read-only workflow that collects exactly 30 public web search results for a Scottsdale Arizona real estate market source brief.",
          "Use tool.paginate over browser_search with exactly 3 pageQueries, pageSize 10, maxItems 30, maxPages 3, itemsPath root array, queryInputPath query, pageSizeInputPath maxResults, and dedupeKeyPath url.",
          'After collection, use collection.dedupe with keyPath url and strategy:"url_canonical", then collection.map to keep title/url/snippet, collection.chunk into 3 chunks of 10, model.map over chunks, model.reduce with strategy:"tree" for final synthesis, and document.render format pdf for the report artifact.',
          "Do not use connector.paginate for the browser search collection, do not write files, and do not modify external state.",
        ].join(" "),
        workspaceSummary:
          "Live browser_search pagination compiler dogfood. browser_search is selected and declares tool pagination metadata: itemsPath is the root array, query fan-out is supported through pageQueries, queryInputPath is query, pageSizeInputPath is maxResults, and maxPageSize is 10. The compiler supports tool.paginate, collection.dedupe, collection.chunk, model.map, tree model.reduce, and document.render.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [],
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.mutationPolicy).toBe("read_only");
      expect(artifact.manifest.tools).toEqual(expect.arrayContaining(["browser_search", "ambient.responses"]));
      expect(artifact.manifest.maxToolCalls ?? 0).toBeGreaterThanOrEqual(3);
      expect(artifact.manifest.maxModelCalls ?? 0).toBeGreaterThanOrEqual(4);
      expect(source).toContain("workflow.paginateTool");
      expect(source).toContain("tools.browser_search");
      expect(source).toContain('"itemsPath": ""');
      expect(source).toContain('"pageSizeInputPath": "maxResults"');
      expect(source).toContain('"queryInputPath": "query"');
      expect(source).toContain('"maxItems": 30');
      expect(source).toContain('"maxPages": 3');
      expect(source).toContain("workflow.dedupeCollection");
      expect(source).toContain('"strategy": "url_canonical"');
      expect(source).toContain("workflow.chunkCollection");
      expect(source).toContain("workflow.mapModel");
      expect(source).toContain("workflow.reduceModel");
      expect(source).toContain("workflow.renderDocument");
      expect(source).toContain('"format": "pdf"');
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "compiles a movie-night current-data recommendation workflow with live Ambient",
    async () => {
      const apiKey = liveAmbientApiKey();

      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest: [
          "Create a read-only workflow that recommends whether a couple in Scottsdale, Arizona should go out to see a movie tonight.",
          "The run date is Saturday, May 16, 2026 and the local time zone is America/Phoenix. Do not rely on model knowledge for currently playing movies, showtimes, reviews, ratings, or venue details.",
          "Use tool.paginate over browser_search with exactly 4 pageQueries, pageSize 10, maxItems 40, maxPages 4, itemsPath root array, queryInputPath query, pageSizeInputPath maxResults, and dedupeKeyPath url.",
          "The four pageQueries must cover tonight's Scottsdale showtimes/currently playing movies, review/ratings signals, runtime/genre/ratings, and theater/parking/dinner/travel friction.",
          'After collection, use collection.dedupe with keyPath url and strategy:"url_canonical", collection.map to keep title/url/snippet/date/rank, collection.chunk into 4 chunks of 10, and model.map over chunks to extract candidate movies, showtimes, reviews, runtime, genre, travel friction, and evidence freshness.',
          'Add a review.input asking for the couple\'s preference profile before final recommendation, then use model.reduce with strategy:"tree", maxFanIn 4, maxLevels 1 to produce the go/no-go recommendation with alternatives, confidence, tradeoffs, and evidence freshness.',
          "Do not use Google write grants, file_write, connector writes, or stale model knowledge.",
        ].join(" "),
        workspaceSummary:
          "Live movie-night current-data compiler dogfood. browser_search is selected and declares tool pagination metadata: itemsPath is the root array, query fan-out is supported through pageQueries, queryInputPath is query, pageSizeInputPath is maxResults, and maxPageSize is 10. The compiler supports tool.paginate, collection.dedupe, collection.map, collection.chunk, model.map, review.input, and tree model.reduce. Use the selected Ambient Desktop model through model.map/model.reduce for synthesis; do not ask the user to choose a random cloud LLM provider.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [],
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.mutationPolicy).toBe("read_only");
      expect(artifact.manifest.tools).toEqual(expect.arrayContaining(["browser_search", "ambient.responses"]));
      expect(artifact.manifest.tools).not.toContain("file_write");
      expect(artifact.manifest.maxToolCalls ?? 0).toBeGreaterThanOrEqual(4);
      expect(artifact.manifest.maxModelCalls ?? 0).toBeGreaterThanOrEqual(5);
      expect(source).toContain("workflow.paginateTool");
      expect(source).toContain("tools.browser_search");
      expect(source).toContain('"itemsPath": ""');
      expect(source).toContain('"pageSizeInputPath": "maxResults"');
      expect(source).toContain('"queryInputPath": "query"');
      expect(source).toContain('"maxItems": 40');
      expect(source).toContain('"maxPages": 4');
      expect(source).toContain("workflow.dedupeCollection");
      expect(source).toContain('"strategy": "url_canonical"');
      expect(source).toContain("workflow.chunkCollection");
      expect(source).toContain("workflow.mapModel");
      expect(source).toContain("workflow.askUser");
      expect(source).toContain("workflow.reduceModel");
      expect(source).toContain('"strategy": "tree"');
      expect(source).toContain("2026-05-16");
      expect(source).toContain("America/Phoenix");
      expect(source).not.toContain("tools.file_write");
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "compiles a Scottsdale 100-source PDF workflow with live Ambient",
    async () => {
      const apiKey = liveAmbientApiKey();

      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest: [
          "Create a workflow that performs deep research for a Scottsdale, Arizona real estate report.",
          "Collect exactly 100 public source candidates using browser_search through tool.paginate with exactly 10 pageQueries, pageSize 10, maxItems 100, maxPages 10, itemsPath root array, queryInputPath query, pageSizeInputPath maxResults, and dedupeKeyPath url.",
          "Search angles must cover market trends, inventory, prices, neighborhoods, migration, mortgage rates, zoning/development, short-term rental rules, schools/taxes, and comparable nearby cities.",
          'After source collection, use collection.dedupe with keyPath url and strategy:"url_canonical", then collection.map to keep title/url/snippet/date/rank, collection.chunk into 10 chunks of 10, model.map over chunks for claims/statistics/citations/source-quality extraction, and model.reduce with strategy:"tree", maxFanIn 5, maxLevels 2 for final synthesis.',
          "Render a PDF report with document.render format pdf and then stage a file_write mutation to Documents/scottsdale-real-estate-research-report.pdf.",
          "Do not modify external websites or cloud data; only stage the local PDF file write.",
        ].join(" "),
        workspaceSummary:
          "Live Scottsdale 100-source compiler dogfood. browser_search is selected and declares tool pagination metadata: itemsPath is the root array, query fan-out is supported through pageQueries, queryInputPath is query, pageSizeInputPath is maxResults, and maxPageSize is 10. file_write is available for staged workspace writes. The compiler supports tool.paginate, collection.dedupe, collection.map, collection.chunk, model.map, tree model.reduce, document.render, and mutation.stage.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [],
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.mutationPolicy).toBe("staged_until_approved");
      expect(artifact.manifest.tools).toEqual(expect.arrayContaining(["browser_search", "ambient.responses", "file_write"]));
      expect(artifact.manifest.maxToolCalls ?? 0).toBeGreaterThanOrEqual(11);
      expect(artifact.manifest.maxModelCalls ?? 0).toBeGreaterThanOrEqual(13);
      expect(source).toContain("workflow.paginateTool");
      expect(source).toContain("tools.browser_search");
      expect(source).toContain('"itemsPath": ""');
      expect(source).toContain('"pageSizeInputPath": "maxResults"');
      expect(source).toContain('"queryInputPath": "query"');
      expect(source).toContain('"maxItems": 100');
      expect(source).toContain('"maxPages": 10');
      expect(source).toContain("workflow.dedupeCollection");
      expect(source).toContain('"strategy": "url_canonical"');
      expect(source).toContain("workflow.chunkCollection");
      expect(source).toContain("workflow.mapModel");
      expect(source).toContain("workflow.reduceModel");
      expect(source).toContain('"strategy": "tree"');
      expect(source).toContain('"maxFanIn": 5');
      expect(source).toContain("workflow.renderDocument");
      expect(source).toContain('"format": "pdf"');
      expect(source).toContain("workflow.stageMutation");
      expect(source).toContain("tools.file_write");
      expect(source).toContain("Documents/scottsdale-real-estate-research-report.pdf");
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "compiles a long-field connector workflow through long_context_process with live Ambient",
    async () => {
      const apiKey = liveAmbientApiKey();
      const records = Array.from({ length: 80 }, (_, index) => ({
        id: `transcript-${index + 1}`,
        title: `Transcript ${index + 1}`,
        body: `Meeting transcript ${index + 1}. ${"Action item discussion and decision evidence. ".repeat(220)}`,
      }));
      const connectorDescriptors = [fixtureWorkflowConnector(records).descriptor];

      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest: [
          "Create a read-only workflow that analyzes 80 long fixture meeting transcript records for action items, owners, due dates, decisions, and unresolved questions.",
          "Use connector.call on fixture.readonly listRecords with limit 80, then connector.map on fixture.readonly getRecord with maxItems 80 and maxConcurrency 4.",
          "The getRecord results contain long body fields, so use a tool.call to long_context_process with taskType extraction before the final schema-shaping model.call.",
          "Do not pass read-record-details.items or any other large raw collection directly into a single model.call. The final model.call should consume the long_context_process response plus source counts only.",
        ].join(" "),
        workspaceSummary:
          "Live long-field RLM routing compiler dogfood. The fixture.readonly connector account fixture is available and returns long transcript-like record bodies. Selected tools include long_context_process and Ambient model calls. The compiler rejects direct model.call consumption of large collection outputs when long_context_process is available.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors,
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");
      const fixtureGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "fixture.readonly");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.mutationPolicy).toBe("read_only");
      expect(artifact.manifest.tools).toEqual(expect.arrayContaining(["long_context_process", "ambient.responses"]));
      expect(fixtureGrant).toMatchObject({
        connectorId: "fixture.readonly",
        scopes: expect.arrayContaining(["fixture.records.read"]),
        operations: expect.arrayContaining(["listRecords", "getRecord"]),
        dataRetention: "redacted_audit",
      });
      expect(artifact.manifest.maxConnectorCalls ?? 0).toBeGreaterThanOrEqual(81);
      expect(source).toContain("tools.long_context_process");
      expect(source).toContain("ambient.call");
      expect(source.indexOf("tools.long_context_process")).toBeLessThan(source.indexOf("ambient.call"));
      expect(source).toMatch(/["']?operation["']?\s*:\s*['"]getRecord['"]/);
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "dogfoods Gmail workflow grant review registry with live Ambient compile",
    async () => {
      const apiKey = liveAmbientApiKey();
      const connectorDescriptors = googleWorkspaceConnectorDescriptors({
        adapter: "gws",
        states: {
          "google.gmail": {
            status: "available",
            accounts: [{ id: "default", label: "Default Google account" }],
          },
        },
      }).filter((descriptor) => descriptor.id === "google.gmail");

      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest:
          "Review the last 100 emails in Gmail and write a concise report categorizing them by action required, urgency, sender/domain, and recurring themes. The workflow must be read-only, reuse any approved Gmail connector grant, ask Ambient to synthesize the report, and preserve a redacted audit trail.",
        workspaceSummary:
          "Live grant-registry dogfood prompt. A GWS Gmail connector account named default is available and a reusable Gmail read grant may already exist.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors,
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const artifact = dashboard.artifacts[0];
      if (!artifact.workflowThreadId) throw new Error("Live Gmail workflow did not create a workflow thread id.");
      const thread = store.getWorkflowAgentThreadSummary(artifact.workflowThreadId);
      const auditThread = store.createThread("Gmail workflow grant review dogfood");
      const grant = store.createPermissionGrant({
        permissionModeAtCreation: "workspace",
        scopeKind: "workflow_thread",
        workflowThreadId: artifact.workflowThreadId,
        actionKind: "connector_content_read",
        targetKind: "tool",
        targetHash: "dogfood:gmail:read-thread",
        targetLabel: "Google Workspace gmail.users.messages.get (default)",
        conditions: {
          provider: "google.workspace.cli",
          accountHint: "default",
          methodId: "gmail.users.messages.get",
          sideEffect: "personal_content_read",
        },
        source: "workflow_review",
        reason: "Live dogfood reusable Gmail read grant.",
      });
      store.addPermissionAudit({
        threadId: auditThread.id,
        permissionMode: "workspace",
        toolName: "google_workspace_call",
        risk: "plugin-tool",
        decision: "allowed",
        detail: "Method: gmail.users.messages.get\nAccount: default\nWorkflow dogfood persistent grant reuse.",
        reason: "Approved by persistent workflow Gmail grant.",
        decisionSource: "persistent_grant",
        grantId: grant.id,
      });
      store.addPermissionAudit({
        threadId: auditThread.id,
        permissionMode: "full-access",
        toolName: "google_workspace_call",
        risk: "plugin-tool",
        decision: "allowed",
        detail: "Method: gmail.users.messages.list\nAccount: default\nWorkflow dogfood Full Access receipt.",
        reason: "Allowed automatically by Full Access mode.",
        decisionSource: "allowed_by_full_access",
      });

      const registry = workflowPermissionGrantRegistryModel({
        grants: store.listPermissionGrants(),
        auditEntries: store.listPermissionAudit(20),
        workflowThreadId: artifact.workflowThreadId,
        projectPath: thread.projectPath,
        workspacePath,
        auditThreadId: auditThread.id,
      });

      await writeGmailGrantReviewDogfoodArtifact({
        artifactId: artifact.id,
        auditThreadId: auditThread.id,
        title: artifact.title,
        status: artifact.status,
        connectorGrants: artifact.manifest.connectors,
        registrySummary: registry.summary,
        registryRows: registry.rows.map((row) => ({
          id: row.id,
          scope: row.scopeLabel,
          target: row.targetLabel,
          auditCount: row.auditCount,
          provenance: row.provenanceLabel,
        })),
        fullAccessReceipts: registry.fullAccessReceipts.map((receipt) => ({
          id: receipt.id,
          tool: receipt.toolLabel,
          risk: receipt.riskLabel,
          detail: receipt.detailLabel,
        })),
      });

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.mutationPolicy).toBe("read_only");
      expect(registry.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: grant.id,
            scopeLabel: "Workflow",
            targetLabel: "Google Workspace gmail.users.messages.get (default)",
            auditCount: 1,
            provenanceLabel: `Workflow ${artifact.workflowThreadId}`,
          }),
        ]),
      );
      expect(registry.fullAccessReceipts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            toolLabel: "google_workspace_call",
            detailLabel: expect.stringContaining("gmail.users.messages.list"),
          }),
        ]),
      );
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "dogfoods selected-event debug rewrite with live Ambient",
    async () => {
      const apiKey = liveAmbientApiKey();
      const artifactRoot = join(store.getWorkspace().statePath, "workflows", "live-debug-rewrite-dogfood");
      await mkdir(artifactRoot, { recursive: true });
      const baseSourcePath = join(artifactRoot, "base.ts");
      await writeFile(
        baseSourcePath,
        `
export default async function run({ workflow }) {
  await workflow.step("extract records", { nodeId: "extract" }, async () => {
    return [{ id: "rec-1", text: "Needs classification" }];
  });
  await workflow.step("classify records", { nodeId: "classify" }, async () => {
    throw new Error("classification schema mismatch");
  });
}
`,
        "utf8",
      );
      const thread = store.createWorkflowAgentThreadSummary({
        title: "Live Debug Rewrite Dogfood",
        initialRequest: "Classify records with retained inputs and repair schema mismatches.",
        projectPath: workspacePath,
        traceMode: "debug",
      });
      const baseArtifact = store.createWorkflowArtifact({
        workflowThreadId: thread.id,
        title: "Live Debug Rewrite Dogfood",
        status: "approved",
        manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only", maxModelCalls: 2, maxRunMs: 120_000 },
        spec: { goal: "Classify records with retained inputs.", summary: "The base workflow fails in the classify graph node." },
        sourcePath: baseSourcePath,
        statePath: join(artifactRoot, "base-state.json"),
      });
      const baseGraph = store.createWorkflowGraphSnapshot({
        workflowThreadId: thread.id,
        source: "compile",
        summary: "Extract records, classify them, and report schema-safe labels.",
        nodes: [
          { id: "request", type: "request", label: "Request" },
          { id: "extract", type: "deterministic_step", label: "Extract records", retryPolicy: "Retry with same retained input." },
          {
            id: "classify",
            type: "model_call",
            label: "Classify records",
            modelRole: "Return schema-safe record labels.",
            retryPolicy: "Retry with same retained input; ask Ambient to debug schema mismatches.",
          },
          { id: "output", type: "output", label: "Output" },
        ],
        edges: [
          { id: "request-extract", source: "request", target: "extract", type: "control_flow" },
          { id: "extract-classify", source: "extract", target: "classify", type: "data_flow" },
          { id: "classify-output", source: "classify", target: "output", type: "data_flow" },
        ],
      });
      const baseVersion = store.createWorkflowVersion({
        workflowThreadId: thread.id,
        artifactId: baseArtifact.id,
        graphSnapshotId: baseGraph.id,
        sourcePath: baseArtifact.sourcePath,
        repoPath: artifactRoot,
        status: "approved",
        createdBy: "compiler",
      });
      const run = store.startWorkflowRun({ artifactId: baseArtifact.id, status: "running" });
      store.updateWorkflowRun({ id: run.id, status: "failed", error: "classification schema mismatch", finish: true });
      store.appendWorkflowRunEvent({
        runId: run.id,
        type: "step.error",
        message: "extract records",
        graphNodeId: "extract",
        data: { error: "older extract warning retained for selection disambiguation" },
      });
      const selectedEvent = store.appendWorkflowRunEvent({
        runId: run.id,
        type: "ambient.call.invalid",
        message: "classify.records",
        graphNodeId: "classify",
        itemKey: "rec-1",
        data: { error: "classification schema mismatch", expected: "{ id, label, confidence }" },
      });
      store.appendWorkflowRunEvent({ runId: run.id, type: "workflow.failed", message: "classification schema mismatch" });
      store.recordWorkflowModelCall({
        runId: run.id,
        task: "classify.records",
        status: "invalid",
        input: { records: [{ id: "rec-1", text: "Needs classification" }] },
        output: { label: "needs_review" },
        validationError: "Expected array of { id, label, confidence } records.",
        graphNodeId: "classify",
        itemKey: "rec-1",
        startedAt: "2026-05-05T00:00:00.000Z",
        completedAt: "2026-05-05T00:00:01.000Z",
      });

      const debugContext = buildWorkflowDebugRewriteContext(store, {
        runId: run.id,
        eventId: selectedEvent.id,
        userNotes: "Repair only the selected classify node. Keep graph node id classify for the repaired classification step.",
      });
      const requestedChange = workflowDebugRewriteUserRequest(debugContext);
      const liveProvider = new AmbientWorkflowCompilerProvider({
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      });
      const observed = { prompt: "", progressEvents: 0, outputChars: 0, thinkingChars: 0 };
      const provider = {
        compileProgramIr: async (input: Parameters<AmbientWorkflowCompilerProvider["compileProgramIr"]>[0]) => {
          observed.prompt = input.prompt;
          return liveProvider.compileProgramIr({
            ...input,
            onProgress: (progress) => {
              observed.progressEvents += 1;
              observed.outputChars = progress.outputChars;
              observed.thinkingChars = progress.thinkingChars ?? observed.thinkingChars;
              input.onProgress?.(progress);
            },
          });
        },
      };

      const proposedDashboard = await compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: requestedChange,
        workspaceSummary: [
          "Live Ambient/Pi selected-event debug rewrite dogfood.",
          "The selected failure is ambient.call.invalid on graph node classify; preserve that node id if the conceptual classification step remains.",
        ].join("\n"),
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        debugRewriteContext: buildWorkflowDebugRewritePromptSection(debugContext),
        provider,
      });
      const proposedArtifact = proposedDashboard.artifacts[0];
      const proposedThread = store.getWorkflowAgentThreadSummary(thread.id);
      const proposedGraphIds = proposedThread.graph?.nodes.map((node) => node.id) ?? [];
      const proposedSource = await readFile(proposedArtifact.sourcePath, "utf8");
      const revision = createWorkflowDebugRewriteRevision(store, debugContext, { baseVersionId: baseVersion.id, requestedChange });
      const graphDiff = revision.graphDiff as WorkflowGraphDiff | undefined;

      await writeLiveDebugRewriteDogfoodArtifact({
        workflowThreadId: thread.id,
        runId: run.id,
        selectedEventId: selectedEvent.id,
        failedEvent: debugContext.failedEvent,
        proposedArtifactId: proposedArtifact.id,
        proposedGraphIds,
        revisionId: revision.id,
        sourceContainsClassify: proposedSource.includes("classify"),
        graphDiffAddedNodes: graphDiff?.addedNodes.map((node) => node.id) ?? [],
        progressEvents: observed.progressEvents,
        outputChars: observed.outputChars,
        thinkingChars: observed.thinkingChars,
      });

      expect(debugContext.failedEvent).toMatchObject({ id: selectedEvent.id, type: "ambient.call.invalid", graphNodeId: "classify" });
      expect(observed.prompt).toContain(selectedEvent.id);
      expect(observed.prompt).toContain("graph node classify");
      expect(observed.progressEvents).toBeGreaterThan(0);
      expect(proposedArtifact).toMatchObject({ status: "ready_for_preview" });
      expect(proposedGraphIds).toContain("classify");
      expect(proposedSource).toContain("classify");
      expect(revision).toMatchObject({
        status: "proposed",
        baseVersionId: baseVersion.id,
        baseArtifactId: baseArtifact.id,
        proposedGraphSnapshotId: proposedThread.activeGraphSnapshotId,
      });
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  registerWorkflowLiveGoogleWorkspaceRunDogfoodTests({
    getStore: () => store,
    getWorkspacePath: () => workspacePath,
    workflowScheduleRunHistoryItems,
  });

  itLive(
    "dogfoods scheduled local-file timeout recovery with live Ambient",
    async () => {
      const apiKey = liveAmbientApiKey();
      const model = liveWorkflowModel();
      const fixtureDir = join(workspacePath, "scheduled-local-files");
      await mkdir(fixtureDir, { recursive: true });
      await writeFile(
        join(fixtureDir, "meeting-notes.md"),
        ["# Meeting notes", "- Draft the Scottsdale activities report.", "- Separate kid-friendly events from date-night options."].join(
          "\n",
        ),
        "utf8",
      );
      await writeFile(
        join(fixtureDir, "inbox.txt"),
        ["Budget review due Friday.", "Public pool list needs toddler-friendly labels.", "Archive completed research notes."].join("\n"),
        "utf8",
      );
      const paths = ["scheduled-local-files/meeting-notes.md", "scheduled-local-files/inbox.txt"];
      const createdAt = new Date(2026, 0, 1, 8, 0, 0, 0);
      const dueAt = new Date(2026, 0, 1, 10, 0, 0, 0);
      const thread = store.createWorkflowAgentThreadSummary({
        initialRequest: "Classify local files every morning and produce a compact HTML status report.",
        projectPath: workspacePath,
        traceMode: "debug",
      });
      const dashboard = await compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest:
          "Create a read-only scheduled local-file workflow that reads a small directory, checkpoints normalized evidence, asks Ambient to classify the files, and returns a compact HTML report.",
        workspaceSummary: "Live scheduled local-file timeout recovery dogfood with two small files in scheduled-local-files/.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model,
        provider: { compileProgramIr: vi.fn(async () => scheduledLocalFileTimeoutRecoveryCompilerOutput(paths)) },
      });
      const artifact = dashboard.artifacts[0];
      reviewWorkflowArtifact(store, { artifactId: artifact.id, decision: "approved" });
      const approvedVersion = store.getLatestApprovedWorkflowVersion(thread.id);
      const schedule = store.createAutomationSchedule(
        {
          targetKind: "workflow_thread",
          targetId: thread.id,
          preset: "daily",
          timezone: "America/Phoenix",
          runLimits: { idleTimeoutMs: 90_000, maxRunMs: null },
        },
        createdAt,
      )[0];
      const limited = store.updateAutomationScheduleOccurrenceRunLimits({
        scheduleId: schedule.id,
        occurrenceAt: schedule.nextRunAt,
        runLimits: { idleTimeoutMs: 90_000, maxRunMs: 650 },
        reason: "Dogfood a recoverable one-off scheduled timeout.",
      });
      const pendingException = limited.exceptions.find((exception) => exception.exceptionKind === "run_limits");
      if (!pendingException) throw new Error("Expected run-limit occurrence exception.");

      let pausedRunId = "";
      const started = await runDueWorkflowArtifactSchedules(
        store,
        dueAt,
        async (scheduleInput) => {
          expect(scheduleInput.runLimits).toMatchObject({ idleTimeoutMs: 90_000, maxRunMs: 650 });
          expect(scheduleInput.occurrenceExceptionId).toBe(pendingException.id);
          const pausedDashboard = await runWorkflowArtifact({
            store,
            artifactId: scheduleInput.artifact.id,
            workspacePath,
            permissionMode: "full-access",
            runtime: "automation",
            recoverableTimeouts: true,
            runLimits: scheduleInput.runLimits,
            model,
            ambientProvider: new AmbientWorkflowRunProvider({
              model,
              apiKey,
              baseUrl: liveAmbientBaseUrl(),
              workflowThreadId: thread.id,
              idleTimeoutMs: 90_000,
              absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
            }),
          });
          const pausedRun = latestRunForArtifact(pausedDashboard, scheduleInput.artifact.id);
          pausedRunId = pausedRun.id;
          store.appendWorkflowRunEvent({
            runId: pausedRun.id,
            type: "workflow.schedule.started",
            message: scheduleInput.schedule.id,
            data: workflowScheduleRunStartedEventData(scheduleInput),
          });
          return { runId: pausedRun.id };
        },
        { permissionMode: "full-access" },
      );
      const pausedRun = store.getWorkflowRun(pausedRunId);
      const pausedDetail = readWorkflowRunDetail(store, pausedRunId);
      const timeoutPause = workflowTotalRuntimePauseModel(pausedDetail.run.status, pausedDetail.events);
      const removeCapComposer = workflowThreadComposerModel({ draft: "remove total runtime cap", detail: pausedDetail });

      const resumedDashboard = await runWorkflowArtifact({
        store,
        artifactId: artifact.id,
        workspacePath,
        permissionMode: "full-access",
        resumeFromRunId: pausedRun.id,
        runLimits: workflowRemoveTotalRunLimitOverrides({ idleTimeoutMs: 90_000 }),
        model,
        ambientProvider: new AmbientWorkflowRunProvider({
          model,
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          workflowThreadId: thread.id,
          idleTimeoutMs: 90_000,
          absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const resumedRun = latestRunForArtifact(resumedDashboard, artifact.id);
      const resumedDetail = readWorkflowRunDetail(store, resumedRun.id);
      const scheduleRunHistory = workflowScheduleRunHistoryItems(schedule.id, store.listWorkflowRuns(), 5);
      const outputCards = workflowRunOutputCards(resumedDetail);
      const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
        checkpoints?: Record<string, { value?: { files?: unknown[]; report?: { summary?: string; html?: string; files?: string[] } } }>;
      };

      await writeScheduledLocalTimeoutRecoveryDogfoodArtifact({
        schedule: {
          id: schedule.id,
          targetKind: schedule.targetKind,
          targetId: schedule.targetId,
          runLimits: schedule.runLimits,
          startedOutcome: started[0],
          consumedExceptions: store.listAutomationScheduleExceptions({ scheduleId: schedule.id }).map((exception) => ({
            id: exception.id,
            kind: exception.exceptionKind,
            status: exception.status,
            runLimits: exception.runLimits,
          })),
        },
        version: approvedVersion ? { id: approvedVersion.id, version: approvedVersion.version, status: approvedVersion.status } : undefined,
        pausedRun: { id: pausedRun.id, status: pausedRun.status, error: pausedRun.error, scheduledBy: pausedRun.scheduledBy },
        timeoutPause,
        removeCapComposer: {
          mode: removeCapComposer.mode,
          runtimeAction: removeCapComposer.runtimeAction,
          disabled: removeCapComposer.disabled,
        },
        resumedRun: { id: resumedRun.id, status: resumedRun.status, error: resumedRun.error, scheduledBy: resumedRun.scheduledBy },
        scheduleRunHistory,
        eventCounts: eventCountsByType(resumedDetail.events),
        modelCalls: resumedDetail.modelCalls.map((call) => ({
          task: call.task,
          status: call.status,
          latencyMs: call.latencyMs,
          graphNodeId: call.graphNodeId,
        })),
        outputCards: outputCards.map((card) => ({
          kind: card.kind,
          format: card.format,
          label: card.label,
          preview: card.preview?.slice(0, 360),
        })),
        checkpoint: state.checkpoints?.scheduledLocalReport?.value,
      });

      expect(approvedVersion).toMatchObject({ workflowThreadId: thread.id, artifactId: artifact.id, status: "approved" });
      expect(started).toEqual([
        expect.objectContaining({
          scheduleId: schedule.id,
          artifactId: artifact.id,
          workflowThreadId: thread.id,
          versionId: approvedVersion?.id,
          outcome: "started",
          runId: pausedRun.id,
        }),
      ]);
      expect(pausedRun).toMatchObject({
        status: "paused",
        error: "Workflow reached the total runtime limit (650ms).",
        scheduledBy: expect.objectContaining({ scheduleId: schedule.id, targetVersionId: approvedVersion?.id }),
      });
      expect(timeoutPause).toMatchObject({ totalLimitLabel: "650 ms", sourceLabel: "run override" });
      expect(removeCapComposer).toMatchObject({ mode: "run_recovery", runtimeAction: "remove_total_runtime_cap", disabled: false });
      expect(resumedRun).toMatchObject({
        status: "succeeded",
        scheduledBy: expect.objectContaining({ scheduleId: schedule.id, targetVersionId: approvedVersion?.id }),
      });
      expect(resumedDetail.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "workflow.resume", message: pausedRun.id }),
          expect.objectContaining({
            type: "workflow.schedule.started",
            message: schedule.id,
            data: expect.objectContaining({ resumeSourceRunId: pausedRun.id }),
          }),
          expect.objectContaining({ type: "checkpoint.resume", message: "scheduledLocalEvidence" }),
          expect.objectContaining({ type: "ambient.call.progress", graphNodeId: "classify-files" }),
          expect.objectContaining({ type: "checkpoint.write", message: "scheduledLocalReport" }),
        ]),
      );
      expect(scheduleRunHistory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: resumedRun.id, statusLabel: "Run Succeeded", actionLabel: "Open run" }),
          expect.objectContaining({ id: pausedRun.id, statusLabel: "Run Paused", actionLabel: "Extend run" }),
        ]),
      );
      expect(store.listAutomationScheduleExceptions({ scheduleId: schedule.id })).toEqual([
        expect.objectContaining({ id: pendingException.id, exceptionKind: "run_limits", status: "consumed" }),
      ]);
      expect(resumedDetail.modelCalls).toEqual(
        expect.arrayContaining([expect.objectContaining({ task: "dogfood.scheduled_local_report", status: "succeeded" })]),
      );
      expect(outputCards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ format: "html", preview: expect.stringMatching(/file|classif|report|scottsdale|pool|budget/i) }),
        ]),
      );
      expect(state.checkpoints?.scheduledLocalReport?.value?.report?.summary).toMatch(/file|classif|report|scottsdale|pool|budget/i);
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );
});
