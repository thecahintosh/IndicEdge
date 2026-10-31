import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';

export const emptyState = () => ({ workflows: [], requests: {}, history: [], daily: {} });

// Single-process, localhost-only persistence. Cloud uses PostgreSQL row locks.
export function localStore(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'state.json');
  let state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  return {
    async mutate(owner, operation) {
      const next = structuredClone(state);
      const value = operation(next[owner] ??= emptyState());
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(next), { mode: 0o600 });
      fs.renameSync(`${file}.tmp`, file);
      state = next;
      return value;
    },
    async read(owner) { return structuredClone(state[owner] ?? emptyState()); },
    async health() { return true; },
    async close() {}
  };
}

export async function postgresStore(url) {
  const client = postgres(url, { prepare: false, max: 5, connect_timeout: 10, idle_timeout: 20 });
  const db = drizzle(client);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS public.indicedge_state (
    user_id UUID PRIMARY KEY, state JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.execute(sql`ALTER TABLE public.indicedge_state ENABLE ROW LEVEL SECURITY`);
  await db.execute(sql`REVOKE ALL ON public.indicedge_state FROM anon, authenticated`);
  return {
    async mutate(owner, operation) {
      return client.begin(async tx => {
        // Drizzle configures postgres-js JSON serializers as transparent. Encode
        // explicitly here because these locked transactions use the raw client.
        await tx`INSERT INTO public.indicedge_state (user_id, state) VALUES (${owner}, ${JSON.stringify(emptyState())}::jsonb) ON CONFLICT DO NOTHING`;
        const [row] = await tx`SELECT state FROM public.indicedge_state WHERE user_id = ${owner} FOR UPDATE`;
        const result = operation(row.state);
        await tx`UPDATE public.indicedge_state SET state = ${JSON.stringify(row.state)}::jsonb, updated_at = NOW() WHERE user_id = ${owner}`;
        return result;
      });
    },
    async read(owner) {
      const [row] = await client`SELECT state FROM public.indicedge_state WHERE user_id = ${owner}`;
      return row?.state ?? emptyState();
    },
    async health() { await client`SELECT 1`; return true; },
    async close() { await client.end(); }
  };
}
