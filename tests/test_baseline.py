import unittest
from app.baseline import evaluate

NOW = 1_000_000.0
every10 = lambda stop=0, days=8: [NOW - stop - i * 600 for i in range(days * 144)]


class T(unittest.TestCase):
    def test_ok(self): self.assertEqual(evaluate(every10(), NOW)["state"], "ok")
    def test_down(self): self.assertEqual(evaluate(every10(stop=3 * 3600), NOW)["state"], "down")
    def test_learning(self): self.assertEqual(evaluate([NOW - 60, NOW - 30], NOW)["state"], "learning")
    def test_failing(self): self.assertEqual(evaluate(every10(), NOW, last_ok=False)["state"], "failing")
    def test_volume_drop(self):
        ts = [t for i, t in enumerate(every10()) if t <= NOW - 86400 or i % 3 == 0]
        self.assertEqual(evaluate(ts, NOW)["state"], "degraded")


if __name__ == "__main__":
    unittest.main()
