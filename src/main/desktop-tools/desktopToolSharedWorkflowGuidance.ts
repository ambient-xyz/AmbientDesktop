import type { WorkflowCapabilityGuidanceDescriptor } from "./desktopToolDescriptorTypes";

export const mediaAcquisitionWorkflowGuidelines = [
  "For user requests to find, download, or display remote images, use this workflow: browser_search or a known source page, browser_content for page context, browser_eval for candidate image URL extraction when needed, then media_download for validation and inline rendering.",
  "Do not assume a web page URL is a direct image file URL. Prefer candidates from img src/srcset, og:image, Twitter image metadata, download/original-file links, and canonical media file links.",
  "For Wikimedia Commons pages, inspect the file page and prefer the actual original or thumbnail upload URL rather than guessing Special:Redirect/file paths.",
  "For Unsplash-like pages and image CDNs, extract concrete image resource URLs from page metadata or DOM attributes, then let media_download validate bytes instead of trusting URL extensions.",
  "If the user asks for public domain, CC0, or another license, prefer source pages with visible license metadata and pass sourceUrl plus a concise licenseNote to media_download; if the source is uncertain, do not claim a license.",
  "Stop after the first media_download result that says Ambient Desktop rendered the media inline, unless the user requested multiple candidates.",
];

export const browserSharedWorkflowGuidance: WorkflowCapabilityGuidanceDescriptor[] = [
  {
    id: "browser-user-action-intervention",
    summary: "Browser work that may hit CAPTCHA, login, MFA, or consent uses browser.intervention.",
    text: "Browser user-action rule: when a browser_search/browser_nav/browser_content/browser_login step may hit CAPTCHA/login/MFA/consent, use browser.intervention instead of raw tool.call plus hand-written retry logic.",
    applicabilityTags: ["browser", "browser.intervention", "user-action", "captcha", "mfa", "consent"],
    risk: "high",
    validatorRefs: ["validateWorkflowProgramStatic", "dryRunWorkflowProgramOutput"],
  },
  {
    id: "browser-lower-level-handoff",
    summary: "Low-level browser calls that disable user waiting must add review handoff data.",
    text: "Lower-level browser rule: if you use tool.call with waitForUserAction:false, the same IR must add a review.input handoff, put bounded metadata in options.data.browserIntervention, and route downstream work through it.",
    applicabilityTags: ["browser", "tool.call", "review.input", "waitForUserAction"],
    risk: "high",
    validatorRefs: ["validateWorkflowProgramStatic"],
  },
  {
    id: "browser-default-wait-behavior",
    summary: "Browser tools use default wait behavior unless an explicit intervention handoff exists.",
    text: "Default browser behavior: omit waitForUserAction unless using browser.intervention or an explicit review.input handoff.",
    applicabilityTags: ["browser", "waitForUserAction"],
    risk: "medium",
    validatorRefs: ["validateWorkflowProgramStatic"],
  },
  {
    id: "browser-user-action-resume",
    summary: "Browser userActionId resumes depend on the review gate that collected the user action state.",
    text: "Use waitForUserAction:false only when the following node graph hands that BrowserUserActionState to review.input; browser userActionId resumes must depend on that review gate.",
    applicabilityTags: ["browser", "userActionId", "resume", "review.input"],
    risk: "high",
    validatorRefs: ["validateWorkflowProgramStatic"],
  },
  {
    id: "browser-source-provenance",
    summary: "Browser item fan-out preserves item-stable evidence instead of active-page reads.",
    text: "Browser recovery provenance rule: browser_nav returns compact page text and links and can be the evidence-producing item read. For browser item fan-out, feed the browser fan-out items/results directly into checkpoints and the final model.call input. Do not create empty evidence checkpoints or model calls that contain only instructions. Do not run a later browser_content loop over the active page after navigating multiple items; active-page reads are not item-stable. If browser_content is needed for each item, pass the item URL inside the same item-scoped fan-out and preserve the source id/item key.",
    applicabilityTags: ["browser", "source-provenance", "browser_nav", "browser_content", "fan-out", "checkpoint"],
    risk: "high",
    validatorRefs: ["validateWorkflowProgramStatic"],
  },
];

export const browserLoginWorkflowGuidance: WorkflowCapabilityGuidanceDescriptor[] = [
  {
    id: "browser-login-intervention",
    summary: "Browser login hands off once and verifies via downstream browser reads.",
    text: "Browser login intervention rule: for browser_login, default to retry.maxAttempts:0 after the user handoff and verify progress with a dependent browser_content/browser_nav step, because refilling credentials after MFA/passkey completion can be unsafe or fail if the login form is gone.",
    applicabilityTags: ["browser", "browser_login", "mfa", "passkey", "credential-broker"],
    risk: "high",
    validatorRefs: ["validateWorkflowProgramStatic"],
  },
];
