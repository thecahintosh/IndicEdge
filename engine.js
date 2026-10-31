import OpenAI from 'openai';
export const statusError = (status, message) => Object.assign(new Error(message), { status });
export const pruneConfigured = (env = process.env) => Boolean(env.PRUNE_API_KEY && env.PRUNE_MODEL);

export function createPrune(env = process.env) {
  let client;
  return async function callPrune(messages, runId, json = false, feature) {
    if (!pruneConfigured(env)) throw new Error('Prune is not configured');
    client ??= new OpenAI({ apiKey: env.PRUNE_API_KEY, baseURL: 'https://api.withprune.com/v1', timeout: 25000, maxRetries: 0 });
    const start = performance.now();
    const response = await client.chat.completions.create({
      model: env.PRUNE_MODEL, messages, max_tokens: 500,
      ...(json ? { response_format: { type: 'json_object' } } : {})
    }, { headers: {
      'X-Prune-Run-Id': runId,
      'X-Prune-Run-Budget-Usd': env.PRUNE_RUN_BUDGET_USD || '0.02',
      'X-Prune-Feature-Id': feature || (json ? 'intent-compiler' : 'workflow-explanation')
    } });
    const answer = response.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) throw new Error('No model text returned');
    return { answer, model: response.model || env.PRUNE_MODEL, metadata: response.prune_metadata ?? null,
      usage: response.usage ?? null, latencyMs: Math.round(performance.now() - start) };
  };
}

export async function admittedCall(store, owner, id, fingerprint, operation, limit = 30, now = new Date()) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? '')) throw statusError(400, 'A UUID Idempotency-Key is required');
  const day = now.toISOString().slice(0, 10);
  const cached = await store.mutate(owner, state => {
    // Keep unknown outcomes until explicitly reconciled; expire finished replay
    // payloads after seven days and stop growth at a hard ceiling.
    for (const [key, request] of Object.entries(state.requests)) {
      if (request.status !== 'pending' && now - new Date(request.startedAt) > 7 * 86400000) delete state.requests[key];
    }
    for (const key of Object.keys(state.daily)) if (key < new Date(now - 8 * 86400000).toISOString().slice(0, 10)) delete state.daily[key];
    const prior = state.requests[id];
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw statusError(409, 'Request key belongs to a different operation');
      if (prior.status === 'completed') return prior.result;
      throw statusError(409, 'This call already started. Check history; do not automatically retry.');
    }
    if (Object.values(state.requests).some(r => r.status === 'pending')) throw statusError(409, 'An AI call is pending or has an unknown outcome. Check its receipt before another call.');
    if (Object.keys(state.requests).length >= 1000) throw statusError(429, 'AI request ledger is full. Local workflows remain available.');
    if ((state.daily[day] ?? 0) >= limit) throw statusError(429, 'Daily AI call limit reached. Local workflows remain available.');
    state.daily[day] = (state.daily[day] ?? 0) + 1;
    state.requests[id] = { status: 'pending', fingerprint, startedAt: now.toISOString() };
    return null;
  });
  if (cached) return { ...cached, replayed: true };
  let result;
  try { result = await operation(); }
  catch {
    await store.mutate(owner, state => { state.requests[id].status = 'failed'; }).catch(() => {});
    throw statusError(502, 'Prune call failed. No automatic retry was made; check Prune for any charges.');
  }
  try {
    await store.mutate(owner, state => {
      state.requests[id] = { ...state.requests[id], status: 'completed', result };
      state.history.unshift({ id, kind: 'ai', at: new Date().toISOString(), model: result.model,
        metadata: result.metadata, usage: result.usage, latencyMs: result.latencyMs });
      state.history = state.history.slice(0, 100);
    });
  } catch {
    return { ...result, persistenceWarning: 'AI completed, but the receipt could not be saved. Do not repeat this billable call.' };
  }
  return result;
}
