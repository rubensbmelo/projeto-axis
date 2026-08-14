import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Limite global baixo para o teste estourar rápido sem 300 requisições.
process.env.RATE_LIMIT_GLOBAL = '5';

let helpers: typeof import('./helpers');
let ctx: Awaited<ReturnType<typeof import('./helpers').setupOrg>>;

beforeAll(async () => {
  helpers = await import('./helpers');
  ctx = await helpers.setupOrg('RateLimit'); // setup usa 2 requisições /api
});

afterAll(async () => {
  await helpers.teardownOrg(ctx);
});

describe('rate limiting global', () => {
  it('estoura em 429 após atingir o limite', async () => {
    // Envia até estourar o limite baixo configurado (5/15min por IP).
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await helpers.http().get('/api/cases').set(helpers.authHeaders(ctx.owner.token, ctx.orgId));
      statuses.push(res.status);
    }
    // As primeiras passam; em algum ponto estoura 429 e segue bloqueado.
    expect(statuses[0]).toBe(200);
    expect(statuses).toContain(429);
    const first429 = statuses.indexOf(429);
    expect(first429).toBeGreaterThan(0);
    expect(statuses.slice(first429)).not.toContain(200);
  });
});
