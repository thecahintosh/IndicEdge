import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { localStore } from '../db.js';
import { admittedCall } from '../engine.js';
import { createApp } from '../server.js';

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'indicedge-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { store: localStore(directory), directory };
}
test('billable request is replayed without calling provider twice, including restart', async t => {
  const { store, directory } = fixture(t);
  const id = randomUUID();
  let calls = 0;
  const operation = async () => { calls++; return { answer: 'ok', metadata: null }; };
  await admittedCall(store, 'a', id, 'same', operation);
  const result = await admittedCall(localStore(directory), 'a', id, 'same', operation);
  assert.equal(calls, 1);
  assert.equal(result.replayed, true);
  await assert.rejects(admittedCall(store, 'a', id, 'different', operation), { status: 409 });
});
test('daily call quota and failed attempts are durable, scoped per owner', async t => {
  const { store } = fixture(t);
  await assert.rejects(admittedCall(store, 'a', randomUUID(), 'x', async () => { throw Error('private provider error'); }, 1), { status: 502 });
  await assert.rejects(admittedCall(store, 'a', randomUUID(), 'y', async () => ({}), 1), { status: 429 });
  await admittedCall(store, 'b', randomUUID(), 'x', async () => ({ answer: 'ok' }), 1);
  assert.equal((await store.read('a')).history.length, 0);
});
test('pending reservation prevents a concurrent billable call', async t => {
  const { store } = fixture(t);
  let release;
  const first = admittedCall(store, 'a', randomUUID(), 'x', () => new Promise(resolve => { release = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(admittedCall(store, 'a', randomUUID(), 'y', async () => ({})), { status: 409 });
  release({ answer: 'ok' }); await first;
});
test('API rejects foreign origins, invalid JSON, missing auth and backend file access', async t => {
  const { store } = fixture(t);
  const app = createApp({ store, env: {}, authenticate: async () => null });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url + '/api/history')).status, 401);
  assert.equal((await fetch(url + '/api/config', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(url + '/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })).status, 400);
  assert.equal((await fetch(url + '/server.js')).status, 404);
});
test('provider success with failed persistence returns result and never invites a paid retry', async () => {
  let writes = 0;
  const store = { mutate: async (owner, action) => {
    writes++;
    if (writes === 1) return action({ workflows: [], requests: {}, history: [], daily: {} });
    throw Error('database temporarily unavailable');
  } };
  const result = await admittedCall(store, 'a', randomUUID(), 'safe', async () => ({ answer: 'Completed', metadata: { fixture: true } }));
  assert.equal(result.answer, 'Completed');
  assert.match(result.persistenceWarning, /Do not repeat/);
});
test('local mutation rolls back on validation failure and namespaces stay isolated', async t => {
  const { store } = fixture(t);
  await store.mutate('a', state => { state.workflows.push({ name: 'private' }); });
  await assert.rejects(store.mutate('a', state => { state.workflows.push({ name: 'bad' }); throw Error('reject'); }));
  assert.equal((await store.read('a')).workflows.length, 1);
  assert.equal((await store.read('b')).workflows.length, 0);
});
test('unknown idempotency outcomes are never automatically repeated', async t => {
  const { store } = fixture(t);
  const id = randomUUID();
  await store.mutate('a', state => { state.requests[id] = { status: 'pending', fingerprint: 'same', startedAt: new Date().toISOString() }; });
  let calls = 0;
  await assert.rejects(admittedCall(store, 'a', id, 'same', async () => { calls++; return {}; }), { status: 409 });
  assert.equal(calls, 0);
});
