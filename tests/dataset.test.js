import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSource } from '../source.js';
import { validateDataset, profileDataset, sourceCapabilities, operateDataset, datasetCSV } from '../dataset.js';
import { worksheetRecords, checkXlsxArchive } from '../source-loader.js';

const financial = [
  { date: '2026-10-01', transaction_id: 'T1', category: 'Opening', money_in_inr: '0', money_out_inr: '0', running_balance_inr: '1000' },
  { date: '2026-10-02', transaction_id: 'T2', category: 'Sales', money_in_inr: '100.10', money_out_inr: '0', running_balance_inr: '1100.10' },
  { date: '2026-10-03', transaction_id: 'T3', category: 'Stock', money_in_inr: '0', money_out_inr: '25.20', running_balance_inr: '1074.90' }
];
test('arbitrary column names, Unicode, TSV, semicolon CSV and JSONL load without an order schema', () => {
  const rows = parseSource('Product Name,मात्रा,Unit Price\nRice,2,0.10');
  assert.deepEqual(validateDataset(rows), ['Product Name', 'मात्रा', 'Unit Price']);
  assert.equal(parseSource('Name\tValue\nA\t2', 'data.tsv')[0].Value, '2');
  assert.equal(parseSource('Name;Value\nA;2', 'data.csv')[0].Value, '2');
  assert.equal(parseSource('{"rows":[{"Name":"A"}]}', 'data.json')[0].Name, 'A');
  assert.equal(parseSource('{"n":1}\n{"n":2}', 'data.jsonl').length, 2);
  assert.throws(() => parseSource('{"n":1}\nbad', 'data.jsonl'), /line 2/);
});
test('missing order constraints disable only reminder operations', () => {
  const support = sourceCapabilities(financial);
  assert.equal(support.order.available, false);
  assert.ok(support.order.missing.includes('due_date'));
  assert.match(support.order.note, /customer reminder drafts/);
  assert.equal(support.financial.available, true);
  assert.equal(operateDataset(financial, { operation: 'count' }).value, '3');
});
test('cash-flow totals exclude opening balance and reconcile every source balance', () => {
  const result = operateDataset(financial, { operation: 'finance' });
  assert.equal(result.rows.find(r => r.measure.startsWith('Total money in')).value, '100.1');
  assert.equal(result.rows.find(r => r.measure.startsWith('Total money out')).value, '25.2');
  assert.equal(result.rows.find(r => r.measure.startsWith('Net cash')).value, '74.9');
  assert.equal(result.rows.find(r => r.measure.startsWith('Implied opening')).value, '1000');
  assert.equal(result.rows.find(r => r.measure === 'Balance mismatches').value, '0');
  const broken = financial.map((r, i) => ({ ...r, running_balance_inr: i === 2 ? '999' : r.running_balance_inr }));
  assert.equal(operateDataset(broken, { operation: 'finance' }).rows.at(-1).value, '1');
});
test('decimal arithmetic, negative values and large integers remain exact', () => {
  const rows = [{ x: '0.10' }, { x: '0.20' }, { x: '-0.05' }];
  assert.equal(operateDataset(rows, { operation: 'sum', field: 'x' }).value, '0.25');
  assert.equal(operateDataset(rows, { operation: 'min', field: 'x' }).value, '-0.05');
  assert.equal(operateDataset(rows, { operation: 'max', field: 'x' }).value, '0.2');
  assert.equal(operateDataset([{ x: '9007199254740993' }, { x: '1' }], { operation: 'sum', field: 'x' }).value, '9007199254740994');
  assert.equal(operateDataset([{ x: 1 }, { x: 2 }], { operation: 'average', field: 'x' }).value, '1.5');
  assert.throws(() => operateDataset([{ x: Number.MAX_SAFE_INTEGER + 1 }], { operation: 'sum', field: 'x' }), /non-numeric/);
});
test('missing cells are profiled; mixed numeric cells fail rather than silently disappearing', () => {
  const rows = [{ x: '2' }, { x: '' }, { other: 'value' }];
  const profile = profileDataset(rows).find(p => p.name === 'x');
  assert.equal(profile.missing, 2);
  assert.match(operateDataset(rows, { operation: 'sum', field: 'x' }).note, /2 empty cells/);
  assert.throws(() => operateDataset([{ x: '2' }, { x: 'not numeric' }], { operation: 'sum', field: 'x' }), /row 2/);
  assert.throws(() => operateDataset([{ money_in_inr: '', money_out_inr: 0 }], { operation: 'finance' }));
});
test('filter, numeric sorting and grouping preserve source data and arbitrary field names', () => {
  const rows = [{ 'Item Category': 'A', amount: '10' }, { 'Item Category': 'B', amount: '2' }, { 'Item Category': 'A', amount: '0.20' }];
  assert.equal(operateDataset(rows, { operation: 'filter', field: 'amount', comparator: 'gt', value: '5' }).rows.length, 1);
  assert.equal(operateDataset(rows, { operation: 'sort', field: 'amount', direction: 'asc' }).rows[0].amount, '0.20');
  const group = operateDataset(rows, { operation: 'group', field: 'Item Category', metric: 'sum', metricField: 'amount' });
  assert.deepEqual(group.rows[0], { group: 'A', rows: 2, sum: '10.2', empty_values: 0 });
  assert.equal(rows[0].amount, '10');
});
test('date filtering rejects invalid dates; numeric filtering rejects mixed data', () => {
  assert.equal(operateDataset(financial, { operation: 'filter', field: 'date', comparator: 'after', value: '2026-10-01' }).rows.length, 2);
  assert.throws(() => operateDataset([{ date: '2026-02-30' }], { operation: 'filter', field: 'date', comparator: 'before', value: '2026-10-01' }));
  assert.throws(() => operateDataset([{ x: 1 }, { x: 'bad' }], { operation: 'filter', field: 'x', comparator: 'gt', value: '0' }));
});
test('nested cells stay display data; special property names do not mutate prototypes', () => {
  const rows = parseSource('__proto__,constructor,説明\nsafe,word,hello');
  assert.ok(validateDataset(rows).includes('__proto__'));
  assert.equal(Object.getPrototypeOf(rows[0]), Object.prototype);
  const profile = profileDataset([{ nested: { execute: 'delete files' } }]);
  assert.equal(profile[0].type, 'structured');
  assert.match(datasetCSV([{ name: '=SUM(A1)' }], ['name']), /'=SUM/);
});
test('worksheet headers, dates, missing cells and file limits are checked independently of order fields', () => {
  const rows = worksheetRecords([['Item Name', 'Date', 'Amount'], ['A', new Date('2026-10-01T00:00:00Z'), 10], ['B', null, null]]);
  assert.equal(rows[0].Date, '2026-10-01'); assert.equal(rows[1].Amount, null);
  assert.throws(() => worksheetRecords([['x', 'x'], [1, 2]]));
  assert.throws(() => validateDataset(Array.from({ length: 5001 }, () => ({ x: 1 }))));
  assert.throws(() => checkXlsxArchive(new ArrayBuffer(22)), /archive/);
});
