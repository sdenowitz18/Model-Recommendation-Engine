/**
 * Embedding utilities for RAG-based knowledge base retrieval.
 *
 * - Chunks large documents into smaller pieces (~500 tokens)
 * - Generates embeddings via OpenAI text-embedding-3-small
 * - Computes cosine similarity in-process (no pgvector needed)
 * - Retrieves the most relevant KB chunks for a given query
 */

import { openai } from "./openai";
import { storage } from "./storage";
import type { KbChunk } from "@shared/schema";

// ─── Chunking ───────────────────────────────────────────────────────────────

/**
 * Rough token estimate: ~4 characters per token for English text.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into chunks of roughly `maxTokens` tokens each.
 * Splits on paragraph boundaries first, then sentence boundaries if a
 * single paragraph is too large.
 */
export function chunkText(text: string, maxTokens = 500): string[] {
  const chunks: string[] = [];
  // Split on double-newlines (paragraphs)
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  let currentChunk = "";

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    // If a single paragraph exceeds maxTokens, split it by sentences
    if (paraTokens > maxTokens) {
      // Flush current chunk first
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      const sentences = para.split(/(?<=[.!?])\s+/);
      let sentenceChunk = "";
      for (const sentence of sentences) {
        if (estimateTokens(sentenceChunk + " " + sentence) > maxTokens && sentenceChunk) {
          chunks.push(sentenceChunk.trim());
          sentenceChunk = sentence;
        } else {
          sentenceChunk += (sentenceChunk ? " " : "") + sentence;
        }
      }
      if (sentenceChunk) {
        chunks.push(sentenceChunk.trim());
      }
      continue;
    }

    // Would adding this paragraph exceed the limit?
    if (estimateTokens(currentChunk + "\n\n" + para) > maxTokens && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + para;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter(Boolean);
}

// ─── Embeddings ─────────────────────────────────────────────────────────────

/**
 * Generate embeddings for an array of text strings using OpenAI.
 * Handles batching — the API accepts up to 2048 inputs at once.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });

  // Sort by index to guarantee order matches input
  const sorted = response.data.sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

/**
 * Embed a single query string.
 */
export async function embedQuery(query: string): Promise<number[]> {
  const [embedding] = await embedTexts([query]);
  return embedding;
}

// ─── Similarity ─────────────────────────────────────────────────────────────

/**
 * Cosine similarity between two vectors. Returns a value in [-1, 1].
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Retrieval ──────────────────────────────────────────────────────────────

/**
 * Retrieve the top-K most relevant KB chunks for a given query and step.
 * Computes cosine similarity in application code (no pgvector needed).
 */
export async function retrieveRelevantChunks(
  query: string,
  stepNumber: number,
  topK = 10,
): Promise<KbChunk[]> {
  // Fetch all chunks for this step
  const allChunks = await storage.getKbChunks(stepNumber);
  if (allChunks.length === 0) return [];

  // Filter to only chunks that have embeddings
  const embeddedChunks = allChunks.filter((c) => c.embedding && c.embedding.length > 0);
  if (embeddedChunks.length === 0) {
    // No embeddings yet — fall back to returning all chunks (up to topK)
    return allChunks.slice(0, topK);
  }

  // Embed the query
  const queryEmbedding = await embedQuery(query);

  // Score each chunk
  const scored = embeddedChunks.map((chunk) => ({
    chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding!),
  }));

  // Sort by score descending, take top K
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.chunk);
}

// ─── Ingestion helpers ──────────────────────────────────────────────────────

/**
 * Chunk and embed a KB entry's content, then store the chunks.
 * Called when a KB entry is added or during reindexing.
 */
export async function ingestKnowledgeBaseEntry(
  knowledgeBaseId: number,
  stepNumber: number,
  title: string,
  content: string,
): Promise<number> {
  // Prepend the title to the content so the first chunk has context
  const fullText = `${title}\n\n${content}`;
  const textChunks = chunkText(fullText, 500);

  if (textChunks.length === 0) return 0;

  // Generate embeddings for all chunks at once
  const embeddings = await embedTexts(textChunks);

  // Build chunk records
  const chunkRecords = textChunks.map((text, index) => ({
    knowledgeBaseId,
    stepNumber,
    chunkIndex: index,
    content: text,
    embedding: embeddings[index] || null,
  }));

  // Store in DB
  await storage.createKbChunks(chunkRecords);
  return chunkRecords.length;
}

/**
 * Re-index all existing KB entries: delete old chunks, re-chunk, re-embed.
 */
export async function reindexAllKnowledgeBase(): Promise<{ total: number; entries: number }> {
  const allEntries = await storage.getAllKnowledgeBase();
  let totalChunks = 0;

  for (const entry of allEntries) {
    // Remove old chunks for this entry
    await storage.deleteKbChunksByKnowledgeBaseId(entry.id);
    // Re-ingest
    const count = await ingestKnowledgeBaseEntry(entry.id, entry.stepNumber, entry.title, entry.content);
    totalChunks += count;
  }

  return { total: totalChunks, entries: allEntries.length };
}

/**
 * Auto-reindex on startup: only indexes KB entries that have no chunks yet.
 * Returns null if nothing needed indexing.
 */
export async function autoReindexIfNeeded(): Promise<{ total: number; entries: number } | null> {
  const allEntries = await storage.getAllKnowledgeBase();
  if (allEntries.length === 0) return null;

  let totalChunks = 0;
  let indexedEntries = 0;

  for (const entry of allEntries) {
    const existingChunks = await storage.getKbChunksByKnowledgeBaseId(entry.id);
    if (existingChunks.length === 0) {
      const count = await ingestKnowledgeBaseEntry(entry.id, entry.stepNumber, entry.title, entry.content);
      totalChunks += count;
      indexedEntries++;
    }
  }

  if (indexedEntries === 0) return null;
  return { total: totalChunks, entries: indexedEntries };
}
