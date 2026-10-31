import { understandIntent, validatePlan, executeWorkflow, normalizeOrders, businessDate, formatMoney,
  disclosureFor, compilerMessages, summaryMessages, POLICY_VERSION } from './workflow.js';
import { sampleOrders, exportCSV } from './source.js';
import { readDatasetFile } from './source-loader.js';
import { validateDataset, sourceCapabilities } from './dataset.js';
import { setupDatasetUI } from './dataset-ui.js';
import { setupRetrievalUI } from './retrieval-ui.js';

const $ = id => document.getElementById(id);
const state = { config: null, session: null, auth: null, generation: 0, controllers: new Set(), rows: [],
  sourceName: 'Fictional example orders', sourceKind: 'dataset', synthetic: true, result: null, workflows: [], pendingAI: null, view: 'workbench', intentBlocked: false, sheets: [], sourceEpoch: 0 };
const titles = { workbench: 'Workbench', library: 'Saved workflows', sources: 'Source data', retrieve: 'Ask your files', history: 'Run history', compute: 'Compute & receipts' };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
const icon = name => { const img = document.createElement('img'); img.src = `./assets/icons/${name}.svg`; img.alt = ''; return img; };
const json = value => JSON.stringify(value, null, 2);
async function digest(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(b => b.toString(16).padStart(2, '0')).join(''); }
function notice(message = '') { $('globalMessage').textContent = message; $('globalMessage').classList.toggle('hidden', !message); }
function reveal(element, delay = 0) {
  if (reducedMotion.matches) return;
  element.animate([{ opacity: .55, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
    { duration: 220, delay, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'backwards' });
}
async function api(route, options = {}) {
  const controller = new AbortController();
  const generation = state.generation;
  state.controllers.add(controller);
  const timer = setTimeout(() => controller.abort(), 35000);
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers };
  if (state.session?.access_token) headers.Authorization = `Bearer ${state.session.access_token}`;
  try {
    const response = await fetch(route, { ...options, headers, signal: controller.signal, credentials: 'same-origin' });
    const data = await response.json();
    if (generation !== state.generation) throw new DOMException('Session changed', 'AbortError');
    if (!response.ok) throw Object.assign(new Error(data.error || `Request failed (${response.status})`), { status: response.status });
    return data;
  } finally { clearTimeout(timer); state.controllers.delete(controller); }
}
function on(id, event, action) {
  $(id).addEventListener(event, async e => {
    try { await action(e); }
    catch (error) { if (error.name !== 'AbortError') notice(error.message); }
  });
}
function button(text, className, action) {
  const el = node('button', className, text);
  el.addEventListener('click', async () => { try { await action(); } catch (error) { notice(error.message); } });
  return el;
}
function plan() { return validatePlan({ version: 1, kind: 'overdue_reminders', minDaysOverdue: Number($('days').value), language: $('language').value, includeSummary: $('includeSummary').checked }); }
function applyPlan(value, origin) {
  const valid = validatePlan(value);
  $('days').value = valid.minDaysOverdue; $('language').value = valid.language;
  $('includeSummary').checked = valid.includeSummary;
  state.intentBlocked = false;
  $('planOrigin').textContent = origin;
  invalidate(); $('stepUnderstand').classList.add('complete');
  $('policyPayload').textContent = json(disclosureFor(valid));
}
function invalidate() {
  state.result = null;
  $('resultsPanel').classList.add('hidden'); $('aiExplanation').classList.add('hidden');
  $('draftList').replaceChildren(); $('resultSummary').textContent = ''; $('resultFacts').replaceChildren(); $('aiExplanation').textContent = '';
  for (const id of ['stepUnderstand', 'stepMinimize', 'stepExecute', 'stepReview']) $(id).classList.remove('complete');
  const orderSupport = state.rows.length ? sourceCapabilities(state.rows).order : null;
  $('readyLabel').textContent = orderSupport && !orderSupport.available ? 'Order reminders unavailable for this source' : state.intentBlocked ? 'Review the changed instruction first' : state.rows.length ? 'Ready when you are' : 'Load source records first';
  $('runWorkflow').disabled = !state.rows.length || state.intentBlocked || !orderSupport?.available;
  $('sourceConstraintNote').textContent = orderSupport && !orderSupport.available ? `${orderSupport.note} Your dataset is loaded; use Source data → Analyze fields for other operations.` : '';
  // Any open disclosure belongs to the old inputs.
  if ($('disclosureDialog').open) $('disclosureDialog').close();
  state.pendingAI = null;
}
function setView(view) {
  if (!Object.hasOwn(titles, view)) view = 'workbench';
  state.view = view;
  for (const key of Object.keys(titles)) $(`${key}View`).classList.toggle('hidden', key !== view);
  for (const link of document.querySelectorAll('[data-view]')) {
    link.classList.toggle('active', link.dataset.view === view);
    if (link.dataset.view === view) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  $('viewTitle').textContent = titles[view];
  if (view === 'library') loadLibrary().catch(error => notice(error.message));
  if (view === 'history') loadHistory().catch(error => notice(error.message));
  if (view === 'compute') loadCompute().catch(error => notice(error.message));
}
function route(view) { if (location.hash === `#${view}`) setView(view); else location.hash = view; }
function renderSource() {
  const columns = state.rows.length ? validateDataset(state.rows) : [];
  $('sourceTitle').textContent = state.sourceName;
  $('sourceName').textContent = state.sourceName;
  $('sourceDescription').textContent = `${state.rows.length} ${state.synthetic ? 'fictional ' : ''}records · held in this browser`;
  $('sourceCount').textContent = `${state.rows.length} records${state.synthetic ? ' · fictional' : ''}`;
  $('sourceFieldCount').textContent = `${columns.length} fields · browser-local`;
  datasetUI.render();
  $('sourceMessage').textContent = state.rows.length > 100 ? 'Showing the first 100 records. Operations include every loaded record.' : state.rows.length ? 'Dataset loaded. Review available operations and missing-field notes below.' : 'No source loaded. Choose a file or use the fictional example.';
  invalidate();
}
const datasetUI = setupDatasetUI({ getRows: () => state.rows, reveal, useRows: (rows, name) => {
  state.rows = rows; state.sourceName = `${state.sourceName} · ${name}`; renderSource(); notice('Active source updated to the derived rows. Reload the original file to restore it.');
} });
const retrievalUI = setupRetrievalUI({
  getCurrent: () => ({ name: state.sheets.length > 1 ? `${state.sourceName} · ${$('sourceSheet').selectedOptions[0]?.textContent || 'active view'}` : state.sourceName, rows: state.rows, kind: state.sourceKind, note: $('sourceImportNote').textContent }),
  canUseAI: () => Boolean(state.config?.prune), openDisclosure, reveal,
  cancelDisclosure: () => {
    if (state.pendingAI?.endpoint === 'retrieve-answer') { state.pendingAI = null; $('disclosureDialog').close(); }
  }
});
function clearWorkbook() {
  state.sourceEpoch++; state.sheets = []; $('sourceSheet').replaceChildren(); $('sheetControl').classList.add('hidden'); $('sourceImportNote').textContent = '';
}
function loadSample() {
  clearWorkbook();
  state.sourceKind = 'dataset';
  state.rows = sampleOrders($('asOf').value || businessDate()); state.synthetic = true; state.sourceName = 'Fictional example orders'; renderSource();
}
async function run() {
  if (state.intentBlocked) throw new Error('Review the instruction or edit explicit rules before running');
  const currentPlan = plan();
  const started = performance.now();
  const result = executeWorkflow(currentPlan, state.rows, $('asOf').value);
  const elapsed = performance.now() - started;
  state.result = result;
  $('resultSummary').textContent = result.summary;
  $('resultFacts').replaceChildren();
  for (const [value, label] of [[String(result.matchedRows), 'orders matched'], [formatMoney(result.outstandingPaise), 'outstanding'], ['0', 'AI calls this run'], ['$0', 'external model spend']]) {
    const el = node('div', '', value); el.append(node('span', '', label)); $('resultFacts').append(el);
  }
  $('draftList').replaceChildren();
  if (!result.drafts.length) { const empty = node('div', 'empty-state'); empty.append(node('h3', '', 'No orders match these rules'), node('p', '', 'Check the threshold, evaluation date and pending status.')); $('draftList').append(empty); }
  result.drafts.forEach((draft, i) => {
    const article = node('article', 'draft');
    const header = node('div', 'draft-header'); header.append(node('strong', '', draft.customer_name), node('span', '', `${draft.order_id} · ${draft.daysOverdue} days overdue · ${formatMoney(draft.amountPaise)}`));
    const label = node('label', 'sr-only', `Edit draft for ${draft.customer_name}`); label.htmlFor = `draft-${i}`;
    const input = node('textarea'); input.id = `draft-${i}`; input.value = draft.message; input.rows = 3;
    input.addEventListener('input', () => { draft.message = input.value; });
    article.append(header, label, input); $('draftList').append(article);
  });
  $('runTiming').textContent = `${elapsed.toFixed(1)} ms local execution · ${result.asOf} IST · nothing sent`;
  $('resultsPanel').classList.remove('hidden');
  $('readyLabel').textContent = 'Completed in your browser';
  for (const [i, id] of ['stepUnderstand', 'stepMinimize', 'stepExecute', 'stepReview'].entries()) {
    $(id).classList.add('complete'); reveal($(id).querySelector('.step-icon'), i * 45);
  }
  reveal($('resultsPanel'));
  $('resultsTitle').focus({ preventScroll: true });
  $('explainAI').disabled = !state.config?.prune;
  $('explainAI').title = state.config?.prune ? 'Preview the aggregate-only request before sending' : 'Prune is disabled or not configured in this workspace';
  const audit = { id: crypto.randomUUID(), plan: currentPlan, asOf: result.asOf, matchedRows: result.matchedRows,
    totalRows: result.totalRows, outstandingPaise: result.outstandingPaise, sourceDigest: await digest(normalizeOrders(state.rows)) };
  try { await api('/api/runs', { method: 'POST', body: JSON.stringify(audit) }); }
  catch (error) { if (error.name !== 'AbortError') notice(`Drafts are ready locally. Run history was not saved: ${error.message}`); }
}
function empty(container, title, copy) {
  const el = node('div', 'empty-state'); el.append(node('h2', '', title), node('p', '', copy)); container.replaceChildren(el);
}
async function loadLibrary() {
  const { items } = await api('/api/workflows');
  state.workflows = items; $('libraryCount').textContent = items.length;
  if (!items.length) return empty($('workflowList'), 'Start with a task worth repeating', 'Review the rules in the workbench, then save a workflow. Your customer records stay out of the library.');
  $('workflowList').replaceChildren();
  for (const item of items) {
    const el = node('article', 'library-item'); const copy = node('div');
    copy.append(node('h2', '', item.name), node('p', '', `Pending orders overdue by at least ${item.plan.minDaysOverdue} days · ${item.plan.language === 'hi' ? 'Hindi' : 'English'} drafts`), node('small', '', 'Uses the current browser source · no planning call'));
    const actions = node('div', 'list-actions');
    actions.append(button('Load rules', 'button subtle', () => { if (item.policyVersion !== POLICY_VERSION) throw new Error('This workflow needs policy review'); applyPlan(item.plan, 'Reused saved workflow · no planning call'); route('workbench'); notice('Saved rules loaded. Review the date and current source before generating drafts.'); }),
      button('Delete', 'text-button', async () => { await api(`/api/workflows/${item.id}`, { method: 'DELETE' }); await loadLibrary(); }));
    el.append(copy, actions); $('workflowList').append(el);
  }
}
async function loadHistory() {
  const { items } = await api('/api/history');
  if (!items.length) return empty($('historyList'), 'Your first run starts here', 'Generate order reminder drafts or approve an AI call. Its evidence will appear here.');
  $('historyList').replaceChildren();
  for (const item of items) {
    const el = node('article', 'history-item');
    el.append(node('h2', '', item.kind === 'workflow' ? `${item.matchedRows} orders · ${formatMoney(item.outstandingPaise)} outstanding` : `AI call · ${item.model || 'provider'}`),
      node('p', '', item.kind === 'workflow' ? `Browser CPU · 0 AI calls · source hash ${item.sourceDigest.slice(0, 12)}…` : 'Prune-routed call · actual returned metadata below'), node('small', '', new Date(item.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST'));
    const details = node('details'); details.append(node('summary', '', 'Inspect evidence'), node('pre', '', json(item))); el.append(details); $('historyList').append(el);
  }
}
async function loadCompute() {
  const [gpu, health] = await Promise.all([api('/api/gpu'), api('/api/health')]);
  $('computeDetails').replaceChildren();
  const data = [['Execution path', 'Browser CPU — dates, integer arithmetic, filtering and templates'], ['GPU device', gpu.available ? gpu.name : gpu.reason],
    ['GPU utilization', gpu.available ? `${gpu.utilizationPercent}% (telemetry snapshot)` : 'Unavailable'], ['GPU memory', gpu.available ? `${gpu.memoryUsedMiB} / ${gpu.memoryTotalMiB} MiB` : 'Unavailable'],
    ['CUDA task execution', 'Not implemented — telemetry only'], ['Persistence', health.database], ['Prune gateway', health.prune], ['Daily model call ceiling', `${state.config?.dailyCallLimit ?? 30} attempts per UTC day per account`],
    ['Source retention', 'Browser memory until reload, clear or sign-out'], ['Backend history', 'Up to 100 aggregate run events; workflow names and plans are stored']];
  for (const [term, value] of data) { const row = node('div', 'compute-row'); row.append(node('dt', '', term), node('dd', '', value)); $('computeDetails').append(row); }
}
function showAccount() {
  const local = state.config?.local;
  $('authDescription').textContent = local ? 'Local development mode. No account required. External AI calls are disabled.' : state.session ? 'You are signed in. Signing out clears source data and results from this browser.' : 'Sign in with your Supabase account to save workflows, store run evidence and approve AI calls.';
  $('authFields').classList.toggle('hidden', Boolean(local || state.session));
  $('logoutBtn').classList.toggle('hidden', Boolean(local || !state.session));
  $('accountDialog').showModal(); reveal($('accountDialog'));
}
function setSession(session) {
  if (state.session?.user?.id === session?.user?.id) { state.session = session; return; }
  state.generation++;
  for (const controller of state.controllers) controller.abort();
  state.session = session; state.workflows = []; state.pendingAI = null;
  $('libraryCount').textContent = '0'; $('historyList').replaceChildren(); $('workflowList').replaceChildren();
  state.rows = []; state.sourceName = 'No source loaded'; state.synthetic = false; renderSource();
  clearWorkbook();
  retrievalUI.clear();
  $('instruction').value = ''; $('draftList').replaceChildren(); $('aiExplanation').textContent = '';
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  $('identity').textContent = session?.user?.email || 'Workspace';
  $('modeLabel').textContent = state.config?.local ? 'Local mode · AI disabled' : session ? 'Signed in' : 'Not signed in';
}
function openDisclosure(endpoint, data, messages, reason, context = {}) {
  if (!state.config?.prune) throw new Error('Remote AI is disabled or not configured. Use local rules and templates.');
  if (!state.session) { showAccount(); return; }
  state.pendingAI = { endpoint, data: endpoint === 'compile' ? { instruction: messages[1].content } : data, messages, id: crypto.randomUUID(), ...context };
  $('outboundPayload').textContent = json(messages); $('disclosureReason').textContent = reason;
  $('approvePayload').checked = false; $('confirmDisclosure').disabled = true; $('disclosureMessage').textContent = '';
  $('disclosureDialog').showModal(); reveal($('disclosureDialog'));
}
async function refreshStatus() {
  try {
    const health = await api('/api/health');
    $('connectionLabel').textContent = health.local ? 'Local workspace' : 'Backend connected'; $('connectionDot').dataset.state = 'ready';
  } catch (error) { $('connectionLabel').textContent = 'Backend unavailable'; $('connectionDot').dataset.state = 'error'; throw error; }
}

on('understand', 'click', () => {
  $('intentMessage').replaceChildren();
  try { applyPlan(understandIntent($('instruction').value), 'Understood locally · review before running'); $('intentMessage').textContent = 'Rules ready. Check the threshold, draft language and evaluation date below.'; reveal($('rulesPanel')); }
  catch (error) {
    state.intentBlocked = true; invalidate();
    $('intentMessage').append(node('span', '', error.message + ' '));
    if (state.config?.prune) $('intentMessage').append(button('Preview AI interpretation', 'text-button', () => {
      const instruction = $('instruction').value;
      openDisclosure('compile', { instruction }, compilerMessages(instruction), 'Only this sanitized instruction and a fixed plan schema are shared. No source rows are sent. Review for private business facts the pattern filter may miss.');
    }));
  }
});
document.querySelectorAll('.example').forEach(el => el.addEventListener('click', () => { $('instruction').value = el.dataset.example; state.intentBlocked = true; invalidate(); $('instruction').focus(); }));
for (const id of ['days', 'language', 'asOf', 'includeSummary']) on(id, 'input', () => { state.intentBlocked = false; invalidate(); $('planOrigin').textContent = 'Edited locally · review before running'; });
on('instruction', 'input', () => { $('intentMessage').replaceChildren(); state.intentBlocked = true; invalidate(); });
on('runWorkflow', 'click', run);
on('openSource', 'click', () => route('sources'));
on('askCurrentSource', 'click', () => { $('ragAddCurrent').click(); route('retrieve'); });
on('newWorkflow', 'click', () => { $('instruction').value = ''; applyPlan({ version: 1, kind: 'overdue_reminders', minDaysOverdue: 5, language: 'hi', includeSummary: true }, 'Set directly · no model call'); route('workbench'); $('instruction').focus(); notice('New rules started. Your currently loaded source is unchanged.'); });
on('loadSample', 'click', () => { loadSample(); notice('Loaded six fictional records. Review the source, then return to the workbench.'); });
on('clearSource', 'click', () => { clearWorkbook(); state.rows = []; state.sourceName = 'No source loaded'; state.synthetic = false; $('sourceFile').value = ''; renderSource(); });
on('sourceFile', 'change', async e => {
  const file = e.target.files[0]; if (!file) return;
  clearWorkbook(); const epoch = state.sourceEpoch;
  $('sourceMessage').textContent = 'Reading the dataset in this browser…'; $('sourceFile').disabled = true;
  try {
    const result = await readDatasetFile(file);
    if (epoch !== state.sourceEpoch) return;
    state.sheets = result.sheets; const selected = result.sheets.findIndex(sheet => sheet.rows.length);
    $('sourceSheet').replaceChildren(...result.sheets.map((sheet, i) => { const option = node('option', '', sheet.error ? `${sheet.name} — ${sheet.error}` : sheet.name); option.value = String(i); option.disabled = Boolean(sheet.error); return option; }));
    $('sourceSheet').value = String(selected); $('sheetControl').classList.toggle('hidden', result.sheets.length < 2);
    $('sourceImportNote').textContent = result.note;
    state.rows = result.sheets[selected].rows; state.sourceKind = result.kind || 'dataset'; state.synthetic = false; state.sourceName = file.name; renderSource(); notice('Source loaded locally. Analyze its fields or use Ask your files to retrieve relevant excerpts.');
  } catch (error) { if (epoch !== state.sourceEpoch) return; state.rows = []; state.sourceName = 'Source rejected'; state.synthetic = false; renderSource(); throw error; }
  finally { $('sourceFile').value = ''; $('sourceFile').disabled = false; }
});
on('sourceSheet', 'change', () => {
  const sheet = state.sheets[Number($('sourceSheet').value)]; if (!sheet?.rows.length) throw new Error(sheet?.error || 'Choose a readable worksheet');
  state.rows = sheet.rows; renderSource(); notice(`Using worksheet “${sheet.name}”. Previous operation results have been cleared.`);
});
on('exportDrafts', 'click', () => {
  if (!state.result) return;
  const url = URL.createObjectURL(new Blob(['\uFEFF' + exportCSV(state.result.drafts)], { type: 'text/csv;charset=utf-8' }));
  const link = node('a'); link.href = url; link.download = `indicedge-drafts-${state.result.asOf}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
on('saveWorkflow', 'click', () => { plan(); if (!state.config?.local && !state.session) return showAccount(); $('saveMessage').textContent = ''; $('saveDialog').showModal(); reveal($('saveDialog')); });
on('saveForm', 'submit', async e => {
  e.preventDefault(); const submit = e.submitter; submit.disabled = true;
  try { await api('/api/workflows', { method: 'POST', body: JSON.stringify({ name: $('workflowName').value, plan: plan() }) }); $('saveDialog').close(); await loadLibrary(); notice('Workflow saved. Load it from Saved workflows to use the current source without replanning.'); }
  catch (error) { $('saveMessage').textContent = error.message; }
  finally { submit.disabled = false; }
});
on('refreshLibrary', 'click', loadLibrary); on('refreshHistory', 'click', loadHistory); on('refreshCompute', 'click', loadCompute); on('refreshStatus', 'click', refreshStatus);
on('accountButton', 'click', showAccount);
for (const close of document.querySelectorAll('.close-dialog')) close.addEventListener('click', () => close.closest('dialog').close());
on('approvePayload', 'change', () => { $('confirmDisclosure').disabled = !$('approvePayload').checked; });
on('confirmDisclosure', 'click', async () => {
  const pending = state.pendingAI;
  if (!pending || !$('approvePayload').checked) return;
  $('confirmDisclosure').disabled = true; $('disclosureMessage').textContent = 'Calling Prune once. No automatic retry…';
  try {
    const result = await api(`/api/${pending.endpoint}`, { method: 'POST', headers: { 'Idempotency-Key': pending.id },
      body: JSON.stringify({ ...pending.data, approvedDigest: await digest(pending.messages) }) });
    $('disclosureDialog').close();
    if (pending.endpoint === 'compile') { applyPlan(result.plan, 'Proposed by AI · validated · review before running'); $('intentMessage').textContent = 'AI proposed supported rules. Confirm they match your intended task.'; }
    else if (pending.endpoint === 'retrieve-answer') {
      if (!retrievalUI.applyAnswer(result, pending.ragVersion)) { notice('AI completed for a question or selection that has changed. Its answer was not displayed; check history for the receipt.'); return; }
    }
    else { $('aiExplanation').textContent = result.answer; $('aiExplanation').classList.remove('hidden'); reveal($('aiExplanation')); }
    notice(result.persistenceWarning || 'Prune call completed. Returned metadata is available in Run history.');
  } catch (error) { if (error.name !== 'AbortError') $('disclosureMessage').textContent = `${error.message} This request will not be retried automatically.`; }
});
on('explainAI', 'click', () => {
  if (!state.result) return;
  const facts = { matchedRows: state.result.matchedRows, outstandingPaise: state.result.outstandingPaise, minDaysOverdue: plan().minDaysOverdue, language: plan().language };
  openDisclosure('explain', { facts }, summaryMessages(facts), 'Only the aggregate order count, outstanding amount, threshold and requested language leave this browser. Names, contacts, order IDs, source rows and drafts are excluded. These totals may still be commercially sensitive.');
});
async function authenticate(signUp = false) {
  $('loginBtn').disabled = $('signupBtn').disabled = true;
  try {
    if (!state.auth) throw new Error('Authentication is not configured');
    const credentials = { email: $('email').value.trim(), password: $('password').value };
    if (!credentials.email || credentials.password.length < 6) throw new Error('Enter an email and a password of at least six characters');
    const { data, error } = await state.auth.auth[signUp ? 'signUp' : 'signInWithPassword'](credentials);
    if (error) throw error;
    if (data.session) { setSession(data.session); $('accountDialog').close(); await loadLibrary(); notice('Signed in. Load a source file or fictional records to begin.'); }
    else $('authMessage').textContent = 'Check your inbox for email confirmation, then sign in.';
  } catch (error) { $('authMessage').textContent = error.message; }
  finally { $('loginBtn').disabled = $('signupBtn').disabled = false; $('password').value = ''; }
}
on('authForm', 'submit', async e => { e.preventDefault(); await authenticate(); });
on('signupBtn', 'click', () => authenticate(true));
on('logoutBtn', 'click', async () => { const { error } = await state.auth.auth.signOut(); if (error) throw error; setSession(null); $('accountDialog').close(); notice('Signed out. Source records and customer drafts were cleared.'); });
window.addEventListener('hashchange', () => setView(location.hash.slice(1)));

async function initialize() {
  $('asOf').value = businessDate(); loadSample();
  $('policyPayload').textContent = json(disclosureFor(plan()));
  // Legacy browser-controlled API origins are deliberately ignored.
  localStorage.removeItem('indicedge_api');
  setView(location.hash.slice(1) || 'workbench');
  try {
    state.config = await api('/api/config');
    retrievalUI.refreshAI();
    $('modeLabel').textContent = state.config.local ? 'Local mode · AI disabled' : 'Not signed in';
    await refreshStatus();
    if (state.config.local) { await loadLibrary(); return; }
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.57.0?bundle');
    state.auth = createClient(state.config.supabaseUrl, state.config.supabaseAnonKey);
    const { data, error } = await state.auth.auth.getSession(); if (error) throw error;
    if (data.session) setSession(data.session);
    state.auth.auth.onAuthStateChange((event, session) => { if (['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED'].includes(event)) setSession(session); });
    if (state.session) await loadLibrary();
  } catch (error) { notice(`Workspace setup: ${error.message}. Local source parsing and deterministic drafts remain available.`); }
}
initialize();
