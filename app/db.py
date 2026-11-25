"""SQLite by default; set DATABASE_URL (and install psycopg[binary]) to use Postgres."""
import os, sqlite3, time

URL = os.getenv("DATABASE_URL")
PATH = os.getenv("HEARTBEAT_DB", "heartbeat.db")


def _conn():
    if URL:
        import psycopg
        from psycopg.rows import dict_row
        return psycopg.connect(URL, row_factory=dict_row)
    c = sqlite3.connect(PATH)
    c.row_factory = sqlite3.Row
    return c


def _run(sql, args=(), fetch=False):
    if URL:
        sql = sql.replace("?", "%s")
    c = _conn()
    try:
        with c:
            cur = c.execute(sql, args)
            return [dict(r) for r in cur.fetchall()] if fetch else None
    finally:
        c.close()


def init():
    _run("CREATE TABLE IF NOT EXISTS pings (slug TEXT, ts DOUBLE PRECISION, ok INTEGER, duration_ms DOUBLE PRECISION, payload TEXT)")
    _run("CREATE INDEX IF NOT EXISTS ix_pings ON pings (slug, ts)")


def record(slug, ok=True, duration_ms=None, payload="", ts=None):
    _run("INSERT INTO pings VALUES (?,?,?,?,?)", (slug, ts or time.time(), int(ok), duration_ms, payload))


def monitors():
    return _run("SELECT slug, (SELECT ok FROM pings p WHERE p.slug = m.slug ORDER BY ts DESC LIMIT 1) AS last_ok "
                "FROM (SELECT DISTINCT slug FROM pings) m ORDER BY slug", fetch=True)


def times(slug, since=None):
    return [r["ts"] for r in _run("SELECT ts FROM pings WHERE slug=? AND ts>? ORDER BY ts", (slug, since or 0), fetch=True)]


def last_payload(slug):
    r = _run("SELECT payload FROM pings WHERE slug=? ORDER BY ts DESC LIMIT 1", (slug,), fetch=True)
    return r[0]["payload"] if r else ""


def recent(slug, n=15):
    return _run("SELECT ts, ok, duration_ms, payload FROM pings WHERE slug=? ORDER BY ts DESC LIMIT 15", (slug,), fetch=True)
