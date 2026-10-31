
const $ = (id) => document.getElementById(id);

let supabase = null;
let currentSession = null;
let apiBase = "";

function message(id, value) {
  $(id).textContent = value;
}

function setAuthBusy(busy) {
  $("loginBtn").disabled = busy;
  $("signupBtn").disabled = busy;
}

async function loadSupabase() {
  const sources = [
    "https://esm.sh/@supabase/supabase-js@2.57.0?bundle",
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm"
  ];

  let lastError;

  for (const source of sources) {
    try {
      const library = await import(source);

      if (typeof library.createClient === "function") {
        return library.createClient;
      }
    } catch (error) {
      lastError = error;
      console.error("Supabase SDK load failed:", error);
    }
  }

  throw new Error(
    "Could not load Supabase JavaScript. " +
    "Check your internet connection and browser console. " +
    (lastError?.message || "")
  );
}

async function api(path, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (currentSession?.access_token) {
    headers.Authorization =
      `Bearer ${currentSession.access_token}`;
  }

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(apiBase + path, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

function setView(view) {
  const views = ["overview", "assistant", "history"];

  for (const item of views) {
    $(`${item}View`).classList.toggle(
      "hidden",
      item !== view
    );
  }

  document.querySelectorAll(".nav").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.view === view
    );
  });

  const titles = {
    overview: "Overview",
    assistant: "AI Workspace",
    history: "Execution History"
  };

  $("pageTitle").textContent = titles[view];

  if (view === "overview") refreshHealth();
  if (view === "history") refreshHistory();
}

async function refreshHealth() {
  try {
    const health = await api("/api/health");

    $("apiStatus").textContent = health.api;
    $("dbStatus").textContent = health.database;
    $("pruneStatus").textContent = health.prune;

    $("systemBadge").textContent =
      health.database === "connected"
        ? "Backend online"
        : "Database unavailable";
  } catch (error) {
    console.error("Health check failed:", error);

    $("apiStatus").textContent = "Offline";
    $("dbStatus").textContent = "Unknown";
    $("pruneStatus").textContent = "Unknown";
    $("systemBadge").textContent = "Disconnected";
  }

  if (!currentSession) return;

  try {
    const gpu = await api("/api/gpu");

    $("gpuStatus").textContent = gpu.available
      ? `${gpu.utilizationPercent}%`
      : "Unavailable";
  } catch {
    $("gpuStatus").textContent = "Unknown";
  }
}

function enterApp(session) {
  currentSession = session;

  $("authScreen").classList.add("hidden");
  $("appScreen").classList.remove("hidden");

  $("userEmail").textContent =
    session.user?.email || "Signed in";

  message("authMessage", "");
  setView("overview");
}

function leaveApp() {
  currentSession = null;

  $("appScreen").classList.add("hidden");
  $("authScreen").classList.remove("hidden");

  $("resultPanel").classList.add("hidden");
}

function credentials() {
  const email = $("email").value.trim();
  const password = $("password").value;

  if (!email || !password) {
    throw new Error("Enter your email and password.");
  }

  if (password.length < 6) {
    throw new Error(
      "Password must be at least 6 characters."
    );
  }

  return { email, password };
}

async function signUp() {
  setAuthBusy(true);
  message("authMessage", "Creating your account...");

  try {
    if (!supabase) {
      throw new Error(
        "Supabase is not initialized. See the message above."
      );
    }

    const { email, password } = credentials();

    const { data, error } =
      await supabase.auth.signUp({
        email,
        password
      });

    if (error) throw error;

    if (data.session) {
      enterApp(data.session);
      return;
    }

    message(
      "authMessage",
      "Signup request completed. If email confirmation " +
      "is enabled, check your inbox and verify your email. " +
      "Then sign in."
    );
  } catch (error) {
    console.error("Signup error:", error);
    message("authMessage", error.message);
  } finally {
    setAuthBusy(false);
  }
}

async function signIn() {
  setAuthBusy(true);
  message("authMessage", "Signing in...");

  try {
    if (!supabase) {
      throw new Error("Supabase is not initialized.");
    }

    const { email, password } = credentials();

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,
        password
      });

    if (error) throw error;

    if (!data.session) {
      throw new Error(
        "No session received. Check email confirmation."
      );
    }

    enterApp(data.session);
  } catch (error) {
    console.error("Sign-in error:", error);
    message("authMessage", error.message);
  } finally {
    setAuthBusy(false);
  }
}

async function sendPrompt() {
  const prompt = $("promptInput").value.trim();

  if (!prompt) {
    message("requestMessage", "Enter a request first.");
    return;
  }

  $("sendBtn").disabled = true;
  $("sendBtn").textContent = "Processing...";
  message("requestMessage", "Contacting WithPrune...");

  try {
    const result = await api("/api/ask", {
      method: "POST",
      body: JSON.stringify({ prompt })
    });

    $("answerOutput").textContent = result.answer;
    $("modelOutput").textContent = result.model;
    $("latencyOutput").textContent =
      `${result.latencyMs} ms`;

    $("receiptOutput").textContent =
      result.metadata
        ? JSON.stringify(result.metadata, null, 2)
        : "No prune_metadata returned.";

    $("resultPanel").classList.remove("hidden");

    message(
      "requestMessage",
      "Request completed and saved."
    );
  } catch (error) {
    console.error("LLM request error:", error);
    message("requestMessage", error.message);
  } finally {
    $("sendBtn").disabled = false;
    $("sendBtn").textContent = "Execute request";
  }
}

async function refreshHistory() {
  $("historyList").textContent = "Loading...";

  try {
    const { items } = await api("/api/history");

    $("historyList").replaceChildren();

    if (!items.length) {
      $("historyList").textContent =
        "No requests saved yet.";
      return;
    }

    for (const item of items) {
      const wrapper = document.createElement("div");
      wrapper.className = "history-item";

      const title = document.createElement("h4");
      title.textContent = item.prompt;

      const answer = document.createElement("p");
      answer.textContent = item.answer;

      const detail = document.createElement("small");
      detail.textContent =
        `${new Date(item.createdAt).toLocaleString()} · ` +
        item.model;

      wrapper.append(title, answer, detail);
      $("historyList").appendChild(wrapper);
    }
  } catch (error) {
    console.error("History error:", error);
    $("historyList").textContent = error.message;
  }
}

async function initialize() {
  message(
    "authMessage",
    "Connecting to IndicEdge..."
  );

  try {
    apiBase = (
      localStorage.getItem("indicedge_api") || ""
    ).replace(/\/$/, "");

    const response = await fetch(
      apiBase + "/api/config"
    );

    if (!response.ok) {
      throw new Error(
        `Backend configuration failed: HTTP ${response.status}`
      );
    }

    const config = await response.json();

    if (
      !config.supabaseUrl ||
      !config.supabaseAnonKey
    ) {
      throw new Error(
        "Backend returned incomplete Supabase configuration."
      );
    }

    const createClient = await loadSupabase();

    supabase = createClient(
      config.supabaseUrl,
      config.supabaseAnonKey
    );

    const { data, error } =
      await supabase.auth.getSession();

    if (error) throw error;

    if (data.session) {
      enterApp(data.session);
    } else {
      message(
        "authMessage",
        "Connected. Sign in or create an account."
      );
    }

    supabase.auth.onAuthStateChange(
      (event, session) => {
        currentSession = session;

        if (event === "SIGNED_OUT") {
          leaveApp();
        } else if (
          event === "SIGNED_IN" &&
          session
        ) {
          enterApp(session);
        }
      }
    );

  } catch (error) {
    console.error("Initialization error:", error);

    message(
      "authMessage",
      `Initialization failed: ${error.message}`
    );
  }
}

$("loginBtn").addEventListener("click", signIn);
$("signupBtn").addEventListener("click", signUp);

$("logoutBtn").addEventListener(
  "click",
  async () => {
    if (supabase) await supabase.auth.signOut();
    leaveApp();
  }
);

$("sendBtn").addEventListener("click", sendPrompt);

$("refreshHistory").addEventListener(
  "click",
  refreshHistory
);

$("promptInput").addEventListener(
  "input",
  (event) => {
    $("characterCount").textContent =
      `${event.target.value.length} / 4000`;
  }
);

document.querySelectorAll(".nav").forEach((button) => {
  button.addEventListener(
    "click",
    () => setView(button.dataset.view)
  );
});

initialize();
