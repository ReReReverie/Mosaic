import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type {
  CreativeConstraint,
  ProgressEvent,
  ReferenceFile,
  ScoringWeights,
} from "@/core/types";
import { DEFAULT_SCORING_WEIGHTS } from "@/core/types";
import { runAnalysis } from "@/core/orchestrator";
import { validateWeights } from "@/core/ranker";
import { scanFiles, type BrowserFileInput } from "@/core/scanner";
import { getRequestKey, consumeRateLimit } from "@/lib/rateLimit";
import { saveAnalysisSession } from "@/lib/sessionStore";
import { resolveAiProvider } from "@/core/aiProvider";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 250 * 1024 * 1024;
const MAX_BRIEF_LENGTH = 2_000;
const CONSTRAINT_TYPES = new Set<CreativeConstraint["type"]>([
  "format",
  "output",
  "aspectRatio",
  "minResolution",
  "maxColors",
  "brandColor",
  "audience",
  "accessibilityStandard",
  "moodIntensity",
]);

function parseJson(value: FormDataEntryValue | null, field: string): unknown {
  if (value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string.`);
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${field} must contain valid JSON.`);
  }
}

function parseIdList(value: FormDataEntryValue | null, field: string): string[] {
  const parsed = parseJson(value, field);
  if (parsed === undefined) return [];
  if (
    !Array.isArray(parsed) ||
    parsed.length > MAX_FILES ||
    parsed.some((item) => typeof item !== "string" || item.length > 128)
  ) {
    throw new Error(`${field} must be an array of short strings.`);
  }
  return [...new Set(parsed)];
}

function parseWeights(value: FormDataEntryValue | null): ScoringWeights {
  if (value === null) return DEFAULT_SCORING_WEIGHTS;
  const parsed = parseJson(value, "weights");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("weights must be an object.");
  }
  const weights = parsed as ScoringWeights;
  validateWeights(weights);
  return weights;
}

function parseConstraints(value: FormDataEntryValue | null): CreativeConstraint[] {
  const parsed = parseJson(value, "constraints");
  if (parsed === undefined) return [];
  if (!Array.isArray(parsed) || parsed.length > 20) {
    throw new Error("constraints must be an array with at most 20 entries.");
  }

  return parsed.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Each constraint must be an object.");
    }
    const constraint = item as Partial<CreativeConstraint>;
    if (
      typeof constraint.type !== "string" ||
      !CONSTRAINT_TYPES.has(constraint.type as CreativeConstraint["type"]) ||
      (typeof constraint.value !== "string" && typeof constraint.value !== "number") ||
      typeof constraint.description !== "string" ||
      constraint.description.length > 500
    ) {
      throw new Error("Each constraint must contain a valid type, value, and description.");
    }
    return constraint as CreativeConstraint;
  });
}

function toBrowserInput(entry: File): BrowserFileInput {
  const relativePath =
    (entry as File & { webkitRelativePath?: string }).webkitRelativePath;
  return {
    type: "browser",
    file: {
      name: entry.name,
      size: entry.size,
      lastModified: entry.lastModified,
      webkitRelativePath: relativePath || entry.name,
      mimeType: entry.type,
    },
  };
}

export async function POST(req: NextRequest) {
  const rateLimit = consumeRateLimit(getRequestKey(req.headers));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many analyses. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  let aiProvider;
  try {
    aiProvider = resolveAiProvider({
      provider: req.headers.get("x-mosaic-ai-provider"),
      apiKey: req.headers.get("x-mosaic-ai-key"),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid AI provider configuration." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  try {
    const rawBrief = formData.get("brief");
    const brief = typeof rawBrief === "string" ? rawBrief.trim() : "";
    if (brief.length < 5 || brief.length > MAX_BRIEF_LENGTH) {
      return NextResponse.json(
        { error: `Brief must be between 5 and ${MAX_BRIEF_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const weights = parseWeights(formData.get("weights"));
    const pinnedIds = parseIdList(formData.get("pinnedIds"), "pinnedIds");
    const removedIds = parseIdList(formData.get("removedIds"), "removedIds");
    const clientFileIds = parseIdList(formData.get("clientFileIds"), "clientFileIds");
    const constraints = parseConstraints(formData.get("constraints"));
    const entries = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);

    if (entries.length === 0) {
      return NextResponse.json({ error: "At least one file is required." }, { status: 400 });
    }
    if (entries.length > MAX_FILES) {
      return NextResponse.json(
        { error: `A maximum of ${MAX_FILES} files can be analyzed at once.` },
        { status: 413 }
      );
    }
    if (clientFileIds.length > 0 && clientFileIds.length !== entries.length) {
      throw new Error("clientFileIds must match the number of uploaded files.");
    }
    if (clientFileIds.some((id) => !/^[a-f0-9]{32}$/i.test(id))) {
      throw new Error("clientFileIds contains an invalid file ID.");
    }

    const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        { error: "The combined upload size cannot exceed 250 MB." },
        { status: 413 }
      );
    }

    const referenceFiles: ReferenceFile[] = [];
    const fileBuffers = new Map<string, Buffer>();
    const skippedFiles = [] as ReturnType<typeof scanFiles>["skipped"];

    const seenIds = new Set<string>();
    for (const [index, entry] of entries.entries()) {
      const scanned = scanFiles([toBrowserInput(entry)]);
      skippedFiles.push(...scanned.skipped);
      const scannedFile = scanned.files[0];
      if (!scannedFile) continue;

      const clientId = clientFileIds[index];
      const referenceFile = clientId ? { ...scannedFile, id: clientId } : scannedFile;
      if (seenIds.has(referenceFile.id)) {
        throw new Error("Each uploaded file must have a unique path and metadata.");
      }
      seenIds.add(referenceFile.id);

      referenceFiles.push(referenceFile);
      fileBuffers.set(referenceFile.id, Buffer.from(await entry.arrayBuffer()));
    }

    if (referenceFiles.length === 0) {
      return NextResponse.json(
        { error: "None of the uploaded files are supported reference formats." },
        { status: 400 }
      );
    }

    const { registerThumbnails } = await import("@/lib/thumbnailCache");
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const generator = runAnalysis({
            files: referenceFiles,
            brief,
            weights,
            aiProvider,
            pinnedIds,
            removedIds,
            constraints,
            preSkippedFiles: skippedFiles,
            readFile: async (file) => fileBuffers.get(file.id) ?? Buffer.alloc(0),
          });

          for await (const event of generator) {
            if (event.type === "done" && event.result) {
              await saveAnalysisSession(event.result);
              await registerThumbnails(event.result.references, fileBuffers);
            }
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\\n`));
          }
        } catch (err) {
          const errorEvent: ProgressEvent = {
            type: "error",
            progress: 0,
            message: "Analysis failed.",
            error: err instanceof Error ? err.message : "Unexpected analysis error.",
          };
          controller.enqueue(encoder.encode(`${JSON.stringify(errorEvent)}\\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request." },
      { status: 400 }
    );
  }
}
