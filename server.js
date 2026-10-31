
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import {
  initializeDatabase,
  checkDatabase,
  saveRun,
  getHistory,
  closeDatabase
} from "./db.js";

import { askPrune, pruneConfigured } from "./engine.js";
import { getGPUStatus } from "./gpu.js";

const app = express();
const PORT = Number(process.env.PORT || 8000);
const root = path.dirname(fileURLToPath(import.meta.url));

for (const name of [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY"
]) {
  if (!process.env[name]) {
    throw new Error(`${name} is missing`);
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

const allowedOrigins = (
  process.env.FRONTEND_ORIGINS || "http://localhost:8000"
).split(",").map(value => value.trim());

app.disable("x-powered-by");

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error("Origin not allowed"));
  }
}));

app.use(express.json({ limit: "32kb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  next();
});

// Explicit frontend routes with correct MIME types

app.get(["/", "/index.html"], (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.sendFile(path.join(root, "index.html"));
});

app.get("/style.css", (req, res) => {
  res.setHeader("Content-Type", "text/css; charset=utf-8");
  res.sendFile(path.join(root, "style.css"));
});

app.get("/app.js", (req, res) => {
  res.setHeader(
    "Content-Type",
    "text/javascript; charset=utf-8"
  );
  res.sendFile(path.join(root, "app.js"));
});

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Authentication required"
    });
  }

  try {
    const token = header.slice(7);
    const { data, error } =
      await supabase.auth.getUser(token);

    if (error || !data?.user?.id) {
      return res.status(401).json({
        error: "Invalid or expired session"
      });
    }

    req.user = data.user;
    next();
  } catch {
    return res.status(503).json({
      error: "Authentication service unavailable"
    });
  }
}

app.get("/api/config", (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    appName: "IndicEdge"
  });
});

app.get("/api/health", async (req, res) => {
  let database = false;

  try {
    database = await checkDatabase();
  } catch {
    database = false;
  }

  res.status(database ? 200 : 503).json({
    api: "online",
    database: database ? "connected" : "unavailable",
    prune: pruneConfigured() ? "configured" : "missing",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/gpu", requireAuth, async (req, res) => {
  res.json(await getGPUStatus());
});

app.get("/api/history", requireAuth, async (req, res) => {
  try {
    const items = await getHistory(req.user.id);
    res.json({ items });
  } catch {
    res.status(500).json({
      error: "Could not load history"
    });
  }
});

const activeUsers = new Set();

app.post("/api/ask", requireAuth, async (req, res) => {
  const prompt = req.body?.prompt;

  if (
    typeof prompt !== "string" ||
    prompt.trim().length < 1 ||
    prompt.length > 4000
  ) {
    return res.status(400).json({
      error: "Prompt must contain 1 to 4000 characters"
    });
  }

  if (!pruneConfigured()) {
    return res.status(503).json({
      error: "WithPrune is not configured"
    });
  }

  const userId = req.user.id;

  if (activeUsers.has(userId)) {
    return res.status(429).json({
      error: "Another request is still running"
    });
  }

  activeUsers.add(userId);

  try {
    const result = await askPrune(prompt.trim());

    const saved = await saveRun({
      userId,
      prompt: prompt.trim(),
      answer: result.answer,
      model: result.model,
      metadata: {
        prune: result.metadata,
        usage: result.usage,
        latencyMs: result.latencyMs
      }
    });

    res.json({
      id: saved.id,
      ...result
    });
  } catch (error) {
    console.error("LLM request failed:", error.message);

    res.status(502).json({
      error: "LLM request failed. Check backend logs."
    });
  } finally {
    activeUsers.delete(userId);
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: "Not found"
  });
});

app.use((error, req, res, next) => {
  console.error("Server error:", error.message);

  res.status(500).json({
    error: "Internal server error"
  });
});

await initializeDatabase();

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`IndicEdge listening on port ${PORT}`);
});

async function shutdown() {
  server.close();
  await closeDatabase();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
