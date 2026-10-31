export function parseSource(text, filename = 'orders.csv') {
  if (new TextEncoder().encode(text).length > 750000) throw new Error('Use a source file smaller than 750 KB');
  if (filename.toLowerCase().endsWith('.json')) {
    const rows = JSON.parse(text);
    if (!Array.isArray(rows)) throw new Error('JSON must contain an array of order objects');
    return rows;
  }
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === undefined) throw new Error('CSV contains an unclosed quote');
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === '"' && field === '' && !closed) quoted = true;
    else if (c === ',' || c === '\n' || c === undefined) {
      row.push(field.replace(/\r$/, '')); field = ''; closed = false;
      if (c !== ',') { if (row.some(v => v.trim())) rows.push(row); row = []; }
    } else {
      if (closed && c !== '\r') throw new Error('Unexpected text after a closing CSV quote');
      if (c === '"') throw new Error('Unexpected CSV quote');
      field += c;
    }
    if (rows.length > 2001) throw new Error('Use at most 2,000 source rows');
  }
  const header = rows.shift()?.map(h => h.trim());
  if (!header?.length || new Set(header).size !== header.length || header.some(h => !/^[a-z_]+$/.test(h))) throw new Error('CSV needs unique lowercase column names');
  return rows.map((values, i) => {
    if (values.length !== header.length) throw new Error(`CSV row ${i + 2} has a different number of columns`);
    return Object.fromEntries(header.map((key, j) => [key, values[j]]));
  });
}
export function exportCSV(drafts) {
  // Prevent spreadsheet formula injection in user-controlled fields.
  const quote = value => '"' + String(value).replace(/^[\s]*[=+@-]/, match => "'" + match).replaceAll('"', '""') + '"';
  const keys = ['order_id', 'customer_name', 'contact', 'message'];
  return [keys.join(','), ...drafts.map(row => keys.map(k => quote(row[k])).join(','))].join('\r\n');
}
export function sampleOrders(asOf) {
  const date = offset => new Date(Date.parse(`${asOf}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
  return [
    ['ORD-1042', 'Aarav Mehta', 'aarav@example.test', -9, '2450.50', 'pending'],
    ['ORD-1043', 'Kavya Nair', 'kavya@example.test', -7, '6800.00', 'pending'],
    ['ORD-1044', 'Rohan Kapoor', 'rohan@example.test', -2, '1200.00', 'pending'],
    ['ORD-1045', 'Simran Kaur', 'simran@example.test', -12, '3250.00', 'paid'],
    ['ORD-1046', 'Ishaan Shah', 'ishaan@example.test', -5, '1875.25', 'pending'],
    ['ORD-1047', 'Ananya Rao', 'ananya@example.test', 3, '4500.00', 'pending']
  ].map(([order_id, customer_name, contact, offset, amount, status]) => ({ order_id, customer_name, contact,
    due_date: date(offset), amount, status, bank_account: 'SYNTHETIC-BANK-DO-NOT-DISCLOSE', internal_note: 'Fictional supplier margin: 18%; unrelated to reminders' }));
}
