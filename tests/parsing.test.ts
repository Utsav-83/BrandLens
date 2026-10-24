import { describe, it, expect } from "vitest";
import {
  parseUploadedDocument,
  validateFileHeader,
  parseDocx,
  parsePdf,
  ScannedPdfError,
  UnsupportedFileTypeError,
  InvalidFileHeaderError,
} from "@/lib/parse";
import {
  createValidDocxBuffer,
  createValidPdfBuffer,
  createEmptyScannedPdfBuffer,
} from "./fixtures/create-fixtures";

describe("Document Parsing & Magic Byte Validation (src/lib/parse/index.ts)", () => {
  describe("Plain Text & Markdown Parsing", () => {
    it("parses valid .txt file and computes word count", async () => {
      const content = "SmartPay settles transactions in 2 business days. Fee is 1.8%.";
      const buffer = Buffer.from(content, "utf-8");

      const result = await parseUploadedDocument("approved-facts.txt", buffer);
      expect(result.extension).toBe("txt");
      expect(result.text).toBe(content);
      expect(result.wordCount).toBe(10);
    });

    it("parses valid .md file", async () => {
      const content = "# Aurora Pay Guidelines\n\nAlways use SmartPay instead of smart-pay.";
      const buffer = Buffer.from(content, "utf-8");

      const result = await parseUploadedDocument("guide.md", buffer);
      expect(result.extension).toBe("md");
      expect(result.text).toContain("Always use SmartPay");
      expect(result.wordCount).toBe(10);
    });

    it("rejects .txt file containing binary null bytes", () => {
      const binaryBuf = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x57, 0x6f]); // "Hello\0Wo"
      expect(() => validateFileHeader("notes.txt", binaryBuf)).toThrow(InvalidFileHeaderError);
    });
  });

  describe("DOCX Parsing (mammoth)", () => {
    it("parses valid .docx file with PK header and extracts text", async () => {
      const sampleText = "Aurora Pay Brand Voice Guidelines: friendly and professional.";
      const docxBuffer = createValidDocxBuffer(sampleText);

      // Validate header passes
      const header = validateFileHeader("brand-guide.docx", docxBuffer);
      expect(header.extension).toBe("docx");

      // Parse with mammoth
      const extractedText = await parseDocx(docxBuffer);
      expect(extractedText).toContain(sampleText);

      // End-to-end parseUploadedDocument
      const result = await parseUploadedDocument("brand-guide.docx", docxBuffer);
      expect(result.extension).toBe("docx");
      expect(result.text).toContain(sampleText);
      expect(result.wordCount).toBeGreaterThan(0);
    });

    it("rejects fake .docx file that does not start with PK zip header", () => {
      const fakeDocx = Buffer.from("Not a real zip archive file content");
      expect(() => validateFileHeader("corrupted.docx", fakeDocx)).toThrow(InvalidFileHeaderError);
    });
  });

  describe("PDF Parsing (unpdf)", () => {
    it("parses valid .pdf file with %PDF- header and extracts text", async () => {
      const sampleText = "Aurora Pay Merchant Agreement 2026";
      const pdfBuffer = createValidPdfBuffer(sampleText);

      const header = validateFileHeader("agreement.pdf", pdfBuffer);
      expect(header.extension).toBe("pdf");

      const extracted = await parsePdf(pdfBuffer);
      expect(extracted).toContain(sampleText);

      const result = await parseUploadedDocument("agreement.pdf", pdfBuffer);
      expect(result.extension).toBe("pdf");
      expect(result.text).toContain(sampleText);
    });

    it("rejects file renamed to .pdf that does not start with %PDF- header", () => {
      const fakePdf = Buffer.from("Just plain text masquerading as a pdf");
      expect(() => validateFileHeader("fake.pdf", fakePdf)).toThrow(InvalidFileHeaderError);
    });

    it("throws ScannedPdfError with friendly message when PDF has no extractable text", async () => {
      const emptyPdfBuffer = createEmptyScannedPdfBuffer();

      await expect(parsePdf(emptyPdfBuffer)).rejects.toThrow(ScannedPdfError);
      await expect(parsePdf(emptyPdfBuffer)).rejects.toThrow(
        "This looks like a scanned document; image/OCR support is planned for Round 3"
      );
    });
  });

  describe("Unsupported File Extensions", () => {
    it("rejects unsupported extensions like .exe, .png, .zip", () => {
      const buf = Buffer.from("some content");
      expect(() => validateFileHeader("malicious.exe", buf)).toThrow(UnsupportedFileTypeError);
      expect(() => validateFileHeader("logo.png", buf)).toThrow(UnsupportedFileTypeError);
      expect(() => validateFileHeader("archive.zip", buf)).toThrow(UnsupportedFileTypeError);
    });

    it("rejects files without extensions", () => {
      const buf = Buffer.from("some content");
      expect(() => validateFileHeader("noextensionfile", buf)).toThrow(UnsupportedFileTypeError);
    });
  });
});
