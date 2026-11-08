// Runs the Supabase migrations (supabase/migrations) on PGlite, real Postgres in Node, with a stand-in
// for what a Supabase project provides (auth schema, auth.uid(), the anon/authenticated roles), and
// checks row-level security and "last edit wins".
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const R1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const pg = new PGlite();

/** Runs SQL as a signed-in user (or anonymously), like a request through the Data API. */
async function as(user: string | null, sql: string, params: unknown[] = []) {
  await pg.exec(user ? `set role authenticated; set request.jwt.claim.sub = '${user}'` : `set role anon; set request.jwt.claim.sub = ''`);
  try {
    return await pg.query<Record<string, any>>(sql, params);
  } finally {
    await pg.exec(`reset role; reset request.jwt.claim.sub`);
  }
}
const upsert = `insert into public.accounts (id, data, updated_at, deleted_at) values ($1, $2, $3, $4)
  on conflict (user_id, id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`;
const rowOf = async (user: string) => (await pg.query<Record<string, any>>(`select * from public.accounts where id = $1 and user_id = $2`, [R1, user])).rows[0];

beforeAll(async () => {
  await pg.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  const dir = join(process.cwd(), 'supabase', 'migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(join(dir, f), 'utf8'));
  await pg.exec(`insert into auth.users (id) values ('${A}'), ('${B}')`);
  await as(A, upsert, [R1, { name: 'Cash' }, '2026-11-01T10:00:00Z', null]);
}, 60_000); // starting PGlite (WASM Postgres) can take a while on a busy machine

// Close the database, or the WASM Postgres crashes the test worker when it exits.
afterAll(() => pg.close());

describe('row-level security', () => {
  it('a row inserted without user_id belongs to the caller', async () => {
    expect((await rowOf(A))?.server_updated_at).toBeTruthy();
  });

  it("users see only their own rows; anonymous requests get nothing", async () => {
    expect((await as(A, `select id from public.accounts`)).rows).toHaveLength(1);
    expect((await as(B, `select id from public.accounts`)).rows).toHaveLength(0);
    await expect(as(null, `select * from public.accounts`)).rejects.toThrow();
  });

  it("users can't change, take over, insert for, or hard-delete others' rows", async () => {
    expect((await as(B, `update public.accounts set data = '{"x":1}' where id = $1`, [R1])).affectedRows).toBe(0);
    await expect(as(A, `update public.accounts set user_id = $1, updated_at = $2 where id = $3`, [B, '2027-01-01T00:00:00Z', R1])).rejects.toThrow();
    await expect(as(A, `insert into public.accounts (id, user_id, data, updated_at) values (gen_random_uuid(), $1, '{}', now())`, [B])).rejects.toThrow();
    await expect(as(A, `delete from public.accounts where id = $1`, [R1])).rejects.toThrow();
  });

  it("the same id for another user is that user's own row", async () => {
    await as(B, upsert, [R1, { name: 'Theirs' }, '2026-12-01T00:00:00Z', null]);
    expect((await rowOf(A)).data.name).toBe('Cash');
    expect((await rowOf(B)).data.name).toBe('Theirs');
  });

  it('the same rules hold on categories, transactions and settings', async () => {
    for (const t of ['categories', 'transactions']) {
      await as(A, `insert into public.${t} (id, data, updated_at) values (gen_random_uuid(), '{}', now())`);
      expect((await as(B, `select id from public.${t}`)).rows).toHaveLength(0);
    }
    await as(A, `insert into public.settings (data, updated_at) values ('{"currency":"EGP"}', now())`);
    expect((await as(B, `select * from public.settings`)).rows).toHaveLength(0);
  });
});

describe('last edit wins', () => {
  it('ignores an older edit arriving late, and the same edit sent twice', async () => {
    await as(A, upsert, [R1, { name: 'Old' }, '2026-10-01T00:00:00Z', null]);
    expect((await rowOf(A)).data.name).toBe('Cash');
    await as(A, upsert, [R1, { name: 'Wallet' }, '2026-11-02T10:00:00Z', null]);
    const after = await rowOf(A);
    expect(after.data.name).toBe('Wallet');
    await as(A, upsert, [R1, { name: 'Wallet' }, '2026-11-02T10:00:00Z', null]);
    expect((await rowOf(A)).server_updated_at.getTime()).toBe(after.server_updated_at.getTime());
  });

  it('applies to settings too', async () => {
    const put = `insert into public.settings (data, updated_at) values ($1, $2)
      on conflict (user_id) do update set data = excluded.data, updated_at = excluded.updated_at`;
    await as(A, put, [{ currency: 'USD' }, '2099-01-01T00:00:00Z']);
    await as(A, put, [{ currency: 'GBP' }, '2026-01-01T00:00:00Z']);
    expect((await as(A, `select data from public.settings`)).rows[0].data.currency).toBe('USD');
  });
});

describe('learned SMS links and merchant rules', () => {
  it.each(['sms_links', 'merchant_rules'])('%s keeps rows private and the newest edit', async (t) => {
    const put = `insert into public.${t} (id, data, updated_at) values ($1, $2, $3)
      on conflict (user_id, id) do update set data = excluded.data, updated_at = excluded.updated_at`;
    await as(A, put, [R1, { accountId: 'new' }, '2026-11-07T10:00:00Z']);
    expect((await as(B, `select id from public.${t}`)).rows).toHaveLength(0);
    await as(A, put, [R1, { accountId: 'old' }, '2026-11-01T10:00:00Z']);
    expect((await as(A, `select data from public.${t} where id = $1`, [R1])).rows[0].data.accountId).toBe('new');
  });
});

describe('account deletion', () => {
  it("removes all of the user's rows and nobody else's", async () => {
    await pg.exec(`delete from auth.users where id = '${A}'`);
    const n = await pg.query<{ n: number }>(
      `select (select count(*) from public.accounts where user_id = $1) + (select count(*) from public.categories where user_id = $1)
        + (select count(*) from public.transactions where user_id = $1) + (select count(*) from public.settings where user_id = $1)
        + (select count(*) from public.sms_links where user_id = $1) + (select count(*) from public.merchant_rules where user_id = $1) as n`,
      [A],
    );
    expect(Number(n.rows[0].n)).toBe(0);
    expect((await rowOf(B)).data.name).toBe('Theirs');
  });
});
