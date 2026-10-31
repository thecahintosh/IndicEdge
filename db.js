
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb
} from "drizzle-orm/pg-core";
import { desc, eq, sql } from "drizzle-orm";

export const runs = pgTable("indicedge_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  prompt: text("prompt").notNull(),
  answer: text("answer").notNull(),
  model: text("model").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", {
    withTimezone: true
  }).defaultNow().notNull()
});

let client;
let db;

export function getDB() {
  if (!db) throw new Error("Database not initialized");
  return db;
}

export async function initializeDatabase() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  client = postgres(url, {
    prepare: false,
    max: 5,
    connect_timeout: 10,
    idle_timeout: 20
  });

  db = drizzle(client);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.indicedge_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      prompt TEXT NOT NULL,
      answer TEXT NOT NULL,
      model TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS
    indicedge_runs_user_created_idx
    ON public.indicedge_runs (user_id, created_at DESC)
  `);

  await db.execute(sql`
    ALTER TABLE public.indicedge_runs
    ENABLE ROW LEVEL SECURITY
  `);

  return true;
}

export async function checkDatabase() {
  await getDB().execute(sql`SELECT 1`);
  return true;
}

export async function saveRun(data) {
  const [saved] = await getDB()
    .insert(runs)
    .values(data)
    .returning();

  return saved;
}

export async function getHistory(userId) {
  return getDB()
    .select()
    .from(runs)
    .where(eq(runs.userId, userId))
    .orderBy(desc(runs.createdAt))
    .limit(30);
}

export async function closeDatabase() {
  if (client) await client.end();
}
