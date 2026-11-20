import { createHash, randomUUID } from 'node:crypto';
import { cache } from './cache';
import { normalizeQuestion } from './faqs';

/**
 * faq-cache-7: cached RAG answers for guests (docs/faq-cache.md). Every answer is stored under the knowledge version
 * current when it was asked; changing a document or an FAQ sets a new version, so older answers stop matching at once.
 */
const VERSION_KEY = 'rag:ver';
/** Longer than any answer lives; if it lapses the version falls back to '0' and old answers are already gone. */
const VERSION_TTL_SECONDS = 30 * 24 * 3600;

export const answerKey = (version: string, question: string) =>
  `rag:ans:${version}:${createHash('sha256').update(normalizeQuestion(question)).digest('hex')}`;

export async function knowledgeVersion(): Promise<string> {
  return (await cache.get<string>(VERSION_KEY)) ?? '0';
}

/** Random rather than a counter, so two writers bumping at once still both leave a new version. */
export async function bumpKnowledgeVersion(): Promise<void> {
  // shortcut: when Redis is down this bump is lost; answers cached before the outage can then be served until their TTL
  await cache.set(VERSION_KEY, randomUUID(), VERSION_TTL_SECONDS);
}
