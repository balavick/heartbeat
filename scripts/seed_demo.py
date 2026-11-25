"""Seed three demo workflows: healthy, silently dead, volume-degraded.
Run from the repo root:  python -m scripts.seed_demo"""
import time
from app import db

db.init()
now, step = time.time(), 600
for i in range(8 * 144):
    t = now - i * step
    db.record("nightly-sync", ts=t)
    if t <= now - 3 * 3600:
        db.record("invoice-webhook", ts=t)   # went silent 3h ago
    if t <= now - 86400 or i % 3 == 0:
        db.record("lead-sync", ts=t)         # volume fell to a third today
print("seeded")
