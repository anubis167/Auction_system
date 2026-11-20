import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// faq-cache-8: docs/faq-cache.md stays in step with the routes, settings and files it describes.
const root = path.resolve(__dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const doc = read('docs/faq-cache.md');

/** "METHOD /api/..." for every route a router file declares, e.g. faqsRouter.get('/:id' -> "GET /api/faqs/:id". */
function codeRoutes(file: string, router: string, base: string, only?: RegExp) {
  return [...read(file).matchAll(new RegExp(`${router}\\.(get|post|put|delete)\\(\\s*'([^']*)'`, 'g'))]
    .map((m) => `${m[1].toUpperCase()} ${base}${m[2] === '/' ? '' : m[2]}`)
    .filter((r) => !only || only.test(r));
}

describe('faq-cache-8 docs/faq-cache.md', () => {
  const table = doc.slice(doc.indexOf('## Routes'), doc.indexOf('## How the chat bot answers'));
  const documented = [...table.matchAll(/^\| `(GET|POST|PUT|DELETE) (\/api\/[^`]+)`/gm)].map((m) => `${m[1]} ${m[2]}`);
  const inCode = [
    ...codeRoutes('be/src/routes/faqs.ts', 'faqsRouter', '/api/faqs'),
    ...codeRoutes('be/src/routes/rag.ts', 'ragRouter', '/api/rag', /faq-match|answer-cache/),
  ];

  it('lists every FAQ and cache route in the code, and nothing else', () => {
    expect(inCode.length).toBe(8);
    expect([...documented].sort()).toEqual([...inCode].sort());
  });

  it('names every setting in config.ts and .env.example, and every key prefix the code uses', () => {
    for (const env of ['REDIS_URL', 'FAQ_CACHE_TTL_SECONDS', 'RAG_ANSWER_TTL_SECONDS']) {
      expect(doc).toContain(`\`${env}\``);
      expect(read('be/src/config.ts')).toContain(env);
      expect(read('be/.env.example')).toContain(`${env}=`);
    }
    for (const key of ['faq:list', 'faq:item:', 'faq:q:', 'rag:ver', 'rag:ans:']) {
      expect(doc).toContain(key);
      expect(read('be/src/routes/faqs.ts') + read('be/src/lib/ragAnswerCache.ts')).toContain(key);
    }
  });

  it('names the chat functions that exist, links every change note, and docs/rag.md links to it', () => {
    for (const fn of ['faq_answer', 'cached_answer', 'store_answer']) {
      expect(doc).toContain(`functions/${fn}.py`);
      expect(() => read(`be/rag/functions/${fn}.py`)).not.toThrow();
    }
    for (let n = 1; n <= 8; n++) expect(() => read(`docs/changes/faq-cache-${n}.md`)).not.toThrow();
    expect(read('docs/rag.md')).toContain('(faq-cache.md)');
  });
});
