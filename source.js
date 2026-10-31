export function parseSource(text, filename = 'orders.csv') {
  text = text.replace(/^\uFEFF/, '');
  if (new TextEncoder().encode(text).length > 5_000_000) throw new Error('Use a source file smaller than 5 MB');
  if (/\.(jsonl|ndjson)$/i.test(filename)) {
    return text.split(/\r?\n/).flatMap((line, i) => {
      if (!line.trim()) return [];
      try { return [JSON.parse(line)]; } catch { throw new Error(`Invalid JSON on line ${i + 1}`); }
    });
  }
  if (filename.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : parsed?.rows ?? parsed?.data;
    if (!Array.isArray(rows)) throw new Error('JSON must be an array of records, or an object containing a rows/data array');
    return rows;
  }
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/)[0] || '';
  const count = separator => {
    let inside = false, found = 0;
    for (let i = 0; i < firstLine.length; i++) {
      if (firstLine[i] === '"' && firstLine[i + 1] === '"' && inside) { i++; continue; }
      if (firstLine[i] === '"') inside = !inside;
      else if (!inside && firstLine[i] === separator) found++;
    }
    return found;
  };
  const delimiter = /\.tsv$/i.test(filename) ? '\t' : [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === undefined) throw new Error('CSV contains an unclosed quote');
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === '"' && field === '' && !closed) quoted = true;
    else if (c === delimiter || c === '\n' || c === undefined) {
      row.push(field.replace(/\r$/, '')); field = ''; closed = false;
      if (c !== delimiter) { if (row.some(v => v.trim())) rows.push(row); row = []; }
    } else {
      if (closed && c !== '\r') throw new Error('Unexpected text after a closing CSV quote');
      if (c === '"') throw new Error('Unexpected CSV quote');
      field += c;
    }
    if (rows.length > 5001) throw new Error('Use at most 5,000 source rows');
  }
  const header = rows.shift()?.map(h => h.trim());
  if (!header?.length || header.length > 200 || new Set(header).size !== header.length || header.some(h => !h || h.length > 200 || /[\u0000-\u001f\u007f]/.test(h))) throw new Error('Use up to 200 unique, non-empty column names (spaces and non-English names are supported)');
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
