/* Browser port of app/baseline.py (cadence + volume). Quiet-hours logic lives in the Python backend only. */
const HOUR = 3600, DAY = 86400;
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function cadence(times, now) {
  const ts = [...times].sort((a, b) => a - b).slice(-50);
  if (ts.length < 5) return ["learning", null];
  const gaps = ts.slice(1).map((t, i) => t - ts[i]), med = median(gaps);
  const mad = median(gaps.map(g => Math.abs(g - med))), allowed = med + 3 * Math.max(mad, 0.1 * med), since = now - ts[ts.length - 1];
  return [since <= allowed ? "ok" : since <= 2 * allowed ? "late" : "down", allowed];
}
function volume(times, now) {
  const c = hi => times.filter(t => t > hi - DAY && t <= hi).length;
  const cur = c(now), base = median([1, 2, 3, 4, 5, 6, 7].map(i => c(now - i * DAY)));
  return [base >= 5 && cur < base * 0.5 ? "degraded" : "ok", cur, base];
}
function evaluate(times, now, lastOk = true) {
  const [c, allowed] = cadence(times, now), [v, cur, base] = volume(times, now);
  const state = !lastOk ? "failing" : c === "down" ? "down" : c === "late" ? "late" : v === "degraded" ? "degraded" : c === "learning" ? "learning" : "ok";
  return { state, expected_within: allowed, runs_24h: cur, baseline_24h: base };
}
function hourly(times, now, n = 24) {
  const o = Array(n).fill(0);
  for (const t of times) { const i = Math.floor((now - t) / HOUR); if (i >= 0 && i < n) o[n - 1 - i]++; }
  return o;
}
if (typeof module !== "undefined") module.exports = { evaluate, hourly, DAY };
