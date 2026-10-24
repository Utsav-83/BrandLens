import { SourceType } from "@/generated/prisma";

export interface SourceChunkItem {
  text: string;
  position: number;
}

/**
 * Splits text into chunks based on the source type.
 * - Glossary: Each "AVOID ... -> USE ..." line is its own chunk.
 * - Fact: Each individual fact statement line is its own chunk.
 * - Guide & Claims: Structured into paragraphs/sections of 40-120 words.
 */
export function chunkSourceContent(type: SourceType, content: string): SourceChunkItem[] {
  const chunks: SourceChunkItem[] = [];
  const normalized = content.replace(/\r\n/g, "\n").trim();

  if (type === "glossary") {
    const lines = normalized.split("\n");
    let pos = 0;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      chunks.push({
        text: line,
        position: pos++,
      });
    }
    return chunks;
  }

  if (type === "fact") {
    const lines = normalized.split("\n");
    let pos = 0;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      chunks.push({
        text: line,
        position: pos++,
      });
    }
    return chunks;
  }

  // Guide and Claims: chunk by paragraphs or section headers
  const paragraphs = normalized.split(/\n\n+/);
  let pos = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const words = trimmed.split(/\s+/);
    if (words.length <= 130) {
      chunks.push({
        text: trimmed,
        position: pos++,
      });
    } else {
      // Split large paragraphs into sentence groups of ~40-80 words
      const sentences = trimmed.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [trimmed];
      let currentGroup: string[] = [];
      let currentWordCount = 0;

      for (const sent of sentences) {
        const sentWords = sent.trim().split(/\s+/).length;
        if (currentWordCount + sentWords > 100 && currentGroup.length > 0) {
          chunks.push({
            text: currentGroup.join(" ").trim(),
            position: pos++,
          });
          currentGroup = [];
          currentWordCount = 0;
        }
        currentGroup.push(sent.trim());
        currentWordCount += sentWords;
      }

      if (currentGroup.length > 0) {
        chunks.push({
          text: currentGroup.join(" ").trim(),
          position: pos++,
        });
      }
    }
  }

  return chunks;
}
