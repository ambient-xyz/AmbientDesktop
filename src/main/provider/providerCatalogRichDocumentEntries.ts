import type { ProviderCatalogEntry } from "./providerCatalogTypes";

const reviewedAt = "2026-05-11";

export const providerCatalogRichDocumentEntries: ProviderCatalogEntry[] = [
  {
    id: "rich-documents.ambient-artifact-runtimes",
    displayName: "Ambient Documents/Presentations/Spreadsheets runtimes",
    capabilityArea: "rich-documents",
    installerShape: "artifact-generator",
    providerKind: "built-in",
    sourceModel: "ambient-built-in",
    recommendationTier: "recommended",
    recommendationSummary:
      "Primary local artifact-generation path for `.docx`, `.pptx`, and `.xlsx` when the user wants files in the workspace.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation:
        "Use the Ambient Documents, Presentations, and Spreadsheets runtimes as the primary local rich-document path when the user wants workspace files such as `.docx`, `.pptx`, or `.xlsx` with render/readback verification.",
      dogfoodTargets: [
        "Create one tiny `.docx`, `.pptx`, and `.xlsx` artifact through the built-in runtimes, then verify each by reading it back through the workspace file surface.",
        "For Word and PowerPoint outputs, render or preview the result where available and record artifact path, file size, page/slide/sheet count, and visual/readback notes.",
        "Exercise failure reporting by asking Pi for an unsupported rich-document operation and checking that it asks for the concrete file/task type instead of guessing a generic install.",
      ],
      promotionCriteria: [
        "Local artifact generation produces non-empty files with stable paths and bounded previews for Pi.",
        "Render/readback verification catches malformed Word, PowerPoint, and spreadsheet outputs before the task is considered complete.",
        "Pi guidance makes this the default for local files and does not route users to cloud connectors unless they ask for native collaboration.",
      ],
      fallbackGuidance: [
        "Use Ambient Office extraction/preview when the task is reading, summarizing, or converting existing Office files.",
        "Use Google Workspace when the target is a native Google Doc, Sheet, or Slide with collaboration.",
        "Use local OOXML libraries only for custom generators that the built-in runtimes cannot express yet.",
      ],
    },
    bestFor: ["Local Word/PPTX/XLSX artifact generation", "Workspace-visible document outputs", "Render-and-readback verification"],
    tradeoffs: [
      "Local artifacts are not cloud-collaborative by default",
      "Advanced Office layout fidelity depends on the specific runtime and preview path",
    ],
    avoidWhen: ["The user explicitly wants a native Google Doc/Sheet/Slide or Microsoft 365 collaborative document"],
    platforms: ["macos-arm64", "macos-x64", "linux-x64"],
    hardwareFit: ["CPU-friendly for small and medium documents; large rendered decks/workbooks need bounded preview checks"],
    firstPartyTemplate: {
      available: true,
      templateId: "ambient-rich-documents:local-artifact-runtimes",
      notes: "Use installed Documents, Presentations, and Spreadsheets runtime skills before custom packages.",
    },
    capabilityBuilderDefaults: {
      provider: "Ambient rich-document runtimes",
      locality: "local",
      outputFileArtifacts: ["docx", "pptx", "xlsx", "pdf", "png"],
      responseFormats: ["json"],
    },
    ambientContract: {
      commandContract:
        "Artifact generator writes declared `.docx`, `.pptx`, or `.xlsx` workspace files and returns artifact metadata plus verification notes.",
      descriptorRequirements: [
        "artifact-generator shape",
        "declared output file artifacts",
        "render/readback verification notes",
        "bounded preview metadata",
      ],
      artifactPolicy:
        "Write generated files to user-visible workspace paths and store any render previews or screenshots as explicit artifacts.",
      validationTarget:
        "Generate tiny DOCX, PPTX, and XLSX files, then read back or render enough of each artifact to verify structure and content.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [],
    localArtifactReadiness: {
      status: "local-ready",
      verifiedArtifacts: [
        "Documents runtime skill",
        "Presentations runtime skill",
        "Spreadsheets runtime skill",
        "workspace artifact readback path",
      ],
      missingOrBlockingArtifacts: ["Unified first-party provider installer card for all rich-document runtimes"],
      minimumLocalSmokeTest: "Generate one tiny DOCX/PPTX/XLSX artifact and verify it through workspace readback/rendering.",
    },
    runtimeState: { externalService: false, serviceKind: "none", statePaths: ["workspace artifact paths", "render preview artifacts"] },
    costPrivacyNotes: ["Local files remain in the workspace unless the user asks to upload or share them."],
    maintenanceNotes: [
      "Track runtime plugin versions, renderer availability, supported output formats, and readback/render proof requirements.",
    ],
    safetyBoundaries: [
      "Do not upload generated documents to cloud services unless the user explicitly asks for a cloud-native or shared artifact.",
    ],
    knownQuirks: ["Generated document quality depends on template/layout support and must be verified visually or by structured readback."],
    researchStatus: "live-dogfooded",
    evidence: [
      {
        date: reviewedAt,
        type: "manual-note",
        summary: "Documents, Presentations, and Spreadsheets runtime skills are installed in this Codex/Ambient environment.",
      },
      {
        date: reviewedAt,
        type: "local-smoke",
        summary:
          "Existing Office and runtime tests cover workspace artifact handling, Office extraction, and rich artifact file extensions.",
      },
    ],
    docs: [
      { label: "Documents runtime skill", url: "plugin://documents", lastReviewed: reviewedAt },
      { label: "Presentations runtime skill", url: "plugin://presentations", lastReviewed: reviewedAt },
      { label: "Spreadsheets runtime skill", url: "plugin://spreadsheets", lastReviewed: reviewedAt },
      { label: "Office parsing and previewing plan", url: "officeParsingAndPreviewing.md", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "rich-documents.ambient-office-extraction-preview",
    displayName: "Ambient Office extraction/preview",
    capabilityArea: "rich-documents",
    installerShape: "file-converter",
    providerKind: "built-in",
    sourceModel: "ambient-built-in",
    recommendationTier: "recommended",
    recommendationSummary:
      "Primary local path for reading PDFs plus `.docx`, `.pptx`, and `.xlsx`, with LibreOffice-backed previews when a renderer is available.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation:
        "Use Ambient PDF/Office extraction and preview as the primary rich-document reading and conversion path for existing local files: native text extraction covers PDFs with extractable text plus `.docx`, `.pptx`, and `.xlsx`, while LibreOffice preview handles Office-to-PDF rendering when available.",
      dogfoodTargets: [
        "Run a local extraction fixture for `.pdf` through native read, `file_read`, or `long_context_process` and verify page count, truncation, and extracted text metadata.",
        "Run local extraction fixtures for `.docx`, `.pptx`, and `.xlsx` through `file_read` or `long_context_process` and verify format, unit count, truncation, and extracted text metadata.",
        "Run the LibreOffice preview path with both missing-renderer and renderer-available cases so Pi can surface clear setup guidance.",
        "Use at least one real or fixture deck/workbook with speaker notes or multiple sheets to verify ordering and bounded output behavior.",
      ],
      promotionCriteria: [
        "Extraction returns text and metadata without exposing raw OOXML package bytes.",
        "LibreOffice preview failures are explicit as missing-renderer or failed conversion rather than blocking text extraction.",
        "Pi guidance distinguishes supported modern Office text extraction from legacy `.doc`, `.ppt`, and `.xls` preview-only behavior.",
      ],
      fallbackGuidance: [
        "Use Ambient local artifact runtimes when the user wants to create new rich-document files.",
        "Use LibreOffice/Pandoc conversion when a format conversion is needed outside the built-in extraction path.",
        "Use Google Workspace export when the source is a native Google Doc/Sheet/Slide rather than a local Office file.",
      ],
    },
    bestFor: ["PDF text extraction", "Office file reading", "DOCX/PPTX/XLSX extraction", "PDF previews", "Long-context document QA"],
    tradeoffs: [
      "Visual preview requires LibreOffice discovery",
      "Legacy `.doc`, `.ppt`, and `.xls` are preview-only, not text-extraction-ready",
    ],
    avoidWhen: ["The user needs to create a new native cloud document instead of reading or previewing a local file"],
    platforms: ["macos-arm64", "macos-x64", "linux-x64"],
    hardwareFit: ["Native text extraction is lightweight; preview conversion cost depends on LibreOffice and file size"],
    firstPartyTemplate: {
      available: true,
      templateId: "ambient-rich-documents:office-extraction-preview",
      notes: "Use existing file_read, native read, and long_context_process contracts before adding new tools.",
    },
    capabilityBuilderDefaults: {
      provider: "Ambient Office extraction/preview",
      locality: "local",
      outputFileArtifacts: ["pdf", "txt", "json"],
      responseFormats: ["text", "json"],
    },
    ambientContract: {
      commandContract:
        "Converter/extractor returns bounded text and metadata for PDFs and supported Office files and writes preview PDFs only when conversion is requested.",
      descriptorRequirements: [
        "file-converter shape",
        "supported format list including PDF",
        "bounded extraction metadata",
        "LibreOffice renderer status",
      ],
      artifactPolicy: "Return bounded extracted text to Pi; persist full previews and conversion outputs by path.",
      validationTarget:
        "Extract DOCX/PPTX/XLSX fixture text, exercise too-large/unsupported failures, and render a PDF preview through LibreOffice or return missing-renderer.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [],
    localArtifactReadiness: {
      status: "local-ready",
      verifiedArtifacts: [
        "pdfTextExtraction service",
        "officeTextExtraction service",
        "OfficePreviewService",
        "file_read integration",
        "long_context_process document input path",
      ],
      missingOrBlockingArtifacts: ["Installed LibreOffice for visual preview on hosts where it is not discoverable"],
      minimumLocalSmokeTest:
        "Extract PDF/DOCX/PPTX/XLSX fixtures and run preview conversion with missing-renderer and renderer-available paths.",
    },
    runtimeState: { externalService: false, serviceKind: "none", statePaths: [".ambient-office-preview cache", "workspace file metadata"] },
    costPrivacyNotes: ["Local extraction avoids cloud upload; preview conversion runs locally through LibreOffice when installed."],
    maintenanceNotes: [
      "Track file-size limits, zip-entry limits, LibreOffice discovery, renderer version, cache invalidation, and legacy-format handling.",
    ],
    safetyBoundaries: ["Treat Office files as untrusted: keep size limits, conversion timeouts, and bounded extracted output."],
    knownQuirks: ["Text extraction and visual preview are intentionally separate; a missing renderer should not block text extraction."],
    researchStatus: "live-dogfooded",
    evidence: [
      {
        date: reviewedAt,
        type: "local-smoke",
        summary:
          "Unit coverage verifies DOCX/PPTX/XLSX extraction, too-large handling, corrupt files, and LibreOffice preview success/missing-renderer paths.",
      },
      {
        date: reviewedAt,
        type: "manual-note",
        summary: "Office parsing and previewing plan documents current support and legacy limitations.",
      },
    ],
    docs: [
      { label: "Office parsing and previewing plan", url: "officeParsingAndPreviewing.md", lastReviewed: reviewedAt },
      {
        label: "LibreOffice command-line parameters",
        url: "https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html",
        lastReviewed: reviewedAt,
      },
      {
        label: "LibreOffice PDF export parameters",
        url: "https://help.libreoffice.org/latest/en-US/text/shared/guide/pdf_params.html",
        lastReviewed: reviewedAt,
      },
    ],
  },
  {
    id: "rich-documents.google-workspace",
    displayName: "Google Workspace Docs/Sheets/Slides",
    capabilityArea: "rich-documents",
    installerShape: "connector",
    providerKind: "cloud",
    sourceModel: "closed-source",
    recommendationTier: "conditional",
    recommendationSummary:
      "Cloud-native collaborative document path for Google Docs, Sheets, and Slides when the user wants shared Google Workspace artifacts.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation:
        "Use Google Workspace when the target artifact should be a native collaborative Google Doc, Sheet, or Slide rather than a local Office file; keep OAuth scopes, export formats, and cloud sharing explicit.",
      dogfoodTargets: [
        "Create or modify one tiny native Google Doc, Sheet, and Slide through the approved Google Workspace connector path when credentials are available.",
        "Export one selected Google Workspace file through Drive export to text or PDF and verify the connector readback path.",
        "Record OAuth scopes, file id, sharing state, export MIME type, API method ids, and latency/error shapes without exposing tokens.",
      ],
      promotionCriteria: [
        "Credentialed connector dogfood can create/read/export native Google Workspace files through Ambient-managed OAuth.",
        "Pi guidance chooses Google Workspace only for cloud-native collaboration, Drive organization, or user-requested sharing.",
        "Export/readback paths are deterministic enough that Pi can verify content without relying on browser scraping.",
      ],
      fallbackGuidance: [
        "Use Ambient local artifact runtimes for local `.docx`, `.pptx`, or `.xlsx` deliverables.",
        "Use Ambient Office extraction/preview for existing local Office files.",
        "Use Microsoft 365/Graph only when the user or organization specifically requires Microsoft cloud storage/workflows.",
      ],
    },
    bestFor: [
      "Native Google Docs",
      "Native Google Sheets",
      "Native Google Slides",
      "Collaborative cloud documents",
      "Drive export workflows",
    ],
    tradeoffs: ["Requires Google OAuth and network access", "Native Google document structures differ from local Office artifacts"],
    avoidWhen: [
      "The user needs offline/local-only document generation",
      "The user wants a local `.docx`, `.pptx`, or `.xlsx` file without cloud upload",
    ],
    platforms: ["any"],
    hardwareFit: ["Hosted API path; local hardware is not the bottleneck"],
    capabilityBuilderDefaults: {
      provider: "Google Workspace",
      locality: "network",
      responseFormats: ["json", "text"],
      networkHosts: ["docs.googleapis.com", "slides.googleapis.com", "sheets.googleapis.com", "www.googleapis.com"],
    },
    ambientContract: {
      commandContract:
        "Connector calls explicit Google Docs/Sheets/Slides/Drive methods and returns file ids, URLs, export metadata, and bounded content previews.",
      descriptorRequirements: ["connector shape", "OAuth scope notes", "Google API method declarations", "export/readback validation"],
      artifactPolicy: "Do not persist OAuth tokens in artifacts; write exported files only when the user requests local copies.",
      validationTarget: "Create or export a tiny native Google Workspace document and verify content through connector readback.",
    },
    secrets: [],
    networkHosts: ["docs.googleapis.com", "slides.googleapis.com", "sheets.googleapis.com", "www.googleapis.com"],
    modelAssets: [],
    runtimeState: { externalService: true, serviceKind: "hosted-api", statePaths: ["Google sidecar OAuth/account state"] },
    costPrivacyNotes: ["Document content, metadata, and sharing state live in Google Workspace under the connected account."],
    maintenanceNotes: [
      "Track OAuth scopes, sidecar method catalog, Drive export MIME support, API quota/rate limits, and account switching behavior.",
    ],
    safetyBoundaries: [
      "Do not create, share, or overwrite cloud documents without explicit user intent and scoped connector authorization.",
    ],
    knownQuirks: [
      "Drive export is often the safer readback fallback for Google Docs text when Docs API read methods are unavailable in a local OAuth project.",
    ],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary: "Google Docs, Slides, Sheets, and Drive export APIs expose create/export paths for cloud-native rich documents.",
      },
      {
        date: reviewedAt,
        type: "manual-note",
        summary: "Ambient has Google Workspace sidecar and method-broker coverage for Drive/Docs/Sheets/Slides workflows.",
      },
    ],
    docs: [
      {
        label: "Google Docs documents.create",
        url: "https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/create",
        lastReviewed: reviewedAt,
      },
      {
        label: "Google Slides presentations.create",
        url: "https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/create",
        lastReviewed: reviewedAt,
      },
      {
        label: "Google Sheets spreadsheets.create",
        url: "https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/create",
        lastReviewed: reviewedAt,
      },
      {
        label: "Google Drive download/export guide",
        url: "https://developers.google.com/workspace/drive/api/guides/manage-downloads",
        lastReviewed: reviewedAt,
      },
    ],
  },
  {
    id: "rich-documents.local-conversion-ooxml",
    displayName: "LibreOffice/Pandoc/OOXML libraries",
    capabilityArea: "rich-documents",
    installerShape: "file-converter",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "conditional",
    recommendationSummary:
      "Local fallback stack for conversions and custom Word/PowerPoint generators when built-in Ambient runtimes are not enough.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation:
        "Use LibreOffice, Pandoc, Mammoth, python-docx, docx, or PptxGenJS as a local fallback stack for explicit conversion or custom OOXML generation tasks that the built-in Ambient runtimes cannot cover.",
      dogfoodTargets: [
        "Run one tiny conversion through Pandoc or LibreOffice and verify the output file exists, opens through Ambient Office extraction/preview, and records the exact command/version.",
        "Generate one tiny `.docx` with a JS or Python OOXML library and one tiny `.pptx` with PptxGenJS, then read or preview both artifacts.",
        "Exercise unsupported-format and missing-binary failures so Pi can recommend a narrower built-in path before installing packages.",
      ],
      promotionCriteria: [
        "Each wrapper declares the exact binary/package versions, input/output formats, and workspace artifact paths.",
        "Generated DOCX/PPTX files pass Ambient extraction or preview validation without silent repair.",
        "Pi guidance recommends this stack only for concrete conversion/custom-generator tasks, not as the default rich-document path.",
      ],
      fallbackGuidance: [
        "Use Ambient local artifact runtimes first for normal Word/PowerPoint/spreadsheet creation.",
        "Use Ambient Office extraction/preview first for reading existing Office files.",
        "Use Google Workspace when the user wants native cloud collaboration rather than local files.",
      ],
    },
    bestFor: ["Explicit format conversion", "Custom OOXML generation", "Markdown-to-DOCX/PPTX", "DOCX-to-HTML extraction"],
    tradeoffs: [
      "Dependency and fidelity risks vary by library",
      "LibreOffice conversion can be slow and host-dependent",
      "Custom OOXML generation needs visual verification",
    ],
    avoidWhen: [
      "A built-in Ambient runtime can produce the required artifact directly",
      "The user has not specified an input/output format",
    ],
    platforms: ["macos-arm64", "macos-x64", "windows-x64", "linux-x64"],
    hardwareFit: ["CPU-friendly for small files; LibreOffice conversion can be heavy for large decks/workbooks"],
    capabilityBuilderDefaults: {
      provider: "Local document conversion/OOXML stack",
      locality: "local",
      outputFileArtifacts: ["docx", "pptx", "xlsx", "pdf", "html", "md"],
      responseFormats: ["json", "text"],
      modelAssets: ["LibreOffice/soffice binary", "Pandoc binary", "OOXML package dependencies"],
    },
    ambientContract: {
      commandContract:
        "Wrapper performs one explicit conversion or generation operation and returns input/output paths, versions, and validation proof.",
      descriptorRequirements: [
        "file-converter shape",
        "input/output format declaration",
        "binary/package version notes",
        "artifact validation proof",
      ],
      artifactPolicy: "Write converted/generated files to workspace paths and keep full conversion logs as artifacts when output is large.",
      validationTarget: "Convert or generate a tiny DOCX/PPTX/PDF artifact and verify it through Ambient readback or preview.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [
      {
        name: "LibreOffice/soffice",
        sourceUrl: "https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html",
        cachePolicy: "System install or managed binary path.",
      },
      { name: "Pandoc", sourceUrl: "https://pandoc.org/MANUAL.html", cachePolicy: "System install or managed binary path." },
      { name: "Mammoth", sourceUrl: "https://github.com/mwilliamson/mammoth.js", licenseNote: "BSD-2-Clause" },
      { name: "python-docx", sourceUrl: "https://python-docx.readthedocs.io/en/latest/user/documents.html", licenseNote: "MIT" },
      { name: "docx", sourceUrl: "https://www.npmjs.com/package/docx" },
      { name: "PptxGenJS", sourceUrl: "https://gitbrent.github.io/PptxGenJS/", licenseNote: "MIT" },
    ],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: [
        "official LibreOffice CLI docs",
        "Pandoc manual",
        "Mammoth repo",
        "python-docx docs",
        "docx npm package",
        "PptxGenJS docs",
      ],
      missingOrBlockingArtifacts: [
        "Ambient-approved typed installer for each library/binary",
        "format-specific fidelity matrix",
        "cross-platform binary discovery",
      ],
      minimumLocalSmokeTest: "Run one tiny conversion/generation and verify output through Ambient Office readback or preview.",
    },
    runtimeState: { externalService: false, serviceKind: "none", statePaths: ["workspace conversion outputs", "tool/package cache"] },
    costPrivacyNotes: ["Local conversions avoid cloud upload but may install binaries or packages into a managed environment."],
    maintenanceNotes: ["Pin versions, format support, binary discovery paths, conversion timeouts, and fidelity caveats per tool."],
    safetyBoundaries: ["Do not run macros or active content from untrusted Office files; treat conversion inputs as untrusted."],
    knownQuirks: [
      "Pandoc is excellent for structured Markdown-to-DOCX/PPTX but not pixel-perfect Office round-tripping.",
      "Mammoth favors semantic HTML over exact visual style preservation.",
      "PptxGenJS can generate rich decks but still needs visual QA.",
    ],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary:
          "Official/project docs reviewed for LibreOffice CLI parameters, Pandoc DOCX/PPTX support, Mammoth, python-docx, docx, and PptxGenJS.",
      },
    ],
    docs: [
      {
        label: "LibreOffice command-line parameters",
        url: "https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html",
        lastReviewed: reviewedAt,
      },
      { label: "Pandoc manual", url: "https://pandoc.org/MANUAL.html", lastReviewed: reviewedAt },
      { label: "Mammoth", url: "https://github.com/mwilliamson/mammoth.js", lastReviewed: reviewedAt },
      { label: "python-docx", url: "https://python-docx.readthedocs.io/en/latest/user/documents.html", lastReviewed: reviewedAt },
      { label: "docx npm package", url: "https://www.npmjs.com/package/docx", lastReviewed: reviewedAt },
      { label: "PptxGenJS", url: "https://gitbrent.github.io/PptxGenJS/", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "rich-documents.microsoft-365-graph",
    displayName: "Microsoft 365 / Graph document workflows",
    capabilityArea: "rich-documents",
    installerShape: "connector",
    providerKind: "cloud",
    sourceModel: "closed-source",
    recommendationTier: "research-needed",
    recommendationSummary:
      "Reserved enterprise cloud path for OneDrive, SharePoint, and Excel workbook workflows; not a V1 default document generator.",
    recommendationMemo: {
      deploymentRole: "reserved",
      recommendation:
        "Use Microsoft 365 / Graph as a reserved enterprise connector candidate when the user specifically needs OneDrive, SharePoint, or Excel workbook workflows; do not treat it as the default Word/PowerPoint authoring provider until scoped connector dogfood exists.",
      dogfoodTargets: [
        "With approved Microsoft account auth, upload one tiny generated Office file to OneDrive or SharePoint and read back its DriveItem metadata.",
        "Run one tiny Excel workbook API operation for a workbook stored in OneDrive/SharePoint and record scopes, file id, range address, and response shape.",
        "Document which Word/PowerPoint tasks are file-storage/upload flows versus native document-editing APIs before recommending any install path.",
      ],
      promotionCriteria: [
        "Ambient has an approved Microsoft OAuth/connector flow with scoped permissions, account switching, and audit events.",
        "DriveItem upload/readback and at least one Excel workbook operation are credential-dogfooded without token leakage.",
        "Pi guidance clearly separates Microsoft cloud storage/workbook automation from local Office artifact generation.",
      ],
      fallbackGuidance: [
        "Use Ambient local artifact runtimes for local Word/PowerPoint/spreadsheet files.",
        "Use Google Workspace for cloud-native Docs/Sheets/Slides collaboration when Microsoft is not required.",
        "Use local conversion/OOXML libraries when the task is file conversion or custom local generation.",
      ],
    },
    bestFor: [
      "Enterprise Microsoft 365 workflows",
      "OneDrive and SharePoint file storage",
      "Excel workbook automation",
      "Organization-scoped document workflows",
    ],
    tradeoffs: [
      "Requires Microsoft OAuth/admin policy and scoped permissions",
      "Word/PowerPoint authoring is not the same as file upload/storage",
      "Enterprise tenant policy can block connector behavior",
    ],
    avoidWhen: ["The user just needs a local `.docx` or `.pptx` artifact", "No Microsoft account/tenant requirement exists"],
    platforms: ["any"],
    hardwareFit: ["Hosted API path; local hardware is not the bottleneck"],
    capabilityBuilderDefaults: {
      provider: "Microsoft 365 / Graph",
      locality: "network",
      responseFormats: ["json"],
      networkHosts: ["graph.microsoft.com"],
    },
    ambientContract: {
      commandContract:
        "Connector calls explicit Microsoft Graph endpoints for DriveItem files or workbook operations and returns ids, URLs, scopes, and bounded previews.",
      descriptorRequirements: ["connector shape", "OAuth scope notes", "Graph endpoint declarations", "tenant/admin-policy notes"],
      artifactPolicy: "Do not persist OAuth tokens in artifacts; write downloaded/exported files only when requested.",
      validationTarget:
        "Upload a tiny file to OneDrive/SharePoint or run one Excel workbook operation through approved Microsoft Graph auth.",
    },
    secrets: [],
    networkHosts: ["graph.microsoft.com"],
    modelAssets: [],
    runtimeState: { externalService: true, serviceKind: "hosted-api", statePaths: ["future Microsoft connector OAuth/account state"] },
    costPrivacyNotes: ["Document content and metadata live in Microsoft 365 under the connected tenant/account."],
    maintenanceNotes: [
      "Track Graph API version, OAuth scopes, tenant/admin consent, DriveItem upload limits, Excel workbook API limits, and throttling behavior.",
    ],
    safetyBoundaries: [
      "Do not upload, share, or modify enterprise documents without explicit user intent and scoped account authorization.",
    ],
    knownQuirks: [
      "Graph is strong for files and Excel workbook operations; Word/PowerPoint authoring may require local artifact generation plus upload rather than native edit APIs.",
    ],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary: "Microsoft Graph docs reviewed for file/DriveItem workflows, Excel workbook APIs, and general Graph constraints.",
      },
    ],
    docs: [
      { label: "Microsoft Graph API overview", url: "https://learn.microsoft.com/en-us/graph/use-the-api", lastReviewed: reviewedAt },
      {
        label: "Working with files in Microsoft Graph",
        url: "https://learn.microsoft.com/en-us/graph/api/resources/onedrive",
        lastReviewed: reviewedAt,
      },
      {
        label: "Upload or replace DriveItem content",
        url: "https://learn.microsoft.com/graph/api/driveitem-put-content?view=graph-rest-1.0",
        lastReviewed: reviewedAt,
      },
      {
        label: "Working with Excel in Microsoft Graph",
        url: "https://learn.microsoft.com/en-us/graph/api/resources/excel?view=graph-rest-1.0",
        lastReviewed: reviewedAt,
      },
    ],
  },
];
