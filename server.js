import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStore, postgresStore } from './db.js';
import { createPrune, pruneConfigured, admittedCall, statusError } from './engine.js';
import { getGPUStatus } from './gpu.js';
import { mountWorkflows as workflowRoutes } from './workflow-api.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const localOwner = '00000000-0000-4000-8000-000000000001';
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function createApp({ store, authenticate, callPrune, env = process.env, gpu = getGPUStatus, mountWorkflows } = {}) {
  const app = express();
  const local = env.LOCAL_MODE === 'true';
  const origins = (env.FRONTEND_ORIGINS || 'http://localhost:8000,http://127.0.0.1:8000').split(',').map(s => s.trim());
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' https://esm.sh https://cdn.jsdelivr.net; style-src 'self'; font-src 'self'; connect-src 'self' https://*.supabase.co; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" });
    if (local && !['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname)) return res.status(403).json({ error: 'Local mode accepts only localhost requests' });
    if (req.headers.origin && !origins.includes(req.headers.origin)) return res.status(403).json({ error: 'Origin is not allowed' });
    next();
  });
  app.use(cors({ origin: origins }));
  app.use(express.json({ limit: '1mb' }));
  for (const file of ['index.html', 'style.css', 'app.js', 'workflow.js', 'source.js', 'dataset.js', 'dataset-ui.js', 'source-loader.js']) {
    app.get(file === 'index.html' ? ['/', '/index.html'] : `/${file}`, (req, res) => res.sendFile(path.join(root, file)));
  }
  app.use('/assets', express.static(path.join(root, 'assets'), { dotfiles: 'deny' }));
  app.get('/api/config', (req, res) => res.json({ local, appName: 'IndicEdge',
    supabaseUrl: local ? null : env.SUPABASE_URL, supabaseAnonKey: local ? null : env.SUPABASE_ANON_KEY,
    prune: !local && pruneConfigured(env), dailyCallLimit: Number(env.MAX_DAILY_CALLS || 30) }));
  app.get('/api/health', async (req, res) => {
    let connected = false;
    try { connected = await store.health(); } catch {}
    res.status(connected ? 200 : 503).json({ api: 'online', database: connected ? (local ? 'local file' : 'connected') : 'unavailable',
      prune: local ? 'disabled in local mode' : pruneConfigured(env) ? 'configured' : 'missing', local });
  });
  app.use('/api', async (req, res, next) => {
    try {
      req.owner = local ? localOwner : await authenticate(req.headers.authorization);
      if (!req.owner) throw statusError(401, 'Sign in to access your workspace');
      next();
    } catch (error) { next(error.status ? error : statusError(503, 'Authentication service unavailable')); }
  });
  app.get('/api/gpu', async (req, res) => res.json({ ...(await gpu()), acceleratedWorkload: false }));
  app.get('/api/history', async (req, res) => res.json({ items: (await store.read(req.owner)).history }));
  app.post('/api/ask', async (req, res) => {
    const prompt = req.body?.prompt;
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) throw statusError(400, 'Prompt must contain 1–4000 characters');
    if (local || !pruneConfigured(env)) throw statusError(503, 'Prune is not available in this mode');
    const result = await admittedCall(store, req.owner, req.get('Idempotency-Key'), fingerprint({ prompt }),
      () => callPrune([{ role: 'system', content: 'Answer concisely. Do not claim external actions or file access.' }, { role: 'user', content: prompt }], req.get('Idempotency-Key')),
      Number(env.MAX_DAILY_CALLS || 30));
    res.json(result);
  });
  mountWorkflows?.(app, { store, callPrune, env, fingerprint });
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, req, res, next) => {
    const status = error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : error.status || 500;
    res.status(status).json({ error: status === 500 ? 'Request could not be completed. Check configuration and try again.' :
      status === 400 && error.type ? 'Request body is not valid JSON' : status === 413 ? 'File is too large; use at most 1 MB' : error.message });
  });
  return app;
}

export async function start(env = process.env) {
  const dailyLimit = Number(env.MAX_DAILY_CALLS || 30);
  const runBudget = Number(env.PRUNE_RUN_BUDGET_USD || '0.02');
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 1000) throw new Error('MAX_DAILY_CALLS must be an integer in 1–1000');
  if (!Number.isFinite(runBudget) || runBudget <= 0 || runBudget > 10) throw new Error('PRUNE_RUN_BUDGET_USD must be a positive amount up to 10 USD');
  const local = env.LOCAL_MODE === 'true';
  const host = env.HOST || (local ? '127.0.0.1' : '0.0.0.0');
  if (local && !['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('LOCAL_MODE must bind to localhost');
  if (!local) for (const key of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']) if (!env[key]) throw new Error(`${key} is required; use LOCAL_MODE=true for an explicit local demo`);
  const store = local ? localStore(path.resolve(root, env.DATA_DIR || '.data')) : await postgresStore(env.DATABASE_URL);
  const auth = local ? null : createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const authenticate = async header => {
    if (!header?.startsWith('Bearer ')) throw statusError(401, 'Authentication required');
    const { data, error } = await auth.auth.getUser(header.slice(7));
    if (error || !data?.user?.id) throw statusError(401, 'Invalid or expired session');
    return data.user.id;
  };
  const app = createApp({ store, authenticate, callPrune: createPrune(env), env, mountWorkflows: workflowRoutes });
  const server = app.listen(Number(env.PORT || 8000), host, () => console.log(`IndicEdge: http://${host}:${env.PORT || 8000} (${local ? 'local, AI disabled' : 'authenticated'})`));
  async function shutdown() { server.close(async () => { await store.close(); process.exit(0); }); }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await start();
