export async function runOrchestrationSmoke(cdp, actions) {
  const {
    clickButton,
    waitFor,
    clickWorkflowAgentView,
    evaluate,
    fillInput,
    clickButtonByTitle,
    clickEnabledButton,
    clickWorkflowAgentSidebarThread,
    clickEnabledButtonIn,
    clickEnabledButtonInRow,
    selectAutomationField,
    dragKanbanCardToColumn,
  } = actions;
  await clickButton(cdp, "Workflow Agents");
  await waitFor(
    cdp,
    () => document.body.innerText.includes("Workflow Agents") && Boolean(document.querySelector(".workflow-agent-tabs")),
    "workflow agents home panel",
  );
  await clickWorkflowAgentView(cdp, "Local Tasks");
  await waitFor(cdp, () => document.body.innerText.includes("Add task"), "local tasks pane");
  await evaluate(cdp, `window.ambientDesktop.setOrchestrationAutoDispatchEnabled({ enabled: false }).then(() => true)`);
  await waitFor(cdp, () => document.body.innerText.includes("Auto-dispatch off"), "auto-dispatch paused for manual orchestration smoke");
  await clickWorkflowAgentView(cdp, "New Workflow");
  await waitFor(cdp, () => document.body.innerText.includes("New Workflow"), "new workflow panel");
  await waitFor(cdp, () => document.body.innerText.includes("Skip discovery and compile"), "workflow compiler controls");
  const compileDisabledWithoutRequest = await evaluate(
    cdp,
    `
    (() => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === "Skip discovery and compile");
      return Boolean(button?.disabled);
    })()
  `,
  );
  if (!compileDisabledWithoutRequest) throw new Error("Workflow Agent skip-discovery compile should be disabled until request is filled.");
  await fillInput(cdp, 'textarea[placeholder="Workflow request"]', "Find weekend activities in Scottsdale Arizona");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === "Skip discovery and compile" && !button.disabled,
      ),
    "workflow request enables skip-discovery compile",
  );
  await clickButtonByTitle(cdp, "Reload workflow artifacts, runs, and audit details.");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === "Skip discovery and compile" && !button.disabled,
      ),
    "workflow refresh preserves request field state",
  );
  await clickEnabledButton(cdp, "Create sample");
  await waitFor(cdp, () => document.body.innerText.includes("Workflow Agent tool bridge preview"), "workflow sample artifact");
  await clickWorkflowAgentSidebarThread(cdp, "Workflow Agent tool bridge preview");
  await waitFor(
    cdp,
    () => document.querySelector(".workflow-agent-diagram-pane")?.textContent?.includes("Workflow Diagram"),
    "workflow graph diagram pane",
  );
  await waitFor(cdp, () => Boolean(document.querySelector(".workflow-agent-node")), "workflow graph diagram nodes");
  await waitFor(
    cdp,
    () => document.querySelector(".workflow-connector-list")?.textContent?.includes("workspace.inventory"),
    "workflow connector consent list",
  );
  await waitFor(cdp, () => document.body.innerText.includes("workspace.inventory"), "workflow connector grant");
  await waitFor(cdp, () => document.body.innerText.includes("Account Local workspace (workspace)"), "workflow connector account label");
  await waitFor(cdp, () => document.body.innerText.includes("Account status available"), "workflow connector account status");
  await waitFor(
    cdp,
    () => document.body.innerText.includes("Auth No OAuth required for the local workspace."),
    "workflow connector auth status",
  );
  await waitFor(
    cdp,
    () => document.body.innerText.includes("Read workspace file inventory (workspace.files.read)"),
    "workflow connector scope label",
  );
  await waitFor(cdp, () => document.body.innerText.includes("Operations List files (listFiles)"), "workflow connector operation label");
  await waitFor(
    cdp,
    () => document.body.innerText.includes("Side effects Read-only workspace metadata"),
    "workflow connector side effects",
  );
  await waitFor(cdp, () => document.body.innerText.includes("Rate limit 300/min burst 30"), "workflow connector rate limit");
  await waitFor(cdp, () => document.body.innerText.includes("Sync One bounded page; no sync cursor"), "workflow connector sync policy");
  await waitFor(
    cdp,
    () =>
      document.body.innerText.includes(
        "Sample preview entries include path, type, size, and truncation flags; file contents are not read.",
      ),
    "workflow connector sample preview",
  );
  await waitFor(
    cdp,
    () => document.body.innerText.includes("Only redacted summaries are kept in the audit trail."),
    "workflow connector retention policy",
  );
  await waitFor(
    cdp,
    () => document.body.innerText.includes("Review policy: personal-data or mutation calls pause for approval."),
    "workflow connector review policy",
  );
  await clickEnabledButton(cdp, "Use no retention");
  await waitFor(cdp, () => document.body.innerText.includes("Retention None"), "workflow connector retention downgrade");
  await waitFor(
    cdp,
    () => document.body.innerText.includes("No connector values are retained after the call."),
    "workflow connector downgraded policy",
  );
  await waitFor(cdp, () => document.body.innerText.includes("Audit Preview"), "workflow audit preview");
  await waitFor(
    cdp,
    () => document.querySelector(".workflow-program-inspector")?.innerText.includes("export default async function"),
    "workflow source preview",
  );
  await waitFor(
    cdp,
    () => {
      const modelCalls = document.querySelector(".workflow-model-call-list")?.innerText ?? "";
      return (
        modelCalls.includes("compiler.plan") &&
        modelCalls.includes("Status succeeded") &&
        modelCalls.includes("Replay workflow-sample-preview") &&
        modelCalls.includes('Input {"request":"Build a local workflow preview artifact."}') &&
        modelCalls.includes('Output {"programShape":"deterministic steps plus structured Ambient calls","confidence":0.92}')
      );
    },
    "workflow model call review list",
  );
  await waitFor(
    cdp,
    () => {
      const events = document.querySelector(".workflow-event-list")?.innerText ?? "";
      return (
        events.includes("Events") &&
        events.includes("workflow.compile") &&
        events.includes("workflow.manifest") &&
        events.includes("workflow.audit")
      );
    },
    "workflow event review list",
  );
  const workflowSource = await evaluate(
    cdp,
    `[...document.querySelectorAll(".workflow-program-inspector pre")].map((item) => item.innerText).find((text) => text.includes("export default async function")) ?? ""`,
  );
  if (!workflowSource.includes("export default async function")) throw new Error("Workflow source preview did not expose editable source.");
  await clickEnabledButtonIn(cdp, ".workflow-program-inspector", "Edit source");
  await waitFor(cdp, () => Boolean(document.querySelector('textarea[placeholder="Workflow source"]')), "workflow source editor");
  await waitFor(
    cdp,
    () => document.querySelector(".workflow-source-diff-preview")?.innerText.includes("No source changes"),
    "workflow source clean diff preview",
  );
  const unchangedSourceSaveDisabled = await evaluate(
    cdp,
    `
    (() => {
      const root = document.querySelector(".workflow-program-inspector");
      const button = [...(root?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.trim() === "Save source");
      return Boolean(button?.disabled);
    })()
  `,
  );
  if (!unchangedSourceSaveDisabled) throw new Error("Workflow source editor enabled Save source for an unchanged draft.");
  await fillInput(cdp, 'textarea[placeholder="Workflow source"]', `${workflowSource}\n// e2e unsaved source draft`);
  await waitFor(
    cdp,
    () => {
      const rawDrafts = window.localStorage.getItem("ambient.workflowSourceDrafts.v1");
      if (!rawDrafts) return false;
      try {
        return Object.values(JSON.parse(rawDrafts)).some((value) => String(value).includes("// e2e unsaved source draft"));
      } catch {
        return false;
      }
    },
    "workflow source draft stored locally",
  );
  await clickWorkflowAgentView(cdp, "Local Tasks");
  await waitFor(cdp, () => document.body.innerText.includes("Add task"), "local tasks pane after source draft");
  await clickWorkflowAgentSidebarThread(cdp, "Workflow Agent tool bridge preview");
  await waitFor(cdp, () => document.body.innerText.includes("Resume source edit"), "workflow source draft resume action");
  await clickEnabledButtonIn(cdp, ".workflow-program-inspector", "Resume source edit");
  await waitFor(
    cdp,
    () => document.querySelector('textarea[placeholder="Workflow source"]')?.value.includes("// e2e unsaved source draft"),
    "workflow source draft persisted",
  );
  await clickEnabledButtonIn(cdp, ".workflow-program-inspector", "Cancel source edit");
  await waitFor(
    cdp,
    () => {
      const rawDrafts = window.localStorage.getItem("ambient.workflowSourceDrafts.v1");
      if (!rawDrafts) return true;
      try {
        return !Object.values(JSON.parse(rawDrafts)).some((value) => String(value).includes("// e2e unsaved source draft"));
      } catch {
        return false;
      }
    },
    "workflow source draft cleared from local storage",
  );
  await clickEnabledButtonIn(cdp, ".workflow-program-inspector", "Edit source");
  await waitFor(
    cdp,
    () => Boolean(document.querySelector('textarea[placeholder="Workflow source"]')),
    "workflow source editor after draft cancel",
  );
  await fillInput(cdp, 'textarea[placeholder="Workflow source"]', "export default async function run() { return process.env.HOME; }");
  await waitFor(
    cdp,
    () => document.querySelector(".workflow-source-diff-preview")?.innerText.includes("Source diff +"),
    "workflow source dirty diff preview",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".workflow-source-diff-lines")?.innerText.includes("+ export default async function run()"),
    "workflow source diff line preview",
  );
  await clickEnabledButtonIn(cdp, ".workflow-program-inspector", "Save source");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".workflow-artifact-row")].some(
        (row) => row.innerText.includes("Rejected") && row.innerText.includes("Rejected previews cannot run"),
      ) && document.querySelector(".workflow-program-inspector")?.innerText.includes("process.env.HOME"),
    "workflow invalid source edit rejected",
  );
  const invalidSourceRunEnabled = await evaluate(
    cdp,
    `
    (() => {
      const row = [...document.querySelectorAll(".workflow-artifact-row")].find((item) => item.innerText.includes("Rejected"));
      return [...(row?.querySelectorAll("button") ?? [])].some((button) => !button.disabled && ["Dry run", "Run unapproved", "Run"].includes(button.textContent?.trim() ?? ""));
    })()
  `,
  );
  if (invalidSourceRunEnabled) throw new Error("Workflow artifact exposed run controls after invalid source edit.");
  await clickEnabledButtonIn(cdp, ".workflow-program-inspector", "Edit source");
  await waitFor(cdp, () => Boolean(document.querySelector('textarea[placeholder="Workflow source"]')), "workflow source recovery editor");
  await fillInput(cdp, 'textarea[placeholder="Workflow source"]', `${workflowSource}\n// e2e source edit recovered`);
  await clickEnabledButtonIn(cdp, ".workflow-program-inspector", "Save source");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".workflow-artifact-row")].some(
        (row) => row.innerText.includes("Ready For Preview") && row.innerText.includes("Review the generated source"),
      ) && document.querySelector(".workflow-program-inspector")?.innerText.includes("// e2e source edit recovered"),
    "workflow source edit recovered",
  );
  await waitFor(
    cdp,
    () => {
      const row = document.querySelector(".workflow-artifact-row");
      return Boolean(
        row?.innerText.includes("Run unapproved") &&
        row.innerText.includes("Approve") &&
        row.innerText.includes("Reject") &&
        row.innerText.includes("Review the generated source"),
      );
    },
    "workflow artifact review gate",
  );
  const normalRunBeforeApproval = await evaluate(
    cdp,
    `
    (() => {
      const row = [...document.querySelectorAll(".workflow-artifact-row")].find((item) => item.innerText.includes("Ready For Preview"));
      return [...(row?.querySelectorAll("button") ?? [])].some((button) => button.textContent?.trim() === "Run" && !button.disabled);
    })()
  `,
  );
  if (normalRunBeforeApproval) throw new Error("Workflow artifact exposed normal Run before approval.");
  await clickEnabledButton(cdp, "Revalidate");
  await waitFor(
    cdp,
    () => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Revalidate" && !button.disabled),
    "workflow artifact revalidation action settled",
  );
  await clickEnabledButton(cdp, "Remove scope workspace.files.read");
  await waitFor(
    cdp,
    () => {
      const row = [...document.querySelectorAll(".workflow-artifact-row")].find((item) => item.innerText.includes("Rejected"));
      return Boolean(row?.innerText.includes("Rejected previews cannot run unless they are edited and recompiled."));
    },
    "workflow connector scope removal rejected gate",
  );
  await clickWorkflowAgentView(cdp, "New Workflow");
  await waitFor(
    cdp,
    () => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Create sample" && !button.disabled),
    "workflow connector scope removal action settled",
  );
  await clickEnabledButton(cdp, "Create sample");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".workflow-artifact-row")].some(
        (row) => row.innerText.includes("Ready For Preview") && row.innerText.includes("Approve") && row.innerText.includes("Reject"),
      ),
    "fresh workflow artifact review gate after scope removal",
  );
  await clickEnabledButton(cdp, "Reject connector");
  await waitFor(
    cdp,
    () => {
      const row = [...document.querySelectorAll(".workflow-artifact-row")].find((item) => item.innerText.includes("Rejected"));
      return Boolean(row?.innerText.includes("Rejected previews cannot run unless they are edited and recompiled."));
    },
    "workflow connector grant rejected gate",
  );
  await clickWorkflowAgentView(cdp, "New Workflow");
  await waitFor(
    cdp,
    () => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Create sample" && !button.disabled),
    "workflow connector rejection action settled",
  );
  await clickEnabledButton(cdp, "Create sample");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".workflow-artifact-row")].some(
        (row) => row.innerText.includes("Ready For Preview") && row.innerText.includes("Approve") && row.innerText.includes("Reject"),
      ),
    "fresh workflow artifact review gate after connector rejection",
  );
  await clickEnabledButtonInRow(cdp, ".workflow-artifact-row", "Ready For Preview", "Reject");
  await waitFor(
    cdp,
    () => {
      const row = [...document.querySelectorAll(".workflow-artifact-row")].find((item) => item.innerText.includes("Rejected"));
      return Boolean(row?.innerText.includes("Rejected previews cannot run unless they are edited and recompiled."));
    },
    "workflow artifact rejected gate",
  );
  const rejectedRunEnabled = await evaluate(
    cdp,
    `
    (() => {
      const row = [...document.querySelectorAll(".workflow-artifact-row")].find((item) => item.innerText.includes("Rejected"));
      return [...(row?.querySelectorAll("button") ?? [])].some((button) => !button.disabled && ["Dry run", "Run unapproved", "Run"].includes(button.textContent?.trim() ?? ""));
    })()
  `,
  );
  if (rejectedRunEnabled) throw new Error("Workflow artifact exposed run controls after rejection.");
  await clickWorkflowAgentView(cdp, "New Workflow");
  await waitFor(
    cdp,
    () => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Create sample" && !button.disabled),
    "workflow revision discovery action settled",
  );
  await clickEnabledButton(cdp, "Create sample");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".workflow-artifact-row")].some(
        (row) => row.innerText.includes("Ready For Preview") && row.innerText.includes("Approve") && row.innerText.includes("Reject"),
      ),
    "fresh workflow artifact review gate",
  );
  await clickEnabledButtonInRow(cdp, ".workflow-artifact-row", "Ready For Preview", "Run unapproved");
  await waitFor(
    cdp,
    () => document.querySelector(".workflow-audit-preview")?.innerText.includes("Run Console"),
    "workflow run unapproved console",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".workflow-review-list")?.innerText.includes("sample-review"),
    "workflow run unapproved review queue",
  );
  await waitFor(
    cdp,
    () => {
      const row = [...document.querySelectorAll(".workflow-artifact-row")].find((item) => item.innerText.includes("Ready For Preview"));
      return Boolean(
        row?.innerText.includes("Run unapproved") &&
        row.innerText.includes("Approve") &&
        row.innerText.includes("Reject") &&
        ![...(row.querySelectorAll("button") ?? [])].some((button) => button.textContent?.trim() === "Run" && !button.disabled),
      );
    },
    "workflow run unapproved preserves review gate",
  );
  await clickEnabledButtonIn(cdp, ".workflow-review-list", "Reject");
  await waitFor(
    cdp,
    () => document.querySelector(".workflow-review-list")?.innerText.includes("Rejected"),
    "workflow run unapproved review reject",
  );
  await clickEnabledButtonIn(cdp, ".workflow-audit-preview", "Close");
  await waitFor(cdp, () => !document.querySelector(".workflow-audit-preview"), "workflow run unapproved console close");
  await clickEnabledButtonInRow(cdp, ".workflow-artifact-row", "Ready For Preview", "Approve");
  await waitFor(
    cdp,
    () => {
      const row = [...document.querySelectorAll(".workflow-artifact-row")].find((item) => item.innerText.includes("Approved"));
      return Boolean(
        row?.innerText.includes("Approved") &&
        [...row.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Run" && !button.disabled),
      );
    },
    "workflow artifact approved gate",
  );
  await clickEnabledButtonInRow(cdp, ".workflow-artifact-row", "Approved", "Dry run");
  await waitFor(cdp, () => document.body.innerText.includes("Run Console"), "workflow dry-run console");
  await waitFor(cdp, () => document.body.innerText.includes("dry_run"), "workflow dry-run mode event");
  await waitFor(cdp, () => document.body.innerText.includes("connector.end"), "workflow connector event");
  await waitFor(
    cdp,
    () => {
      const connectorCalls = document.querySelector(".workflow-connector-call-list")?.innerText ?? "";
      return (
        connectorCalls.includes("workspace.inventory.listFiles") &&
        connectorCalls.includes("Completed") &&
        connectorCalls.includes("Retention redacted_audit") &&
        connectorCalls.includes("Side effects none") &&
        connectorCalls.includes("Personal data no") &&
        connectorCalls.includes('Input {"maxEntries":25}') &&
        connectorCalls.includes("Output ")
      );
    },
    "workflow connector call review list",
  );
  await clickEnabledButtonInRow(cdp, ".workflow-artifact-row", "Approved", "Run");
  await waitFor(cdp, () => document.body.innerText.includes("Run Console"), "workflow run console");
  await waitFor(cdp, () => document.body.innerText.includes("Paused"), "workflow run paused for approval");
  await waitFor(cdp, () => document.querySelector(".workflow-review-list")?.innerText.includes("sample-review"), "workflow review queue");
  await waitFor(
    cdp,
    () => {
      const steps = document.querySelector(".workflow-step-list")?.innerText ?? "";
      return (
        steps.includes("Step Timeline") &&
        steps.includes("preview audit") &&
        steps.includes("Paused") &&
        steps.includes("Approval approval-")
      );
    },
    "workflow step timeline paused state",
  );
  await clickEnabledButtonIn(cdp, ".workflow-review-list", "Approve");
  await waitFor(
    cdp,
    () => {
      const root = document.querySelector(".workflow-review-list");
      if (!root) return false;
      if (root.innerText.includes("Approved")) return true;
      const button = [...root.querySelectorAll("button")].find((item) => !item.disabled && item.textContent?.includes("Approve"));
      button?.click();
      return false;
    },
    "workflow review decision",
  );
  await clickEnabledButtonIn(cdp, ".workflow-audit-preview", "Resume");
  await waitFor(
    cdp,
    () => {
      const root = document.querySelector(".workflow-audit-preview");
      const text = root?.innerText ?? "";
      return (
        text.includes("Succeeded") &&
        [...(root?.querySelectorAll("button") ?? [])].some((button) => !button.disabled && button.textContent?.includes("Resume"))
      );
    },
    "workflow run resumed after approval",
    30_000,
  );
  await waitFor(
    cdp,
    () => document.querySelector(".workflow-checkpoint-list")?.innerText.includes("sample"),
    "workflow checkpoint console",
  );
  await clickEnabledButtonIn(cdp, ".workflow-audit-preview", "Resume");
  await waitFor(
    cdp,
    () => document.querySelector(".workflow-audit-preview")?.innerText.includes("checkpoint.resume"),
    "workflow resume from checkpoint",
    30_000,
  );
  await clickEnabledButtonIn(cdp, ".workflow-audit-preview", "Close");
  await waitFor(cdp, () => !document.querySelector(".workflow-audit-preview"), "workflow run console close");
  await clickEnabledButtonInRow(cdp, ".workflow-artifact-row", "Approved", "Audit");
  await waitFor(
    cdp,
    () => document.querySelector(".workflow-audit-preview")?.innerText.includes("Run Console"),
    "workflow audit reopen after close",
  );
  await clickWorkflowAgentView(cdp, "Local Tasks");
  const addDisabledWithoutTitle = await evaluate(
    cdp,
    `
    (() => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === "Add task");
      return Boolean(button?.disabled);
    })()
  `,
  );
  if (!addDisabledWithoutTitle) throw new Error("Local Task Add task button should be disabled until Title is filled.");
  await fillInput(cdp, 'input[placeholder="Priority"]', "p12x34");
  await waitFor(cdp, () => document.querySelector('input[placeholder="Priority"]')?.value === "123", "local task priority sanitization");
  await selectAutomationField(cdp, "Trigger", "scheduled");
  await waitFor(cdp, () => document.body.innerText.includes("Next eligible 9:00 AM window"), "local task scheduled trigger preview");
  await selectAutomationField(cdp, "Schedule", "advanced");
  await waitFor(cdp, () => Boolean(document.querySelector('input[placeholder="0 9 * * *"]')), "local task advanced cron field");
  await fillInput(cdp, 'input[placeholder="0 9 * * *"]', "30 10 * * 6");
  await waitFor(cdp, () => document.body.innerText.includes("Next run follows 30 10 * * 6"), "local task custom cron preview");
  await fillInput(cdp, 'input[placeholder="Task title"]', "E2E orchestration task");
  await fillInput(cdp, 'textarea[placeholder="Description"]', "Prepare a deterministic task workspace.");
  await fillInput(cdp, 'input[placeholder="Labels"]', "client, qa, client");
  await clickButton(cdp, "Add task");
  await waitFor(cdp, () => document.body.innerText.includes("E2E orchestration task"), "created orchestration task");
  await waitFor(
    cdp,
    () => {
      const board = document.querySelector(".task-kanban-board");
      return Boolean(
        board?.textContent?.includes("Todo") && board.textContent.includes("Ready") && board.textContent.includes("E2E orchestration task"),
      );
    },
    "local task kanban board",
  );
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".task-kanban-card")].some(
        (card) => card.textContent?.includes("E2E orchestration task") && card.textContent.includes("Scheduled 30 10 * * 6"),
      ),
    "local task scheduled trigger badge",
  );
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".task-kanban-card")].some(
        (card) =>
          card.textContent?.includes("E2E orchestration task") && card.textContent.includes("client") && card.textContent.includes("qa"),
      ),
    "local task create labels",
  );
  await clickEnabledButtonInRow(cdp, ".task-kanban-card", "E2E orchestration task", "Remove label client");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".task-kanban-card")].some(
        (card) =>
          card.textContent?.includes("E2E orchestration task") && !card.textContent.includes("client") && card.textContent.includes("qa"),
      ),
    "local task remove label control",
  );
  await clickEnabledButtonInRow(cdp, ".task-kanban-card", "E2E orchestration task", "Edit card");
  await waitFor(cdp, () => Boolean(document.querySelector('input[placeholder="Edit task title"]')), "local task card edit form");
  await fillInput(cdp, 'input[placeholder="Edit task title"]', "");
  const saveDisabledWithoutEditTitle = await evaluate(
    cdp,
    `
    (() => {
      const card = [...document.querySelectorAll(".task-kanban-card")].find((item) => item.querySelector('input[placeholder="Edit task title"]'));
      const button = [...(card?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.trim() === "Save card");
      return Boolean(button?.disabled);
    })()
  `,
  );
  if (!saveDisabledWithoutEditTitle) throw new Error("Local Task Save card button should be disabled when the edited title is blank.");
  await fillInput(cdp, 'input[placeholder="Edit task title"]', "E2E orchestration task updated");
  await fillInput(cdp, 'textarea[placeholder="Edit task description"]', "Prepare an updated deterministic task workspace.");
  const savedEditedCard = await evaluate(
    cdp,
    `
    (() => {
      const card = [...document.querySelectorAll(".task-kanban-card")].find((item) => item.querySelector('input[placeholder="Edit task title"]'));
      const button = [...(card?.querySelectorAll("button") ?? [])].find((item) => !item.disabled && item.textContent?.trim() === "Save card");
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!savedEditedCard) throw new Error("Local Task Save card button should be enabled after editing title and description.");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".task-kanban-card")].some(
        (card) =>
          card.textContent?.includes("E2E orchestration task updated") &&
          card.textContent.includes("Prepare an updated deterministic task workspace."),
      ),
    "local task card edit save",
  );
  await fillInput(cdp, 'input[placeholder="Task title"]', "E2E blocker task");
  await fillInput(cdp, 'textarea[placeholder="Description"]', "Independent prerequisite task.");
  await clickButton(cdp, "Add task");
  await waitFor(cdp, () => document.body.innerText.includes("E2E blocker task"), "created orchestration blocker task");
  await clickEnabledButtonInRow(cdp, ".task-kanban-card", "E2E orchestration task updated", "Add blocker");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".task-kanban-card")].some(
        (card) =>
          card.textContent?.includes("E2E orchestration task updated") &&
          card.textContent.includes("Blocked by") &&
          card.textContent.includes("E2E blocker task"),
      ),
    "local task blocker add control",
  );
  await clickEnabledButtonInRow(cdp, ".task-kanban-card", "E2E orchestration task updated", "Remove blocker");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".task-kanban-card")].some(
        (card) => card.textContent?.includes("E2E orchestration task updated") && !card.textContent.includes("Blocked by"),
      ),
    "local task blocker remove control",
  );
  await clickEnabledButtonInRow(cdp, ".task-kanban-card", "E2E orchestration task updated", "Priority higher");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".task-kanban-card")].some(
        (card) => card.textContent?.includes("E2E orchestration task updated") && card.textContent.includes("Priority 122"),
      ),
    "local task priority higher control",
  );
  await clickEnabledButtonInRow(cdp, ".task-kanban-card", "E2E orchestration task updated", "Priority lower");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".task-kanban-card")].some(
        (card) => card.textContent?.includes("E2E orchestration task updated") && card.textContent.includes("Priority 123"),
      ),
    "local task priority lower control",
  );
  await clickEnabledButtonInRow(cdp, ".task-kanban-card", "E2E orchestration task updated", "Move to Ready");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".task-kanban-column")].some(
        (column) =>
          column.querySelector(".task-kanban-column-header")?.textContent?.includes("Ready") &&
          column.textContent?.includes("E2E orchestration task updated"),
      ),
    "local task kanban move control",
  );
  await dragKanbanCardToColumn(cdp, "E2E orchestration task updated", "In Progress");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".task-kanban-column")].some(
        (column) =>
          column.querySelector(".task-kanban-column-header")?.textContent?.includes("In Progress") &&
          column.textContent?.includes("E2E orchestration task updated"),
      ),
    "local task kanban drag to in progress",
  );
  await dragKanbanCardToColumn(cdp, "E2E orchestration task updated", "Ready");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".task-kanban-column")].some(
        (column) =>
          column.querySelector(".task-kanban-column-header")?.textContent?.includes("Ready") &&
          column.textContent?.includes("E2E orchestration task updated"),
      ),
    "local task kanban drag back to ready",
  );
  await clickEnabledButton(cdp, "Prepare next");
  await waitFor(cdp, () => document.body.innerText.includes("Recent Runs"), "orchestration run dashboard");
  await waitFor(cdp, () => document.body.innerText.includes("Prepared workspace"), "orchestration timeline");
  await waitFor(cdp, () => document.body.innerText.includes("Proof of work"), "orchestration proof preview");
  await waitFor(cdp, () => document.body.innerText.includes("Reveal workspace"), "orchestration workspace navigation");
  await clickWorkflowAgentView(cdp, "Schedules");
  await waitFor(cdp, () => document.body.innerText.includes("Cron-like schedules are represented here"), "schedules pane");
  await selectAutomationField(cdp, "Target type", "workflow_artifact");
  await waitFor(cdp, () => document.body.innerText.includes("Workflow Agent tool bridge preview"), "schedule workflow target");
  await selectAutomationField(cdp, "Preset", "advanced");
  await waitFor(cdp, () => Boolean(document.querySelector('input[placeholder="0 9 * * *"]')), "schedule advanced cron field");
  await fillInput(cdp, 'input[placeholder="0 9 * * *"]', "15 8 * * 1");
  await waitFor(
    cdp,
    () => {
      const card = document.querySelector(".automation-schedule-card");
      return Boolean(card?.textContent?.includes("Cron 15 8 * * 1") && card.textContent.includes("Next run follows 15 8 * * 1"));
    },
    "schedule custom cron preview",
  );
  await clickEnabledButton(cdp, "Save schedule");
  await waitFor(
    cdp,
    () =>
      document.body.innerText.includes("Saved Schedules") &&
      document.body.innerText.includes("Workflow Agent tool bridge preview") &&
      document.body.innerText.includes("Skip if active"),
    "saved durable schedule record",
  );
  await selectAutomationField(cdp, "Enabled", "paused");
  await waitFor(cdp, () => document.querySelector(".automation-schedule-card")?.textContent?.includes("Paused"), "schedule paused preview");

  await clickWorkflowAgentSidebarThread(cdp, "Workflow Agent tool bridge preview");
  await waitFor(
    cdp,
    () => document.body.innerText.includes("Workflow Agent tool bridge preview"),
    "workflow sample artifact before restart draft",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".workflow-program-inspector")?.innerText.includes("export default async function"),
    "workflow source preview before restart draft",
  );
  await clickEnabledButtonIn(cdp, ".workflow-program-inspector", "Edit source");
  await waitFor(
    cdp,
    () => Boolean(document.querySelector('textarea[placeholder="Workflow source"]')),
    "workflow restart source draft editor",
  );
  await fillInput(cdp, 'textarea[placeholder="Workflow source"]', `${workflowSource}\n// e2e restart source draft`);
  await waitFor(
    cdp,
    () => {
      const rawDrafts = window.localStorage.getItem("ambient.workflowSourceDrafts.v1");
      if (!rawDrafts) return false;
      try {
        return Object.values(JSON.parse(rawDrafts)).some((value) => String(value).includes("// e2e restart source draft"));
      } catch {
        return false;
      }
    },
    "workflow source draft stored for app restart",
  );
}
