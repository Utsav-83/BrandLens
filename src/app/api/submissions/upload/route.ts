import { NextResponse } from "next/server";
import { requireRole, assertSameOrigin } from "@/lib/guards";
import {
  parseUploadedDocument,
  ScannedPdfError,
  UnsupportedFileTypeError,
  InvalidFileHeaderError,
} from "@/lib/parse";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const guard = await requireRole("creator", "admin");
  if (guard.error) return guard.error;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file uploaded. Please provide a file in the 'file' field." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File exceeds the 5 MB maximum size limit." },
        { status: 400 }
      );
    }

    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await parseUploadedDocument(sanitizedFilename, buffer);

    return NextResponse.json({
      filename: sanitizedFilename,
      extension: result.extension,
      wordCount: result.wordCount,
      text: result.text,
    });
  } catch (error: unknown) {
    if (error instanceof ScannedPdfError) {
      return NextResponse.json(
        { error: error.message },
        { status: 422 }
      );
    }

    if (error instanceof UnsupportedFileTypeError || error instanceof InvalidFileHeaderError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.error("Submission upload parsing error:", error);
    return NextResponse.json(
      { error: "Failed to parse document content." },
      { status: 500 }
    );
  }
}
