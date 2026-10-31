import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp, fingerprint } from '../server.js';
import { localStore } from '../db.js';
import { mountWorkflows } from '../workflow-api.js';
import { ragMessages } from '../retrieval.js';

test('RAG answers require exact disclosure approval, validate citations, and replay without another call', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'indicedge-rag-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let calls = 0, invalid = false, sent;
  const store = localStore(directory);
  const app = createApp({ store, env: { PRUNE_API_KEY: 'fixture', PRUNE_MODEL: 'fixture' }, authenticate: async h => h,
    mountWorkflows, callPrune: async messages => {
      calls++; sent = messages;
      return { answer: JSON.stringify(invalid ? { answer: 'Unsupported [S9]', citations: ['S9'], needsReview: false } : { answer: 'Return unused goods within 30 days [S1].', citations: ['S1'], needsReview: false }), metadata: { fixture: true }, model: 'fixture' };
    } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/retrieve-answer`;
  const question = 'What is the return policy?', evidence = [{ citation: 'S1', location: 'Page 1', text: 'Unused goods may be returned within 30 days.' }];
  const body = { question, evidence, approvedDigest: fingerprint(ragMessages(question, evidence)) };
  const call = (payload, id = randomUUID(), owner = 'alice') => fetch(url, { method: 'POST', headers: { Authorization: owner, 'Content-Type': 'application/json', 'Idempotency-Key': id }, body: JSON.stringify(payload) });
  assert.equal((await call({ question, evidence })).status, 409); assert.equal(calls, 0);
  const id = randomUUID(); const first = await call(body, id); assert.equal(first.status, 200);
  assert.deepEqual((await first.json()).citations, ['S1']);
  const repeated = await call(body, id); assert.equal((await repeated.json()).replayed, true); assert.equal(calls, 1);
  assert.equal((await call({ ...body, evidence: [{ ...evidence[0], text: 'Changed after approval' }] })).status, 409);
  assert.equal(JSON.stringify(sent).includes('fullDocument'), false);
  assert.equal((await store.read('bob')).history.length, 0);
  invalid = true;
  assert.equal((await call(body)).status, 422);
  assert.equal(calls, 2);
  assert.equal((await store.read('alice')).history.length, 2, 'invalid citation output still records the actual provider event');
});
