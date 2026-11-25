"""One-file SDK.  from heartbeat import monitor
   @monitor("nightly-sync")
   def job(): ..."""
import functools, json, os, time, urllib.request

URL = os.getenv("HEARTBEAT_URL", "http://localhost:8000")
TOKEN = os.getenv("HEARTBEAT_TOKEN", "")


def ping(slug, ok=True, **fields):
    body = json.dumps({"ok": ok, **fields}).encode()
    req = urllib.request.Request(f"{URL}/ping/{slug}", body, {"Content-Type": "application/json", "X-Heartbeat-Token": TOKEN})
    try:
        urllib.request.urlopen(req, timeout=3)
    except OSError:
        pass  # monitoring must never break the job


def monitor(slug):
    def wrap(fn):
        @functools.wraps(fn)
        def run(*a, **kw):
            t0 = time.time()
            try:
                result = fn(*a, **kw)
            except Exception as e:
                ping(slug, ok=False, error=repr(e), duration_ms=(time.time() - t0) * 1000)
                raise
            ping(slug, duration_ms=(time.time() - t0) * 1000)
            return result
        return run
    return wrap
