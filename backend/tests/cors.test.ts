import { describe, it, expect } from 'vitest';

process.env.CORS_ORIGINS = 'http://localhost:5173';

// Import dinâmico: garante que o app leia o CORS_ORIGINS acima.
const { http } = await import('./helpers');

describe('CORS restrito por allowlist', () => {
  it('origem permitida recebe access-control-allow-origin', async () => {
    const res = await http().get('/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('origem fora da allowlist NÃO recebe header de CORS', async () => {
    const res = await http().get('/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('requisição sem Origin (curl/teste) é aceita', async () => {
    const res = await http().get('/health');
    expect(res.status).toBe(200);
  });
});
