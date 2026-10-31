import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { localStore } from '../db.js';
import { createApp, fingerprint } from '../server.js';
import { mountWorkflows } from '../workflow-api.js';
import { summaryMessages } from '../workflow.js';

test('workflow library is owner-scoped; AI needs exact approval; replay costs one call', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'indicedge-api-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let calls = 0;
  const app = createApp({ store: localStore(dir), env: { PRUNE_API_KEY: 'test', PRUNE_MODEL: 'test' },
    authenticate: async header => header, mountWorkflows, callPrune: async () => { calls++; return { answer: '3 draft reminders.', metadata: { testFixture: true } }; } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = async (endpoint, body, owner = 'alice', id = randomUUID()) => {
    const response = await fetch(url + endpoint, { method: body ? 'POST' : 'GET', headers: { Authorization: owner, 'Content-Type': 'application/json', 'Idempotency-Key': id }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const plan = { version: 1, kind: 'overdue_reminders', minDaysOverdue: 5, language: 'en', includeSummary: true };
  assert.equal((await request('/api/workflows', { name: 'Orders', plan })).status, 201);
  assert.equal((await request('/api/workflows', null, 'bob')).data.items.length, 0);
  const facts = { matchedRows: 3, outstandingPaise: 1112575, minDaysOverdue: 5, language: 'en' };
  assert.equal((await request('/api/explain', { facts })).status, 409);
  assert.equal(calls, 0);
  const id = randomUUID();
  const body = { facts, approvedDigest: fingerprint(summaryMessages(facts)) };
  assert.equal((await request('/api/explain', body, 'alice', id)).status, 200);
  assert.equal((await request('/api/explain', body, 'alice', id)).data.replayed, true);
  assert.equal(calls, 1);
  assert.equal((await request('/api/explain', { ...body, facts: { ...facts, matchedRows: 4 } })).status, 409);
  const history = (await request('/api/history')).data.items;
  assert.equal(history.length, 1);
  assert.equal(JSON.stringify(history).includes('draft reminders'), false);
});
