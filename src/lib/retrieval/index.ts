import { db } from "../db";

export interface IndexedChunk {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  sourceType?: string;
  text: string;
  isExpired?: boolean;
}

export interface ScoredResult {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  text: string;
  score: number;
}

export const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
  "can", "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't", "doing",
  "don't", "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't",
  "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", "herself",
  "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is",
  "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my", "myself", "no",
  "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves",
  "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so",
  "some", "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there",
  "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to",
  "too", "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were",
  "weren't", "what", "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's",
  "whom", "why", "why's", "with", "within", "without", "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've",
  "your", "yours", "yourself", "yourselves"
]);

/**
 * Tokenizes text into lowercase tokens, strips non-alphanumeric (preserving %, #, numbers),
 * and removes English stop words.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s%#.-]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[.-]+|[.-]+$/g, "")) // trim boundary punctuation
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

/**
 * Pure BM25 scoring implementation over an array of in-memory chunks.
 */
export function scoreChunks(
  chunks: IndexedChunk[],
  query: string,
  options: { k?: number; minScore?: number } = {}
): ScoredResult[] {
  const k = options.k ?? 5;
  const minScore = options.minScore ?? 0.01;

  if (chunks.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const N = chunks.length;
  const k1 = 1.2;
  const b = 0.75;

  // Pre-tokenize chunks
  const docTokensList = chunks.map((c) => tokenize(c.text));
  const docLengths = docTokensList.map((tokens) => tokens.length);
  const avgdl = docLengths.reduce((sum, len) => sum + len, 0) / (N || 1);

  // Document frequencies for query terms
  const docFreqs: Record<string, number> = {};
  for (const qToken of queryTokens) {
    let df = 0;
    for (const docTokens of docTokensList) {
      if (docTokens.includes(qToken)) {
        df++;
      }
    }
    docFreqs[qToken] = df;
  }

  // Calculate scores
  const scored: ScoredResult[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const docTokens = docTokensList[i];
    const docLen = docLengths[i];

    // Term frequencies in this document
    const termFreqs: Record<string, number> = {};
    for (const token of docTokens) {
      termFreqs[token] = (termFreqs[token] || 0) + 1;
    }

    let score = 0;
    for (const qToken of queryTokens) {
      const tf = termFreqs[qToken] || 0;
      if (tf === 0) continue;

      const df = docFreqs[qToken] || 0;
      // Lucene / Robertson BM25 IDF formulation
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (docLen / (avgdl || 1)));

      score += idf * (numerator / denominator);
    }

    // Substring bonus: exact phrase or normalized phrase boost
    const normChunkText = chunk.text.toLowerCase();
    const normQuery = query.toLowerCase().trim();
    if (normQuery.length > 3 && normChunkText.includes(normQuery)) {
      score += 2.0;
    }

    if (score >= minScore) {
      scored.push({
        chunkId: chunk.chunkId,
        sourceId: chunk.sourceId,
        sourceTitle: chunk.sourceTitle,
        text: chunk.text,
        score: Number(score.toFixed(4)),
      });
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, k);
}

/**
 * Retrieves top k supporting chunks for a query from active, non-expired sources in a workspace.
 */
export async function retrieve(
  workspaceId: string,
  query: string,
  options: { k?: number; minScore?: number } = {}
): Promise<ScoredResult[]> {
  const now = new Date();

  const chunks = await db.chunk.findMany({
    where: {
      source: {
        workspaceId,
        status: "active",
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
    },
    include: {
      source: {
        select: {
          id: true,
          title: true,
          type: true,
        },
      },
    },
  });

  const indexedChunks: IndexedChunk[] = chunks.map((c) => ({
    chunkId: c.id,
    sourceId: c.source.id,
    sourceTitle: c.source.title,
    sourceType: c.source.type,
    text: c.text,
  }));

  return scoreChunks(indexedChunks, query, options);
}

/**
 * Searches exclusively within expired sources to detect outdated facts.
 */
export async function findExpiredMatches(
  workspaceId: string,
  query: string,
  options: { k?: number; minScore?: number } = {}
): Promise<ScoredResult[]> {
  const now = new Date();

  const chunks = await db.chunk.findMany({
    where: {
      source: {
        workspaceId,
        status: "active",
        expiresAt: {
          lte: now,
        },
      },
    },
    include: {
      source: {
        select: {
          id: true,
          title: true,
          type: true,
        },
      },
    },
  });

  const indexedChunks: IndexedChunk[] = chunks.map((c) => ({
    chunkId: c.id,
    sourceId: c.source.id,
    sourceTitle: c.source.title,
    sourceType: c.source.type,
    text: c.text,
    isExpired: true,
  }));

  return scoreChunks(indexedChunks, query, {
    k: options.k ?? 3,
    minScore: options.minScore ?? 0.1,
  });
}
