import { describe, it, expect } from "vitest";
import { tokenize, scoreChunks, IndexedChunk } from "@/lib/retrieval";

describe("Retrieval & BM25 Scoring Engine (src/lib/retrieval/index.ts)", () => {
  const sampleChunks: IndexedChunk[] = [
    {
      chunkId: "c1",
      sourceId: "s1",
      sourceTitle: "Approved Facts",
      text: "SmartPay payments settle within 2 business days.",
    },
    {
      chunkId: "c2",
      sourceId: "s1",
      sourceTitle: "Approved Facts",
      text: "Data is encrypted in transit with TLS 1.2+ and at rest with AES-256.",
    },
    {
      chunkId: "c3",
      sourceId: "s1",
      sourceTitle: "Approved Facts",
      text: "Transaction fee is 1.8% per successful card payment.",
    },
    {
      chunkId: "c4",
      sourceId: "s2",
      sourceTitle: "Brand Voice Guide",
      text: "Avoid absolute claims like 100% secure or guaranteed zero risk.",
    },
  ];

  it("tokenizes text accurately, stripping stop words while preserving key symbols", () => {
    const raw = "SmartPay payments settle within 2 business days, with 100% security & 1.8% fee!";
    const tokens = tokenize(raw);

    expect(tokens).toContain("smartpay");
    expect(tokens).toContain("payments");
    expect(tokens).toContain("settle");
    expect(tokens).toContain("2");
    expect(tokens).toContain("business");
    expect(tokens).toContain("days");
    expect(tokens).toContain("100%");
    expect(tokens).toContain("1.8%");
    expect(tokens).toContain("fee");
    expect(tokens).not.toContain("with"); // stop word
    expect(tokens).not.toContain("within"); // stop word
  });

  it("ranks settlement chunk highest for settlement inquiry", () => {
    const query = "When do SmartPay payments settle to bank?";
    const results = scoreChunks(sampleChunks, query, { k: 3 });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunkId).toBe("c1");
    expect(results[0].text).toContain("settle within 2 business days");
  });

  it("ranks encryption chunk highest for security/AES inquiry", () => {
    const query = "What encryption and security standards like TLS and AES are used?";
    const results = scoreChunks(sampleChunks, query, { k: 3 });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunkId).toBe("c2");
    expect(results[0].text).toContain("TLS 1.2+ and at rest with AES-256");
  });

  it("ranks fee chunk highest for card payment pricing inquiry", () => {
    const query = "What is the transaction fee for card payments?";
    const results = scoreChunks(sampleChunks, query, { k: 3 });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunkId).toBe("c3");
    expect(results[0].text).toContain("1.8%");
  });

  it("correctly separates active facts from expired facts", () => {
    const activeChunks: IndexedChunk[] = [
      {
        chunkId: "active-fee",
        sourceId: "s-active",
        sourceTitle: "Approved Facts 2026",
        text: "Transaction fee is 1.8% per successful card payment.",
        isExpired: false,
      },
    ];

    const expiredChunks: IndexedChunk[] = [
      {
        chunkId: "expired-fee",
        sourceId: "s-expired",
        sourceTitle: "Legacy Promotional Pricing (Expired)",
        text: "Promotional introductory transaction fee of 0.5% applies to all new merchants in Q1 2025.",
        isExpired: true,
      },
    ];

    const query = "promotional fee 0.5%";

    // Standard active retrieval should not contain the expired chunk
    const activeResults = scoreChunks(activeChunks, query);
    expect(activeResults.find((r) => r.chunkId === "expired-fee")).toBeUndefined();

    // Expired matches retrieval specifically finds the outdated promotional fact
    const expiredResults = scoreChunks(expiredChunks, query);
    expect(expiredResults.length).toBeGreaterThan(0);
    expect(expiredResults[0].chunkId).toBe("expired-fee");
    expect(expiredResults[0].text).toContain("0.5%");
  });
});
