import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../be/tests/helpers';

// sch-1.1: proves e2e/integration runs against the real app and the auction_test db
describe('sch-1.1 e2e/integration wiring', () => {
  it('serves the health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });
});
