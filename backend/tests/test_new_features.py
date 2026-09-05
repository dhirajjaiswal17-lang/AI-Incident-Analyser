"""Iteration-2 feature tests: per-user ServiceNow credentials, analyst feedback,
KB document upload, and analyze rate limiting.

Run serially:  cd /app/backend && python -m pytest tests/test_new_features.py -n 0 -v
(config-mutating tests share one backend, so xdist parallelism is disabled here)
"""
import io
import os
import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")

backend_env = dotenv_values("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL") or backend_env.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or backend_env.get("DB_NAME")

from conftest import ADMIN_TOKEN as ADMIN, END_USER_TOKEN as END

REAL_INSTANCE = "https://dev414250.service-now.com"
DEFAULT_FIELDS = ["number", "short_description", "description", "priority", "impact", "urgency",
                  "category", "subcategory", "assignment_group", "state", "opened_at",
                  "sys_updated_on", "cmdb_ci", "sys_id", "work_notes", "comments"]
SN_DEFAULT = {"instance_url": REAL_INSTANCE, "table": "incident",
              "active_query": "active=true^stateNOT IN6,7,8", "fields": DEFAULT_FIELDS,
              "show_work_notes": False}
AI_DEFAULT = {"provider": "openai", "model": "gpt-4o-mini", "temperature": 0.2,
              "max_tokens": 1400, "api_key": "", "use_emergent_key": True,
              "rate_limit_per_hour": 10}


def cli(token=None):
    s = requests.Session()
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return cli(ADMIN)


@pytest.fixture(scope="module")
def enduser():
    return cli(END)


@pytest.fixture(scope="module")
def anon():
    return cli()


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module", autouse=True)
def restore_config():
    """Guarantee ServiceNow + AI config are restored to defaults after this module."""
    yield
    a = cli(ADMIN)
    r1 = a.put(f"{BASE_URL}/api/admin/servicenow/config", json=SN_DEFAULT)
    r2 = a.put(f"{BASE_URL}/api/admin/ai/config", json=AI_DEFAULT)
    assert r1.status_code == 200 and r1.json()["instance_url"] == REAL_INSTANCE
    assert r2.status_code == 200 and r2.json()["rate_limit_per_hour"] == 10
    # remove creds we saved for the admin test user (restore 428 state)
    a.delete(f"{BASE_URL}/api/me/servicenow")


def set_sn(admin, instance_url):
    r = admin.put(f"{BASE_URL}/api/admin/servicenow/config", json={**SN_DEFAULT, "instance_url": instance_url})
    assert r.status_code == 200, r.text
    return r.json()


def set_ai(admin, **over):
    r = admin.put(f"{BASE_URL}/api/admin/ai/config", json={**AI_DEFAULT, **over})
    assert r.status_code == 200, r.text
    return r.json()


def _minimal_pdf(text: str) -> bytes:
    """Build a tiny valid single-page PDF containing `text` (no external deps)."""
    content = f"BT /F1 18 Tf 40 700 Td ({text}) Tj ET".encode()
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    xref_at = len(out)
    out += f"xref\n0 {len(objs)+1}\n".encode() + b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode()
    return bytes(out)


# ---------------- Feature 1: per-user ServiceNow credentials ----------------
class TestPerUserSNCredentials:
    def test_status_requires_auth(self, anon):
        r = anon.get(f"{BASE_URL}/api/me/servicenow")
        assert r.status_code == 401
        assert r.json()["detail"] == "Not authenticated"

    def test_status_shape_admin_no_creds(self, admin):
        r = admin.get(f"{BASE_URL}/api/me/servicenow")
        assert r.status_code == 200
        d = r.json()
        for k in ("configured", "instance_url", "has_credentials", "username"):
            assert k in d
        assert d["configured"]
        assert d["instance_url"] == REAL_INSTANCE
        assert not d["has_credentials"]
        assert d["username"] == ""

    def test_real_instance_no_creds_returns_428(self, admin):
        for path in ("/api/incidents", "/api/incidents/sn_inc_0001",
                     "/api/incidents/sn_inc_0001/analyze"):
            method = admin.post if path.endswith("analyze") else admin.get
            r = method(f"{BASE_URL}{path}")
            assert r.status_code == 428, f"{path} -> {r.status_code} {r.text[:200]}"
            assert "application/json" in r.headers.get("content-type", "")
            assert r.json()["detail"] == "ServiceNow credentials required"

    def test_admin_sn_test_without_personal_creds(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/servicenow/test")
        assert r.status_code == 200
        d = r.json()
        assert not d["ok"]
        assert d["message"] == "ServiceNow credentials required"

    def test_save_validation(self, admin):
        for body in ({"username": "", "password": "x"}, {"username": "u", "password": ""},
                     {"username": "   ", "password": "x"}):
            r = admin.put(f"{BASE_URL}/api/me/servicenow", json=body)
            assert r.status_code == 400, f"{body} -> {r.status_code}"
            assert "required" in r.json()["detail"].lower()

    def test_save_encrypts_and_persists(self, admin, mongo):
        r = admin.put(f"{BASE_URL}/api/me/servicenow",
                      json={"username": " TEST_sn_user ", "password": "TEST_pw_123"})
        assert r.status_code == 200
        assert r.json() == {"ok": True, "username": "TEST_sn_user"}

        got = admin.get(f"{BASE_URL}/api/me/servicenow").json()
        assert got["has_credentials"]
        assert got["username"] == "TEST_sn_user"

        admin_user = mongo.users.find_one({"email": "admin@test.local"})
        doc = mongo.sn_credentials.find_one({"user_id": admin_user["user_id"]})
        assert doc is not None
        assert doc["username"] == "TEST_sn_user"
        assert doc["password"].startswith("gAAAA"), "password not Fernet-encrypted at rest"
        assert "TEST_pw_123" not in doc["password"]

    def test_test_endpoint_wrong_creds_returns_json_not_exception(self, admin):
        r = admin.post(f"{BASE_URL}/api/me/servicenow/test")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert not d["ok"]
        assert isinstance(d["message"], str) and d["message"]
        assert "<html" not in d["message"].lower()

    def test_wrong_creds_incidents_returns_424_json(self, admin):
        r = admin.get(f"{BASE_URL}/api/incidents")
        assert r.status_code == 424, f"{r.status_code} {r.text[:300]}"
        assert "application/json" in r.headers.get("content-type", "")
        detail = r.json()["detail"]
        assert "<html" not in detail.lower()
        assert "servicenow" in detail.lower()

    def test_enduser_with_dummy_creds_gets_424(self, enduser):
        st = enduser.get(f"{BASE_URL}/api/me/servicenow").json()
        if not st["has_credentials"]:
            assert enduser.put(f"{BASE_URL}/api/me/servicenow",
                               json={"username": "sre.user", "password": "secret1"}).status_code == 200
        r = enduser.get(f"{BASE_URL}/api/incidents/sn_inc_0001")
        assert r.status_code == 424, f"{r.status_code} {r.text[:300]}"
        assert "application/json" in r.headers.get("content-type", "")

    def test_delete_removes_credentials(self, admin, mongo):
        r = admin.delete(f"{BASE_URL}/api/me/servicenow")
        assert r.status_code == 200 and r.json()["ok"]
        assert not admin.get(f"{BASE_URL}/api/me/servicenow").json()["has_credentials"]
        admin_user = mongo.users.find_one({"email": "admin@test.local"})
        assert mongo.sn_credentials.find_one({"user_id": admin_user["user_id"]}) is None
        # 428 state restored
        assert admin.get(f"{BASE_URL}/api/incidents").status_code == 428


# ---------------- Admin ServiceNow config ----------------
class TestAdminSNConfig:
    def test_config_has_no_credentials_keys(self, admin):
        d = admin.get(f"{BASE_URL}/api/admin/servicenow/config").json()
        assert "username" not in d and "password" not in d

    def test_url_normalization(self, admin):
        out = set_sn(admin, f"{REAL_INSTANCE}/api/now/table/incident")
        assert out["instance_url"] == REAL_INSTANCE
        assert admin.get(f"{BASE_URL}/api/admin/servicenow/config").json()["instance_url"] == REAL_INSTANCE

    def test_normalization_adds_scheme(self, admin):
        out = set_sn(admin, "dev414250.service-now.com/")
        assert out["instance_url"] == REAL_INSTANCE
        set_sn(admin, REAL_INSTANCE)


# ---------------- Demo mode + feedback + rate limit ----------------
class TestDemoAnalyzeFeedbackQuota:
    def test_demo_mode_list(self, admin, enduser):
        set_sn(admin, "")
        d = enduser.get(f"{BASE_URL}/api/incidents").json()
        assert d["demo"]
        assert d["total"] == 8 and len(d["items"]) == 8

    def test_quota_shapes(self, admin, enduser):
        set_ai(admin, rate_limit_per_hour=10)
        q = enduser.get(f"{BASE_URL}/api/analyses/quota")
        assert q.status_code == 200
        qd = q.json()
        assert qd["limit"] == 10
        assert isinstance(qd["used"], int)
        assert qd["remaining"] == max(0, 10 - qd["used"])

        aq = admin.get(f"{BASE_URL}/api/analyses/quota").json()
        assert aq == {"limit": 0, "used": 0, "remaining": None}

        cfg = admin.get(f"{BASE_URL}/api/admin/ai/config").json()
        assert cfg["rate_limit_per_hour"] == 10

    def test_analyze_and_feedback_flow(self, admin, enduser):
        # make sure the end user has headroom
        set_ai(admin, rate_limit_per_hour=0)
        r = enduser.post(f"{BASE_URL}/api/incidents/sn_inc_0001/analyze", timeout=120)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert set(("analysis", "analysis_id", "incident_number", "model")).issubset(d)
        assert d["analysis_id"].startswith("an_")
        assert d["incident_number"] == "INC0091823"
        assert d["model"] == "openai/gpt-4o-mini"
        for k in ("likely_root_cause", "business_impact", "recommended_immediate_action",
                  "preventive_action", "confidence"):
            assert k in d["analysis"], f"missing {k}"
        aid = d["analysis_id"]

        # wrong rating -> 400
        bad = enduser.post(f"{BASE_URL}/api/analyses/{aid}/feedback", json={"rating": "meh"})
        assert bad.status_code == 400
        assert "up" in bad.json()["detail"]

        # other user -> 404
        other = admin.post(f"{BASE_URL}/api/analyses/{aid}/feedback", json={"rating": "up"})
        assert other.status_code == 404

        ok = enduser.post(f"{BASE_URL}/api/analyses/{aid}/feedback",
                          json={"rating": "down", "comment": "TEST_not helpful"})
        assert ok.status_code == 200
        fb = ok.json()["feedback"]
        assert ok.json()["ok"]
        assert fb["rating"] == "down"
        assert fb["comment"] == "TEST_not helpful"
        assert fb["by"] == "user@test.local"
        assert fb["ts"]

        # visible to admin analysis history
        rows = admin.get(f"{BASE_URL}/api/admin/analyses").json()
        row = next((x for x in rows if x["id"] == aid), None)
        assert row is not None, "analysis missing from admin history"
        assert row["feedback"]["rating"] == "down"
        assert row["feedback"]["comment"] == "TEST_not helpful"

        # dashboard aggregates
        dash = admin.get(f"{BASE_URL}/api/admin/dashboard").json()
        assert dash["feedback_total"] >= 1
        assert isinstance(dash["feedback_up"], int)
        assert dash["helpful_rate"] is None or isinstance(dash["helpful_rate"], int)

    def test_rate_limit_enforced_for_enduser_not_admin(self, admin, enduser):
        used = enduser.get(f"{BASE_URL}/api/analyses/quota").json()["used"]
        set_ai(admin, rate_limit_per_hour=max(1, used))
        q = enduser.get(f"{BASE_URL}/api/analyses/quota").json()
        assert q["remaining"] == 0, q

        r = enduser.post(f"{BASE_URL}/api/incidents/sn_inc_0002/analyze", timeout=60)
        assert r.status_code == 429, f"{r.status_code} {r.text[:300]}"
        assert "Rate limit reached" in r.json()["detail"]

        # admin exempt
        ar = admin.post(f"{BASE_URL}/api/incidents/sn_inc_0002/analyze", timeout=120)
        assert ar.status_code == 200, ar.text[:300]
        assert ar.json()["analysis_id"].startswith("an_")

        set_ai(admin, rate_limit_per_hour=10)

    def test_restore_real_instance(self, admin):
        out = set_sn(admin, REAL_INSTANCE)
        assert out["instance_url"] == REAL_INSTANCE
        assert out["table"] == "incident"
        assert not out["show_work_notes"]
        assert out["active_query"] == "active=true^stateNOT IN6,7,8"
        assert out["fields"] == DEFAULT_FIELDS


# ---------------- Feature 3: KB upload ----------------
class TestKBUpload:
    created = []

    @classmethod
    def teardown_class(cls):
        a = cli(ADMIN)
        for kb_id in cls.created:
            a.delete(f"{BASE_URL}/api/admin/kb/{kb_id}")

    def test_upload_markdown(self, admin):
        content = "# TEST_Playbook\n\nStep 1 restart pods.\nStep 2 check logs."
        r = admin.post(f"{BASE_URL}/api/admin/kb/upload",
                       files={"file": ("TEST_my-upload_doc.md", content.encode(), "text/markdown")},
                       data={"tags": "TEST_a, TEST_b", "application": "Core Payment API"})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        self.__class__.created.append(d["id"])
        assert d["id"].startswith("kb_")
        assert d["title"] == "TEST my upload doc"
        assert d["content"] == content
        assert d["tags"] == ["TEST_a", "TEST_b"]
        assert d["application"] == "Core Payment API"
        assert d["source_file"] == "TEST_my-upload_doc.md"
        assert "_id" not in d

        listing = admin.get(f"{BASE_URL}/api/admin/kb").json()
        found = next((x for x in listing if x["id"] == d["id"]), None)
        assert found is not None
        assert found["title"] == "TEST my upload doc"
        assert found["content"] == content

    def test_upload_txt(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/kb/upload",
                       files={"file": ("TEST_notes.txt", b"plain text runbook", "text/plain")})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        self.__class__.created.append(d["id"])
        assert d["title"] == "TEST notes"
        assert d["content"] == "plain text runbook"
        assert d["tags"] == []

    def test_upload_pdf_text_extracted(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/kb/upload",
                       files={"file": ("TEST_pdf-doc.pdf", _minimal_pdf("TEST_PDF_CONTENT ledger reconciliation"),
                                       "application/pdf")})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        self.__class__.created.append(d["id"])
        assert d["title"] == "TEST pdf doc"
        assert "TEST_PDF_CONTENT" in d["content"]

    def test_unsupported_type(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/kb/upload",
                       files={"file": ("TEST_doc.docx", b"PK\x03\x04junk",
                                       "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})
        assert r.status_code == 400, r.text[:300]
        assert "Unsupported file type" in r.json()["detail"]

    def test_empty_file(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/kb/upload",
                       files={"file": ("TEST_empty.txt", b"   \n  ", "text/plain")})
        assert r.status_code == 400, r.text[:300]
        assert "No readable text" in r.json()["detail"]

    def test_enduser_forbidden(self, enduser):
        r = enduser.post(f"{BASE_URL}/api/admin/kb/upload",
                         files={"file": ("TEST_x.txt", b"hello", "text/plain")})
        assert r.status_code == 403
        assert r.json()["detail"] == "Admin access required"

    def test_anon_unauthorized(self, anon):
        r = anon.post(f"{BASE_URL}/api/admin/kb/upload",
                      files={"file": ("TEST_x.txt", b"hello", "text/plain")})
        assert r.status_code == 401


# ---------------- Regression ----------------
class TestRegression:
    def test_auth_me(self, admin, enduser):
        a = admin.get(f"{BASE_URL}/api/auth/me").json()
        assert a["role"] == "admin" and a["email"] == "admin@test.local"
        e = enduser.get(f"{BASE_URL}/api/auth/me").json()
        assert e["role"] == "end_user"

    def test_role_enforcement(self, enduser):
        for p in ("/api/admin/dashboard", "/api/admin/kb", "/api/admin/audit",
                  "/api/admin/ai/config", "/api/admin/servicenow/config", "/api/admin/analyses"):
            r = enduser.get(f"{BASE_URL}{p}")
            assert r.status_code == 403, f"{p} -> {r.status_code}"

    def test_admin_crud_lifecycle(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/rca", json={"title": "TEST_rca", "root_cause": "rc", "resolution": "res"})
        assert r.status_code == 200, r.text[:200]
        rid = r.json()["id"]
        up = admin.put(f"{BASE_URL}/api/admin/rca/{rid}",
                       json={"title": "TEST_rca2", "root_cause": "rc2", "resolution": "res"})
        assert up.status_code == 200 and up.json()["title"] == "TEST_rca2"
        assert any(x["id"] == rid and x["title"] == "TEST_rca2"
                   for x in admin.get(f"{BASE_URL}/api/admin/rca").json())
        assert admin.delete(f"{BASE_URL}/api/admin/rca/{rid}").status_code == 200
        assert all(x["id"] != rid for x in admin.get(f"{BASE_URL}/api/admin/rca").json())

    def test_audit_log(self, admin):
        items = admin.get(f"{BASE_URL}/api/admin/audit").json()
        assert isinstance(items, list) and items
        txt = str(items)
        assert "TEST_pw_123" not in txt and "secret1" not in txt

    def test_my_analyses(self, enduser):
        items = enduser.get(f"{BASE_URL}/api/analyses/mine").json()
        assert isinstance(items, list)
        assert all(x["user_email"] == "user@test.local" for x in items)

    def test_ai_test_pong(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/ai/test", timeout=90)
        assert r.status_code == 200
        assert r.json()["ok"], r.text[:300]
