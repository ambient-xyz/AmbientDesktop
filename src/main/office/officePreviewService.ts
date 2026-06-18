import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { OfficePreview, OfficePreviewFormat } from "../../shared/workspaceTypes";
import { describeOfficePreviewSupport } from "./officeFileSupport";
import { ambientRuntimeEnv } from "../setup/runtimePath";

const execFileAsync = promisify(execFile);
const DEFAULT_CONVERT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_PDF_BYTES = 100 * 1024 * 1024;
const PREVIEW_CACHE_VERSION = 1;

export interface OfficePreviewServiceOptions {
  cacheRoot: string;
  env?: NodeJS.ProcessEnv;
  sofficePath?: string;
  sofficeCandidates?: string[];
  convertTimeoutMs?: number;
  maxSourceBytes?: number;
  maxPdfBytes?: number;
}

export interface OfficePreviewRenderResult extends OfficePreview {
  pdfPath?: string;
  pdfBytes?: number;
  pdfMtimeMs?: number;
}

interface LibreOfficeRenderer {
  command: string;
  version: string;
}

export class OfficePreviewService {
  private readonly env: NodeJS.ProcessEnv;
  private rendererPromise: Promise<LibreOfficeRenderer | undefined> | undefined;
  private readonly inFlight = new Map<string, Promise<OfficePreviewRenderResult>>();

  constructor(private readonly options: OfficePreviewServiceOptions) {
    this.env = options.env ?? process.env;
  }

  clearRendererDiscovery(): void {
    this.rendererPromise = undefined;
  }

  async renderPreview(filePath: string): Promise<OfficePreviewRenderResult> {
    const support = describeOfficePreviewSupport(filePath);
    if (!support) return { status: "unsupported", error: `Unsupported file type: ${basename(filePath)}` };
    if (support.status !== "supported") {
      return {
        status: "unsupported",
        format: undefined,
        error: unsupportedOfficeMessage(support.reason),
      };
    }

    const sourcePath = resolve(filePath);
    const sourceStat = await stat(sourcePath);
    const maxSourceBytes = this.options.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES;
    if (sourceStat.size > maxSourceBytes) {
      return {
        status: "failed",
        format: support.format,
        renderer: "libreoffice",
        error: `Office file is too large to render (${sourceStat.size.toLocaleString()} bytes).`,
      };
    }

    const renderer = await this.discoverRenderer();
    if (!renderer) {
      return {
        status: "missing-renderer",
        format: support.format,
        error: "LibreOffice was not found. Install LibreOffice or set AMBIENT_OFFICE_PREVIEW_SOFFICE_PATH to enable rendered Office previews.",
      };
    }

    const cacheKey = this.cacheKey(sourcePath, sourceStat, renderer);
    const existing = await this.cachedPreview(cacheKey, support.format, renderer);
    if (existing) return existing;

    const pending = this.inFlight.get(cacheKey);
    if (pending) return pending;

    const conversion = this.convert(sourcePath, support.format, cacheKey, renderer, sourceStat.size).finally(() => {
      this.inFlight.delete(cacheKey);
    });
    this.inFlight.set(cacheKey, conversion);
    return conversion;
  }

  private async discoverRenderer(): Promise<LibreOfficeRenderer | undefined> {
    if (!this.rendererPromise) this.rendererPromise = discoverLibreOfficeRenderer(this.rendererCandidates(), this.env);
    return this.rendererPromise;
  }

  private rendererCandidates(): string[] {
    if (this.options.sofficePath) return [this.options.sofficePath];
    if (this.options.sofficeCandidates) return this.options.sofficeCandidates;
    const candidates = [
      this.env.AMBIENT_OFFICE_PREVIEW_SOFFICE_PATH,
      "/Applications/LibreOffice.app/Contents/MacOS/soffice",
      "soffice",
      "libreoffice",
    ];
    return candidates.filter((candidate): candidate is string => Boolean(candidate?.trim()));
  }

  private cacheKey(sourcePath: string, sourceStat: Awaited<ReturnType<typeof stat>>, renderer: LibreOfficeRenderer): string {
    const hash = createHash("sha256");
    hash.update(
      JSON.stringify({
        version: PREVIEW_CACHE_VERSION,
        sourcePath,
        sourceSize: Number(sourceStat.size),
        sourceMtimeMs: Math.trunc(Number(sourceStat.mtimeMs)),
        rendererCommand: renderer.command,
        rendererVersion: renderer.version,
      }),
    );
    return hash.digest("hex").slice(0, 32);
  }

  private async cachedPreview(
    cacheKey: string,
    format: OfficePreviewFormat,
    renderer: LibreOfficeRenderer,
  ): Promise<OfficePreviewRenderResult | undefined> {
    const pdfPath = this.previewPdfPath(cacheKey);
    try {
      const pdfStat = await stat(pdfPath);
      if (!pdfStat.isFile()) return undefined;
      const maxPdfBytes = this.options.maxPdfBytes ?? DEFAULT_MAX_PDF_BYTES;
      if (pdfStat.size > maxPdfBytes) {
        await rm(this.previewDirectory(cacheKey), { recursive: true, force: true });
        return undefined;
      }
      return {
        status: "available",
        format,
        renderer: "libreoffice",
        cacheKey,
        generatedAt: new Date(pdfStat.mtimeMs).toISOString(),
        pdfPath,
        pdfBytes: pdfStat.size,
        pdfMtimeMs: pdfStat.mtimeMs,
      };
    } catch {
      return undefined;
    }
  }

  private async convert(
    sourcePath: string,
    format: OfficePreviewFormat,
    cacheKey: string,
    renderer: LibreOfficeRenderer,
    sourceBytes: number,
  ): Promise<OfficePreviewRenderResult> {
    const directory = this.previewDirectory(cacheKey);
    const outputDirectory = join(directory, "out");
    const profileDirectory = join(directory, "profile");
    const inputPath = join(directory, `source${extname(sourcePath).toLowerCase()}`);
    const rawPdfPath = join(outputDirectory, "source.pdf");
    const pdfPath = this.previewPdfPath(cacheKey);

    try {
      await rm(directory, { recursive: true, force: true });
      await mkdir(outputDirectory, { recursive: true });
      await mkdir(profileDirectory, { recursive: true });
      await copyFile(sourcePath, inputPath);
      await execFileAsync(
        renderer.command,
        [
          "--headless",
          "--nologo",
          "--nofirststartwizard",
          "--norestore",
          "--nodefault",
          "--nolockcheck",
          `-env:UserInstallation=${pathToFileURL(profileDirectory).href}`,
          "--convert-to",
          "pdf",
          "--outdir",
          outputDirectory,
          inputPath,
        ],
        {
          timeout: this.options.convertTimeoutMs ?? DEFAULT_CONVERT_TIMEOUT_MS,
          maxBuffer: 1024 * 1024,
          env: officePreviewProcessEnv(this.env),
          windowsHide: true,
        },
      );

      const pdfStat = await stat(rawPdfPath).catch(() => {
        throw new Error("LibreOffice did not produce a PDF.");
      });
      if (!pdfStat.isFile()) throw new Error("LibreOffice did not produce a PDF.");
      const maxPdfBytes = this.options.maxPdfBytes ?? DEFAULT_MAX_PDF_BYTES;
      if (pdfStat.size > maxPdfBytes) {
        throw new Error(`Rendered PDF is too large (${pdfStat.size.toLocaleString()} bytes).`);
      }
      await rename(rawPdfPath, pdfPath);
      await rm(outputDirectory, { recursive: true, force: true });
      const finalStat = await stat(pdfPath);
      return {
        status: "available",
        format,
        renderer: "libreoffice",
        cacheKey,
        generatedAt: new Date(finalStat.mtimeMs).toISOString(),
        pdfPath,
        pdfBytes: finalStat.size,
        pdfMtimeMs: finalStat.mtimeMs,
      };
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      return {
        status: "failed",
        format,
        renderer: "libreoffice",
        cacheKey,
        error: officePreviewError(error, sourceBytes),
      };
    }
  }

  private previewDirectory(cacheKey: string): string {
    return join(this.options.cacheRoot, cacheKey);
  }

  private previewPdfPath(cacheKey: string): string {
    return join(this.previewDirectory(cacheKey), "preview.pdf");
  }
}

export async function discoverLibreOfficeRenderer(candidates: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<LibreOfficeRenderer | undefined> {
  for (const candidate of candidates) {
    const command = candidate.trim();
    if (!command) continue;
    if (command.includes("/") || command.includes("\\")) {
      try {
        await access(command);
      } catch {
        continue;
      }
    }
    try {
      const { stdout, stderr } = await execFileAsync(command, ["--version"], {
        timeout: 5_000,
        maxBuffer: 128 * 1024,
        env: officePreviewProcessEnv(env),
        windowsHide: true,
      });
      const version = `${stdout}${stderr}`.trim() || "LibreOffice";
      return { command, version };
    } catch {
      continue;
    }
  }
  return undefined;
}

function officePreviewProcessEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const explicitEnv: NodeJS.ProcessEnv = {};
  for (const key of ["AMBIENT_OFFICE_PREVIEW_SOFFICE_PATH", "FAKE_SOFFICE_LOG"]) {
    const value = env[key];
    if (typeof value === "string") explicitEnv[key] = value;
  }
  return ambientRuntimeEnv(env, explicitEnv);
}

function unsupportedOfficeMessage(reason: string): string {
  if (reason === "spreadsheet-format") return "Office spreadsheet format is not supported for preview yet.";
  return "Office file format is not supported for preview yet.";
}

function officePreviewError(error: unknown, sourceBytes: number): string {
  if (error instanceof Error) {
    if ((error as NodeJS.ErrnoException).code === "ETIMEDOUT") return "LibreOffice conversion timed out.";
    return `LibreOffice conversion failed for ${sourceBytes.toLocaleString()} byte source: ${error.message}`;
  }
  return `LibreOffice conversion failed for ${sourceBytes.toLocaleString()} byte source: ${String(error)}`;
}
