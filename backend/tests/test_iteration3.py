"""Iteration 3 backend tests: feedback analytics, bulk import, post-to-servicenow, RAG/application field."""
import io
import time

import pytest

from conftest import BASE_URL

REAL_SN_URL = "https://dev414250.service-now.com"
PROTECTED_HIST = {"INC001", "INC002", "INC003"}

TEST_HIST_NUMBERS = []  # numbers created by tests (for cleanup)
TEST_KB_TITLES = []
TEST_RCA_TITLES = []


def sn_body(instance_url):
    return {
        "instance_url": instance_url,
        "table": "incident",
        "active_query": "active=true^stateNOT IN6,7,8",
        "fields": ["number", "short_description", "description", "priority", "impact", "urgency",
                   "category", "subcategory", "assignment_group", "state", "opened_at",
                   "sys_updated_on", "cmdb_ci", "sys_id", "work_notes", "comments"],
        "show_work_notes": False,
    }


# ---------------- Feedback analytics ----------------
class TestFeedbackAnalytics:
    def test_analytics_default(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/feedback/analytics")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["days", "total_analyses", "rated", "up", "down", "helpful_rate", "coverage",
                  "by_model", "by_application", "by_confidence", "trend", "negatives"]:
            assert k in d, f"missing key {k}"
        assert d["days"] == 30
        assert len(d["trend"]) == 30
        assert d["up"] + d["down"] == d["rated"]
        assert isinstance(d["by_model"], list)
        assert isinstance(d["negatives"], list)

    @pytest.mark.parametrize("days,expected", [(7, 7), (30, 30), (90, 90), (1000, 365), (0, 1)])
    def test_analytics_days_clamp(self, admin, days, expected):
        r = admin.get(f"{BASE_URL}/api/admin/feedback/analytics", params={"days": days})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["days"] == expected
        assert len(d["trend"]) == expected

    def test_analytics_group_shape(self, admin):
        d = admin.get(f"{BASE_URL}/api/admin/feedback/analytics", params={"days": 90}).json()
        for g in d["by_model"] + d["by_application"] + d["by_confidence"]:
            assert set(["key", "total", "up", "down", "rate"]).issubset(g.keys())
            assert g["up"] + g["down"] == g["total"]

    def test_analytics_end_user_forbidden(self, enduser):
        r = enduser.get(f"{BASE_URL}/api/admin/feedback/analytics")
        assert r.status_code == 403, r.text

    def test_analytics_unauthenticated(self, api):
        r = api.get(f"{BASE_URL}/api/admin/feedback/analytics")
        assert r.status_code == 401


# ---------------- Bulk import: historical ----------------
class TestImportHistorical:
    def test_import_json_array_with_aliases(self, admin):
        payload = [{"incident_id": "INCT001", "service": "Payments", "description": "Test gateway timeout",
                    "root_cause": "x", "resolution": "y", "confidence": 0.9}]
        r = admin.post(f"{BASE_URL}/api/admin/historical/import", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["received"] == 1
        assert d["inserted"] == 1
        assert d["updated"] == 0
        assert d["error_count"] == 0
        TEST_HIST_NUMBERS.append("INCT001")

        items = admin.get(f"{BASE_URL}/api/admin/historical").json()
        rec = [i for i in items if i.get("number") == "INCT001"]
        assert len(rec) == 1, "record not persisted / duplicated"
        rec = rec[0]
        assert rec["application"] == "Payments"
        assert rec["short_description"] == "Test gateway timeout"
        assert rec["root_cause"] == "x"
        assert rec["resolution"] == "y"
        assert "confidence:0.9" in rec["tags"], rec["tags"]

    def test_reimport_updates_no_duplicate(self, admin):
        payload = [{"incident_id": "INCT001", "service": "Payments", "description": "Test gateway timeout",
                    "root_cause": "x", "resolution": "y2-updated", "confidence": 0.9}]
        r = admin.post(f"{BASE_URL}/api/admin/historical/import", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["updated"] == 1
        assert d["inserted"] == 0
        items = admin.get(f"{BASE_URL}/api/admin/historical").json()
        recs = [i for i in items if i.get("number") == "INCT001"]
        assert len(recs) == 1
        assert recs[0]["resolution"] == "y2-updated"

    def test_import_items_wrapper(self, admin):
        payload = {"items": [{"incident_id": "INCT002", "service": "Cards", "description": "Test wrapper row"}]}
        r = admin.post(f"{BASE_URL}/api/admin/historical/import", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["inserted"] == 1
        TEST_HIST_NUMBERS.append("INCT002")
        items = admin.get(f"{BASE_URL}/api/admin/historical").json()
        assert any(i.get("number") == "INCT002" for i in items)

    def test_import_csv_multipart_50_rows(self, admin):
        lines = ["incident_id,service,description,root_cause,resolution,priority"]
        for i in range(50):
            lines.append(f"INCT1{i:03d},SvcTest,Test csv row {i},cause {i},fix {i},2")
            TEST_HIST_NUMBERS.append(f"INCT1{i:03d}")
        csv_bytes = "\n".join(lines).encode()
        s = admin
        r = s.post(f"{BASE_URL}/api/admin/historical/import",
                   files={"file": ("rows.csv", io.BytesIO(csv_bytes), "text/csv")},
                   headers={"Content-Type": None})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["received"] == 50, d
        assert d["inserted"] == 50, d
        assert d["error_count"] == 0, d
        items = admin.get(f"{BASE_URL}/api/admin/historical").json()
        got = [i for i in items if i.get("number", "").startswith("INCT1")]
        assert len(got) == 50
        sample = [i for i in got if i["number"] == "INCT1000"][0]
        assert sample["application"] == "SvcTest"
        assert sample["priority"] == "2"

    def test_non_object_rows_counted_as_errors(self, admin):
        payload = ["not-an-object", 42, {"incident_id": "INCT003", "description": "ok row"}]
        r = admin.post(f"{BASE_URL}/api/admin/historical/import", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["error_count"] == 2, d
        assert d["inserted"] == 1
        assert len(d["errors"]) == 2
        TEST_HIST_NUMBERS.append("INCT003")

    def test_unknown_target_404(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/applications/import", json=[{"name": "x"}])
        assert r.status_code == 404, r.text

    def test_empty_array_400(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/historical/import", json=[])
        assert r.status_code == 400, r.text

    def test_bad_body_400(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/historical/import", json={"foo": "bar"})
        assert r.status_code == 400, r.text

    def test_end_user_forbidden(self, enduser):
        r = enduser.post(f"{BASE_URL}/api/admin/historical/import", json=[{"incident_id": "X"}])
        assert r.status_code == 403, r.text


# ---------------- Bulk import: kb + rca ----------------
class TestImportKbRca:
    def test_kb_import_and_update(self, admin):
        payload = [{"title": "Import KB test", "content": "steps...", "tags": "a,b", "application": "X"}]
        r = admin.post(f"{BASE_URL}/api/admin/kb/import", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["inserted"] == 1
        TEST_KB_TITLES.append("Import KB test")
        items = admin.get(f"{BASE_URL}/api/admin/kb").json()
        rec = [i for i in items if i.get("title") == "Import KB test"]
        assert len(rec) == 1
        assert rec[0]["content"] == "steps..."
        assert rec[0]["application"] == "X"
        assert set(rec[0]["tags"]) == {"a", "b"}, rec[0]["tags"]

        payload[0]["content"] = "steps v2"
        r2 = admin.post(f"{BASE_URL}/api/admin/kb/import", json=payload)
        assert r2.json()["updated"] == 1
        assert r2.json()["inserted"] == 0
        items = admin.get(f"{BASE_URL}/api/admin/kb").json()
        rec = [i for i in items if i.get("title") == "Import KB test"]
        assert len(rec) == 1
        assert rec[0]["content"] == "steps v2"

    def test_rca_import_autotitle(self, admin):
        payload = [{"incident_number": "INC777", "root_cause": "r", "resolution": "s"}]
        r = admin.post(f"{BASE_URL}/api/admin/rca/import", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["inserted"] == 1
        TEST_RCA_TITLES.append("RCA - INC777")
        items = admin.get(f"{BASE_URL}/api/admin/rca").json()
        rec = [i for i in items if i.get("title") == "RCA - INC777"]
        assert len(rec) == 1, "auto-title not applied"
        assert rec[0]["incident_number"] == "INC777"
        assert rec[0]["root_cause"] == "r"
        assert rec[0]["resolution"] == "s"


# ---------------- Post to ServiceNow ----------------
class TestPostToServiceNow:
    def test_admin_without_sn_creds_428(self, admin):
        # ensure real instance configured
        r = admin.put(f"{BASE_URL}/api/admin/servicenow/config", json=sn_body(REAL_SN_URL))
        assert r.status_code == 200, r.text
        # ensure admin has no SN creds
        admin.delete(f"{BASE_URL}/api/me/servicenow")
        analyses = admin.get(f"{BASE_URL}/api/admin/analyses").json()
        success = [a for a in analyses if a.get("status") == "success"]
        assert success, "no success analysis available in DB"
        aid = success[0]["id"]
        r = admin.post(f"{BASE_URL}/api/analyses/{aid}/post-to-servicenow")
        assert r.status_code == 428, f"{r.status_code} {r.text}"

    def test_end_user_not_owner_404(self, admin, enduser):
        analyses = admin.get(f"{BASE_URL}/api/admin/analyses").json()
        me = enduser.get(f"{BASE_URL}/api/auth/me").json()["email"]
        others = [a for a in analyses if a.get("user_email") != me]
        assert others, "no foreign analysis to test ownership"
        r = enduser.post(f"{BASE_URL}/api/analyses/{others[0]['id']}/post-to-servicenow")
        assert r.status_code == 404, f"{r.status_code} {r.text}"

    def test_nonexistent_analysis_404(self, admin):
        r = admin.post(f"{BASE_URL}/api/analyses/an_doesnotexist/post-to-servicenow")
        assert r.status_code == 404

    def test_demo_mode_analyze_and_post_400(self, admin, enduser):
        ai_cfg = admin.get(f"{BASE_URL}/api/admin/ai/config").json()
        original_limit = ai_cfg.get("rate_limit_per_hour", 10)
        try:
            # demo mode
            r = admin.put(f"{BASE_URL}/api/admin/servicenow/config", json=sn_body(""))
            assert r.status_code == 200, r.text
            assert r.json()["instance_url"] == ""

            quota = enduser.get(f"{BASE_URL}/api/analyses/quota").json()
            if quota.get("remaining") is not None and quota["remaining"] <= 0:
                admin.put(f"{BASE_URL}/api/admin/ai/config", json={**ai_cfg, "rate_limit_per_hour": 0, "api_key": ""})

            t0 = time.time()
            r = enduser.post(f"{BASE_URL}/api/incidents/sn_inc_0001/analyze", timeout=120)
            assert r.status_code == 200, f"{r.status_code} {r.text}"
            d = r.json()
            assert "analysis_id" in d and d["analysis_id"]
            assert d["incident_number"] == "INC0091823"
            an = d["analysis"]
            for k in ["likely_root_cause", "business_impact", "recommended_immediate_action",
                      "preventive_action", "confidence", "confidence_explanation"]:
                assert k in an, f"missing analysis key {k}"
            print(f"analyze took {time.time()-t0:.1f}s")

            # application field persisted on new record
            mine = enduser.get(f"{BASE_URL}/api/analyses/mine").json()
            rec = [a for a in mine if a["id"] == d["analysis_id"]]
            assert rec, "analysis not in /analyses/mine"
            assert rec[0]["application"] == "Core Payment API", rec[0].get("application")
            assert rec[0]["status"] == "success"

            # post to SN in demo mode -> 400 Demo mode
            pr = enduser.post(f"{BASE_URL}/api/analyses/{d['analysis_id']}/post-to-servicenow")
            assert pr.status_code == 400, f"{pr.status_code} {pr.text}"
            assert "demo mode" in pr.json().get("detail", "").lower(), pr.text

            # feedback still works on this analysis (regression)
            fr = enduser.post(f"{BASE_URL}/api/analyses/{d['analysis_id']}/feedback",
                              json={"rating": "up", "comment": "TEST_it3 feedback"})
            assert fr.status_code == 200, fr.text
            assert fr.json()["feedback"]["rating"] == "up"
        finally:
            admin.put(f"{BASE_URL}/api/admin/ai/config", json={**ai_cfg, "rate_limit_per_hour": original_limit, "api_key": ""})
            admin.put(f"{BASE_URL}/api/admin/servicenow/config", json=sn_body(REAL_SN_URL))


# ---------------- Regression ----------------
class TestRegression:
    def test_health(self, api):
        r = api.get(f"{BASE_URL}/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_sn_config_restored(self, admin):
        d = admin.get(f"{BASE_URL}/api/admin/servicenow/config").json()
        assert d["instance_url"] == REAL_SN_URL, d
        assert d["table"] == "incident"
        assert not d["show_work_notes"]

    def test_incidents_admin_428_without_creds(self, admin):
        r = admin.get(f"{BASE_URL}/api/incidents")
        assert r.status_code == 428, f"{r.status_code} {r.text[:200]}"

    def test_me_servicenow_admin(self, admin):
        d = admin.get(f"{BASE_URL}/api/me/servicenow").json()
        assert d["configured"]
        assert not d["has_credentials"]
        assert d["instance_url"] == REAL_SN_URL

    def test_quota_endpoint(self, enduser):
        r = enduser.get(f"{BASE_URL}/api/analyses/quota")
        assert r.status_code == 200
        d = r.json()
        assert set(["limit", "used", "remaining"]).issubset(d.keys())
        assert d["limit"] == 10, d

    def test_kb_upload(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/kb/upload",
                       files={"file": ("TEST_it3_upload.md", io.BytesIO(b"# Title\nsome runbook steps"), "text/markdown")},
                       data={"application": "X", "tags": "test"},
                       headers={"Content-Type": None})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == "TEST it3 upload"
        admin.delete(f"{BASE_URL}/api/admin/kb/{d['id']}")

    def test_audit_contains_import_action(self, admin):
        logs = admin.get(f"{BASE_URL}/api/admin/audit").json()
        actions = {a["action"] for a in logs}
        assert "historical.import" in actions, sorted(actions)
        assert "kb.import" in actions
        assert "rca.import" in actions

    def test_dashboard(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/dashboard")
        assert r.status_code == 200
        d = r.json()
        assert d["historical"] > 0 and d["kb"] > 0


# ---------------- Cleanup ----------------
class TestZZCleanup:
    def test_cleanup_imported_records(self, admin):
        items = admin.get(f"{BASE_URL}/api/admin/historical").json()
        deleted = 0
        for i in items:
            n = i.get("number", "")
            if n in PROTECTED_HIST or n.startswith("INC00"):
                continue
            if n in TEST_HIST_NUMBERS or n.startswith("INCT"):
                r = admin.delete(f"{BASE_URL}/api/admin/historical/{i['id']}")
                assert r.status_code == 200
                deleted += 1
        print(f"deleted {deleted} historical test records")
        kb = admin.get(f"{BASE_URL}/api/admin/kb").json()
        for i in kb:
            if i.get("title") in TEST_KB_TITLES:
                admin.delete(f"{BASE_URL}/api/admin/kb/{i['id']}")
        rca = admin.get(f"{BASE_URL}/api/admin/rca").json()
        for i in rca:
            if i.get("title") in TEST_RCA_TITLES:
                admin.delete(f"{BASE_URL}/api/admin/rca/{i['id']}")
        # verify protected records intact
        items = admin.get(f"{BASE_URL}/api/admin/historical").json()
        nums = {i.get("number") for i in items}
        for p in PROTECTED_HIST:
            assert p in nums, f"protected record {p} missing!"
        assert not any((i.get("number") or "").startswith("INCT") for i in items)
