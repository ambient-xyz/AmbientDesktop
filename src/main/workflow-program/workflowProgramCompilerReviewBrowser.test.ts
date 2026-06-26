import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors } from "./workflowProgramDesktopToolFacade";
import { compileWorkflowProgramIr } from "./workflowProgramCompiler";

describe("compileWorkflowProgramIr review and browser handoff contracts", () => {
  it("compiles review.input nodes into traceable workflow.askUser review gates", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Browser Intervention Review",
        goal: "Open a page and pause for the user if browser intervention is needed.",
        nodes: [
          {
            id: "open-page",
            kind: "tool.call",
            tool: "browser_nav",
            args: { url: "https://example.com", waitForUserAction: false },
            output: { type: "browserPageSummary" },
          },
          {
            id: "browser-review",
            kind: "review.input",
            dependsOn: ["open-page"],
            prompt: "Complete any browser challenge, then choose how to continue.",
            choices: [
              { id: "completed", label: "Completed" },
              { id: "skip", label: "Skip this page" },
            ],
            allowFreeform: true,
            data: { browserIntervention: { fromNode: "open-page" } },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["browser-review"],
            value: { reviewChoice: { fromNode: "browser-review", path: "choiceId" } },
          },
        ],
      },
    });

    expect(result.output.graph?.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "browser-review", type: "review_gate" })]),
    );
    expect(result.output.source).toContain("workflow.askUser");
    expect(result.output.source).toContain('{ nodeId: "browser-review" }');
    expect(result.output.source).toContain("browserIntervention");
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["tool:browser_nav", "review:browser-review"]),
    );
  });

  it("compiles browser.intervention into conditional user handoff and same-session retry code", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Browser Intervention",
        goal: "Read a browser source while preserving CAPTCHA/MFA user handoff behavior.",
        nodes: [
          {
            id: "browser-intervention",
            kind: "browser.intervention",
            tool: "browser_nav",
            args: { url: "https://example.com/source" },
            source: { title: "Example source", url: "https://example.com/source", snippet: "test source" },
            prompt: "Complete any browser challenge, then continue or skip this source.",
            screenshot: { enabled: true, args: {} },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["browser-intervention"],
            value: {
              skipped: { fromNode: "browser-intervention", path: "skipped" },
              textChars: { fromNode: "browser-intervention", path: "textChars" },
              screenshot: { fromNode: "browser-intervention", path: "screenshot" },
            },
          },
        ],
      },
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["browser_nav", "browser_screenshot"]));
    expect(result.output.graph?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "browser-intervention",
          type: "data_source",
          reviewPolicy: expect.stringContaining("Pause only if the browser reports"),
        }),
      ]),
    );
    expect(result.output.source).toContain("isBrowserUserAction");
    expect(result.output.source).toContain("workflow.askUser");
    expect(result.output.source).toContain("userActionId");
    expect(result.output.source).toContain("tools.browser_screenshot");
    expect(result.loweredPlan.operations.find((operation) => operation.nodeId === "browser-intervention")).toMatchObject({
      operationKind: "runtime.browser_intervention",
      toolName: "browser_nav",
    });
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["tool:browser_nav", "tool:browser_screenshot"]),
    );
  });

  it("compiles chained browser.intervention skip guards without calling later browser reads", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Browser Intervention Skip Guard",
        goal: "Avoid later browser reads after the user skips an earlier blocked source.",
        nodes: [
          {
            id: "open-source",
            kind: "browser.intervention",
            tool: "browser_nav",
            args: { url: "https://example.com/source" },
            source: { title: "Example source", url: "https://example.com/source", interventionTitle: "Managed browser verification" },
          },
          {
            id: "read-source",
            kind: "browser.intervention",
            dependsOn: ["open-source"],
            tool: "browser_content",
            args: { url: "https://example.com/source" },
            source: {
              title: "Example source",
              url: "https://example.com/source",
              browserIntervention: { fromNode: "open-source", path: "browserIntervention" },
            },
            skipIf: { fromNode: "open-source", path: "skipped" },
            screenshot: { enabled: true, args: {} },
          },
          { id: "final-output", kind: "output.final", dependsOn: ["read-source"], value: { source: { fromNode: "read-source" } } },
        ],
      },
    });

    expect(result.output.source).toContain('if (readPath(outputs["open-source"], "skipped"))');
    expect(result.output.source).toContain("browser-intervention-prior-skipped");
    expect(result.output.source).toContain("source?.interventionTitle");
    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["browser_nav", "browser_content", "browser_screenshot"]));
  });

  it("rejects nonblocking browser user-action mode without a review handoff", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Missing Browser Review",
          goal: "Open a browser page without waiting for user action and continue automatically.",
          nodes: [
            {
              id: "open-page",
              kind: "tool.call",
              tool: "browser_nav",
              args: { url: "https://example.com", waitForUserAction: false },
            },
            { id: "final-output", kind: "output.final", dependsOn: ["open-page"], value: { page: { fromNode: "open-page" } } },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "browser.intervention_review_required", nodeId: "open-page" })],
    });
  });

  it("compiles browser_login as a first-class intervention without refilling credentials after handoff by default", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Managed Browser Login",
        goal: "Fill stored credentials, hand off verification to the user, and then inspect the protected page.",
        nodes: [
          { id: "open-login", kind: "tool.call", tool: "browser_nav", args: { url: "https://example.com/login" } },
          {
            id: "login",
            kind: "browser.intervention",
            tool: "browser_login",
            dependsOn: ["open-login"],
            args: { credentialId: "stored-login", expectedOrigin: "https://example.com", submit: true },
            prompt: "Complete MFA, CAPTCHA, passkey, or device confirmation in the managed browser.",
            retry: { maxAttempts: 0 },
            screenshot: { enabled: true, args: {} },
          },
          {
            id: "read-account",
            kind: "browser.intervention",
            dependsOn: ["login"],
            tool: "browser_content",
            args: { url: "https://example.com/account" },
            source: { browserIntervention: { fromNode: "login", path: "browserIntervention" } },
            skipIf: { fromNode: "login", path: "skipped" },
          },
          { id: "final-output", kind: "output.final", dependsOn: ["read-account"], value: { page: { fromNode: "read-account" } } },
        ],
      },
    });

    expect(result.output.manifest.tools).toEqual(
      expect.arrayContaining(["browser_nav", "browser_login", "browser_content", "browser_screenshot"]),
    );
    expect(result.output.source).toContain("tools.browser_login");
    expect(result.output.source).toContain("browser-login-user-action-completed");
    expect(result.output.source).not.toContain("retry Managed Browser Login");
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["tool:browser_nav", "tool:browser_login", "tool:browser_screenshot", "tool:browser_content"]),
    );
  });

  it("requires browser user-action resumes to depend on a review gate", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Blind Browser Retry",
          goal: "Retry a browser intervention without user confirmation.",
          nodes: [
            {
              id: "open-page",
              kind: "tool.call",
              tool: "browser_nav",
              args: { url: "https://example.com" },
            },
            {
              id: "retry-page",
              kind: "tool.call",
              tool: "browser_nav",
              dependsOn: ["open-page"],
              args: { url: "https://example.com", userActionId: { fromNode: "open-page", path: "userAction.id" } },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "browser.user_action_resume_requires_review", nodeId: "retry-page" })],
    });
  });

  it("requires browser_login to hand off MFA and verification state to review.input", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Blind Browser Login",
          goal: "Log in without modeling the human verification handoff.",
          nodes: [
            { id: "open-login", kind: "tool.call", tool: "browser_nav", args: { url: "https://example.com/login" } },
            {
              id: "login",
              kind: "tool.call",
              tool: "browser_login",
              dependsOn: ["open-login"],
              args: { credentialId: "stored-login", expectedOrigin: "https://example.com" },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "browser.login_review_required", nodeId: "login" })],
    });
  });
});
