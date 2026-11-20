/** faq-cache-2: shared by the seed, the FAQ API and the chat bot's FAQ match (docs/faq-cache.md). */

export type FaqEntry = { category: string; question: string; answer: string; sortOrder: number };

/** One spelling for "the same question": lower case, single spaces, no trailing ? ! . */
export function normalizeQuestion(question: string): string {
  return question.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[\s?!.]+$/, '');
}

/**
 * The questions in faq.txt: each "### Qn. question" block under a "# X. CATEGORY" heading.
 * Blocks end at the next heading or a "---" rule; text outside a Q block (intro, section I notes) is skipped.
 */
export function parseFaqText(text: string): FaqEntry[] {
  const entries: FaqEntry[] = [];
  let category = '';
  let current: { question: string; sortOrder: number; lines: string[] } | null = null;
  const close = () => {
    if (current) entries.push({ category, question: current.question, answer: current.lines.join('\n').trim(), sortOrder: current.sortOrder });
    current = null;
  };
  for (const line of text.split(/\r?\n/)) {
    const section = /^# [A-Z]\.\s+(.+)$/.exec(line);
    const q = /^### Q(\d+)\.\s+(.+)$/.exec(line);
    if (section) {
      close();
      const name = section[1].trim().toLowerCase();
      category = name[0].toUpperCase() + name.slice(1);
    } else if (q) {
      close();
      current = { question: q[2].trim(), sortOrder: Number(q[1]), lines: [] };
    } else if (/^---\s*$/.test(line) || /^#{1,2} /.test(line)) {
      close();
    } else if (current) {
      current.lines.push(line);
    }
  }
  close();
  return entries;
}
