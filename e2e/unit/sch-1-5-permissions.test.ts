import { describe, expect, it } from 'vitest';
import { DEFAULT_GRANTS, LOCKED_ADMIN_PERMISSIONS, PERMISSIONS } from '../../be/src/lib/permissions';

// sch-1.5: chat.handle exists and is granted to staff and admin only.
describe('sch-1.5 chat.handle permission', () => {
  it('is defined and granted to staff and admin, not customers', () => {
    expect(PERMISSIONS.map((p) => p.code)).toContain('chat.handle');
    expect(DEFAULT_GRANTS.staff).toContain('chat.handle');
    expect(DEFAULT_GRANTS.admin).toContain('chat.handle');
    expect(DEFAULT_GRANTS.customer).not.toContain('chat.handle');
  });

  it('is not locked, so admins can revoke it like other staff permissions', () => {
    expect(LOCKED_ADMIN_PERMISSIONS).not.toContain('chat.handle');
  });
});
