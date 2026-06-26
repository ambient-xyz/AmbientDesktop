export function scottsdaleWeekendRequest(): string {
  return [
    "Find weekend activities in Scottsdale Arizona.",
    "Build a read-only, repeatable workflow that searches for current weekend activities, collects candidate events or places, asks Ambient to rank a concise shortlist, and checkpoints the evidence.",
    "The workflow should be safe to run repeatedly and should leave an audit trail with search inputs, result summaries, and the ranked plan.",
  ].join(" ");
}

export function scottsdaleFamilyActivitiesRequest(): string {
  return [
    "Research activities suitable for a 4 year old girl that are occurring in the next week in Scottsdale Arizona.",
    "Build a read-only, repeatable workflow that identifies current family-friendly activities, records source evidence, asks Ambient to rank or summarize options, and clearly notes when real-time web or event-listing data is unavailable.",
    "The workflow should be safe to rerun and should retain enough trace data to debug provider/compiler behavior.",
  ].join(" ");
}

export function browserResearchCompilerOutput(query: string) {
  const urls = ["https://example.test/research/pagedattention", "https://example.test/research/streamingllm"];
  return {
    version: 1,
    title: "Browser Research Dogfood",
    goal: "Research KV cache optimization techniques using browser source evidence and synthesize a cited report.",
    summary:
      "Searches browser sources, opens two deterministic source URLs, reads page content, asks Ambient to synthesize a compact cited report, and checkpoints the result.",
    successCriteria: [
      "Browser search returns source candidates",
      "Two sources are opened and read through browser tools",
      "Ambient produces a cited report",
      "The checkpoint includes source URLs and report output",
    ],
    inputs: { query },
    nodes: [
      {
        id: "search-browser-research-sources",
        kind: "tool.call" as const,
        label: "search browser research sources",
        tool: "browser_search",
        args: { query, maxResults: 5, fetchContent: false },
      },
      ...urls.flatMap((url, index) => [
        {
          id: `open-source-${index + 1}`,
          kind: "tool.call" as const,
          label: `open source ${index + 1}`,
          tool: "browser_nav",
          dependsOn: ["search-browser-research-sources"],
          args: { url },
        },
        {
          id: `read-source-${index + 1}`,
          kind: "tool.call" as const,
          label: `read source ${index + 1}`,
          tool: "browser_content",
          dependsOn: [`open-source-${index + 1}`],
          args: { url },
        },
      ]),
      {
        id: "browser-research-report",
        kind: "model.call" as const,
        dependsOn: ["search-browser-research-sources", "read-source-1", "read-source-2"],
        task: "dogfood.browser_research_report",
        input: {
          instruction:
            "Return JSON with report:string and sources:string[]. Summarize the techniques, mention tradeoffs, and cite the provided source URLs. Do not invent additional sources.",
          query,
          searchResults: { fromNode: "search-browser-research-sources" },
          pages: urls.map((url, index) => ({
            url,
            page: { fromNode: `open-source-${index + 1}` },
            content: { fromNode: `read-source-${index + 1}`, path: "text" },
          })),
        },
        output: { schema: { report: "string", sources: "array" } },
      },
      {
        id: "browser-research-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["browser-research-report"],
        key: "browserResearchReport",
        value: { query, sources: urls, report: { fromNode: "browser-research-report" } },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["browser-research-checkpoint"],
        value: { browserResearchReport: { fromNode: "browser-research-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 8, maxModelCalls: 1, maxRunMs: 180_000 },
    openQuestions: [],
  };
}

export function browserExplorationReviewCompilerOutput(query: string) {
  return {
    title: "Scottsdale Couples Entertainment Browser Review",
    spec: {
      goal: "Find current Scottsdale couples entertainment sources, pause for user feedback, and produce a final rendered report.",
      summary:
        "Uses the exploration-observed browser search/content pattern, checkpoints normalized source evidence, asks Ambient for a source-backed shortlist, pauses with an HTML review artifact, then produces final recommendations from user feedback.",
      successCriteria: [
        "Compiler prompt includes retained exploration trace evidence",
        "Browser calls are bounded to one search and two source pages during the deterministic run",
        "The source shortlist review gate includes an HTML artifact and source context",
        "Final output renders as HTML/Markdown cards rather than raw JSON",
      ],
      inputs: {
        query,
        shortlistArtifactPath: "reports/scottsdale-entertainment-shortlist.html",
        finalArtifactPath: "reports/scottsdale-entertainment-final.html",
      },
    },
    manifest: {
      tools: ["browser_search", "browser_nav", "browser_content", "ambient.responses"],
      mutationPolicy: "read_only",
      maxToolCalls: 5,
      maxModelCalls: 2,
      maxRunMs: 360_000,
    },
    graph: {
      summary: "Request -> browser search -> read source pages -> Ambient shortlist -> user review -> final report.",
      nodes: [
        {
          id: "request",
          type: "request",
          label: "Entertainment request",
          description: "User asks for current couples-friendly movies and live shows in Scottsdale.",
        },
        {
          id: "search-sources",
          type: "data_source",
          label: "Search entertainment sources",
          description: "Run one bounded browser search for current Scottsdale entertainment evidence.",
          toolNames: ["browser_search"],
        },
        {
          id: "read-source-pages",
          type: "data_source",
          label: "Read top sources",
          description: "Open and read two selected source pages in the same managed browser adapter.",
          toolNames: ["browser_nav", "browser_content"],
        },
        {
          id: "draft-shortlist",
          type: "model_call",
          label: "Draft source shortlist",
          modelRole: "Turn browser evidence into a concise, source-backed shortlist for user review.",
          inputSummary: "Search result cards plus bounded page text from two Scottsdale entertainment sources.",
          outputSummary: "Draft picks, sources, HTML preview, markdown preview, and summary.",
          retryPolicy: "Retry once when structured output validation fails.",
          retentionPolicy: "Debug trace retains source evidence and model output for dogfood inspection.",
          toolNames: ["ambient.responses"],
        },
        {
          id: "review-shortlist",
          type: "review_gate",
          label: "Review shortlist",
          description: "Pause with an artifact-backed shortlist and collect qualitative user feedback.",
          reviewPolicy: "Resume from the same source evidence and draft shortlist with user feedback applied.",
        },
        {
          id: "final-recommendations",
          type: "model_call",
          label: "Final recommendations",
          modelRole: "Apply user feedback and produce a readable final entertainment report.",
          inputSummary: "Draft shortlist, browser provenance, and runtime user feedback.",
          outputSummary: "Final HTML/Markdown recommendations with source notes.",
          retryPolicy: "Retry once when structured output validation fails.",
          retentionPolicy: "Debug trace retains final model output for dogfood inspection.",
          toolNames: ["ambient.responses"],
        },
        {
          id: "output",
          type: "output",
          label: "Rendered report",
          description: "Checkpoint and emit the final rendered recommendation artifact.",
        },
      ],
      edges: [
        { id: "request-search", source: "request", target: "search-sources", type: "control_flow", label: "needs current listings" },
        { id: "search-read", source: "search-sources", target: "read-source-pages", type: "data_flow", label: "top sources" },
        { id: "read-draft", source: "read-source-pages", target: "draft-shortlist", type: "data_flow", label: "source evidence" },
        { id: "draft-review", source: "draft-shortlist", target: "review-shortlist", type: "control_flow", label: "ask user" },
        { id: "review-final", source: "review-shortlist", target: "final-recommendations", type: "data_flow", label: "feedback" },
        { id: "final-output", source: "final-recommendations", target: "output", type: "data_flow", label: "report" },
      ],
    },
    source: `
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizePick(item, index) {
  return {
    title: typeof item?.title === "string" ? item.title : "Pick " + (index + 1),
    kind: typeof item?.kind === "string" ? item.kind : "entertainment",
    venue: typeof item?.venue === "string" ? item.venue : "Scottsdale",
    timing: typeof item?.timing === "string" ? item.timing : "This week",
    whyCouplesFriendly: typeof item?.whyCouplesFriendly === "string" ? item.whyCouplesFriendly : "Good date-night fit.",
    sourceUrl: typeof item?.sourceUrl === "string" ? item.sourceUrl : ""
  };
}

function renderHtml(picks, heading, summary) {
  return [
    "<!doctype html>",
    "<html><body>",
    "<h1>" + escapeHtml(heading) + "</h1>",
    "<p>" + escapeHtml(summary) + "</p>",
    "<section>",
    ...picks.map((pick) => [
      "<article>",
      "<h2>" + escapeHtml(pick.title) + "</h2>",
      "<p><strong>Type:</strong> " + escapeHtml(pick.kind) + " · <strong>Venue:</strong> " + escapeHtml(pick.venue) + " · <strong>Timing:</strong> " + escapeHtml(pick.timing) + "</p>",
      "<p>" + escapeHtml(pick.whyCouplesFriendly) + "</p>",
      pick.sourceUrl ? "<p><small>Source: " + escapeHtml(pick.sourceUrl) + "</small></p>" : "",
      "</article>"
    ].join("\\n")),
    "</section>",
    "</body></html>"
  ].join("\\n");
}

function renderMarkdown(picks, heading, summary) {
  return [
    "# " + heading,
    "",
    summary,
    "",
    ...picks.map((pick) => "- " + pick.title + " (" + pick.kind + ", " + pick.venue + "): " + pick.whyCouplesFriendly + (pick.sourceUrl ? " Source: " + pick.sourceUrl : ""))
  ].join("\\n");
}

const shortlistSchema = {
  parse(value) {
    if (!value || !Array.isArray(value.picks)) {
      throw new Error("Browser source shortlist must include picks[].");
    }
    const picks = value.picks.map(normalizePick);
    const summary = typeof value.summary === "string" ? value.summary : "Draft Scottsdale entertainment shortlist is ready for review.";
    return {
      summary,
      picks,
      sources: Array.isArray(value.sources) ? value.sources : [],
      html: typeof value.html === "string" ? value.html : renderHtml(picks, "Scottsdale couples entertainment shortlist", summary),
      markdown: typeof value.markdown === "string" ? value.markdown : renderMarkdown(picks, "Scottsdale couples entertainment shortlist", summary)
    };
  }
};

const finalSchema = {
  parse(value) {
    if (!value || !Array.isArray(value.picks)) {
      throw new Error("Final browser recommendations must include picks[].");
    }
    const picks = value.picks.map(normalizePick);
    const summary = typeof value.summary === "string" ? value.summary : "Final Scottsdale couples entertainment recommendations.";
    return {
      summary,
      picks,
      sources: Array.isArray(value.sources) ? value.sources : [],
      artifactPath: "reports/scottsdale-entertainment-final.html",
      html: typeof value.html === "string" ? value.html : renderHtml(picks, "Best Scottsdale movies and live shows for couples this week", summary),
      markdown: typeof value.markdown === "string" ? value.markdown : renderMarkdown(picks, "Best Scottsdale movies and live shows for couples this week", summary)
    };
  }
};

export default async function run({ workflow, tools, ambient }) {
  const query = ${JSON.stringify(query)};
  const sourceEvidence = await workflow.resumePoint("sourceEvidence", async () => {
    const results = await workflow.step("search current entertainment sources", { nodeId: "search-sources" }, () =>
      tools.browser_search({ query, maxResults: 5, fetchContent: false })
    );
    const selected = Array.isArray(results) ? results.slice(0, 2) : [];
    const sources = [];
    for (const result of selected) {
      await workflow.step("open " + result.url, { nodeId: "read-source-pages" }, () => tools.browser_nav({ url: result.url }));
      const page = await workflow.step("read " + result.url, { nodeId: "read-source-pages" }, () => tools.browser_content({ url: result.url }));
      sources.push({
        title: String(result.title ?? page.title ?? "Source"),
        url: String(result.url ?? page.url ?? ""),
        snippet: String(result.snippet ?? "").slice(0, 600),
        text: String(page.text ?? "").slice(0, 4000),
        textTruncated: Boolean(page.textTruncated)
      });
    }
    return { query, results: selected, sources };
  });

  const draft = await workflow.resumePoint("draftShortlist", async () => {
    const shortlist = await ambient.call({
      task: "dogfood.browser_source_shortlist",
      nodeId: "draft-shortlist",
      input: {
        instruction: "Return JSON with summary:string, picks:[{title,kind,venue,timing,whyCouplesFriendly,sourceUrl}], sources:string[], html:string, and markdown:string. Use only provided browser evidence. Include at least one movie and one live show when source evidence supports it. Keep the HTML concise and readable.",
        query,
        sources: sourceEvidence.sources
      },
      schema: shortlistSchema,
      cacheKey: ["dogfood", "browser_source_shortlist", query]
    });
    return shortlist;
  });

  const answer = await workflow.askUser(
    "Review the Scottsdale entertainment shortlist. What should change before final recommendations?",
    {
      choices: [
        { id: "approve", label: "Looks right", description: "Use the source-backed shortlist as-is." },
        { id: "revise", label: "Use my feedback", description: "Apply the freeform feedback in the final report." }
      ],
      allowFreeform: true,
      data: {
        report: {
          title: "Source shortlist",
          artifactPath: "reports/scottsdale-entertainment-shortlist.html",
          html: draft.html,
          markdown: draft.markdown
        },
        sources: sourceEvidence.sources.map((source) => ({ title: source.title, url: source.url, snippet: source.snippet })),
        summary: draft.summary
      }
    },
    { nodeId: "review-shortlist" }
  );

  const final = await ambient.call({
    task: "dogfood.browser_final_recommendations",
    nodeId: "final-recommendations",
    input: {
      instruction: "Return JSON with summary:string, picks:[{title,kind,venue,timing,whyCouplesFriendly,sourceUrl}], sources:string[], html:string, and markdown:string. Apply user feedback. The report must be readable HTML and should mention that listings/times should be verified before booking.",
      query,
      sourceEvidence,
      draft,
      userFeedback: { choiceId: answer.choiceId, text: answer.text }
    },
    schema: finalSchema,
    cacheKey: ["dogfood", "browser_final_recommendations", query, answer.choiceId ?? "", answer.text ?? ""]
  });

  await workflow.checkpoint("final_output", final);
  await workflow.emit({
    type: "workflow.output.ready",
    message: "Scottsdale couples entertainment recommendations are ready.",
    graphNodeId: "output",
    data: { artifactPath: final.artifactPath, html: final.html, markdown: final.markdown, summary: final.summary, picks: final.picks, sources: final.sources }
  });
}
`,
    previewSummary: "Compile from browser exploration into a bounded browser workflow with a reviewable shortlist artifact.",
    dryRunStrategy: "Dry run repeats the bounded browser search/read shape and pauses with the same source shortlist review artifact.",
    openQuestions: [],
  };
}

export function browserInterventionRecoveryCompilerOutput(query: string) {
  return {
    version: 1,
    title: "Scottsdale Family Shows Browser Intervention Recovery",
    goal: "Find child-friendly Scottsdale live shows, pause if browser verification blocks the source page, then resume into a rendered report.",
    summary:
      "Searches current Scottsdale family-show sources, checkpoints search evidence, uses a first-class browser.intervention node for user-action handoff and same-session retry, then asks Ambient to produce a readable report.",
    successCriteria: [
      "Search results are checkpointed before any browser intervention pause",
      "Browser user-action state becomes a runtime input card with bounded context",
      "Resume retries the same browser operation with the preserved userActionId instead of repeating search",
      "Final output is a rendered HTML/Markdown card rather than raw JSON",
    ],
    inputs: { query, finalArtifactPath: "reports/scottsdale-family-shows.html" },
    nodes: [
      {
        id: "search-sources",
        kind: "tool.call" as const,
        label: "Search current sources",
        tool: "browser_search",
        args: { query, maxResults: 4, fetchContent: false },
        output: { type: "browserSearchResults" },
      },
      {
        id: "browser-intervention",
        kind: "browser.intervention" as const,
        label: "Browser intervention",
        dependsOn: ["search-sources"],
        tool: "browser_nav" as const,
        args: { url: { fromNode: "search-sources", path: "0.url" } },
        source: {
          title: { fromNode: "search-sources", path: "0.title" },
          url: { fromNode: "search-sources", path: "0.url" },
          snippet: { fromNode: "search-sources", path: "0.snippet" },
        },
        prompt: "Browser needs user action before reading Scottsdale Family Shows Calendar.",
        choices: [
          { id: "completed", label: "I completed it", description: "Retry the same browser operation in the preserved browser session." },
          {
            id: "skip",
            label: "Skip this source",
            description: "Continue without this source if browser verification cannot be completed.",
          },
        ],
        allowFreeform: true,
        output: { type: "browserInterventionEvidence" },
      },
      {
        id: "read-source-pages",
        kind: "browser.intervention" as const,
        label: "Read source page",
        dependsOn: ["browser-intervention"],
        tool: "browser_content" as const,
        args: { url: { fromNode: "search-sources", path: "0.url" } },
        source: {
          title: { fromNode: "search-sources", path: "0.title" },
          url: { fromNode: "search-sources", path: "0.url" },
          snippet: { fromNode: "search-sources", path: "0.snippet" },
        },
        prompt: "Browser needs user action before reading Scottsdale Family Shows Calendar.",
        choices: [
          { id: "completed", label: "I completed it", description: "Retry the same browser operation in the preserved browser session." },
          {
            id: "skip",
            label: "Skip this source",
            description: "Continue without this source if browser verification cannot be completed.",
          },
        ],
        allowFreeform: true,
        output: { type: "browserSourceEvidence" },
      },
      {
        id: "sourceEvidence",
        kind: "checkpoint.write" as const,
        dependsOn: ["read-source-pages"],
        key: "sourceEvidence",
        value: {
          query,
          results: { fromNode: "search-sources" },
          sources: [{ fromNode: "read-source-pages" }],
        },
      },
      {
        id: "final-recommendations",
        kind: "model.call" as const,
        label: "Final family-show report",
        dependsOn: ["sourceEvidence"],
        task: "dogfood.browser_intervention_family_shows",
        input: {
          instruction:
            "Return JSON with summary:string, picks:[{title,venue,timing,ageFit,why,sourceUrl}], sources:string[], artifactPath:string, html:string, and markdown:string. Use artifactPath exactly as provided. Use only the provided browser evidence. Mention that dates/tickets should be verified before attending.",
          query,
          artifactPath: "reports/scottsdale-family-shows.html",
          sourceEvidence: { fromNode: "sourceEvidence" },
        },
        output: {
          schema: { summary: "string", picks: "array", sources: "array", artifactPath: "string", html: "string", markdown: "string" },
        },
      },
      {
        id: "final_output",
        kind: "checkpoint.write" as const,
        dependsOn: ["final-recommendations"],
        key: "final_output",
        value: {
          artifactPath: "reports/scottsdale-family-shows.html",
          html: { fromNode: "final-recommendations", path: "html" },
          markdown: { fromNode: "final-recommendations", path: "markdown" },
          summary: { fromNode: "final-recommendations", path: "summary" },
          picks: { fromNode: "final-recommendations", path: "picks" },
          sources: { fromNode: "final-recommendations", path: "sources" },
        },
      },
      {
        id: "output",
        kind: "output.final" as const,
        label: "Scottsdale family-friendly live shows report is ready.",
        dependsOn: ["final_output"],
        value: { fromNode: "final_output" },
      },
    ],
    edges: [
      { id: "request-search", source: "request", target: "search-sources", type: "control_flow" as const, label: "needs current listings" },
      { id: "search-open", source: "search-sources", target: "browser-intervention", type: "data_flow" as const, label: "top source" },
      { id: "open-read", source: "browser-intervention", target: "read-source-pages", type: "data_flow" as const, label: "verified page" },
      {
        id: "read-final",
        source: "read-source-pages",
        target: "final-recommendations",
        type: "data_flow" as const,
        label: "source evidence",
      },
      { id: "final-output", source: "final-recommendations", target: "output", type: "data_flow" as const, label: "report" },
    ],
    budgets: { maxToolCalls: 7, maxModelCalls: 1, maxRunMs: 360_000 },
    openQuestions: [],
  };
}

export function managedBrowserInterventionCompilerOutput(sourceUrl: string) {
  const choices = [
    { id: "completed", label: "I completed it", description: "Retry the same browser operation in the preserved browser session." },
    { id: "skip", label: "Skip source", description: "Continue without this source if verification cannot be completed." },
  ];
  return {
    version: 1,
    title: "Real Managed Browser Family Shows Dogfood",
    goal: "Use the real managed browser to read a web source for child-friendly Scottsdale shows, pause on human verification, then resume into a rendered report.",
    summary:
      "Opens a deterministic web source in an isolated managed-browser profile through first-class browser.intervention nodes, reuses the preserved userActionId after user confirmation, captures source content and one screenshot, and asks Ambient to produce a readable report.",
    successCriteria: [
      "The workflow pauses with typed browser-intervention metadata when the real browser detects human verification",
      "The browser reveal action receives the preserved targetId and isolated profile context",
      "Resume retries the same browser operation with the preserved userActionId without opening extra tabs",
      "Graph events cover the intervention, content read, model call, and output nodes",
      "Final output renders as HTML instead of truncated JSON",
    ],
    inputs: { sourceUrl, finalArtifactPath: "reports/managed-browser-family-shows.html" },
    nodes: [
      {
        id: "browser-intervention",
        kind: "browser.intervention" as const,
        label: "Open managed source",
        tool: "browser_nav" as const,
        args: { url: sourceUrl },
        source: {
          title: "Family shows challenge source",
          url: sourceUrl,
          snippet:
            "Deterministic managed-browser source with a human-verification interstitial followed by Scottsdale family-show listings.",
          interventionTitle: "Managed browser verification",
        },
        prompt: "Browser needs user action before reading Family shows challenge source.",
        choices,
        allowFreeform: true,
        retry: { maxAttempts: 1, onStillBlocked: "fail" as const },
        output: { type: "managedBrowserOpenEvidence" },
      },
      {
        id: "read-source",
        kind: "browser.intervention" as const,
        label: "Read verified source",
        dependsOn: ["browser-intervention"],
        tool: "browser_content" as const,
        args: { url: sourceUrl },
        source: {
          title: "Family shows challenge source",
          url: sourceUrl,
          snippet: "Verified Scottsdale family-show listings.",
          interventionTitle: "Managed browser verification",
          browserIntervention: { fromNode: "browser-intervention", path: "browserIntervention" },
        },
        skipIf: { fromNode: "browser-intervention", path: "skipped" },
        prompt: "Browser needs user action before reading Family shows challenge source.",
        choices,
        allowFreeform: true,
        retry: { maxAttempts: 1, onStillBlocked: "fail" as const },
        screenshot: { enabled: true, args: {} },
        output: { type: "managedBrowserSourceEvidence" },
      },
      {
        id: "sourceEvidence",
        kind: "checkpoint.write" as const,
        dependsOn: ["read-source"],
        key: "sourceEvidence",
        value: {
          query: "live shows appropriate for children in Scottsdale next week",
          sourceUrl,
          sources: [{ fromNode: "read-source" }],
        },
      },
      {
        id: "final-recommendations",
        kind: "model.call" as const,
        label: "Final family-show report",
        dependsOn: ["sourceEvidence"],
        task: "dogfood.real_managed_browser_family_shows",
        input: {
          instruction:
            "Return JSON with summary:string, picks:[{title,venue,timing,ageFit,why,sourceUrl}], sources:string[], artifactPath:string, html:string, and markdown:string. Use artifactPath exactly as provided. Use only the verified browser source evidence. Mention that dates/tickets should be verified before attending.",
          artifactPath: "reports/managed-browser-family-shows.html",
          sourceEvidence: { fromNode: "sourceEvidence" },
        },
        output: {
          schema: { summary: "string", picks: "array", sources: "array", artifactPath: "string", html: "string", markdown: "string" },
        },
      },
      {
        id: "final_output",
        kind: "checkpoint.write" as const,
        dependsOn: ["final-recommendations"],
        key: "final_output",
        value: {
          artifactPath: "reports/managed-browser-family-shows.html",
          html: { fromNode: "final-recommendations", path: "html" },
          markdown: { fromNode: "final-recommendations", path: "markdown" },
          summary: { fromNode: "final-recommendations", path: "summary" },
          picks: { fromNode: "final-recommendations", path: "picks" },
          sources: { fromNode: "final-recommendations", path: "sources" },
        },
      },
      {
        id: "output",
        kind: "output.final" as const,
        label: "Managed-browser family-friendly live shows report is ready.",
        dependsOn: ["final_output"],
        value: { fromNode: "final_output" },
      },
    ],
    edges: [
      {
        id: "request-open",
        source: "request",
        target: "browser-intervention",
        type: "control_flow" as const,
        label: "needs source evidence",
      },
      { id: "open-read", source: "browser-intervention", target: "read-source", type: "data_flow" as const, label: "verified page" },
      { id: "read-final", source: "read-source", target: "final-recommendations", type: "data_flow" as const, label: "source evidence" },
      { id: "final-output", source: "final-recommendations", target: "output", type: "data_flow" as const, label: "report" },
    ],
    budgets: { maxToolCalls: 5, maxModelCalls: 1, maxRunMs: 360_000 },
    openQuestions: [],
  };
}

export function externalManagedBrowserArxivCompilerOutput(input: { query: string; sourceUrl: string }) {
  const { query, sourceUrl } = input;
  const choices = [
    { id: "completed", label: "I completed it", description: "Retry the same browser operation in the preserved browser session." },
    { id: "skip", label: "Skip source", description: "Continue with a clear note that the external source was blocked." },
  ];
  return {
    version: 1,
    title: "External Managed Browser Arxiv Summary",
    goal: "Use the isolated managed browser to inspect a real external arxiv search page and summarize placebo-effect papers from bounded page evidence.",
    summary:
      "Opens an external arxiv search URL through browser.intervention, records browser-intervention evidence if blocked, skips later browser reads when the user skips the source, otherwise captures bounded source text and one screenshot, then asks Ambient for a readable HTML/Markdown report.",
    successCriteria: [
      "The workflow uses the real managed browser against an external site without opening extra tabs",
      "Browser user-action pauses preserve preview evidence and can be skipped or retried",
      "Page text passed to Ambient is bounded and does not flood the event stream",
      "The final output renders as HTML instead of raw JSON",
    ],
    inputs: { query, sourceUrl, finalArtifactPath: "reports/external-arxiv-placebo-summary.html" },
    nodes: [
      {
        id: "open-source",
        kind: "browser.intervention" as const,
        label: "Open external arxiv page",
        tool: "browser_nav" as const,
        args: { url: sourceUrl },
        source: {
          title: "Arxiv placebo-effect search",
          url: sourceUrl,
          snippet: "External arxiv search page for placebo-effect papers.",
          interventionTitle: "External browser source needs attention",
        },
        prompt: "Browser needs user action before reading Arxiv placebo-effect search.",
        choices,
        allowFreeform: true,
        retry: { maxAttempts: 1, onStillBlocked: "return_skipped" as const },
        output: { type: "externalBrowserOpenEvidence" },
      },
      {
        id: "read-source",
        kind: "browser.intervention" as const,
        label: "Read source evidence",
        dependsOn: ["open-source"],
        tool: "browser_content" as const,
        args: { url: sourceUrl },
        source: {
          title: "Arxiv placebo-effect search",
          url: sourceUrl,
          snippet: "External arxiv search page for placebo-effect papers.",
          interventionTitle: "External browser source needs attention",
          browserIntervention: { fromNode: "open-source", path: "browserIntervention" },
        },
        skipIf: { fromNode: "open-source", path: "skipped" },
        prompt: "Browser needs user action before reading Arxiv placebo-effect search.",
        choices,
        allowFreeform: true,
        retry: { maxAttempts: 1, onStillBlocked: "return_skipped" as const },
        screenshot: { enabled: true, args: {} },
        output: { type: "externalBrowserSourceEvidence" },
      },
      {
        id: "sourceEvidence",
        kind: "checkpoint.write" as const,
        dependsOn: ["read-source"],
        key: "sourceEvidence",
        value: {
          query,
          sourceUrl,
          sources: [{ fromNode: "read-source" }],
        },
      },
      {
        id: "final-report",
        kind: "model.call" as const,
        label: "Summarize papers",
        dependsOn: ["sourceEvidence"],
        task: "dogfood.external_managed_browser_arxiv",
        input: {
          instruction:
            "Use only the bounded managed-browser evidence to summarize recent arxiv search results about the placebo effect. Return JSON with summary:string, papers:[{title,summary,sourceUrl}], sourceEvidence:object, artifactPath:string, html:string, and markdown:string. Use artifactPath exactly as provided. If the source was blocked or skipped, clearly explain that and include the browser evidence status instead of inventing paper details.",
          query,
          artifactPath: "reports/external-arxiv-placebo-summary.html",
          sourceEvidence: { fromNode: "sourceEvidence" },
        },
        output: {
          schema: {
            summary: "string",
            papers: "array",
            sourceEvidence: "object",
            artifactPath: "string",
            html: "string",
            markdown: "string",
          },
        },
      },
      {
        id: "final_output",
        kind: "checkpoint.write" as const,
        dependsOn: ["final-report"],
        key: "final_output",
        value: {
          artifactPath: "reports/external-arxiv-placebo-summary.html",
          html: { fromNode: "final-report", path: "html" },
          markdown: { fromNode: "final-report", path: "markdown" },
          summary: { fromNode: "final-report", path: "summary" },
          papers: { fromNode: "final-report", path: "papers" },
          sourceEvidence: { fromNode: "sourceEvidence" },
        },
      },
      {
        id: "output",
        kind: "output.final" as const,
        label: "External arxiv managed-browser report is ready.",
        dependsOn: ["final_output"],
        value: { fromNode: "final_output" },
      },
    ],
    edges: [
      { id: "request-open", source: "request", target: "open-source", type: "control_flow" as const, label: "needs live evidence" },
      { id: "open-read", source: "open-source", target: "read-source", type: "data_flow" as const, label: "page opened or skipped" },
      { id: "read-final", source: "read-source", target: "final-report", type: "data_flow" as const, label: "bounded evidence" },
      { id: "final-output", source: "final-report", target: "output", type: "data_flow" as const, label: "report" },
    ],
    budgets: { maxToolCalls: 5, maxModelCalls: 1, maxRunMs: 420_000 },
    openQuestions: [],
  };
}
