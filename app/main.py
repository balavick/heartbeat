import asyncio, json, os, re, time, urllib.parse, urllib.request
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

from . import auth, db
from .baseline import evaluate, hourly
from .diagnose import diagnose

STATIC = Path(__file__).parent.parent / "web"
BAD = {"late", "down", "failing", "degraded"}
SLUG = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
_prev = {}


def snapshot(now=None):
    now = now or time.time()
    out = []
    for m in db.monitors():
        ts = db.times(m["slug"], since=now - 8 * 86400)
        res = evaluate(ts, now, bool(m["last_ok"]))
        res.update(slug=m["slug"], last_seen=ts[-1] if ts else None, spark=hourly(ts, now))
        out.append(res)
    return out


def notify(m):
    msg = f"Heartbeat: {m['slug']} is {m['state']} (24h runs {m['runs_24h']}, usual {m['baseline_24h']})"
    cause = diagnose(m["slug"], m["state"], db.last_payload(m["slug"]))
    msg += f"\nLikely cause: {cause}" if cause else ""
    print(msg)
    url = os.getenv("SLACK_WEBHOOK_URL")
    if url:
        req = urllib.request.Request(url, json.dumps({"text": msg}).encode(), {"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=5)


async def checker(interval=60):
    while True:
        try:
            for m in snapshot():
                if m["state"] in BAD and _prev.get(m["slug"]) != m["state"]:
                    await asyncio.to_thread(notify, m)
                _prev[m["slug"]] = m["state"]
        except Exception as e:  # keep the loop alive
            print("checker error:", e)
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app):
    auth.cfg()
    db.init()
    task = asyncio.create_task(checker(int(os.getenv("CHECK_INTERVAL", "60"))))
    yield
    task.cancel()


app = FastAPI(title="Heartbeat", lifespan=lifespan)
app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")
authed = lambda r: auth.valid_cookie(r.cookies.get(auth.COOKIE))


@app.post("/ping/{slug}")
async def ping(slug: str, request: Request):
    h = request.headers
    token = h.get("x-heartbeat-token") or h.get("authorization", "").removeprefix("Bearer ").strip()
    if not auth.check_token(token):
        return JSONResponse({"error": "invalid token"}, 401)
    if not SLUG.match(slug):
        return JSONResponse({"error": "slug must be 1-64 chars of A-Z a-z 0-9 _ . -"}, 400)
    try:
        body = await request.json()
    except Exception:
        body = {}
    db.record(slug, bool(body.get("ok", True)), body.get("duration_ms"), json.dumps(body)[:2000])
    return {"ok": True}


@app.get("/login")
def login_page():
    return FileResponse(STATIC / "index.html")


@app.post("/login")
async def login(request: Request):
    ip = request.client.host if request.client else "?"
    if auth.locked(ip):
        return JSONResponse({"error": "too many attempts, try again in 5 minutes"}, 429)
    form = urllib.parse.parse_qs((await request.body()).decode())
    if not auth.check_password(form.get("password", [""])[0]):
        auth.fail(ip)
        return RedirectResponse("/login?e=1", 303)
    resp = RedirectResponse("/", 303)
    resp.set_cookie(auth.COOKIE, auth.make_cookie(), max_age=auth.TTL, httponly=True,
                    samesite="lax", secure=os.getenv("HEARTBEAT_HTTPS") == "1")
    return resp


@app.post("/logout")
def logout():
    resp = RedirectResponse("/login", 303)
    resp.delete_cookie(auth.COOKIE)
    return resp


@app.get("/api/monitors")
def monitors(request: Request):
    return snapshot() if authed(request) else JSONResponse({"error": "login required"}, 401)


@app.get("/")
def dashboard(request: Request):
    return FileResponse(STATIC / "index.html")


@app.get("/api/monitors/{slug}")
def monitor(slug: str, request: Request):
    if not authed(request):
        return JSONResponse({"error": "login required"}, 401)
    m = next((x for x in snapshot() if x["slug"] == slug), None)
    if not m:
        return JSONResponse({"error": "not found"}, 404)
    return {**m, "runs": db.recent(slug)}


@app.get("/api/settings")
def settings(request: Request):
    if not authed(request):
        return JSONResponse({"error": "login required"}, 401)
    return {"ingest_token": auth.cfg()["ingest_token"]}
