import { normalizeOrders, SCHEMA_FIELDS } from './workflow.js';

export const blank = value => value === null || value === undefined || (typeof value === 'string' && !value.trim());
export const cellText = value => blank(value) ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const fail = message => { throw new Error(message); };
const numericPattern = /^[+-]?\d+(?:\.\d{1,6})?$/;
export function numeric(value) {
  if (blank(value) || !['string', 'number'].includes(typeof value)) return null;
  if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) return null;
  const text = String(value).trim();
  if (text.length > 30 || !numericPattern.test(text)) return null;
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace(/^[+-]/, '').split('.');
  return BigInt(whole + fraction.padEnd(6, '0')) * (negative ? -1n : 1n);
}
export function decimal(value, places = 6) {
  const negative = value < 0n; const text = (negative ? -value : value).toString().padStart(7, '0');
  const whole = text.slice(0, -6), fraction = text.slice(-6, -6 + places || undefined).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? '.' + fraction : ''}`;
}
export function validateDataset(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 5000) fail('Load between 1 and 5,000 records');
  const columns = new Set();
  for (const [i, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail(`Row ${i + 1}: use an object with named fields`);
    for (const [key, value] of Object.entries(row)) {
      if (!key.trim() || key.length > 200 || /[\u0000-\u001f\u007f]/.test(key)) fail(`Row ${i + 1}: column names must be non-empty text`);
      columns.add(key);
      if (cellText(value).length > 20000) fail(`Row ${i + 1}: a cell exceeds the 20,000 character limit`);
    }
  }
  if (!columns.size || columns.size > 200) fail('Use between 1 and 200 columns');
  return [...columns];
}
export function profileDataset(rows) {
  const columns = validateDataset(rows);
  return columns.map(name => {
    let missing = 0, numbers = 0, dates = 0, nested = 0;
    const present = [];
    for (const row of rows) {
      const value = row[name];
      if (blank(value)) { missing++; continue; }
      present.push(value);
      if (numeric(value) !== null) numbers++;
      if (typeof value === 'object') nested++;
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value) dates++;
    }
    return { name, missing, present: present.length, numericCount: numbers,
      type: !present.length ? 'empty' : numbers === present.length ? 'number' : dates === present.length ? 'date' : nested ? 'structured' : numbers ? 'mixed' : 'text' };
  });
}
export function sourceCapabilities(rows) {
  const columns = validateDataset(rows);
  const missingOrder = SCHEMA_FIELDS.filter(name => !columns.includes(name));
  let orderIssue = '';
  if (missingOrder.length) orderIssue = `Missing columns: ${missingOrder.join(', ')}. Overdue-order filtering, customer reminder drafts and order-specific summaries cannot run.`;
  else { try { normalizeOrders(rows); } catch (error) { orderIssue = `${error.message}. Order reminders cannot run until these values are corrected.`; } }
  const financialMissing = ['money_in_inr', 'money_out_inr'].filter(name => !columns.includes(name));
  return { order: { available: !orderIssue, missing: missingOrder, note: orderIssue || 'All required order fields are present and valid.' },
    financial: { available: !financialMissing.length, missing: financialMissing,
      note: financialMissing.length ? `Missing columns: ${financialMissing.join(', ')}. The named cash-flow summary is unavailable; individual numeric fields can still be analyzed.` : 'Income, expenses and net cash movement can be calculated. These are cash-flow figures, not accounting profit.' } };
}
function requireColumn(columns, name, label = 'field') {
  if (!columns.includes(name)) fail(`Choose a ${label} that exists in this dataset`);
}
function numbersFrom(rows, field) {
  const values = []; const invalid = []; let ignored = 0;
  rows.forEach((row, i) => {
    if (blank(row[field])) { ignored++; return; }
    const value = numeric(row[field]);
    if (value === null) invalid.push(i + 1); else values.push(value);
  });
  if (invalid.length) fail(`“${field}” has non-numeric values in row${invalid.length === 1 ? '' : 's'} ${invalid.slice(0, 5).join(', ')}${invalid.length > 5 ? '…' : ''}. No values were silently dropped. Filter these rows or choose a numeric field.`);
  if (!values.length) fail(`“${field}” has no numeric values to calculate`);
  return { values, ignored };
}
function total(values) { return values.reduce((sum, value) => sum + value, 0n); }
const tableResult = (rows, columns, note = '') => ({ type: 'table', rows, columns, note });

export function operateDataset(rows, spec) {
  const columns = validateDataset(rows);
  const { operation, field, value = '', comparator = 'equals', direction = 'asc', metric = 'count', metricField } = spec;
  if (operation === 'count') return { type: 'value', label: 'Row count', value: String(rows.length), note: 'All records in the current worksheet/source.' };
  if (operation === 'profile') return tableResult(profileDataset(rows), ['name', 'type', 'present', 'missing', 'numericCount'], 'Types are inferred from non-empty cells. Original field names and values are preserved.');
  if (operation === 'finance') {
    const missing = ['money_in_inr', 'money_out_inr'].filter(name => !columns.includes(name));
    if (missing.length) fail(`Cash-flow summary requires missing columns: ${missing.join(', ')}`);
    const income = numbersFrom(rows, 'money_in_inr'), expense = numbersFrom(rows, 'money_out_inr');
    if (income.ignored || expense.ignored) fail('Income/expense cells are missing. Enter an explicit 0 where there was no movement; totals would otherwise be incomplete.');
    if ([...income.values, ...expense.values].some(n => n < 0n)) fail('Cash-flow summary expects non-negative money_in_inr and money_out_inr values');
    const tin = total(income.values), tout = total(expense.values);
    const summary = [{ measure: 'Total money in (INR)', value: decimal(tin) }, { measure: 'Total money out (INR)', value: decimal(tout) }, { measure: 'Net cash movement (INR)', value: decimal(tin - tout) }];
    let note = 'Cash movement is not profit. Opening balances and running balances are not summed.';
    if (columns.includes('running_balance_inr')) {
      const balances = numbersFrom(rows, 'running_balance_inr');
      if (!balances.ignored) {
        const opening = balances.values[0] - income.values[0] + expense.values[0];
        let expected = opening; let mismatches = 0;
        rows.forEach((row, i) => { expected += income.values[i] - expense.values[i]; if (expected !== balances.values[i]) mismatches++; });
        summary.push({ measure: 'Implied opening balance (INR)', value: decimal(opening) }, { measure: 'Last-row balance (INR)', value: decimal(balances.values.at(-1)) }, { measure: 'Balance mismatches', value: String(mismatches) });
        note += ` Balance check uses source row order, not date sorting; ${mismatches} mismatch${mismatches === 1 ? '' : 'es'} found.`;
      } else note += ' Balance reconciliation is unavailable because some running balances are missing.';
    } else note += ' Missing running_balance_inr: balance reconciliation cannot be performed.';
    return tableResult(summary, ['measure', 'value'], note);
  }
  requireColumn(columns, field);
  if (['sum', 'average', 'min', 'max'].includes(operation)) {
    const { values, ignored } = numbersFrom(rows, field);
    let result = operation === 'sum' ? total(values) : operation === 'average' ? total(values) / BigInt(values.length) : values.reduce((a, b) => operation === 'min' ? a < b ? a : b : a > b ? a : b);
    return { type: 'value', label: `${operation} · ${field}`, value: decimal(result), note: `${values.length} numeric values used; ${ignored} empty cells excluded.${operation === 'average' ? ' Average is truncated to at most six decimal places.' : ' Fixed-point decimal arithmetic (up to six decimal places).'}` };
  }
  if (operation === 'filter') {
    const allowed = ['equals', 'not_equals', 'contains', 'gt', 'gte', 'lt', 'lte', 'empty', 'not_empty', 'before', 'after'];
    if (!allowed.includes(comparator)) fail('Choose a supported filter comparison');
    const numericComparison = ['gt', 'gte', 'lt', 'lte'].includes(comparator);
    const dateComparison = ['before', 'after'].includes(comparator);
    const n = numericComparison ? numeric(value) : null;
    if (numericComparison && n === null) fail('Enter a decimal number for this comparison');
    const validDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
    if (dateComparison && !validDate(value)) fail('Enter a valid YYYY-MM-DD comparison date');
    if (numericComparison) numbersFrom(rows, field);
    if (dateComparison && rows.some(row => !blank(row[field]) && !validDate(row[field]))) fail(`“${field}” contains invalid or non-ISO dates; date filtering is unavailable`);
    const filtered = rows.filter(row => {
      const v = row[field];
      if (comparator === 'empty') return blank(v);
      if (comparator === 'not_empty') return !blank(v);
      if (blank(v)) return false;
      if (numericComparison) { const x = numeric(v); return comparator === 'gt' ? x > n : comparator === 'gte' ? x >= n : comparator === 'lt' ? x < n : x <= n; }
      if (dateComparison) return comparator === 'before' ? v < value : v > value;
      if (comparator === 'contains') return cellText(v).toLocaleLowerCase().includes(String(value).toLocaleLowerCase());
      const equal = numeric(v) !== null && numeric(value) !== null ? numeric(v) === numeric(value) : cellText(v) === String(value);
      return comparator === 'equals' ? equal : !equal;
    });
    return tableResult(filtered, columns, `${filtered.length} of ${rows.length} rows match. Text equality is exact; contains is case-insensitive. Source data is unchanged.`);
  }
  if (operation === 'sort') {
    if (!['asc', 'desc'].includes(direction)) fail('Choose ascending or descending sorting');
    const profile = profileDataset(rows).find(p => p.name === field);
    if (profile.type === 'mixed' || profile.type === 'structured') fail('This field has mixed or structured values. Choose a consistent field before sorting.');
    const sorted = [...rows].sort((a, b) => {
      if (blank(a[field])) return blank(b[field]) ? 0 : 1;
      if (blank(b[field])) return -1;
      let comparison;
      if (profile.type === 'number') comparison = numeric(a[field]) < numeric(b[field]) ? -1 : numeric(a[field]) > numeric(b[field]) ? 1 : 0;
      else comparison = cellText(a[field]).localeCompare(cellText(b[field]), 'en', { numeric: false });
      return direction === 'desc' ? -comparison : comparison;
    });
    return tableResult(sorted, columns, `Sorted ${direction === 'asc' ? 'ascending' : 'descending'} by ${field}; empty cells last. Source data is unchanged.`);
  }
  if (operation === 'group') {
    if (!['count', 'sum'].includes(metric)) fail('Choose count or sum for grouped results');
    if (metric === 'sum') { requireColumn(columns, metricField, 'numeric value field'); numbersFrom(rows, metricField); }
    const groups = new Map();
    for (const row of rows) {
      const groupValue = blank(row[field]) ? null : row[field];
      const key = JSON.stringify([typeof groupValue, groupValue]);
      const group = groups.get(key) || { group: blank(groupValue) ? '(empty)' : cellText(groupValue), rows: 0, value: 0n, missingValues: 0 };
      group.rows++;
      if (metric === 'sum') { const n = numeric(row[metricField]); if (n === null) group.missingValues++; else group.value += n; }
      groups.set(key, group);
    }
    return tableResult([...groups.values()].map(g => metric === 'sum' ? { group: g.group, rows: g.rows, sum: decimal(g.value), empty_values: g.missingValues } : { group: g.group, rows: g.rows }),
      metric === 'sum' ? ['group', 'rows', 'sum', 'empty_values'] : ['group', 'rows'], `Grouped by ${field}. Empty grouping cells have their own group.${metric === 'sum' ? ' Missing numeric cells are counted separately, not treated as source zeroes.' : ''}`);
  }
  fail('Choose a supported dataset operation');
}
export function datasetCSV(rows, columns) {
  const quote = value => '"' + cellText(value).replace(/^[\s]*[=+@-]/, match => "'" + match).replaceAll('"', '""') + '"';
  return [columns.map(quote).join(','), ...rows.map(row => columns.map(key => quote(row[key])).join(','))].join('\r\n');
}
