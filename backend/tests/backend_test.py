"""Backend regression suite for AI Incident Analyzer."""
import pytest
from conftest import BASE_URL, ADMIN_TOKEN, END_USER_TOKEN

ADMIN_ROUTES = [
    "/api/admin/dashboard",
    "/api/admin/kb",
    "/api/admin/rca",
    "/api/admin/historical",
    "/api/admin/applications",
    "/api/admin/servicenow/config",
    "/api/admin/ai/config",
    "/api/admin/analyses",
    "/api/admin/audit",
]


# ---------- Health ----------
class TestHealth:
    def test_health(self, api):
        r = api.get(f"{BASE_URL}/api/health")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "ok"
        assert isinstance(d.get("time"), str)


# ---------- Auth ----------
class TestAuth:
    def test_incidents_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/incidents")
        assert r.status_code == 401, r.text

    def test_me_unauthenticated(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_admin(self, admin):
        r = admin.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["role"] == "admin"
        assert d["email"] == "admin@test.local"

    def test_me_end_user(self, enduser):
        r = enduser.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["role"] == "end_user"
        assert d["email"] == "user@test.local"

    def test_invalid_token_rejected(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer bogus_token_xyz"})
        assert r.status_code == 401

    def test_session_invalid_session_id(self, api):
        r = api.post(f"{BASE_URL}/api/auth/session", json={"session_id": "not-a-real-session"})
        assert r.status_code == 401, r.text


# ---------- Incidents (end user) ----------
# NOTE (iteration 2): a real ServiceNow instance is configured, so incident endpoints
# now require per-user credentials (428) and surface SN auth failures as 424.
# Demo-mode list/detail/analyze coverage lives in tests/test_new_features.py.
class TestIncidents:
    def test_list_incidents_requires_or_rejects_credentials(self, enduser):
        r = enduser.get(f"{BASE_URL}/api/incidents")
        # 200 in demo mode; 428/424 when a real instance is configured
        assert r.status_code in (200, 428, 424), r.text[:300]
        assert "application/json" in r.headers.get("content-type", "")
        if r.status_code != 200:
            assert "servicenow" in r.json()["detail"].lower()

    def test_get_incident_credential_error_is_json(self, enduser):
        r = enduser.get(f"{BASE_URL}/api/incidents/sn_inc_0001")
        assert r.status_code in (200, 428, 424), r.text[:300]
        assert "<html" not in r.text.lower()

    def test_get_incident_invalid_id(self, enduser):
        r = enduser.get(f"{BASE_URL}/api/incidents/bad$id")
        assert r.status_code in (400, 404), r.text


# ---------- AI Analysis ----------
class TestAnalyze:
    ANALYSIS_KEYS = [
        "likely_root_cause", "business_impact", "recommended_immediate_action",
        "preventive_action", "confidence", "confidence_explanation",
    ]

    def test_analyze_requires_auth(self, api):
        r = api.post(f"{BASE_URL}/api/incidents/sn_inc_0001/analyze")
        assert r.status_code == 401

    def test_end_user_analyze_credential_error(self, enduser):
        # Real SN instance configured -> analyze cannot fetch the incident without valid creds.
        # Successful demo-mode analyze is covered in tests/test_new_features.py.
        r = enduser.post(f"{BASE_URL}/api/incidents/sn_inc_0001/analyze", timeout=120)
        assert r.status_code in (200, 428, 424, 429), r.text[:300]
        assert "<html" not in r.text.lower()

    def test_my_analyses_scoped(self, enduser, admin):
        r = enduser.get(f"{BASE_URL}/api/analyses/mine")
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1
        assert all(i["user_email"] == "user@test.local" for i in items)
        assert all("_id" not in i for i in items)

        ra = admin.get(f"{BASE_URL}/api/analyses/mine")
        assert ra.status_code == 200
        assert all(i["user_email"] == "admin@test.local" for i in ra.json())


# ---------- RBAC ----------
class TestRBAC:
    @pytest.mark.parametrize("route", ADMIN_ROUTES)
    def test_end_user_denied(self, enduser, route):
        r = enduser.get(f"{BASE_URL}{route}")
        assert r.status_code == 403, f"{route} -> {r.status_code}"

    @pytest.mark.parametrize("route", ADMIN_ROUTES)
    def test_unauthenticated_denied(self, api, route):
        r = api.get(f"{BASE_URL}{route}")
        assert r.status_code == 401, f"{route} -> {r.status_code}"

    def test_end_user_denied_write_routes(self, enduser):
        assert enduser.post(f"{BASE_URL}/api/admin/applications", json={"name": "TEST_x"}).status_code == 403
        assert enduser.post(f"{BASE_URL}/api/admin/ai/test").status_code == 403
        assert enduser.post(f"{BASE_URL}/api/admin/servicenow/test").status_code == 403
        assert enduser.delete(f"{BASE_URL}/api/admin/kb/kb_k001").status_code == 403


# ---------- Admin dashboard ----------
class TestDashboard:
    def test_dashboard(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/dashboard")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("users", "analyses", "kb", "rca", "applications", "historical"):
            assert k in d and isinstance(d[k], int), k
        assert d["users"] >= 2
        assert d["kb"] >= 7
        assert d["historical"] >= 7
        assert isinstance(d["recent_analyses"], list)
        assert all("_id" not in a for a in d["recent_analyses"])


# ---------- ServiceNow config ----------
class TestServiceNowConfig:
    def test_get_default_config(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/servicenow/config")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["table"] == "incident"
        assert d["show_work_notes"] is False
        assert isinstance(d["fields"], list)
        # iteration 2: credentials are per-user, never part of admin config
        assert "password" not in d and "username" not in d

    def test_put_preserves_config(self, admin):
        original = admin.get(f"{BASE_URL}/api/admin/servicenow/config").json()
        p = admin.put(f"{BASE_URL}/api/admin/servicenow/config", json={**original, "show_work_notes": True})
        assert p.status_code == 200, p.text
        assert p.json()["show_work_notes"] is True
        assert "password" not in p.json()
        # restore
        back = admin.put(f"{BASE_URL}/api/admin/servicenow/config", json=original)
        assert back.status_code == 200
        assert back.json()["instance_url"] == original["instance_url"]
        assert back.json()["show_work_notes"] is False

    def test_test_connection_requires_personal_credentials(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/servicenow/test")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is False
        assert "credentials" in d["message"].lower() or "authentication" in d["message"].lower()


# ---------- AI config ----------
class TestAIConfig:
    def test_get_ai_config(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/ai/config")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["provider"] == "openai"
        assert d["model"] == "gpt-4o-mini"
        assert d["use_emergent_key"] is True
        assert d["api_key"] in ("", "\u2022" * 8)

    def test_put_ai_config(self, admin):
        original = admin.get(f"{BASE_URL}/api/admin/ai/config").json()
        payload = {**original, "temperature": 0.35, "max_tokens": 1200, "api_key": ""}
        p = admin.put(f"{BASE_URL}/api/admin/ai/config", json=payload)
        assert p.status_code == 200, p.text
        assert p.json()["temperature"] == 0.35
        g = admin.get(f"{BASE_URL}/api/admin/ai/config").json()
        assert g["temperature"] == 0.35
        assert g["max_tokens"] == 1200
        # restore
        admin.put(f"{BASE_URL}/api/admin/ai/config", json={**original, "api_key": ""})
        assert admin.get(f"{BASE_URL}/api/admin/ai/config").json()["temperature"] == original["temperature"]

    def test_ai_test_pong(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/ai/test", timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True, d
        assert "PONG" in d.get("sample", "").upper()


# ---------- Admin CRUD ----------
CRUD_CASES = [
    ("applications", {"name": "TEST_App", "tier": "T3", "owner": "qa@test.local", "sla_minutes": 45},
     {"name": "TEST_App_Updated", "tier": "T1", "owner": "qa@test.local", "sla_minutes": 15}, "name"),
    ("kb", {"title": "TEST_KB", "application": "TEST_App", "tags": ["test"], "content": "step 1"},
     {"title": "TEST_KB_Updated", "application": "TEST_App", "tags": ["test", "b"], "content": "step 2"}, "title"),
    ("rca", {"title": "TEST_RCA", "application": "TEST_App", "incident_number": "INC_TEST", "root_cause": "rc", "resolution": "res", "tags": []},
     {"title": "TEST_RCA_Updated", "application": "TEST_App", "incident_number": "INC_TEST", "root_cause": "rc2", "resolution": "res2", "tags": []}, "title"),
    ("historical", {"number": "INC_TEST_H", "short_description": "TEST_hist", "application": "TEST_App", "priority": "2", "root_cause": "x", "resolution": "y"},
     {"number": "INC_TEST_H", "short_description": "TEST_hist_Updated", "application": "TEST_App", "priority": "1", "root_cause": "x2", "resolution": "y2"}, "short_description"),
]


class TestAdminCRUD:
    @pytest.mark.parametrize("name,create,update,field", CRUD_CASES)
    def test_crud_lifecycle(self, admin, name, create, update, field):
        # CREATE
        c = admin.post(f"{BASE_URL}/api/admin/{name}", json=create)
        assert c.status_code == 200, c.text
        doc = c.json()
        assert "_id" not in doc
        item_id = doc["id"]
        assert isinstance(item_id, str) and item_id
        assert doc[field] == create[field]

        try:
            # LIST verifies persistence
            lst = admin.get(f"{BASE_URL}/api/admin/{name}")
            assert lst.status_code == 200
            items = lst.json()
            found = [i for i in items if i["id"] == item_id]
            assert found, f"created {name} not in list"
            assert found[0][field] == create[field]

            # UPDATE
            u = admin.put(f"{BASE_URL}/api/admin/{name}/{item_id}", json=update)
            assert u.status_code == 200, u.text
            assert u.json()[field] == update[field]
            assert u.json()["id"] == item_id

            items = admin.get(f"{BASE_URL}/api/admin/{name}").json()
            found = [i for i in items if i["id"] == item_id]
            assert found and found[0][field] == update[field], "update not persisted"
        finally:
            # DELETE
            d = admin.delete(f"{BASE_URL}/api/admin/{name}/{item_id}")
            assert d.status_code == 200, d.text
            assert d.json()["ok"] is True
            items = admin.get(f"{BASE_URL}/api/admin/{name}").json()
            assert not [i for i in items if i["id"] == item_id], "delete not persisted"

    def test_create_validation_error(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/applications", json={"tier": "T1"})
        assert r.status_code == 422, r.text

    def test_update_nonexistent_id(self, admin):
        r = admin.put(f"{BASE_URL}/api/admin/applications/does_not_exist",
                      json={"name": "TEST_ghost", "tier": "T3", "owner": "", "sla_minutes": 10})
        # Ideally 404; document actual behavior
        assert r.status_code in (200, 404), r.text
        if r.status_code == 200:
            items = admin.get(f"{BASE_URL}/api/admin/applications").json()
            assert not [i for i in items if i["id"] == "does_not_exist"], "ghost record created"


# ---------- Analyses + audit ----------
class TestAnalysesAndAudit:
    def test_admin_analyses(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/analyses")
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list) and len(items) >= 1
        first = items[0]
        for k in ("id", "incident_number", "user_email", "model", "confidence", "status", "result", "created_at"):
            assert k in first, k
        assert "_id" not in first

    def test_audit_log_entries_and_no_secrets(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/audit")
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list) and len(items) >= 1
        actions = {i["action"] for i in items}
        assert "incident.analyze" in actions, actions
        assert any(a.startswith("config.") for a in actions), actions
        blob = str(items).lower()
        for secret in ("test_secret_pw", "password", "api_key", "emergent_llm_key"):
            assert secret not in blob, f"secret-ish key '{secret}' leaked in audit meta"
        for i in items:
            assert "_id" not in i
