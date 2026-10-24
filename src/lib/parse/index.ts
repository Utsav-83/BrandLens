import mammoth from "mammoth";
import { getDocumentProxy, extractText } from "unpdf";

export class ScannedPdfError extends Error {
  constructor(message = "This looks like a scanned document; image/OCR support is planned for Round 3") {
    super(message);
    this.name = "ScannedPdfError";
  }
}

export class UnsupportedFileTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFileTypeError";
  }
}

export class InvalidFileHeaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFileHeaderError";
  }
}

/**
 * Validates the file extension and matches against magic header bytes.
 */
export function validateFileHeader(filename: string, buffer: Buffer): { extension: string; mimeType: string } {
  const extMatch = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!extMatch) {
    throw new UnsupportedFileTypeError("Filename has no valid file extension");
  }

  const ext = extMatch[1];
  const allowedExtensions = ["pdf", "docx", "txt", "md"];
  if (!allowedExtensions.includes(ext)) {
    throw new UnsupportedFileTypeError(
      `Unsupported file extension '.${ext}'. Supported formats: .docx, .pdf, .txt, .md`
    );
  }

  // Magic byte checks
  if (ext === "pdf") {
    // PDF must begin with %PDF- (0x25 0x50 0x44 0x46)
    if (buffer.length < 5 || buffer.toString("utf-8", 0, 5) !== "%PDF-") {
      throw new InvalidFileHeaderError("File has .pdf extension but does not contain valid PDF header (%PDF-)");
    }
    return { extension: "pdf", mimeType: "application/pdf" };
  }

  if (ext === "docx") {
    // DOCX is a zip archive starting with PK (0x50 0x4B)
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new InvalidFileHeaderError("File has .docx extension but does not contain valid ZIP/DOCX header (PK)");
    }
    return { extension: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  }

  if (ext === "txt" || ext === "md") {
    // Text files must not contain binary null bytes within the first 1KB
    const sampleLength = Math.min(buffer.length, 1024);
    for (let i = 0; i < sampleLength; i++) {
      if (buffer[i] === 0x00) {
        throw new InvalidFileHeaderError(`File has .${ext} extension but contains binary content`);
      }
    }
    return { extension: ext, mimeType: ext === "md" ? "text/markdown" : "text/plain" };
  }

  throw new UnsupportedFileTypeError(`Unhandled format .${ext}`);
}

/**
 * Extracts plain text from a DOCX buffer using mammoth.
 */
export async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

/**
 * Extracts plain text from a PDF buffer using unpdf.
 * Throws ScannedPdfError if no extractable text is found.
 */
export async function parsePdf(buffer: Buffer): Promise<string> {
  const uint8Array = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(uint8Array);
  const result = await extractText(pdf, { mergePages: true });

  const text = typeof result.text === "string" ? result.text.trim() : (result.text as string[]).join("\n").trim();
  if (!text) {
    throw new ScannedPdfError();
  }
  return text;
}

/**
 * Extracts text from a plain UTF-8 text or markdown buffer.
 */
export function parsePlainText(buffer: Buffer): string {
  return buffer.toString("utf-8").trim();
}

/**
 * High-level parser that validates magic bytes and extracts clean text.
 */
export async function parseUploadedDocument(
  filename: string,
  buffer: Buffer
): Promise<{ text: string; wordCount: number; extension: string }> {
  const { extension } = validateFileHeader(filename, buffer);
  let text = "";

  if (extension === "pdf") {
    text = await parsePdf(buffer);
  } else if (extension === "docx") {
    text = await parseDocx(buffer);
  } else {
    text = parsePlainText(buffer);
  }

  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  return {
    text,
    wordCount: words,
    extension,
  };
}
