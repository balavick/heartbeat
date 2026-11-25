"""Self-hosted auth, no third-party keys. Humans: password -> signed cookie. Machines: ingest token."""
import functools, hashlib, hmac, json, os, secrets, time
from pathlib import Path

COOKIE, TTL = "hb_session", 7 * 86400
_fails = {}


@functools.lru_cache(maxsize=1)
def cfg():
    path = Path(os.getenv("HEARTBEAT_SECRETS", ".heartbeat_secrets.json"))
    s = json.loads(path.read_text()) if path.exists() else {}
    fresh = not s
    s.setdefault("ingest_token", secrets.token_urlsafe(24))
    s.setdefault("password", secrets.token_urlsafe(12))
    s.setdefault("session_secret", secrets.token_hex(32))
    if fresh:
        path.write_text(json.dumps(s))
        os.chmod(path, 0o600)
        print(f"Heartbeat first run.\n  Dashboard password: {s['password']}\n  Ingest token: {s['ingest_token']}")
    s["password"] = os.getenv("HEARTBEAT_PASSWORD", s["password"])
    s["ingest_token"] = os.getenv("HEARTBEAT_INGEST_TOKEN", s["ingest_token"])
    return s


def _sig(msg):
    return hmac.new(cfg()["session_secret"].encode(), msg.encode(), hashlib.sha256).hexdigest()


def make_cookie(now=None):
    exp = str(int((now or time.time()) + TTL))
    return f"{exp}.{_sig(exp)}"


def valid_cookie(value, now=None):
    try:
        exp, sig = value.split(".", 1)
        return hmac.compare_digest(sig, _sig(exp)) and int(exp) > (now or time.time())
    except (ValueError, AttributeError):
        return False


def check_password(p):
    return hmac.compare_digest(p.encode(), cfg()["password"].encode())


def check_token(t):
    return bool(t) and hmac.compare_digest(t.encode(), cfg()["ingest_token"].encode())


def locked(ip, now=None):
    now = now or time.time()
    _fails[ip] = [t for t in _fails.get(ip, []) if now - t < 300]
    return len(_fails[ip]) >= 5


def fail(ip):
    _fails.setdefault(ip, []).append(time.time())
