# Heartbeat

Alerts you when an automation goes quiet. It learns each workflow's rhythm and flags missed runs, volume drops and failed runs.

## Run it
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload     # first run prints your dashboard password and ingest token
python -m unittest discover -s tests -t .
```
Optional demo data: `python -m scripts.seed_demo`

## Deploy the web app on Netlify
`web/` is a static site (no build step). Drag `heartbeat-site.zip` onto Netlify, or connect the repo (`netlify.toml` sets `publish = "web"`).
- **Out of the box it runs in demo mode:** simulated workflows, evaluated in your browser by the same rules. The page says so.
- **Real monitoring needs the Python backend** (Netlify cannot run a long-lived server or SQLite). Host it on Render, Railway or Fly with `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, plus a Postgres `DATABASE_URL` or a persistent disk. Then uncomment the redirects in `netlify.toml` so the site and API share one origin.

## Sign-in and tokens (no third-party keys)
- **Dashboard:** password login, then a signed HttpOnly cookie (7 days). Five wrong passwords lock that IP for 5 minutes.
- **Workflows:** machines send the ingest token in `X-Heartbeat-Token` (or `Authorization: Bearer`). Cookies are for browsers only.
- Both are generated on first run into `.heartbeat_secrets.json` (git-ignored). Override with `HEARTBEAT_PASSWORD` and `HEARTBEAT_INGEST_TOKEN`. Set `HEARTBEAT_HTTPS=1` behind HTTPS.

```bash
curl -X POST localhost:8000/ping/nightly-sync -H "X-Heartbeat-Token: $TOKEN" -H "Content-Type: application/json" -d '{"ok": true}'
```
Python: copy `sdk/heartbeat.py`, set `HEARTBEAT_TOKEN`, then `@monitor("nightly-sync")`.

## Diagnosis
Rules run with no setup. For a richer answer pick one:
- `OLLAMA_URL=http://localhost:11434` (local, no key; optional `OLLAMA_MODEL`)
- `GEMINI_API_KEY=...` (free key from Google AI Studio; optional `GEMINI_MODEL`, check the current model name)

If the LLM call fails, the rule-based hint is used.

## Postgres
`pip install "psycopg[binary]"` and set `DATABASE_URL=postgresql://user:pass@host/db`. Default is SQLite (`HEARTBEAT_DB`).

## How it decides
- **Down / late:** time since last run vs. the learned gap (median + 3 x MAD), unless history shows this hour is normally quiet (UTC hour-of-day check).
- **Degraded:** last 24 h runs under half the previous 7-day median.
- **Failing:** latest ping reported `"ok": false`.

Other config: `SLACK_WEBHOOK_URL`, `CHECK_INTERVAL` (seconds).
