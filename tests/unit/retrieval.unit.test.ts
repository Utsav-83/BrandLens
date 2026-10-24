import { afterEach, describe, expect, it, vi } from "vitest";
import { chunkSourceContent } from "@/lib/retrieval/chunk";
import { findExpiredMatches, retrieve, tokenize } from "@/lib/retrieval";

vi.mock("@/lib/db", () => ({ db: { chunk: { findMany: vi.fn() } } }));
import { db } from "@/lib/db";

describe("retrieval behavior", () => {
  afterEach(() => vi.clearAllMocks());
  it.each([
    ["glossary", "# terms\nAVOID: old name -> USE: new name\n\nAVOID: bad -> USE: good", 2],
    ["fact", "# approved\nFee is 1.8%.\nSettles in two days.", 2],
  ] as const)("chunks %s content into meaningful records", (type, content, count) => expect(chunkSourceContent(type, content)).toHaveLength(count));
  it("splits long guide content into bounded chunks", () => {
    const text = Array.from({ length: 140 }, (_, i) => `Sentence${i} has useful words.`).join(" ");
    const chunks = chunkSourceContent("guide", text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length > 0)).toBe(true);
  });
  it("tokenizes case-insensitively, removes stop words, and preserves useful numeric tokens", () => {
    expect(tokenize("The 1.8% fee, and 100% secure!")).toEqual(["1.8%", "fee", "100%", "secure"]);
  });
  it("excludes expired sources from support and returns them as expired matches", async () => {
    vi.mocked(db.chunk.findMany).mockImplementation(async (args) => {
      const query = args as unknown as { where: { source: { expiresAt?: { lte?: Date } } } };
      const expiredQuery = Boolean(query.where.source.expiresAt?.lte);
      const rows = [{ id: "c1", text: "Legacy transaction fee is 0.5%.", source: { id: "s1", title: "Legacy facts", type: "fact" } }];
      return (expiredQuery ? rows : []) as never;
    });
    expect(await retrieve("w", "legacy transaction fee 0.5%", { minScore: 0 })).toEqual([]);
    expect((await findExpiredMatches("w", "legacy transaction fee 0.5%")).map((match) => match.chunkId)).toEqual(["c1"]);
  });
});
