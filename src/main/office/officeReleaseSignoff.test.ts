import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { OfficePreviewService } from "./officePreviewService";
import { createAmbientReadOperations } from "../pi/piReadOperations";
import { readWorkspaceFile } from "../workspace/workspaceFiles";

const runReleaseSignoff = process.env.AMBIENT_OFFICE_RELEASE_SIGNOFF === "1";
const describeIf = runReleaseSignoff ? describe : describe.skip;
const sampleRoot = process.env.AMBIENT_OFFICE_SAMPLE_ROOT || join(homedir(), "Downloads");
const maxDepth = Number(process.env.AMBIENT_OFFICE_SAMPLE_MAX_DEPTH ?? 3);
const maxSamplesPerFormat = Number(process.env.AMBIENT_OFFICE_SAMPLE_COUNT ?? 2);

type SupportedFormat = ".docx" | ".pptx" | ".xlsx";
type LegacyFormat = ".doc" | ".ppt" | ".xls";

interface SampleFile {
  path: string;
  name: string;
  extension: string;
  size: number;
}

const preferredSupportedSamples: Record<SupportedFormat, string[]> = {
  ".docx": ["ambient_qa_uae.docx", "model_documentation_v9.docx", "how_ambient_makes_money_v8.docx"],
  ".pptx": ["AmbientPresentation(1).pptx", "Keynote Presentation.pptx", "Copy of Blockchain Presentation Deck.pptx"],
  ".xlsx": ["ambient_financial_model(3).xlsx", "ambient_financial_model_IC_grade.xlsx", "Inference Demand Calculator.xlsx"],
};

describeIf("Office release signoff samples", () => {
  it(
    "extracts and previews real modern Office samples without exposing raw package bytes",
    async () => {
      const samples = await discoverOfficeSamples(sampleRoot, maxDepth);
      const selected = supportedFormats().flatMap((extension) =>
        selectSamples(samples, extension, preferredSupportedSamples[extension], maxSamplesPerFormat),
      );
      expect(selected.length, `Expected real Office samples under ${sampleRoot}`).toBeGreaterThanOrEqual(supportedFormats().length);

      const cacheRoot = await mkdtemp(join(tmpdir(), "ambient-office-signoff-preview-"));
      const previewService = new OfficePreviewService({ cacheRoot });
      const readOperations = createAmbientReadOperations();
      try {
        for (const sample of selected) {
          const workspaceFile = await readWorkspaceFile("/", sample.path, {
            createOfficePreview: async (input) => previewService.renderPreview(input.absolutePath),
          });

          expect(workspaceFile.kind, sample.path).toBe("office");
          expect(workspaceFile.binary, sample.path).toBe(true);
          expect(workspaceFile.officeText?.status, sample.path).toBe("available");
          expect(workspaceFile.officeText?.format, sample.path).toBe(sample.extension.slice(1));
          expect(workspaceFile.content.trim().length, sample.path).toBeGreaterThan(20);
          expect(workspaceFile.content, sample.path).not.toContain("[Content_Types].xml");
          expect(workspaceFile.content, sample.path).not.toContain("PK\u0003\u0004");
          expect(["available", "missing-renderer"], sample.path).toContain(workspaceFile.officePreview?.status);

          const nativeReadText = (await readOperations.readFile(sample.path)).toString("utf8");
          expect(nativeReadText, sample.path).toContain(`Office document text extracted from ${sample.name}`);
          expect(nativeReadText, sample.path).not.toContain("[Content_Types].xml");
          expect(nativeReadText, sample.path).not.toContain("PK\u0003\u0004");
        }
      } finally {
        await rm(cacheRoot, { recursive: true, force: true });
      }
    },
    120_000,
  );

  it(
    "keeps real legacy doc, ppt, and xls samples preview-only when they are present",
    async () => {
      const samples = await discoverOfficeSamples(sampleRoot, maxDepth);
      const selected = legacyFormats().flatMap((extension) => selectSamples(samples, extension, [], 1));
      if (!selected.length) {
        console.warn(`No legacy .doc/.ppt/.xls samples found under ${sampleRoot}; preview-only signoff skipped.`);
        return;
      }

      const cacheRoot = await mkdtemp(join(tmpdir(), "ambient-office-legacy-signoff-preview-"));
      const previewService = new OfficePreviewService({ cacheRoot });
      const readOperations = createAmbientReadOperations();
      try {
        for (const sample of selected) {
          const workspaceFile = await readWorkspaceFile("/", sample.path, {
            createOfficePreview: async (input) => previewService.renderPreview(input.absolutePath),
          });

          expect(workspaceFile.kind, sample.path).toBe("office");
          expect(workspaceFile.content, sample.path).toBe("");
          expect(workspaceFile.officeText?.status, sample.path).toBe("unsupported");
          expect(workspaceFile.officeText?.error, sample.path).toContain(expectedWorkspaceUnsupportedText(sample.extension as LegacyFormat));
          expect(["available", "missing-renderer"], sample.path).toContain(workspaceFile.officePreview?.status);

          const nativeReadText = (await readOperations.readFile(sample.path)).toString("utf8");
          expect(nativeReadText, sample.path).toContain("Office text unavailable");
          expect(nativeReadText, sample.path).toContain(expectedNativeReadUnsupportedText(sample.extension as LegacyFormat));
          expect(nativeReadText, sample.path).not.toContain("PK\u0003\u0004");
        }
      } finally {
        await rm(cacheRoot, { recursive: true, force: true });
      }
    },
    60_000,
  );
});

async function discoverOfficeSamples(root: string, depth: number): Promise<SampleFile[]> {
  const results: SampleFile[] = [];
  await walk(root, depth);
  return results.sort((left, right) => left.path.localeCompare(right.path));

  async function walk(directory: string, remainingDepth: number): Promise<void> {
    if (remainingDepth < 0) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath, remainingDepth - 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = extname(entry.name).toLowerCase();
      if (![...supportedFormats(), ...legacyFormats()].includes(extension as SupportedFormat | LegacyFormat)) continue;
      if (entry.name.startsWith("~$")) continue;
      const fileStat = await stat(absolutePath).catch(() => undefined);
      if (!fileStat?.isFile() || fileStat.size <= 0) continue;
      results.push({ path: absolutePath, name: basename(absolutePath), extension, size: fileStat.size });
    }
  }
}

function selectSamples(samples: SampleFile[], extension: SupportedFormat | LegacyFormat, preferredNames: string[], maxCount: number): SampleFile[] {
  const candidates = samples.filter((sample) => sample.extension === extension);
  const selected: SampleFile[] = [];
  const seen = new Set<string>();

  for (const preferred of preferredNames) {
    const match = candidates.find((sample) => sample.name === preferred);
    if (match && !seen.has(match.path)) {
      selected.push(match);
      seen.add(match.path);
    }
    if (selected.length >= maxCount) return selected;
  }

  for (const candidate of candidates) {
    if (seen.has(candidate.path)) continue;
    selected.push(candidate);
    seen.add(candidate.path);
    if (selected.length >= maxCount) break;
  }
  return selected;
}

function supportedFormats(): SupportedFormat[] {
  return [".docx", ".pptx", ".xlsx"];
}

function legacyFormats(): LegacyFormat[] {
  return [".doc", ".ppt", ".xls"];
}

function expectedWorkspaceUnsupportedText(extension: LegacyFormat): string {
  return extension === ".xls" ? "Legacy .xls" : "Legacy .doc/.ppt";
}

function expectedNativeReadUnsupportedText(extension: LegacyFormat): string {
  return extension === ".xls" ? "Spreadsheet Office files" : "Legacy .doc/.ppt";
}
