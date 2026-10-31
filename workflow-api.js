import { randomUUID } from 'node:crypto';
import { validatePlan, compilerMessages, summaryMessages, POLICY_VERSION, isoDay } from './workflow.js';
import { admittedCall, pruneConfigured, statusError } from './engine.js';

export function mountWorkflows(app, { store, callPrune, env, fingerprint }) {
  app.get('/api/workflows', async (req, res) => res.json({ items: (await store.read(req.owner)).workflows }));
  app.post('/api/workflows', async (req, res) => {
    const plan = validatePlan(req.body?.plan);
    const name = req.body?.name;
    if (typeof name !== 'string' || !name.trim() || name.length > 80 || /[\u0000-\u001f]/.test(name)) throw statusError(400, 'Workflow name must be 1–80 characters');
    const item = { id: randomUUID(), name: name.trim(), plan, policyVersion: POLICY_VERSION, createdAt: new Date().toISOString() };
    await store.mutate(req.owner, state => {
      if (state.workflows.length >= 50) throw statusError(409, 'Workflow library is full; delete a workflow before saving another');
      state.workflows.push(item);
    });
    res.status(201).json(item);
  });
  app.delete('/api/workflows/:id', async (req, res) => {
    await store.mutate(req.owner, state => {
      if (!state.workflows.some(w => w.id === req.params.id)) throw statusError(404, 'Workflow not found');
      state.workflows = state.workflows.filter(w => w.id !== req.params.id);
    });
    res.json({ deleted: true });
  });
  for (const [endpoint, buildMessages] of [['compile', body => compilerMessages(body.instruction)], ['explain', body => summaryMessages(body.facts)]]) {
    app.post(`/api/${endpoint}`, async (req, res) => {
      if (env.LOCAL_MODE === 'true' || !pruneConfigured(env)) throw statusError(503, 'Remote AI is disabled. Use the local rules and templates.');
      const messages = buildMessages(req.body || {});
      if (req.body.approvedDigest !== fingerprint(messages)) throw statusError(409, 'Approve the exact outbound payload before calling AI');
      const id = req.get('Idempotency-Key');
      const result = await admittedCall(store, req.owner, id, fingerprint({ endpoint, messages }), async () => {
        const response = await callPrune(messages, id, endpoint === 'compile');
        return response;
      }, Number(env.MAX_DAILY_CALLS || 30));
      if (endpoint === 'compile') {
        try { result.plan = validatePlan(JSON.parse(result.answer)); }
        catch { return res.status(422).json({ error: 'AI proposed an unsupported plan. Set the rules manually; this model call may have been charged.', metadata: result.metadata, usage: result.usage }); }
        delete result.answer;
      }
      res.json(result);
    });
  }
  app.post('/api/runs', async (req, res) => {
    const { plan, asOf, matchedRows, totalRows, outstandingPaise, sourceDigest, id } = req.body || {};
    validatePlan(plan);
    isoDay(asOf);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf ?? '') || !/^[0-9a-f]{64}$/.test(sourceDigest ?? '') || !/^[0-9a-f-]{36}$/i.test(id ?? '') ||
        !Number.isInteger(matchedRows) || matchedRows < 0 || !Number.isInteger(totalRows) || totalRows < matchedRows || totalRows > 2000 ||
        !Number.isSafeInteger(outstandingPaise) || outstandingPaise < 0) throw statusError(400, 'Invalid run audit record');
    const record = { id, kind: 'workflow', at: new Date().toISOString(), plan: validatePlan(plan), asOf,
      matchedRows, totalRows, outstandingPaise, sourceDigest, modelCalls: 0, externalModelCostUsd: 0, policyVersion: POLICY_VERSION,
      evidence: 'client-reported local execution; not independently attested' };
    await store.mutate(req.owner, state => {
      const prior = state.history.find(row => row.id === id);
      if (prior && fingerprint({ ...prior, at: '' }) !== fingerprint({ ...record, at: '' })) throw statusError(409, 'Run ID already belongs to another result');
      if (!prior) state.history.unshift(record);
      state.history = state.history.slice(0, 100);
    });
    res.status(201).json(record);
  });
}
