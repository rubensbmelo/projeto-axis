import { beforeAll, afterAll, describe, it, expect } from 'vitest';

import { authHeaders, http, setupOrg, teardownOrg, type TestCtx } from './helpers';

describe('patients: CPF, campos obrigatórios e payload estrito', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await setupOrg('Patients');
  });

  afterAll(async () => {
    await teardownOrg(ctx);
  });

  const post = (body: unknown) =>
    http().post('/api/patients').set(authHeaders(ctx.owner.token, ctx.orgId)).send(body as object);

  it('cria paciente válido (201)', async () => {
    const res = await post({ full_name: 'João da Silva' });
    expect(res.status).toBe(201);
    expect(res.body.org_id).toBe(ctx.orgId);
  });

  it('retorna aviso para nome igual ignorando acentos, sem bloquear criação', async () => {
    const res = await post({ full_name: 'Joao da Silva' });
    expect(res.status).toBe(201);
    expect(res.body.warning).toBe('possible_duplicate');
    expect(res.body.matches).toEqual([
      expect.objectContaining({ full_name: 'João da Silva' }),
    ]);
  });

  it('bloqueia CPF duplicado na mesma organização (cpf_duplicado)', async () => {
    const first = await post({ full_name: 'Maria Duplicada', cpf: '111.222.333-44' });
    expect(first.status).toBe(201);

    const res = await post({ full_name: 'Maria Outra Pessoa', cpf: '11122233344' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('cpf_duplicado');
    expect(res.body.existing_patient_id).toBe(first.body.id);
  });

  it('permite múltiplos pacientes sem CPF', async () => {
    const res = await post({ full_name: 'Sem CPF Um' });
    expect(res.status).toBe(201);
    const res2 = await post({ full_name: 'Sem CPF Dois' });
    expect(res2.status).toBe(201);
  });

  it('rejeita sem nome (400)', async () => {
    const res = await post({ cpf: '123.456.789-01' });
    expect(res.status).toBe(400);
  });

  it('rejeita nome só com espaços (400)', async () => {
    const res = await post({ full_name: '    ' });
    expect(res.status).toBe(400);
  });

  it('aceita CPF com máscara (201)', async () => {
    const res = await post({ full_name: 'Com Máscara', cpf: '123.456.789-01' });
    expect(res.status).toBe(201);
  });

  it('rejeita CPF com quantidade errada de dígitos (400)', async () => {
    const res = await post({ full_name: 'CPF Curto', cpf: '123' });
    expect(res.status).toBe(400);
  });

  it('rejeita data de nascimento inválida (400)', async () => {
    const res = await post({ full_name: 'Data Errada', birth_date: '31/12/2020' });
    expect(res.status).toBe(400);
  });

  it('rejeita chave extra no payload (strict) (400)', async () => {
    const res = await post({ full_name: 'Extra', org_id: ctx.orgId });
    expect(res.status).toBe(400);
  });
});
