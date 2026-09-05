"""Iteration 5 tests: AI deprecated-model upgrade + 424 on AI failure.

Requires admin/end-user seeded sessions and access to mongosh for the
'set retired model' step. We manipulate the config through Mongo directly
to simulate a retired model being persisted (as if it slipped in via a
different code path) then verify /admin/ai/test and /incidents/.../analyze
return the friendly 424 error.
"""
import os
import subprocess
import time
import pytest
from conftest import BASE_URL


def _mongo(js: str) -> str:
    from dotenv import dotenv_values
    env = dotenv_values("/app/backend/.env")
    url = (env.get("MONGO_URL") or "").strip().strip('"')
    db = (env.get("DB_NAME") or "").strip().strip('"')
    if not url.rstrip("/").endswith(db):
        url = f"{url.rstrip('/')}/{db}"
    r = subprocess.run(
        ["mongosh", url, "--quiet", "--eval", js],
        capture_output=True, text=True, timeout=30
    )
    return (r.stdout or "") + (r.stderr or "")


# ---------- config restore helper ----------
GOOD_CFG = {
    "provider": "gemini",
    "model": "gemini-3-flash-preview",
    "temperature": 0.2,
    "max_tokens": 1400,
    "use_emergent_key": False,
    "api_key": "",  # preserves stored key
    "rate_limit_per_hour": 10,
}


@pytest.fixture(scope="module", autouse=True)
def _restore_state(admin):
    yield
    # Restore ai config
    admin.put(f"{BASE_URL}/api/admin/ai/config", json=GOOD_CFG, timeout=30)
    # Restore SN instance
    admin.put(
        f"{BASE_URL}/api/admin/servicenow/config",
        json={"instance_url": "https://dev414250.service-now.com", "show_work_notes": True, "list_limit": 100},
        timeout=30,
    )


# ---------- feature 1: GET ai config ----------
class TestAIConfigGet:
    def test_get_returns_config_masked(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/ai/config", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["provider"] in ("openai", "anthropic", "gemini")
        assert d["model"]
        assert isinstance(d["use_emergent_key"], bool)
        assert "rate_limit_per_hour" in d
        # api_key is never returned in clear text
        assert d.get("api_key") in ("••••••••", "") or "•" in (d.get("api_key") or "")


# ---------- feature 2: PUT auto-upgrade ----------
class TestAIConfigPutUpgrade:
    def test_own_key_gemini_retired_upgrades(self, admin):
        payload = {**GOOD_CFG, "model": "gemini-2.5-flash"}
        r = admin.put(f"{BASE_URL}/api/admin/ai/config", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["model"] == "gemini-3-flash-preview"
        assert d["upgraded_from"] == "gemini-2.5-flash"
        # audit
        a = admin.get(f"{BASE_URL}/api/admin/audit?limit=10", timeout=15).json()
        events = a if isinstance(a, list) else a.get("items", a)
        assert any(
            e.get("action") == "config.ai.update"
            and (e.get("meta") or e.get("details") or {}).get("upgraded_from") == "gemini-2.5-flash"
            for e in events
        )

    def test_emergent_key_gpt4o_mini_stays(self, admin):
        payload = {**GOOD_CFG, "provider": "openai", "model": "gpt-4o-mini", "use_emergent_key": True}
        r = admin.put(f"{BASE_URL}/api/admin/ai/config", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["model"] == "gpt-4o-mini"
        assert d["upgraded_from"] in (None, "")

    def test_own_key_gpt5_4_mini_unchanged(self, admin):
        payload = {**GOOD_CFG, "provider": "openai", "model": "gpt-5.4-mini", "use_emergent_key": False}
        r = admin.put(f"{BASE_URL}/api/admin/ai/config", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["model"] == "gpt-5.4-mini"
        assert d["upgraded_from"] in (None, "")


# ---------- feature 3: /admin/ai/test friendly errors ----------
class TestAITest:
    def test_ai_test_good_config(self, admin):
        # restore first
        admin.put(f"{BASE_URL}/api/admin/ai/config", json=GOOD_CFG, timeout=30)
        # retry up to 3 times with sleep for transient Gemini rate limits
        d = None
        for _ in range(3):
            r = admin.post(f"{BASE_URL}/api/admin/ai/test", timeout=60)
            assert r.status_code == 200, r.text
            d = r.json()
            if d.get("ok"):
                break
            if "rate limit" in (d.get("message") or "").lower() or "quota" in (d.get("message") or "").lower():
                time.sleep(15)
                continue
            break
        if d and not d.get("ok") and ("rate limit" in d.get("message","").lower() or "quota" in d.get("message","").lower()):
            pytest.skip(f"Gemini quota exhausted: {d.get('message')}")
        assert d["ok"], d
        assert "PONG" in (d.get("sample") or "").upper()

    def test_ai_test_retired_model_returns_friendly(self, admin):
        # Poke mongo to store a retired model bypass the upgrade
        _mongo("db.configs.updateOne({kind:'ai'},{$set:{'model':'gemini-2.5-flash'}})")
        try:
            r = admin.post(f"{BASE_URL}/api/admin/ai/test", timeout=60)
            assert r.status_code == 200, r.text
            d = r.json()
            assert not d["ok"]
            assert "not available for this API key" in d["message"]
            assert "gemini-3-flash-preview" in d["message"]
        finally:
            _mongo("db.configs.updateOne({kind:'ai'},{$set:{'model':'gemini-3-flash-preview'}})")


# ---------- feature 4: /analyze returns 424 on AI failure ----------
class TestAnalyze424:
    @classmethod
    def setup_class(cls):
        # Switch to demo mode + raise rate-limit=0 for end user? end-user should be exempt when limit=0? admins yes, end users respect limit; 0=unlimited.
        pass

    def test_analyze_success_demo_mode(self, admin, enduser):
        # ensure config good
        admin.put(f"{BASE_URL}/api/admin/ai/config", json=GOOD_CFG, timeout=30)
        # demo mode
        admin.put(
            f"{BASE_URL}/api/admin/servicenow/config",
            json={"instance_url": "", "show_work_notes": True, "list_limit": 100},
            timeout=15,
        )
        try:
            last = None
            for _ in range(3):
                r = enduser.post(f"{BASE_URL}/api/incidents/sn_inc_0001/analyze", timeout=90)
                last = r
                if r.status_code == 200:
                    break
                if r.status_code == 429 or "rate limit" in (r.text or "").lower() or "quota" in (r.text or "").lower():
                    pytest.skip(f"end-user rate limited: {r.text[:120]}")
                time.sleep(3)
            assert last.status_code == 200, last.text
            d = last.json()
            assert d["model"] == "gemini/gemini-3-flash-preview"
            assert "analysis" in d and "analysis_id" in d
            assert "evidence" in d
            assert isinstance(d["analysis"].get("likely_root_cause"), str)
        finally:
            admin.put(
                f"{BASE_URL}/api/admin/servicenow/config",
                json={"instance_url": "https://dev414250.service-now.com", "show_work_notes": True, "list_limit": 100},
                timeout=15,
            )

    def test_analyze_returns_424_on_retired_model(self, admin, enduser):
        admin.put(f"{BASE_URL}/api/admin/ai/config", json=GOOD_CFG, timeout=30)
        admin.put(
            f"{BASE_URL}/api/admin/servicenow/config",
            json={"instance_url": "", "show_work_notes": True, "list_limit": 100},
            timeout=15,
        )
        _mongo("db.configs.updateOne({kind:'ai'},{$set:{'model':'gemini-2.5-flash'}})")
        try:
            r = enduser.post(f"{BASE_URL}/api/incidents/sn_inc_0001/analyze", timeout=90)
            assert r.status_code == 424, f"got {r.status_code}: {r.text[:400]}"
            detail = r.json().get("detail", "")
            assert "not available for this API key" in detail
            assert "gemini-3-flash-preview" in detail
            # analysis history recorded with status=error
            time.sleep(0.5)
            a = admin.get(f"{BASE_URL}/api/admin/analyses?limit=5", timeout=15).json()
            items = a if isinstance(a, list) else a.get("items", a)
            assert any(x.get("status") == "error" for x in items[:5]), items[:2]
        finally:
            _mongo("db.configs.updateOne({kind:'ai'},{$set:{'model':'gemini-3-flash-preview'}})")
            admin.put(
                f"{BASE_URL}/api/admin/servicenow/config",
                json={"instance_url": "https://dev414250.service-now.com", "show_work_notes": True, "list_limit": 100},
                timeout=15,
            )
