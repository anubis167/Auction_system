import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../../be/src/lib/permissions';

// rag-train-9: docs/rag-training-log.md stays in step with the code it describes.
const root = path.resolve(__dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const doc = read('docs/rag-training-log.md');

describe('rag-train-9 training log doc', () => {
  it('every Node route in its table exists in be/src/routes/rag.ts', () => {
    const table = doc.slice(doc.indexOf('## Node routes'), doc.indexOf('## Python routes'));
    const routes = [...table.matchAll(/`(GET|POST|PUT|DELETE) \/api\/rag(\/[^`]*)`/g)].map((m) => [m[1].toLowerCase(), m[2]]);
    expect(routes.length).toBeGreaterThanOrEqual(6);
    const source = read('be/src/routes/rag.ts');
    for (const [method, route] of routes) {
      expect(source, `${method} ${route}`).toMatch(new RegExp(`ragRouter\\.${method}\\(\\s*'${route}'`));
    }
  });

  it('names every table, migration and the permission, and docs/rag.md links to it', () => {
    for (const table of ['rag_sessions', 'rag_turns', 'rag_retrievals', 'rag_examples']) expect(doc).toContain(table);
    for (const m of ['20261120090000_rag_training_log', '20261120100000_rag_logging_consent', '20261120110000_rag_review_permission']) {
      expect(doc).toContain(m);
      expect(() => read(`be/prisma/migrations/${m}/migration.sql`)).not.toThrow();
    }
    expect(PERMISSIONS.map((p) => p.code)).toContain('rag.review');
    expect(doc).toContain('`rag.review`');
    for (const word of ['RAG_TURN_RETENTION_DAYS', 'logging_consent', 'Privacy', 'Retention']) expect(doc).toContain(word);
    expect(read('docs/rag.md')).toContain('(rag-training-log.md)');
  });
});
