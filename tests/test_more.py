import os, tempfile, time, unittest
d = tempfile.mkdtemp()
os.environ["HEARTBEAT_SECRETS"] = os.path.join(d, "s.json")
os.environ["HEARTBEAT_DB"] = os.path.join(d, "t.db")
from app import auth, db
from app.baseline import evaluate
from app.diagnose import rule_diagnosis

BASE = 100 * 86400
RUNS = [BASE - n * 86400 + h * 3600 for n in range(1, 9) for h in range(9, 18)]


class Seasonal(unittest.TestCase):
    def test_quiet_hours_not_an_outage(self): self.assertEqual(evaluate(RUNS, BASE + 3 * 3600)["state"], "ok")
    def test_missed_business_hours(self): self.assertEqual(evaluate(RUNS + [BASE + 9 * 3600], BASE + int(14.5 * 3600))["state"], "down")


class Auth(unittest.TestCase):
    def test_cookie(self):
        c = auth.make_cookie()
        self.assertTrue(auth.valid_cookie(c))
        self.assertFalse(auth.valid_cookie(c[:-1] + "0"))
        self.assertFalse(auth.valid_cookie(c, now=time.time() + 8 * 86400))
        self.assertFalse(auth.valid_cookie(None))
    def test_token_and_password(self):
        self.assertTrue(auth.check_token(auth.cfg()["ingest_token"]))
        self.assertFalse(auth.check_token("") or auth.check_token("nope"))
        self.assertTrue(auth.check_password(auth.cfg()["password"]))
    def test_lockout(self):
        for _ in range(5): auth.fail("1.2.3.4")
        self.assertTrue(auth.locked("1.2.3.4"))


class Diagnose(unittest.TestCase):
    def test_auth_error(self): self.assertIn("Credentials", rule_diagnosis("failing", '{"error": "401 Unauthorized"}'))
    def test_silent(self): self.assertIn("trigger", rule_diagnosis("down", ""))


class DB(unittest.TestCase):
    def test_roundtrip(self):
        db.init(); db.record("a", ts=5.0); db.record("a", ok=False, ts=6.0, payload="x")
        self.assertEqual(db.times("a"), [5.0, 6.0])
        self.assertEqual(db.monitors(), [{"slug": "a", "last_ok": 0}])
        self.assertEqual(db.last_payload("a"), "x")


if __name__ == "__main__":
    unittest.main()
