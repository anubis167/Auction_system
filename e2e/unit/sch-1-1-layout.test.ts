import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../../be/src/lib/permissions';

// sch-1.1: proves e2e/unit runs under be's vitest and can import be code
describe('sch-1.1 e2e/unit wiring', () => {
  it('imports be source', () => {
    expect(PERMISSIONS.length).toBeGreaterThan(0);
  });
});
