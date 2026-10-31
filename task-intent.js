import { validateDataset, operateDataset, numeric, decimal, blank } from './dataset.js';

export function understandDataTask(question, rows) {
  const columns = validateDataset(rows);
  const text = question.trim().toLowerCase();
  if (/\b(where|except|excluding|before|after|since|between|today|yesterday|week|month|january|february|march|april|june|july|august|september|october|november|december)\b/.test(text)) throw new Error('This question contains a filter or date range. Filter the active source under Analyze fields first; this calculation uses all active records.');
  if (!text || /\b(send|delete|transfer|refund|except|where|excluding|between)\b/.test(text)) throw new Error('Use a supported calculation without additional filters, or use Analyze fields to filter explicitly.');
  if (/\b(running|closing|ending|final|current)\s+balance\b/.test(text) && !/\bsum\b/.test(text)) {
    if (!columns.includes('running_balance_inr')) throw new Error('Missing column: running_balance_inr. Closing balance cannot be calculated from this source.');
    return { operation: 'closing_balance', field: 'running_balance_inr', label: 'Closing balance', note: 'Uses the last record in source order. Running balances are cumulative; adding them would double-count money. Source order is not automatically sorted by date.' };
  }
  if (/\b(cash.?flow|financial summary|income and expenses)\b/.test(text)) return { operation: 'finance', label: 'Cash-flow summary' };
  if (/\b(count|how many)\b/.test(text) && /\b(rows|records|transactions)\b/.test(text)) return { operation: 'count', label: 'Count records' };
  const operation = /\b(average|mean)\b/.test(text) ? 'average' : /\b(minimum|lowest|smallest)\b/.test(text) ? 'min' : /\b(maximum|highest|largest)\b/.test(text) ? 'max' : /\b(sum|total)\b/.test(text) ? 'sum' : null;
  if (!operation) throw new Error('Try “find the total running balance”, “total income”, “total expenses”, “average amount”, “count transactions”, or name a numeric field.');
  const normalize = value => value.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const normalized = ` ${normalize(text)} `;
  let matches = columns.filter(column => normalized.includes(` ${normalize(column)} `));
  if (!matches.length && /\b(income|revenue|money in)\b/.test(text)) matches = columns.filter(c => ['money_in_inr', 'income', 'revenue'].includes(c));
  if (!matches.length && /\b(expenses?|spending|money out)\b/.test(text)) matches = columns.filter(c => ['money_out_inr', 'expense', 'expenses'].includes(c));
  if (!matches.length && /\brunning balance\b/.test(text)) matches = columns.filter(c => c === 'running_balance_inr');
  if (matches.length !== 1) throw new Error(matches.length ? `Ambiguous fields: ${matches.join(', ')}. Ask for one calculation at a time.` : `No matching numeric field. Available columns: ${columns.join(', ')}.`);
  return { operation, field: matches[0], label: `${operation} · ${matches[0]}`, note: operation === 'sum' && /balance/i.test(matches[0]) ? 'This explicitly sums balance snapshots; it is not the closing balance or net cash movement.' : 'Calculated over all loaded records. Empty and invalid values are checked before execution.' };
}

export function executeDataTask(task, rows) {
  const columns = validateDataset(rows);
  if (task.operation !== 'closing_balance') return operateDataset(rows, task);
  if (!columns.includes('running_balance_inr')) throw new Error('Missing running_balance_inr column');
  const value = rows.at(-1).running_balance_inr;
  if (blank(value) || numeric(value) === null) throw new Error('The final row has no valid running balance. No earlier value was silently substituted.');
  return { type: 'value', label: 'Closing balance (INR)', value: decimal(numeric(value)), note: task.note };
}
