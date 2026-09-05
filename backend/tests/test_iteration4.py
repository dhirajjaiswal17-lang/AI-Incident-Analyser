"""Iteration 4 tests: Resolved sync (GET/PUT/RUN) + Linked evidence + evidence GET.
Restores servicenow.instance_url, ai.rate_limit_per_hour, sn_sync at the end.
"""
import os, time, pytest, requests
from pymongo import MongoClient

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://incident-insight.preview.emergentagent.com").rstrip("/")
from conftest import ADMIN_TOKEN, END_USER_TOKEN
ADMIN = {"Authorization": f"Bearer {ADMIN_TOKEN}"}
END = {"Authorization": f"Bearer {END_USER_TOKEN}"}

# Mongo direct (for save/restore of live config)
_MC = MongoClient("mongodb://localhost:27017")
DB = _MC["test_database"]

ORIG_SN_SYNC = {"enabled": True, "hour_utc": 2, "lookback_days": 365,
                "sync_user_id": "user_33ad5ed974a9", "sync_user_email": "dhirajjaiswal17@gmail.com"}
ORIG_INSTANCE = "https://dev414250.service-now.com"


@pytest.fixture(scope="module", autouse=True)
def restore_state():
    yield
    # Restore sn_sync
    DB.configs.update_one({"kind": "sn_sync"},
                          {"$set": {"kind": "sn_sync", **ORIG_SN_SYNC}}, upsert=True)
    # Restore instance_url
    DB.configs.update_one({"kind": "servicenow"},
                          {"$set": {"instance_url": ORIG_INSTANCE}}, upsert=True)
    # Restore rate limit
    DB.configs.update_one({"kind": "ai"}, {"$set": {"rate_limit_per_hour": 10}}, upsert=True)


# ===================== Sync Config =====================
class TestSyncConfig:
    def test_get_sync_admin(self):
        r = requests.get(f"{BASE}/api/admin/servicenow/sync", headers=ADMIN, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("enabled", "hour_utc", "lookback_days", "sync_user_id",
                  "sync_user_email", "last_run", "last_result"):
            assert k in d, f"missing key {k}"

    def test_get_sync_end_user_forbidden(self):
        r = requests.get(f"{BASE}/api/admin/servicenow/sync", headers=END, timeout=15)
        assert r.status_code == 403

    def test_get_sync_anon(self):
        r = requests.get(f"{BASE}/api/admin/servicenow/sync", timeout=15)
        assert r.status_code == 401

    def test_put_enabled_no_creds_returns_428(self):
        # admin test user has no SN creds -> 428
        payload = {"enabled": True, "hour_utc": 3, "lookback_days": 7}
        r = requests.put(f"{BASE}/api/admin/servicenow/sync", json=payload,
                         headers=ADMIN, timeout=15)
        assert r.status_code == 428
        assert "credentials" in r.json()["detail"].lower()

    def test_put_disabled_ok_and_clamps(self):
        # hour_utc 30 -> 23, lookback_days 999 -> 365
        payload = {"enabled": False, "hour_utc": 30, "lookback_days": 999}
        r = requests.put(f"{BASE}/api/admin/servicenow/sync", json=payload,
                         headers=ADMIN, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert not d["enabled"]
        assert d["hour_utc"] == 23
        assert d["lookback_days"] == 365
        assert d["sync_user_email"] == "admin@test.local"
        # lookback 0 -> 1
        r2 = requests.put(f"{BASE}/api/admin/servicenow/sync",
                          json={"enabled": False, "hour_utc": 5, "lookback_days": 0},
                          headers=ADMIN, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["lookback_days"] == 1


# ===================== Sync Run =====================
class TestSyncRun:
    def test_run_no_creds(self):
        # after prior PUT, sync_user_id bound to admin test user with no creds
        r = requests.post(f"{BASE}/api/admin/servicenow/sync/run",
                          headers=ADMIN, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert not d["ok"]
        assert "credentials" in (d.get("error", "") or "").lower()
        assert d["fetched"] == 0

    def test_run_demo_mode(self):
        # Clear instance_url and run
        DB.configs.update_one({"kind": "servicenow"}, {"$set": {"instance_url": ""}})
        try:
            r = requests.post(f"{BASE}/api/admin/servicenow/sync/run",
                              headers=ADMIN, timeout=30)
            assert r.status_code == 200
            d = r.json()
            assert not d["ok"]
            assert "not configured" in (d.get("error", "") or "").lower()
        finally:
            DB.configs.update_one({"kind": "servicenow"},
                                  {"$set": {"instance_url": ORIG_INSTANCE}})

    def test_run_end_user_forbidden(self):
        r = requests.post(f"{BASE}/api/admin/servicenow/sync/run",
                          headers=END, timeout=15)
        assert r.status_code == 403

    def test_audit_has_sync_action(self):
        r = requests.get(f"{BASE}/api/admin/audit?limit=100", headers=ADMIN, timeout=15)
        assert r.status_code == 200
        actions = [x["action"] for x in r.json()]
        assert "servicenow.sync" in actions


# ===================== Evidence on analyze + GET evidence =====================
class TestEvidence:
    analysis_id = None
    evidence = None

    @classmethod
    def setup_class(cls):
        # ensure demo mode for cheap analyze
        DB.configs.update_one({"kind": "servicenow"}, {"$set": {"instance_url": ""}})
        # check quota
        q = requests.get(f"{BASE}/api/analyses/quota", headers=END, timeout=15).json()
        if q.get("remaining") is not None and q["remaining"] <= 0:
            DB.configs.update_one({"kind": "ai"}, {"$set": {"rate_limit_per_hour": 0}})

    @classmethod
    def teardown_class(cls):
        DB.configs.update_one({"kind": "servicenow"}, {"$set": {"instance_url": ORIG_INSTANCE}})
        DB.configs.update_one({"kind": "ai"}, {"$set": {"rate_limit_per_hour": 10}})

    def test_analyze_returns_evidence(self):
        r = requests.post(f"{BASE}/api/incidents/sn_inc_0001/analyze",
                          headers=END, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "evidence" in d
        ev = d["evidence"]
        for k in ("historical", "kb", "rca"):
            assert k in ev and isinstance(ev[k], list), f"missing/invalid {k}"
        assert len(ev["historical"]) > 0
        assert len(ev["kb"]) > 0
        # score > 0
        for h in ev["historical"]:
            assert "id" in h and "number" in h and h["score"] > 0
        for k in ev["kb"]:
            assert "id" in k and "title" in k and k["score"] > 0
        TestEvidence.analysis_id = d["analysis_id"]
        TestEvidence.evidence = ev

    def test_mine_shows_evidence(self):
        r = requests.get(f"{BASE}/api/analyses/mine?limit=5", headers=END, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert any(a["id"] == TestEvidence.analysis_id for a in items)
        rec = [a for a in items if a["id"] == TestEvidence.analysis_id][0]
        assert rec.get("evidence") and "historical" in rec["evidence"]

    def test_get_evidence_kb_as_end_user(self):
        kid = TestEvidence.evidence["kb"][0]["id"]
        r = requests.get(f"{BASE}/api/evidence/kb/{kid}", headers=END, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == kid
        assert d.get("title") and d.get("content")

    def test_get_evidence_historical(self):
        hid = TestEvidence.evidence["historical"][0]["id"]
        r = requests.get(f"{BASE}/api/evidence/historical/{hid}", headers=END, timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == hid

    def test_get_evidence_rca(self):
        rlist = TestEvidence.evidence.get("rca") or []
        if not rlist:
            pytest.skip("no rca evidence in this analysis")
        rid = rlist[0]["id"]
        r = requests.get(f"{BASE}/api/evidence/rca/{rid}", headers=END, timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == rid

    def test_unknown_kind(self):
        r = requests.get(f"{BASE}/api/evidence/bogus/anything", headers=END, timeout=15)
        assert r.status_code == 404
        assert "unknown" in r.json()["detail"].lower()

    def test_unknown_id(self):
        r = requests.get(f"{BASE}/api/evidence/kb/does_not_exist", headers=END, timeout=15)
        assert r.status_code == 404

    def test_anon_401(self):
        r = requests.get(f"{BASE}/api/evidence/kb/anything", timeout=15)
        assert r.status_code == 401


# ===================== Regression quick =====================
class TestRegression:
    def test_incidents_admin_428(self):
        # admin test user has no SN creds and instance_url is live -> 428
        # Ensure instance_url restored
        DB.configs.update_one({"kind": "servicenow"}, {"$set": {"instance_url": ORIG_INSTANCE}})
        r = requests.get(f"{BASE}/api/incidents", headers=ADMIN, timeout=15)
        assert r.status_code == 428

    def test_feedback_analytics(self):
        r = requests.get(f"{BASE}/api/admin/feedback/analytics", headers=ADMIN, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "trend" in d and "by_model" in d

    def test_health_root(self):
        # api root not defined; check /api/auth/me anon -> 401 as health signal
        r = requests.get(f"{BASE}/api/auth/me", timeout=15)
        assert r.status_code == 401

    def test_post_to_sn_404_unknown(self):
        r = requests.post(f"{BASE}/api/analyses/no_such_id/post-to-servicenow",
                          headers=END, timeout=15)
        assert r.status_code == 404
