import { describe, it, expect } from "vitest";
import { chunkSourceContent } from "@/lib/retrieval/chunk";

describe("Source Chunking Engine (src/lib/retrieval/chunk.ts)", () => {
  it("chunks glossary content line-by-line", () => {
    const glossaryText = `
# Comment line should be ignored
AVOID: Smart-Pay | Smart Pay | smartpay -> USE: SmartPay
AVOID: cash out | withdraw funds -> USE: transfer to bank
AVOID: fast money -> USE: instant settlement
    `.trim();

    const chunks = chunkSourceContent("glossary", glossaryText);

    expect(chunks.length).toBe(3);
    expect(chunks[0].text).toBe("AVOID: Smart-Pay | Smart Pay | smartpay -> USE: SmartPay");
    expect(chunks[0].position).toBe(0);
    expect(chunks[1].position).toBe(1);
    expect(chunks[2].position).toBe(2);
  });

  it("chunks facts statement-by-statement", () => {
    const factsText = `
SmartPay payments settle within 2 business days.
Data is encrypted in transit with TLS 1.2+ and at rest with AES-256.
Transaction fee is 1.8% per successful card payment.
    `.trim();

    const chunks = chunkSourceContent("fact", factsText);

    expect(chunks.length).toBe(3);
    expect(chunks[0].text).toBe("SmartPay payments settle within 2 business days.");
    expect(chunks[0].position).toBe(0);
    expect(chunks[1].text).toContain("TLS 1.2+");
    expect(chunks[2].text).toContain("1.8%");
  });

  it("chunks guide into structured sections and paragraphs", () => {
    const guideText = `
1.1 Tone and Voice Philosophy
Aurora Pay communicates with a friendly, professional, and reassuring tone. Our audience includes business owners, finance heads, and everyday consumers.

1.2 Prohibited Slang
Avoid overly casual colloquialisms and informal address. Words like "guys", "hey guys", "gonna", "wanna", "super easy", and "awesome" are strictly prohibited in official communications.
    `.trim();

    const chunks = chunkSourceContent("guide", guideText);

    expect(chunks.length).toBe(2);
    expect(chunks[0].position).toBe(0);
    expect(chunks[0].text).toContain("1.1 Tone and Voice Philosophy");
    expect(chunks[1].position).toBe(1);
    expect(chunks[1].text).toContain("1.2 Prohibited Slang");
  });

  it("splits long paragraphs exceeding word thresholds into sentence groups", () => {
    const longSentence = "Aurora Pay empowers merchants across global digital commerce platforms with seamless settlements. ";
    const longParagraph = longSentence.repeat(20); // ~260 words

    const chunks = chunkSourceContent("guide", longParagraph);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].position).toBe(0);
    expect(chunks[1].position).toBe(1);
    // Every chunk should contain content
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0);
    }
  });
});
