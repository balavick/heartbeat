"""Pure logic: learn a workflow's rhythm from ping timestamps and judge its health."""
from statistics import median

HOUR, DAY = 3600, 86400


def cadence_status(times, now, min_samples=5):
    """Compare time since last run with the learned gap (median + 3 x MAD)."""
    ts = sorted(times)[-50:]
    if len(ts) < min_samples:
        return "learning", None
    gaps = [b - a for a, b in zip(ts, ts[1:])]
    med = median(gaps)
    mad = median(abs(g - med) for g in gaps)
    allowed = med + 3 * max(mad, 0.1 * med)
    since = now - ts[-1]
    if since <= allowed:
        return "ok", allowed
    return ("late" if since <= 2 * allowed else "down"), allowed


def volume_status(times, now, history=7, drop=0.5):
    """Runs in the last 24h vs. the median of the previous `history` days."""
    count = lambda hi: sum(1 for t in times if hi - DAY < t <= hi)
    cur = count(now)
    base = median(count(now - i * DAY) for i in range(1, history + 1))
    if base >= 5 and cur < base * (1 - drop):
        return "degraded", cur, base
    return "ok", cur, base


def expected_runs(times, start, end, days=7):
    """Runs normally seen between start and end, from the same clock hours on previous days (UTC)."""
    floor = end - 2 * DAY
    h = max(start - start % HOUR + HOUR, floor - floor % HOUR)
    total = 0.0
    while h < end:
        total += median(sum(1 for t in times if h - d * DAY <= t < h - d * DAY + HOUR) for d in range(1, days + 1))
        h += HOUR
    return total


def evaluate(times, now, last_ok=True):
    c, allowed = cadence_status(times, now)
    # Quiet hours: if history shows this workflow normally sleeps now, silence is not an outage.
    if c in ("late", "down") and max(times) - min(times) >= 3 * DAY and expected_runs(times, max(times), now) < 1:
        c = "ok"
    v, cur, base = volume_status(times, now)
    if not last_ok:
        state = "failing"
    elif c == "down":
        state = "down"
    elif c == "late":
        state = "late"
    elif v == "degraded":
        state = "degraded"
    elif c == "learning":
        state = "learning"
    else:
        state = "ok"
    return {"state": state, "expected_within": allowed, "runs_24h": cur, "baseline_24h": base}


def hourly(times, now, n=24):
    """Run counts for the last n hours, oldest first (for the sparkline)."""
    out = [0] * n
    for t in times:
        i = int((now - t) // HOUR)
        if 0 <= i < n:
            out[n - 1 - i] += 1
    return out
