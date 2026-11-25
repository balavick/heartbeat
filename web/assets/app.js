(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LABEL = { ok: "Healthy", learning: "Learning", late: "Late", degraded: "Low volume", down: "Silent", failing: "Failing" };
const WHY = {
  ok: "Runs are arriving on their usual rhythm.",
  learning: "It needs at least 5 runs before it can judge what normal looks like.",
  late: "The last run is later than its usual gap. It may just be slow.",
  degraded: "Runs still arrive, but at under half the usual daily volume.",
  down: "No run has arrived for far longer than usual. Check the trigger, schedule or server.",
  failing: "The latest run reported an error."
};
const TONE = { ok: "ok", learning: "idle", late: "warn", degraded: "warn", down: "bad", failing: "bad" };
const ORDER = { failing: 0, down: 1, late: 2, degraded: 3, learning: 4, ok: 5 };
const S = { mode: "loading", list: [], q: "", f: "all", runs: {}, token: null, revealed: false, loginErr: "", err: false };
let demo = null;

const ago = t => { if (!t) return "never"; const s = Date.now() / 1000 - t; return s < 90 ? "just now" : s < 5400 ? Math.round(s / 60) + " min ago" : s < 172800 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " d ago"; };
const dur = s => s == null ? "n/a" : s < 5400 ? Math.max(1, Math.round(s / 60)) + " min" : s < 172800 ? (s / 3600).toFixed(1) + " h" : Math.round(s / 86400) + " d";
const badge = s => `<span class="badge ${TONE[s]}">${LABEL[s]}</span>`;
const spark = a => { const m = Math.max(1, ...a); return `<svg class="spark" viewBox="0 0 96 24" aria-hidden="true"><polyline points="${a.map((v, i) => `${(i * 96 / 23).toFixed(1)},${(22 - v / m * 20).toFixed(1)}`).join(" ")}"/></svg>`; };
const snippet = slug => `curl -X POST ${location.origin}/ping/${slug} \\\n  -H "X-Heartbeat-Token: ${S.token || "YOUR_INGEST_TOKEN"}" \\\n  -H "Content-Type: application/json" -d '{"ok": true}'`;
const copyBtn = (text, label = "Copy") => `<button class="btn" data-act="copy" data-text="${esc(text)}">${label}</button>`;

function seedDemo() {
  const now = Date.now() / 1000, step = 1200, d = {};
  const gen = (slug, keep) => { d[slug] = []; for (let i = 8 * 72; i >= 0; i--) { const t = now - i * step; if (keep(t, i)) d[slug].push({ t, ok: true, d: Math.round(300 + Math.random() * 500) }); } };
  gen("nightly-backup", () => true);
  gen("invoice-webhook", t => t <= now - 3 * 3600);
  gen("lead-sync", (t, i) => t <= now - DAY || i % 3 === 0);
  gen("crm-export", () => true);
  Object.assign(d["crm-export"].at(-1), { ok: false, note: "401 Unauthorized: token expired" });
  return d;
}
function useDemo() {
  S.mode = "demo"; demo = demo || seedDemo();
  const now = Date.now() / 1000;
  S.list = Object.entries(demo).map(([slug, r]) => { const ts = r.map(x => x.t); return { slug, ...evaluate(ts, now, r.at(-1).ok), last_seen: ts.at(-1), spark: hourly(ts, now) }; });
}
async function api(path, opt) {
  const r = await fetch(path, { credentials: "same-origin", ...opt });
  return { status: r.status, ok: r.ok, url: r.url, json: (r.headers.get("content-type") || "").includes("json") ? await r.json() : null };
}
async function refresh() {
  try {
    const r = await api("/api/monitors");
    if (r.json && r.status === 200) { S.mode = "live"; S.list = r.json; S.err = false; }
    else if (r.json && r.status === 401) S.mode = "login";
    else useDemo();
  } catch { if (S.mode === "live") S.err = true; else useDemo(); }
  render();
}
async function onRoute() {
  const [r, arg] = route();
  if (S.mode === "live" && r === "d") { const x = await api("/api/monitors/" + encodeURIComponent(arg)).catch(() => null); if (x?.json?.runs) S.runs[arg] = x.json.runs.map(p => { let n = {}; try { n = JSON.parse(p.payload); } catch {} return { t: p.ts, ok: !!p.ok, d: p.duration_ms, note: n.error || n.note }; }); }
  if (S.mode === "live" && r === "s" && !S.token) { const x = await api("/api/settings").catch(() => null); S.token = x?.json?.ingest_token || null; }
  render();
}
const route = () => { const h = location.hash.slice(1) || "/"; return h.startsWith("/m/") ? ["d", decodeURIComponent(h.slice(3))] : h === "/settings" ? ["s"] : ["o"]; };

const shell = (c, r) => `<div class="shell"><aside class="side"><div class="brand"><svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><path d="M3 17h7l3-8 5 14 3-6h8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Heartbeat</div>
<nav aria-label="Main"><a href="#/" ${r === "o" || r === "d" ? 'aria-current="page"' : ""}>Overview</a><a href="#/settings" ${r === "s" ? 'aria-current="page"' : ""}>Settings</a></nav>
<p class="mode">${S.mode === "demo" ? "Demo mode: simulated data running in your browser." : "Connected to your Heartbeat server."}</p></aside>
<main>${S.err ? '<div class="banner" role="alert">Cannot reach the server. Showing the last data received.</div>' : ""}${c}</main></div><div id="toast" role="status" aria-live="polite"></div>`;

function rows() {
  const q = S.q.toLowerCase(), attn = m => ORDER[m.state] < 4;
  const v = S.list.filter(m => (S.f === "all" || (S.f === "attn") === attn(m)) && m.slug.toLowerCase().includes(q)).sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.slug.localeCompare(b.slug));
  if (!v.length) return `<tr><td colspan="5" class="muted">No workflows match this filter.</td></tr>`;
  return v.map(m => `<tr><td><a href="#/m/${encodeURIComponent(m.slug)}">${esc(m.slug)}</a></td><td>${badge(m.state)}</td><td class="num hide-sm">${ago(m.last_seen)}</td>
<td class="num hide-md">${m.runs_24h} <span class="muted">of ${Math.round(m.baseline_24h)} usual</span></td><td class="hide-md">${spark(m.spark)}</td></tr>`).join("");
}
function overview() {
  const L = S.list, n = L.filter(m => ORDER[m.state] < 4).length;
  if (!L.length) return `<h1>Overview</h1><p class="sub">No workflows yet.</p><div class="panel empty"><h2>Send your first ping</h2><p class="muted">A workflow appears here after its first run reports in.</p><pre>${esc(snippet("my-first-workflow"))}</pre>${copyBtn(snippet("my-first-workflow"))}</div>`;
  const cnt = {}; L.forEach(m => cnt[m.state] = (cnt[m.state] || 0) + 1);
  const states = Object.keys(ORDER).filter(s => cnt[s]);
  return `<h1>${n ? `${n} of ${L.length} workflows need attention` : "All workflows are running normally"}</h1><p class="sub">Each workflow is judged against its own learned rhythm.</p>
<div class="panel"><div class="meter" role="img" aria-label="${states.map(s => cnt[s] + " " + LABEL[s]).join(", ")}">${states.map(s => `<i class="${TONE[s]}" style="flex:${cnt[s]}"></i>`).join("")}</div>
<div class="legend">${states.map(s => `<span class="badge ${TONE[s]}">${cnt[s]} ${LABEL[s].toLowerCase()}</span>`).join("")}</div></div>
<div class="toolbar"><label class="sr" for="q">Search workflows</label><input id="q" type="search" placeholder="Search workflows" value="${esc(S.q)}" autocomplete="off">
<div class="seg" role="group" aria-label="Filter">${[["all", "All"], ["attn", "Needs attention"], ["ok", "Healthy"]].map(([k, t]) => `<button class="btn" data-act="f" data-f="${k}" aria-pressed="${S.f === k}">${t}</button>`).join("")}</div></div>
<div class="panel tbl"><table><caption class="sr">Workflows</caption><thead><tr><th>Workflow</th><th>Status</th><th class="hide-sm">Last run</th><th class="hide-md">Runs in 24 h</th><th class="hide-md">Last 24 h</th></tr></thead><tbody id="rows">${rows()}</tbody></table></div>`;
}
function detail(slug) {
  const m = S.list.find(x => x.slug === slug);
  if (!m) return `<a class="crumb" href="#/">Back to overview</a><h1>Workflow not found</h1><p class="sub">No runs have been recorded for "${esc(slug)}".</p>`;
  const runs = S.mode === "demo" ? demo[slug].slice(-12).reverse() : S.runs[slug] || [], mx = Math.max(1, ...m.spark);
  return `<a class="crumb" href="#/">Back to overview</a><div class="row"><h1>${esc(m.slug)}</h1>${badge(m.state)}</div><p class="sub">${WHY[m.state]}</p>
<div class="panel"><h2>Runs per hour, last 24 hours</h2><svg class="chart" viewBox="0 0 240 60" preserveAspectRatio="none" role="img" aria-label="${m.runs_24h} runs in the last 24 hours">${m.spark.map((v, i) => `<rect x="${i * 10 + 1}" y="${60 - v / mx * 58}" width="8" height="${Math.max(v ? 1.5 : 0.5, v / mx * 58)}" rx="1"/>`).join("")}</svg><div class="axis"><span>24 h ago</span><span>now</span></div>
<dl class="stats"><div><dt>Last run</dt><dd>${ago(m.last_seen)}</dd></div><div><dt>Expected within</dt><dd>${dur(m.expected_within)}</dd></div><div><dt>Runs in 24 h</dt><dd>${m.runs_24h} <span class="muted" style="font-size:14px;font-weight:400">of ${Math.round(m.baseline_24h)} usual</span></dd></div></dl></div>
${S.mode === "demo" ? `<div class="panel"><h2>Try it</h2><p class="muted">These simulate the workflow in this browser. They change nothing on any server.</p><div class="row"><button class="btn primary" data-act="ping" data-slug="${esc(slug)}">Send a successful run</button><button class="btn" data-act="fail" data-slug="${esc(slug)}">Send a failed run</button></div></div>` : ""}
<div class="panel tbl"><table><caption class="sr">Recent runs</caption><thead><tr><th>Time</th><th>Result</th><th class="hide-sm">Duration</th><th>Note</th></tr></thead><tbody>${runs.length ? runs.map(r => `<tr><td class="num">${new Date(r.t * 1000).toLocaleString()}</td><td>${r.ok ? '<span class="badge ok">Succeeded</span>' : '<span class="badge bad">Failed</span>'}</td><td class="num hide-sm">${r.d ? Math.round(r.d) + " ms" : "n/a"}</td><td class="muted">${esc(r.note || "")}</td></tr>`).join("") : `<tr><td colspan="4" class="muted">No recent runs loaded.</td></tr>`}</tbody></table></div>`;
}
function settings() {
  const live = S.mode === "live";
  return `<h1>Settings</h1><p class="sub">${live ? "Connect workflows and manage your session." : "Demo mode has no server, so there is nothing to connect yet."}</p>
<div class="panel"><h2>Ingest token</h2>${live ? (S.token ? `<div class="row"><input id="tok" type="${S.revealed ? "text" : "password"}" value="${esc(S.token)}" readonly aria-label="Ingest token" size="34"><button class="btn" data-act="reveal">${S.revealed ? "Hide" : "Reveal"}</button>${copyBtn(S.token)}</div>` : '<p class="muted">Loading token…</p>') : '<p class="muted">Your server generates this token on first run. Workflows send it in the X-Heartbeat-Token header.</p>'}</div>
<div class="panel"><h2>Report a run</h2><pre>${esc(snippet("nightly-backup"))}</pre>${copyBtn(snippet("nightly-backup"), "Copy command")}</div>
<div class="panel"><h2>${live ? "Session" : "Demo data"}</h2>${live ? '<button class="btn" data-act="signout">Sign out</button>' : '<button class="btn" data-act="reset">Reset demo data</button>'}</div>`;
}
const loginView = () => `<div class="login"><h1>Heartbeat</h1><p class="sub">Sign in to see your workflows.</p><form id="login"><label class="sr" for="pw">Password</label><input id="pw" type="password" placeholder="Password" autocomplete="current-password" required autofocus><p class="err" role="alert">${esc(S.loginErr)}</p><button class="btn primary">Sign in</button></form></div>`;

function render() {
  const app = $("#app"), [r, arg] = route();
  if (S.mode === "loading") { app.innerHTML = '<p class="loading">Loading workflows…</p>'; return; }
  if (S.mode === "login") { app.innerHTML = loginView(); return; }
  app.innerHTML = shell(r === "d" ? detail(arg) : r === "s" ? settings() : overview(), r);
  document.title = (r === "d" ? arg + " | " : r === "s" ? "Settings | " : "") + "Heartbeat";
}
const toast = t => { const e = $("#toast"); if (!e) return; e.textContent = t; e.classList.add("show"); setTimeout(() => e.classList.remove("show"), 2000); };

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return; const a = b.dataset.act;
  if (a === "copy") { try { await navigator.clipboard.writeText(b.dataset.text); toast("Copied"); } catch { toast("Copy failed. Select the text manually."); } }
  else if (a === "f") { S.f = b.dataset.f; render(); }
  else if (a === "reveal") { S.revealed = !S.revealed; render(); }
  else if (a === "reset") { demo = null; useDemo(); render(); toast("Demo data reset"); }
  else if (a === "signout") { await api("/logout", { method: "POST" }); S.mode = "login"; S.token = null; render(); }
  else if (a === "ping" || a === "fail") {
    const r = { t: Date.now() / 1000, ok: a === "ping", d: Math.round(300 + Math.random() * 500) }; if (a === "fail") r.note = "Simulated failure"; demo[b.dataset.slug].push(r); useDemo(); render(); toast(a === "ping" ? "Run recorded" : "Failed run recorded");
  }
});
document.addEventListener("input", e => { if (e.target.id === "q") { S.q = e.target.value; $("#rows").innerHTML = rows(); } });
document.addEventListener("submit", async e => {
  if (e.target.id !== "login") return; e.preventDefault();
  try {
    const r = await fetch("/login", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "password=" + encodeURIComponent($("#pw").value) });
    if (r.status === 429) S.loginErr = "Too many attempts. Try again in 5 minutes."; else if (r.ok && new URL(r.url).pathname === "/") { S.loginErr = ""; return refresh(); } else S.loginErr = "That password is wrong.";
  } catch { S.loginErr = "Cannot reach the server."; }
  render();
});
addEventListener("hashchange", onRoute);
refresh(); setInterval(() => { if (document.activeElement?.id !== "q" && S.mode !== "login") refresh(); }, 15000);
})();
