import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRetrievalIndex, retrieveEvidence, defaultRetrievalField, approvedRagPayload, ragMessages, validateRagAnswer } from '../retrieval.js';

const sources = [
  { id: 'policy', name: 'returns.pdf', kind: 'document', rows: [{ page: 2, line: 4, text: 'Refund policy: unused goods may be returned within 30 days with a purchase receipt.' }, { page: 2, line: 5, text: 'Refunds are processed to the original payment method.' }] },
  { id: 'shipping', name: 'shipping.txt', kind: 'document', rows: [{ line: 1, text: 'Standard delivery takes five business days. Express shipping is available.' }] }
];
test('BM25 retrieves relevant document evidence across files with page/line citations', () => {
  const index = buildRetrievalIndex(sources, ['text']);
  const result = retrieveEvidence(index, 'What is the refund policy?');
  assert.equal(result.results[0].sourceId, 'policy');
  assert.equal(result.results[0].citation, 'S1');
  assert.equal(result.results[0].location, 'Page 2, lines 4–5');
  assert.match(result.results[0].text, /30 days/);
  assert.equal(result.results.some(r => r.sourceId === 'shipping'), false);
});
test('no matching evidence produces no invented answer; queries must carry specific terms', () => {
  const index = buildRetrievalIndex(sources, ['text']);
  assert.equal(retrieveEvidence(index, 'zebras astronomy').results.length, 0);
  assert.throws(() => retrieveEvidence(index, 'what is the'), /specific words/);
  assert.throws(() => retrieveEvidence(index, 'refund', 20));
});
test('excluded fields never enter the index; dataset citations preserve data row provenance', () => {
  const rows = [{ product: 'Rice', category: 'Food', bank_account: 'FORBIDDEN-MARKER' }];
  const index = buildRetrievalIndex([{ id: 'ledger', name: 'ledger.csv', rows }], ['product', 'category']);
  assert.equal(JSON.stringify(index.entries).includes('FORBIDDEN-MARKER'), false);
  assert.equal(defaultRetrievalField('bank_account'), false);
  assert.equal(defaultRetrievalField('customer_name'), false);
  assert.equal(defaultRetrievalField('category'), true);
  assert.equal(retrieveEvidence(index, 'rice').results[0].location, 'Data rows 1');
});
test('long text is chunked with overlap; page boundaries are never merged', () => {
  const index = buildRetrievalIndex([{ id: 'long', name: 'long.pdf', kind: 'document', rows: [
    { page: 1, line: 1, text: 'refund '.repeat(400) }, { page: 2, line: 1, text: 'shipping rules' }
  ] }], ['text']);
  assert.ok(index.entries.length > 2);
  assert.ok(index.entries.every(entry => entry.text.length <= 1200));
  assert.ok(index.entries.every(entry => !entry.text.includes('shipping') || !entry.text.includes('refund')));
});
test('same-language Unicode retrieval supports Hindi without a remote embedding call', () => {
  const index = buildRetrievalIndex([{ id: 'hi', name: 'नीति.txt', kind: 'document', rows: [{ line: 1, text: 'भुगतान वापसी नीति के अनुसार रसीद जरूरी है।' }] }], ['text']);
  assert.equal(retrieveEvidence(index, 'वापसी नीति क्या है?').results.length, 1);
});
test('approved context contains only bounded selected passages and omits original file names', () => {
  const retrieved = retrieveEvidence(buildRetrievalIndex(sources, ['text']), 'refund').results;
  const evidence = retrieved.map(({ citation, location, text }) => ({ citation, location, text }));
  const messages = ragMessages('What is the refund policy? email me at owner@example.test', evidence);
  assert.equal(JSON.stringify(messages).includes('owner@example.test'), false);
  assert.equal(JSON.stringify(messages).includes('returns.pdf'), false);
  assert.throws(() => approvedRagPayload('refund', []));
  assert.throws(() => approvedRagPayload('refund', [{ ...evidence[0], fullDocument: 'secret' }]));
  assert.throws(() => approvedRagPayload('refund', [evidence[0], evidence[0]]));
});
test('citation validation refuses invented IDs, missing citations and arbitrary generated actions', () => {
  const evidence = [{ citation: 'S1', location: 'Page 2', text: 'Unused goods can be returned within 30 days.' }];
  assert.deepEqual(validateRagAnswer({ answer: 'Returns are allowed within 30 days [S1].', citations: ['S1'], needsReview: false }, evidence).citations, ['S1']);
  assert.throws(() => validateRagAnswer({ answer: 'An invented fact [S9].', citations: ['S9'], needsReview: false }, evidence));
  assert.throws(() => validateRagAnswer({ answer: 'An uncited assertion.', citations: [], needsReview: false }, evidence));
  assert.throws(() => validateRagAnswer({ answer: 'Fact [S1].', citations: ['S1'], needsReview: false, execute: 'send_email' }, evidence));
  assert.equal(validateRagAnswer({ answer: 'Insufficient evidence to answer.', citations: [], needsReview: true }, evidence).needsReview, true);
});
