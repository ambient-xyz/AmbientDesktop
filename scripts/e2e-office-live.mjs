#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { snapshotHarnessWorkspace, writeHarnessTraceArtifacts } from "./harness-trace-artifacts.mjs";

const port = Number(process.env.AMBIENT_OFFICE_LIVE_CDP_PORT ?? 9486);
const timeoutMs = Number(process.env.AMBIENT_OFFICE_LIVE_TIMEOUT_MS ?? 300_000);
const workspace = await mkdtemp(join(tmpdir(), "ambient-office-live-workspace-"));
const userData = await mkdtemp(join(tmpdir(), "ambient-office-live-user-data-"));
const docxPath = join(workspace, "office-brief.docx");
const pptxPath = join(workspace, "office-deck.pptx");
const xlsxPath = join(workspace, "office-budget.xlsx");
const pdfPath = join(workspace, "office-brief.pdf");
const docxFinalToken = "DOCX_OFFICE_READ_OK";
const pptxFinalToken = "PPTX_OFFICE_RLM_OK";
const xlsxFinalToken = "XLSX_OFFICE_READ_OK";
const pdfFinalToken = "PDF_NATIVE_READ_OK";
const expectedDocxOwner = "Anika Rao";
const expectedDocxDecision = "approve the Saguaro launch plan";
const expectedPptxLaunch = "Maple Ridge enablement";
const expectedPptxRisk = "regional support coverage";
const expectedXlsxOwner = "Mira Patel";
const expectedXlsxBudget = "4800";
const expectedPdfFinding = "native PDF extraction is available";
const output = [];
const children = new Set();
let appInstance;
let beforeWorkspace;

try {
  await seedWorkspace(workspace);
  beforeWorkspace = await snapshotHarnessWorkspace(workspace);
  await seedUserDataCredentials(userData);

  appInstance = await launchApp();
  const summary = await runOfficeDogfood(appInstance.cdp);
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(outputTail());
  throw error;
} finally {
  if (appInstance) {
    appInstance.cdp.close();
    await terminateProcessTree(appInstance.child);
  }
  for (const child of children) await terminateProcessTree(child);
  await terminateDebugPortProcesses();
  await rm(workspace, { recursive: true, force: true });
  await rm(userData, { recursive: true, force: true });
}

console.log("Live Ambient Office/PDF dogfood passed.");

async function seedWorkspace(root) {
  await writeFile(
    join(root, "README.md"),
    [
      "# Office live dogfood workspace",
      "",
      "This temporary workspace validates first-party PDF/Office parsing and preview-adjacent tool paths.",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    docxPath,
    await createDocxFixture([
      "Office Dogfood Brief",
      `Decision: ${expectedDocxDecision}.`,
      `Owner: ${expectedDocxOwner}.`,
      "Required action: confirm the docx extractor reaches file_read through the live Pi loop.",
    ]),
  );
  await writeFile(
    pptxPath,
    await createPptxFixture([
      {
        title: "Program",
        body: `Launch: ${expectedPptxLaunch}.`,
        notes: "Use the deck-wide long context tool path.",
      },
      {
        title: "Risk",
        body: `Primary risk: ${expectedPptxRisk}.`,
      },
      {
        title: "Closeout",
        body: "Success means the live tool transcript contains long_context_process for a pptx workspace path.",
      },
    ]),
  );
  await writeFile(
    xlsxPath,
    await createXlsxFixture([
      {
        name: "Launch Budget",
        rows: [
          ["Category", "Owner", "Budget"],
          ["Field event", expectedXlsxOwner, Number(expectedXlsxBudget)],
          ["Support buffer", "Regional team", 1200],
        ],
      },
    ]),
  );
  await writeFile(pdfPath, createPdfFixture(["PDF Dogfood Brief", `Finding: ${expectedPdfFinding}.`, "Required action: use the native read tool, not bash or pip."]));
}

async function seedUserDataCredentials(targetUserData) {
  if (process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY) return;
  const source = join(defaultAmbientUserDataPath(), "ambient-api-key.enc");
  if (!existsSync(source)) return;
  await mkdir(targetUserData, { recursive: true });
  await copyFile(source, join(targetUserData, "ambient-api-key.enc"));
}

function defaultAmbientUserDataPath() {
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Ambient Desktop");
  if (process.platform === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Ambient Desktop");
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "Ambient Desktop");
}

async function launchApp() {
  const child = spawn("pnpm", ["exec", "electron-vite", "dev", "--", `--remote-debugging-port=${port}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AMBIENT_DESKTOP_WORKSPACE: workspace,
      AMBIENT_E2E: "1",
      AMBIENT_E2E_USER_DATA: userData,
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  child.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));

  const target = await waitForTarget(port);
  await delay(750);
  const cdp = await connectCdp(target.webSocketDebuggerUrl);
  await waitFor(cdp, () => document.body?.innerText.includes("Ambient"), "main shell", 30_000);
  return { child, cdp };
}

async function runOfficeDogfood(cdp) {
  const initialState = await desktopState(cdp);
  if (!initialState.provider.hasApiKey) {
    throw new Error(
      [
        "Ambient API key is missing.",
        "Save a key in the app, or launch this script with AMBIENT_API_KEY/AMBIENT_AGENT_AMBIENT_API_KEY.",
        "Keys can be created at https://app.ambient.xyz/keys.",
      ].join(" "),
    );
  }

  const keyCheck = await evaluate(cdp, "window.ambientDesktop.testAmbientApiKey()");
  if (!keyCheck?.ok) throw new Error(`Ambient API key check failed: ${keyCheck?.message ?? "unknown error"}`);

  const docx = await runOfficePrompt(cdp, {
    label: "docx native read",
    prompt: [
      "This is a live product dogfood for Office file parsing.",
      "Use the read tool on office-brief.docx before answering.",
      `Answer with ${docxFinalToken}, the owner, and the decision.`,
      "Do not use the network and do not modify files.",
    ].join("\n"),
    context: [{ path: "office-brief.docx" }],
    requiredTool: "read",
    requiredToolText: ["Office document text extracted from office-brief.docx", expectedDocxOwner, expectedDocxDecision],
    forbiddenToolText: ["[Content_Types].xml", "PK\u0003\u0004"],
    requiredAssistantText: [docxFinalToken, expectedDocxOwner, expectedDocxDecision],
  });

  const pptx = await runOfficePrompt(cdp, {
    label: "pptx long_context_process",
    prompt: [
      "This is a live product dogfood for Office deck long-context processing.",
      "Use long_context_process with taskType qa, question set to the user question below, and workspacePaths containing office-deck.pptx.",
      `Question: What is the launch name and the primary risk in the deck?`,
      `Answer with ${pptxFinalToken}, the launch name, and the primary risk.`,
      "Do not use the network and do not modify files.",
    ].join("\n"),
    context: [{ path: "office-deck.pptx" }],
    requiredTool: "long_context_process",
    requiredToolText: ["Lambda-RLM execution summary", expectedPptxLaunch, expectedPptxRisk],
    requiredAssistantText: [pptxFinalToken, expectedPptxLaunch, expectedPptxRisk],
  });

  const xlsx = await runOfficePrompt(cdp, {
    label: "xlsx native read",
    prompt: [
      "This is a live product dogfood for Office spreadsheet parsing.",
      "Use the read tool on office-budget.xlsx before answering.",
      `Answer with ${xlsxFinalToken}, the field event owner, and the field event budget.`,
      "Do not use the network and do not modify files.",
    ].join("\n"),
    context: [{ path: "office-budget.xlsx" }],
    requiredTool: "read",
    requiredToolText: ["Office document text extracted from office-budget.xlsx", expectedXlsxOwner, expectedXlsxBudget],
    forbiddenToolText: ["[Content_Types].xml", "PK\u0003\u0004"],
    requiredAssistantText: [xlsxFinalToken, expectedXlsxOwner, expectedXlsxBudget],
  });

  const pdf = await runOfficePrompt(cdp, {
    label: "pdf native read",
    prompt: [
      "This is a live product dogfood for PDF text extraction.",
      "Use the read tool on office-brief.pdf before answering.",
      `Answer with ${pdfFinalToken} and the finding.`,
      "Do not use bash, python, pip, the network, or file modifications.",
    ].join("\n"),
    context: [{ path: "office-brief.pdf" }],
    requiredTool: "read",
    requiredToolText: ["PDF text extracted from office-brief.pdf", expectedPdfFinding],
    forbiddenToolNames: ["bash"],
    forbiddenToolText: ["%PDF-1.4", "PyPDF2", "Successfully installed", "no-pdf-lib"],
    requiredAssistantText: [pdfFinalToken, expectedPdfFinding],
  });

  const finalState = await desktopState(cdp);
  const summary = {
    workspace,
    model: process.env.AMBIENT_OFFICE_LIVE_MODEL || process.env.AMBIENT_LIVE_MODEL || initialState.settings.model,
    docx,
    pptx,
    xlsx,
    pdf,
  };
  await writeHarnessTraceArtifacts({ workspace, beforeWorkspace, messages: finalState.messages, summary });
  return summary;
}

async function runOfficePrompt(cdp, input) {
  const state = await evaluate(cdp, "window.ambientDesktop.createThread()");
  const threadId = state.activeThreadId;
  await installCollector(cdp);
  await sendPrompt(cdp, {
    threadId,
    content: input.prompt,
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: process.env.AMBIENT_OFFICE_LIVE_MODEL || process.env.AMBIENT_LIVE_MODEL || state.settings.model,
    thinkingLevel: "low",
    context: input.context,
  });

  await waitFor(cdp, () => Boolean(window.__ambientOfficeLive?.sawRunStart), `${input.label} run start`, 45_000);
  await waitForCompletion(cdp, timeoutMs, input.label);

  const live = await getCollectorState(cdp);
  const finalState = await desktopState(cdp);
  const messages = finalState.messages.filter((message) => message.threadId === threadId || !message.threadId);
  const assistantText = messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content)
    .join("\n");
  const normalizedAssistantText = normalizeAssertionText(assistantText);
  const toolTranscript = messages
    .filter((message) => message.role === "tool")
    .map((message) => `${message.metadata?.toolName ?? ""}\n${message.content}`)
    .join("\n");

  if (live.error) throw new Error(`Live Office dogfood failed during ${input.label}: ${live.error}`);
  if (!toolTranscript.includes(input.requiredTool)) {
    throw new Error(`${input.label} did not call ${input.requiredTool}. Tool transcript:\n${toolTranscript.slice(-4000)}`);
  }
  for (const forbidden of input.forbiddenToolNames ?? []) {
    if (live.toolNames.includes(forbidden)) {
      throw new Error(`${input.label} called forbidden tool ${forbidden}. Tool names: ${live.toolNames.join(", ")}`);
    }
  }
  for (const expected of input.requiredToolText) {
    if (!toolTranscript.toLowerCase().includes(expected.toLowerCase())) {
      throw new Error(`${input.label} tool transcript missed ${expected}. Tool transcript:\n${toolTranscript.slice(-4000)}`);
    }
  }
  for (const forbidden of input.forbiddenToolText ?? []) {
    if (toolTranscript.includes(forbidden)) {
      throw new Error(`${input.label} tool transcript included forbidden content ${forbidden}. Tool transcript:\n${toolTranscript.slice(-4000)}`);
    }
  }
  for (const expected of input.requiredAssistantText) {
    if (!normalizedAssistantText.includes(normalizeAssertionText(expected))) {
      throw new Error(`${input.label} assistant response missed ${expected}. Assistant text:\n${assistantText.slice(-4000)}`);
    }
  }

  return {
    threadId,
    messageDeltaCount: live.messageDeltaCount,
    toolEventCount: live.toolEventCount,
    toolMessageCount: live.toolMessageCount,
    toolNames: [...new Set(live.toolNames)],
    statuses: live.statuses,
  };
}

function normalizeAssertionText(text) {
  return String(text)
    .toLowerCase()
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function installCollector(cdp) {
  await evaluate(
    cdp,
    `
    (() => {
      window.__ambientOfficeLive?.unsubscribe?.();
      window.__ambientOfficeLive = {
        statuses: [],
        messageDeltaCount: 0,
        toolEventCount: 0,
        toolMessageCount: 0,
        toolNames: [],
        assistantTail: "",
        toolTail: "",
        sawRunStart: false,
        sawRunIdle: false,
        sendResolved: false,
        error: undefined,
      };
      window.__ambientOfficeLive.unsubscribe = window.ambientDesktop.onEvent((event) => {
        if (event.type === "run-status") {
          window.__ambientOfficeLive.statuses.push(event.status);
          if (event.status !== "idle") window.__ambientOfficeLive.sawRunStart = true;
          if (window.__ambientOfficeLive.sawRunStart && event.status === "idle") window.__ambientOfficeLive.sawRunIdle = true;
        }
        if (event.type === "message-delta") {
          window.__ambientOfficeLive.messageDeltaCount += 1;
          window.__ambientOfficeLive.assistantTail = (window.__ambientOfficeLive.assistantTail + String(event.delta ?? "")).slice(-4000);
        }
        if (event.type === "tool-event") window.__ambientOfficeLive.toolEventCount += 1;
        if ((event.type === "message-created" || event.type === "message-updated") && event.message?.role === "tool") {
          if (event.type === "message-created") window.__ambientOfficeLive.toolMessageCount += 1;
          const toolName = String(event.message.metadata?.toolName ?? "");
          if (toolName) window.__ambientOfficeLive.toolNames.push(toolName);
          window.__ambientOfficeLive.toolTail = (window.__ambientOfficeLive.toolTail + "\\n---\\n" + String(event.message.content ?? "")).slice(-4000);
        }
        if (event.type === "error") window.__ambientOfficeLive.error = event.message;
      });
      return true;
    })()
  `,
  );
}

async function sendPrompt(cdp, input) {
  await evaluate(
    cdp,
    `
    (() => {
      const input = ${JSON.stringify(input)};
      window.ambientDesktop.sendMessage(input)
        .then(() => {
          window.__ambientOfficeLive.sendResolved = true;
        })
        .catch((error) => {
          window.__ambientOfficeLive.error = error instanceof Error ? error.message : String(error);
        });
      return true;
    })()
  `,
  );
}

async function waitForCompletion(cdp, maxMs, label) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const live = await getCollectorState(cdp);
    if (live.error) throw new Error(live.error);
    if (live.sawRunIdle && live.sendResolved) return;
    await delay(1_000);
  }
  const live = await getCollectorState(cdp);
  throw new Error(
    [
      `Timed out after ${maxMs}ms waiting for ${label} live completion.`,
      `statuses=${JSON.stringify(live?.statuses ?? [])}`,
      `sendResolved=${Boolean(live?.sendResolved)} sawRunIdle=${Boolean(live?.sawRunIdle)}`,
      `assistantTail=${JSON.stringify(live?.assistantTail ?? "")}`,
      `toolTail=${JSON.stringify(live?.toolTail ?? "")}`,
    ].join("\n"),
  );
}

async function getCollectorState(cdp) {
  return evaluate(
    cdp,
    `
    (() => {
      const live = window.__ambientOfficeLive;
      return live ? {
        statuses: live.statuses,
        messageDeltaCount: live.messageDeltaCount,
        toolEventCount: live.toolEventCount,
        toolMessageCount: live.toolMessageCount,
        toolNames: live.toolNames,
        assistantTail: live.assistantTail,
        toolTail: live.toolTail,
        sawRunStart: live.sawRunStart,
        sawRunIdle: live.sawRunIdle,
        sendResolved: live.sendResolved,
        error: live.error,
      } : undefined;
    })()
  `,
  );
}

async function desktopState(cdp) {
  return evaluate(cdp, "window.ambientDesktop.bootstrap()");
}

function createPdfFixture(lines) {
  const textLines = lines.length ? lines : [""];
  const stream = [
    "BT",
    "/F1 18 Tf",
    "72 720 Td",
    "24 TL",
    ...textLines.flatMap((line, index) => [`(${escapePdfText(line)}) Tj`, ...(index === textLines.length - 1 ? [] : ["T*"])]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];

  let output = "%PDF-1.4\n";
  const offsets = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output, "latin1"));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(output, "latin1");
  output += "xref\n";
  output += `0 ${objects.length + 1}\n`;
  output += "0000000000 65535 f \n";
  for (const offset of offsets) output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  output += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, "latin1");
}

function escapePdfText(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

async function createDocxFixture(paragraphs) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.map((paragraph) => `<w:p><w:r><w:t>${escapeXml(paragraph)}</w:t></w:r></w:p>`).join("\n")}
  </w:body>
</w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function createPptxFixture(slides) {
  const zip = new JSZip();
  for (const [index, slide] of slides.entries()) {
    const slideNumber = index + 1;
    zip.file(
      `ppt/slides/slide${slideNumber}.xml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp><p:txBody><a:p><a:r><a:t>${escapeXml(slide.title)}</a:t></a:r></a:p></p:txBody></p:sp>
      <p:sp><p:txBody><a:p><a:r><a:t>${escapeXml(slide.body)}</a:t></a:r></a:p></p:txBody></p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`,
    );
    if (slide.notes) {
      zip.file(
        `ppt/notesSlides/notesSlide${slideNumber}.xml`,
        `<?xml version="1.0" encoding="UTF-8"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${escapeXml(slide.notes)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:notes>`,
      );
    }
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

async function createXlsxFixture(sheets) {
  const zip = new JSZip();
  const sharedStrings = [];
  const sharedStringIndexes = new Map();
  const sharedStringIndex = (value) => {
    const existing = sharedStringIndexes.get(value);
    if (existing !== undefined) return existing;
    const index = sharedStrings.length;
    sharedStrings.push(value);
    sharedStringIndexes.set(value, index);
    return index;
  };

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  ${sheets
    .map(
      (_sheet, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("\n  ")}
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("\n    ")}
  </sheets>
</workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets
    .map(
      (_sheet, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${
          index + 1
        }.xml"/>`,
    )
    .join("\n  ")}
</Relationships>`,
  );

  for (const [sheetIndex, sheet] of sheets.entries()) {
    zip.file(
      `xl/worksheets/sheet${sheetIndex + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${sheet.rows
      .map(
        (row, rowIndex) =>
          `<row r="${rowIndex + 1}">${row
            .map((cell, columnIndex) => xlsxCellXml(cell, `${xlsxColumnName(columnIndex + 1)}${rowIndex + 1}`, sharedStringIndex))
            .join("")}</row>`,
      )
      .join("\n    ")}
  </sheetData>
</worksheet>`,
    );
  }

  zip.file(
    "xl/sharedStrings.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">
  ${sharedStrings.map((value) => `<si><t>${escapeXml(value)}</t></si>`).join("\n  ")}
</sst>`,
  );

  return zip.generateAsync({ type: "nodebuffer" });
}

function xlsxCellXml(value, reference, sharedStringIndex) {
  if (typeof value === "number") return `<c r="${reference}"><v>${value}</v></c>`;
  if (typeof value === "boolean") return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${reference}" t="s"><v>${sharedStringIndex(String(value))}</v></c>`;
}

function xlsxColumnName(index) {
  let value = "";
  let current = index;
  while (current > 0) {
    current -= 1;
    value = String.fromCharCode(65 + (current % 26)) + value;
    current = Math.floor(current / 26);
  }
  return value;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function waitForTarget(cdpPort) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const targets = await response.json();
      const target = targets.find((item) => item.webSocketDebuggerUrl && item.type === "page") ?? targets[0];
      if (target?.webSocketDebuggerUrl) return target;
    } catch {
      // App not listening yet.
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for Electron CDP target.");
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((innerResolve, innerReject) => {
            pending.set(id, { resolve: innerResolve, reject: innerReject });
            setTimeout(() => {
              if (!pending.has(id)) return;
              pending.delete(id);
              innerReject(new Error(`Timed out waiting for CDP ${method}.`));
            }, 15_000);
          });
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message ?? "CDP error"));
      else entry.resolve(message.result);
    });
    socket.addEventListener("error", () => reject(new Error("CDP websocket failed.")));
  });
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed.");
  }
  return result.result?.value;
}

async function waitFor(cdp, predicate, label, maxMs = 10_000) {
  const expression = `(${predicate.toString()})()`;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function terminateProcessTree(proc) {
  children.delete(proc);
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const exited = new Promise((resolve) => proc.once("exit", resolve));
  try {
    if (process.platform === "win32") proc.kill("SIGTERM");
    else process.kill(-proc.pid, "SIGTERM");
  } catch {
    proc.kill("SIGTERM");
  }
  await Promise.race([exited, delay(1_500)]);
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  try {
    if (process.platform === "win32") proc.kill("SIGKILL");
    else process.kill(-proc.pid, "SIGKILL");
  } catch {
    proc.kill("SIGKILL");
  }
  await Promise.race([exited, delay(500)]);
}

async function terminateDebugPortProcesses() {
  if (process.platform === "win32") return;
  const cwdPattern = process.cwd().replace(/[.[\]{}()*+?^$|\\]/g, "\\$&");
  await runIgnoringFailure("pkill", ["-f", `${cwdPattern}.*remote-debugging-port=${port}`]);
  await runIgnoringFailure("pkill", ["-f", `electron-vite dev -- --remote-debugging-port=${port}`]);
}

function runIgnoringFailure(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", resolve);
    child.on("close", resolve);
  });
}

function outputTail() {
  return `Electron output tail:\n${output.join("").split("\n").slice(-120).join("\n")}\n`;
}
