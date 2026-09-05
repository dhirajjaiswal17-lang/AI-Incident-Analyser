"""Iteration 6 – regression after code-quality refactor.

Covers:
- _map_row refactor: historical/import mapping (tags string, missing key, rca auto-title)
- _build_context refactor: /similar in demo mode includes expected historical/kb/rca entries
- analyze refactor: demo mode analyze returns 200 or 424 (never 500)
- sync refactor: /admin/servicenow/sync/run credential error path

Uses env-driven tokens from conftest.
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

_backend_env = dotenv_values("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL") or _backend_env.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or _backend_env.get("DB_NAME")


@pytest.fixture(scope="module")
def db():
    c = MongoClient(MONGO_URL)
    return c[DB_NAME]


@pytest.fixture(scope="module", autouse=True)
def _capture_and_restore_state(db, admin, base_url_fixture):
    # Snapshot
    sn = db.configs.find_one({"kind": "servicenow"}) or {}
    ai = db.configs.find_one({"kind": "ai"}) or {}
    sn_sync = db.configs.find_one({"kind": "sn_sync"}) or {}
    yield
    # Restore SN instance url
    if sn:
        db.configs.update_one(
            {"kind": "servicenow"},
            {"$set": {"instance_url": sn.get("instance_url", "https://dev414250.service-now.com")}},
        )
    # Restore sn_sync binding to owner
    db.configs.update_one(
        {"kind": "sn_sync"},
        {"$set": {
            "enabled": True,
            "hour_utc": 2,
            "lookback_days": 365,
            "sync_user_id": "user_33ad5ed974a9",
            "sync_user_email": "dhirajjaiswal17@gmail.com",
        }},
        upsert=True,
    )
    # Remove any TEST_ historical/rca records created
    db.historical_incidents.delete_many({"number": {"$in": ["INCQ001", "INCQ002", "INCQ003"]}})
    db.rcas.delete_many({"incident_number": {"$in": ["INCQ001", "INCQ002", "INCQ003"]}})


# ---------- _map_row refactor ----------
class TestHistoricalImportMapping:
    def test_import_maps_fields(self, admin, base_url_fixture, db):
        payload = [{
            "incident_id": "INCQ001",
            "service": "Payments",
            "description": "Refactor check timeout",
            "root_cause": "x",
            "resolution": "y",
            "confidence": 0.77,
            "category": "Network",
        }]
        r = admin.post(f"{base_url_fixture}/api/admin/historical/import", json=payload)
        assert r.status_code == 200, r.text
        # inserted or updated (idempotent) — either way row must be present
        data = r.json()
        assert (data.get("inserted", 0) + data.get("updated", 0)) >= 1
        rec = db.historical_incidents.find_one({"number": "INCQ001"})
        assert rec is not None
        assert rec.get("application") == "Payments"
        assert rec.get("short_description") == "Refactor check timeout"
        assert rec.get("description", "") == ""
        tags = rec.get("tags", []) or []
        assert any("confidence:0.77" in t for t in tags)
        assert any("category:Network" in t for t in tags)

    def test_tags_string_split(self, admin, base_url_fixture, db):
        payload = [{
            "incident_id": "INCQ002",
            "application": "PaymentsX",
            "short_description": "tags string",
            "tags": "a, b;c",
        }]
        r = admin.post(f"{base_url_fixture}/api/admin/historical/import", json=payload)
        assert r.status_code == 200, r.text
        rec = db.historical_incidents.find_one({"number": "INCQ002"})
        assert rec is not None
        tags = rec.get("tags", []) or []
        # must contain a, b, c after splitting by ,/;
        for expected in ["a", "b", "c"]:
            assert expected in tags, f"expected {expected} in {tags}"

    def test_missing_number_error(self, admin, base_url_fixture):
        r = admin.post(f"{base_url_fixture}/api/admin/historical/import", json=[{"application": "X"}])
        # inserted 0, errors list contains 'missing number'
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("inserted", 0) == 0
        errs = data.get("errors", []) or []
        # errors are [{'row':N,'error':'missing number'}]
        joined = " ".join(e.get("error", "") if isinstance(e, dict) else str(e) for e in errs)
        assert "missing" in joined.lower() and "number" in joined.lower(), joined

    def test_rca_import_auto_title(self, admin, base_url_fixture, db):
        r = admin.post(f"{base_url_fixture}/api/admin/rca/import", json=[{
            "incident_number": "INCQ003",
            "root_cause": "some rca body",
            "resolution": "fix",
        }])
        assert r.status_code == 200, r.text
        rec = db.rcas.find_one({"incident_number": "INCQ003"})
        assert rec is not None, r.text
        title = rec.get("title", "")
        assert title == "RCA - INCQ003", f"expected auto-title, got {title!r}"


# ---------- _build_context refactor ----------
class TestSimilarContext:
    def test_similar_in_demo_mode(self, enduser, admin, base_url_fixture, db):
        # Temporarily blank instance_url to enter demo mode
        original = db.configs.find_one({"kind": "servicenow"}) or {}
        original_url = original.get("instance_url", "https://dev414250.service-now.com")
        db.configs.update_one({"kind": "servicenow"}, {"$set": {"instance_url": ""}}, upsert=True)
        try:
            r = enduser.get(f"{base_url_fixture}/api/incidents/sn_inc_0001/similar")
            assert r.status_code == 200, r.text
            data = r.json()
            hist_nums = [h.get("number") or h.get("incident_number") for h in (data.get("historical") or [])]
            assert "INC0089123" in hist_nums or "INC001" in hist_nums, hist_nums
            # scores should be numeric > 0 for at least one
            assert any((h.get("score") or 0) > 0 for h in (data.get("historical") or []))
            kb_titles = [k.get("title", "") for k in (data.get("kb") or [])]
            assert any("Playbook: Core Payment API 504" in t for t in kb_titles), kb_titles
            # rca list may be under 'rca' or 'rcas'
            rcas_list = data.get("rca") or data.get("rcas") or []
            rca_titles = [x.get("title", "") for x in rcas_list]
            assert any("INC0089123" in t for t in rca_titles), rca_titles
        finally:
            db.configs.update_one({"kind": "servicenow"}, {"$set": {"instance_url": original_url}}, upsert=True)

    def test_similar_live_instance_admin_no_creds(self, admin, base_url_fixture, db):
        # Assumes admin test user has no SN creds and instance is live
        sn = db.configs.find_one({"kind": "servicenow"}) or {}
        if not (sn.get("instance_url") or "").strip():
            pytest.skip("instance_url is not live in this env")
        r = admin.get(f"{base_url_fixture}/api/incidents/sn_inc_0001/similar")
        # 428 (missing user creds) is expected; some flows may 200 if admin has creds
        assert r.status_code in (200, 428), r.text


# ---------- analyze refactor ----------
class TestAnalyzeDemoMode:
    def test_analyze_no_500(self, enduser, base_url_fixture, db):
        original = db.configs.find_one({"kind": "servicenow"}) or {}
        original_url = original.get("instance_url", "https://dev414250.service-now.com")
        db.configs.update_one({"kind": "servicenow"}, {"$set": {"instance_url": ""}}, upsert=True)
        try:
            r = enduser.post(f"{base_url_fixture}/api/incidents/sn_inc_0001/analyze", json={})
            # Acceptable: 200 (LLM ok) or 424 (quota/friendly). NEVER 500.
            assert r.status_code in (200, 424), f"unexpected {r.status_code}: {r.text[:400]}"
            if r.status_code == 200:
                d = r.json()
                analysis = d.get("analysis") or {}
                # Accept either flat or nested shape
                keys_flat = ["root_cause", "impact", "immediate_actions", "preventive_actions"]
                keys_nested = ["likely_root_cause", "business_impact", "recommended_immediate_action", "preventive_action"]
                has_flat = all(k in d for k in keys_flat)
                has_nested = all(k in analysis for k in keys_nested)
                assert has_flat or has_nested, f"missing analysis keys: {list(d.keys())} / {list(analysis.keys())}"
                assert "analysis_id" in d
                assert "model" in d
        finally:
            db.configs.update_one({"kind": "servicenow"}, {"$set": {"instance_url": original_url}}, upsert=True)


# ---------- sync refactor ----------
class TestSyncRun:
    def test_sync_run_needs_creds(self, admin, base_url_fixture, db):
        # Ensure instance_url is configured (live)
        admin.put(
            f"{base_url_fixture}/api/admin/servicenow/config",
            json={"instance_url": "https://dev414250.service-now.com"},
        )
        # Bind sn_sync to admin test user (who has no SN creds) → sync/run should complete with ok:false,error creds required
        admin_user = db.users.find_one({"email": "admin@test.local"}) or {}
        admin_uid = admin_user.get("user_id") or admin_user.get("id")
        assert admin_uid, "admin test user not seeded"
        r_put = admin.put(f"{base_url_fixture}/api/admin/servicenow/sync", json={"enabled": False})
        assert r_put.status_code == 200, r_put.text
        db.configs.update_one(
            {"kind": "sn_sync"},
            {"$set": {"sync_user_id": admin_uid, "sync_user_email": "admin@test.local", "enabled": False}},
            upsert=True,
        )
        try:
            r = admin.post(f"{base_url_fixture}/api/admin/servicenow/sync/run")
            assert r.status_code == 200, r.text
            d = r.json()
            assert d.get("ok") is False
            err = (d.get("error") or "").lower()
            # Accept either 'credentials required' or 'not configured' (both signal missing SN setup)
            assert ("credential" in err) or ("not configured" in err) or ("creds" in err), err
        finally:
            # Restore binding to owner (also done by module autouse)
            db.configs.update_one(
                {"kind": "sn_sync"},
                {"$set": {
                    "enabled": True,
                    "hour_utc": 2,
                    "lookback_days": 365,
                    "sync_user_id": "user_33ad5ed974a9",
                    "sync_user_email": "dhirajjaiswal17@gmail.com",
                }},
                upsert=True,
            )

    def test_sync_run_unbound_returns_400(self, admin, base_url_fixture, db):
        original = db.configs.find_one({"kind": "sn_sync"}) or {}
        db.configs.update_one(
            {"kind": "sn_sync"},
            {"$set": {"sync_user_id": "", "sync_user_email": ""}},
            upsert=True,
        )
        try:
            r = admin.post(f"{base_url_fixture}/api/admin/servicenow/sync/run")
            assert r.status_code == 400, f"expected 400 when unbound got {r.status_code}: {r.text[:200]}"
        finally:
            db.configs.update_one(
                {"kind": "sn_sync"},
                {"$set": {
                    "enabled": True,
                    "hour_utc": 2,
                    "lookback_days": 365,
                    "sync_user_id": "user_33ad5ed974a9",
                    "sync_user_email": "dhirajjaiswal17@gmail.com",
                }},
                upsert=True,
            )
