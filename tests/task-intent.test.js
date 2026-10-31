import { test } from 'node:test';
import assert from 'node:assert/strict';
import { understandDataTask, executeDataTask } from '../task-intent.js';
const rows = [{ money_in_inr: '10.10', money_out_inr: '0', running_balance_inr: '100' }, { money_in_inr: '0.20', money_out_inr: '5', running_balance_inr: '95.20' }];
test('natural-language balances use closing snapshot rather than summing cumulative values', () => {
  const task = understandDataTask('find the total running balance', rows);
  assert.equal(task.operation, 'closing_balance');
  assert.equal(executeDataTask(task, rows).value, '95.2');
  assert.match(task.note, /double-count/);
  assert.equal(executeDataTask(understandDataTask('sum running balance', rows), rows).value, '195.2');
});
test('income, expenses, exact numeric fields, averages and record counts route to dataset operations', () => {
  for (const [query, expected] of [['find total income', '10.3'], ['total expenses', '5'], ['average money_in_inr?', '5.15'], ['count transactions', '2']]) {
    assert.equal(executeDataTask(understandDataTask(query, rows), rows).value, expected);
  }
});
test('missing fields, invalid final balances and unsupported filters fail explicitly', () => {
  assert.throws(() => understandDataTask('closing balance', [{ x: 1 }]), /Missing column/);
  assert.throws(() => executeDataTask(understandDataTask('closing balance', rows), [{ running_balance_inr: '' }]), /final row/);
  assert.throws(() => understandDataTask('total income for October', rows), /date range/);
});
