import { describe, expect, it } from 'vitest';
import { formatBytes, MAX_DOC_SIZE_BYTES } from './pages/AdminRag';

describe('rag-2.2 and rag-2.3 admin rag helpers', () => {
  it('enforces 10 MB maximum document size', () => {
    expect(MAX_DOC_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });

  it('formats byte sizes into readable units', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1048576)).toBe('1.00 MB');
    expect(formatBytes(10 * 1024 * 1024)).toBe('10.00 MB');
  });

  it('validates file extensions and limits correctly', () => {
    const isAllowedExt = (filename: string) => {
      const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
      return ext === '.txt' || ext === '.md';
    };
    expect(isAllowedExt('guide.md')).toBe(true);
    expect(isAllowedExt('rules.txt')).toBe(true);
    expect(isAllowedExt('document.pdf')).toBe(false);
    expect(isAllowedExt('archive.zip')).toBe(false);

    const isOverLimit = (size: number) => size >= MAX_DOC_SIZE_BYTES;
    expect(isOverLimit(9 * 1024 * 1024)).toBe(false);
    expect(isOverLimit(10 * 1024 * 1024)).toBe(true);
    expect(isOverLimit(11 * 1024 * 1024)).toBe(true);
  });
});
