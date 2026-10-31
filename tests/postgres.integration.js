// Run against a disposable PostgreSQL instance, never the user's production DB.
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { postgresStore } from '../db.js';
import { admittedCall } from '../engine.js';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL must identify a disposable PostgreSQL database');
const setup = postgres(url, { max: 1 });
// Supabase provides these roles; a vanilla disposable test database does not.
await setup.unsafe("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$");
const store = await postgresStore(url);
const secondInstance = await postgresStore(url);
const owner = randomUUID(); const otherOwner = randomUUID();
try {
  await Promise.all(Array.from({ length: 15 }, (_, i) => (i % 2 ? store : secondInstance).mutate(owner, state => { state.daily.test = (state.daily.test || 0) + 1; })));
  assert.equal((await store.read(owner)).daily.test, 15, 'row locks must prevent lost updates across instances');
  assert.equal((await store.read(otherOwner)).daily.test, undefined, 'owners must remain isolated');
  const id = randomUUID(); let calls = 0;
  const operation = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 40)); return { answer: 'test response', metadata: { fixture: true } }; };
  const results = await Promise.allSettled([admittedCall(store, owner, id, 'same', operation), admittedCall(secondInstance, owner, id, 'same', operation)]);
  assert.equal(calls, 1, 'concurrent instances must not double bill');
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const replay = await admittedCall(secondInstance, owner, id, 'same', operation);
  assert.equal(replay.replayed, true);
  assert.equal(calls, 1);
  const [permissions] = await setup`SELECT has_table_privilege('anon','public.indicedge_state','SELECT') AS anon_read, has_table_privilege('authenticated','public.indicedge_state','SELECT') AS user_read`;
  assert.equal(permissions.anon_read, false); assert.equal(permissions.user_read, false);
  console.log('PostgreSQL integration: concurrent row locks, two-instance idempotency, owner isolation and browser-role revocation PASS');
} finally {
  await setup`DELETE FROM public.indicedge_state WHERE user_id IN (${owner}, ${otherOwner})`;
  await store.close(); await secondInstance.close(); await setup.end();
}
