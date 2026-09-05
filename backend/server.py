"""AI Incident Analyzer - Backend API
Enterprise banking IT production support: ServiceNow + LLM incident analysis.
"""
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response, Cookie, Query
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, uuid, json, re, asyncio, base64
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import datetime, timezone, timedelta
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("incident-analyzer")

# ---------- DB ----------
mongo_url = os.environ['MONGO_URL']
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ['DB_NAME']]

app = FastAPI(title="AI Incident Analyzer")
api = APIRouter(prefix="/api")

# ---------- Utils ----------
def utcnow():
    return datetime.now(timezone.utc)

def iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None: return None
    if isinstance(dt, str): return dt
    if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()

def new_id(prefix="id"):
    return f"{prefix}_{uuid.uuid4().hex[:12]}"

# ---------- Models ----------
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "end_user"  # or "admin"
    created_at: str

class AuthPayload(BaseModel):
    session_id: str

class ServiceNowConfig(BaseModel):
    instance_url: str = ""
    username: str = ""
    password: str = ""
    table: str = "incident"
    active_query: str = "active=true^stateNOT IN6,7,8"
    fields: List[str] = Field(default_factory=lambda: [
        "number","short_description","description","priority","impact","urgency",
        "category","subcategory","assignment_group","state","opened_at","sys_updated_on",
        "cmdb_ci","sys_id","work_notes","comments"
    ])
    show_work_notes: bool = False

class AIConfig(BaseModel):
    provider: str = "openai"        # openai | anthropic | gemini
    model: str = "gpt-4o-mini"
    temperature: float = 0.2
    max_tokens: int = 1400
    api_key: str = ""               # if empty, uses EMERGENT_LLM_KEY
    use_emergent_key: bool = True

class Application(BaseModel):
    id: str = Field(default_factory=lambda: new_id("app"))
    name: str
    tier: str = "T2"
    owner: str = ""
    sla_minutes: int = 60
    disabled: bool = False
    created_at: str = Field(default_factory=lambda: iso(utcnow()))

class KBArticle(BaseModel):
    id: str = Field(default_factory=lambda: new_id("kb"))
    title: str
    tags: List[str] = []
    application: str = ""
    content: str
    created_at: str = Field(default_factory=lambda: iso(utcnow()))

class RCA(BaseModel):
    id: str = Field(default_factory=lambda: new_id("rca"))
    title: str
    application: str = ""
    incident_number: str = ""
    root_cause: str
    resolution: str
    tags: List[str] = []
    created_at: str = Field(default_factory=lambda: iso(utcnow()))

class HistoricalIncident(BaseModel):
    id: str = Field(default_factory=lambda: new_id("hist"))
    number: str
    short_description: str
    description: str = ""
    application: str = ""
    priority: str = "3"
    resolution: str = ""
    root_cause: str = ""
    resolved_at: str = ""
    tags: List[str] = []

class AnalysisRecord(BaseModel):
    id: str = Field(default_factory=lambda: new_id("an"))
    incident_number: str
    incident_sys_id: str
    user_email: str
    model: str
    confidence: str
    status: str
    result: Dict[str, Any]
    created_at: str = Field(default_factory=lambda: iso(utcnow()))

# ---------- Auth ----------
async def audit(action: str, user_email: str, meta: Optional[Dict[str, Any]] = None):
    await db.audit_logs.insert_one({
        "id": new_id("log"),
        "ts": iso(utcnow()),
        "action": action,
        "user_email": user_email,
        "meta": meta or {},
    })

async def get_session_token(request: Request) -> Optional[str]:
    tok = request.cookies.get("session_token")
    if tok: return tok
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "): return auth.split(" ", 1)[1].strip()
    return None

async def current_user(request: Request) -> Optional[Dict[str, Any]]:
    tok = await get_session_token(request)
    if not tok: return None
    session = await db.user_sessions.find_one({"session_token": tok}, {"_id": 0})
    if not session: return None
    exp = session.get("expires_at")
    if isinstance(exp, str): exp = datetime.fromisoformat(exp)
    if exp and exp.tzinfo is None: exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp < utcnow(): return None
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    return user

async def require_user(request: Request) -> Dict[str, Any]:
    u = await current_user(request)
    if not u: raise HTTPException(status_code=401, detail="Not authenticated")
    return u

async def require_admin(request: Request) -> Dict[str, Any]:
    u = await require_user(request)
    if u.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return u

# ---------- Auth Endpoints ----------
@api.post("/auth/session")
async def create_session(body: AuthPayload, response: Response):
    # Exchange session_id with Emergent auth
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = r.json()
    email = data["email"]
    # Upsert user
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    # Admin bootstrap: first user OR ADMIN_EMAILS env allowlist becomes admin
    admin_emails = [e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()]
    user_count = await db.users.count_documents({})
    if existing:
        user = existing
        # keep role sticky, but promote if in allowlist
        if email.lower() in admin_emails and user.get("role") != "admin":
            await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"role": "admin"}})
            user["role"] = "admin"
    else:
        role = "admin" if (user_count == 0 or email.lower() in admin_emails) else "end_user"
        user = {
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": email,
            "name": data.get("name", email),
            "picture": data.get("picture", ""),
            "role": role,
            "created_at": iso(utcnow()),
        }
        await db.users.insert_one(user)

    session_token = data["session_token"]
    await db.user_sessions.insert_one({
        "user_id": user["user_id"],
        "session_token": session_token,
        "expires_at": iso(utcnow() + timedelta(days=7)),
        "created_at": iso(utcnow()),
    })
    response.set_cookie(
        key="session_token", value=session_token, httponly=True,
        secure=True, samesite="none", path="/", max_age=7*24*3600,
    )
    await audit("login", email)
    return {"user": {k: user[k] for k in ("user_id","email","name","picture","role")}}

@api.get("/auth/me")
async def auth_me(request: Request):
    u = await current_user(request)
    if not u: raise HTTPException(status_code=401, detail="Not authenticated")
    return {k: u[k] for k in ("user_id","email","name","picture","role")}

@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    tok = await get_session_token(request)
    if tok: await db.user_sessions.delete_one({"session_token": tok})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

# ---------- Config helpers ----------
async def get_config(kind: str, default: Dict[str, Any]) -> Dict[str, Any]:
    doc = await db.configs.find_one({"kind": kind}, {"_id": 0})
    if not doc: return default
    return {k: v for k, v in doc.items() if k != "kind"}

async def set_config(kind: str, data: Dict[str, Any]):
    await db.configs.update_one({"kind": kind}, {"$set": {**data, "kind": kind}}, upsert=True)

# ---------- ServiceNow ----------
def _sn_masked(cfg: Dict[str, Any]) -> Dict[str, Any]:
    out = {**cfg}
    if out.get("password"): out["password"] = "••••••••"
    return out

async def _sn_cfg() -> ServiceNowConfig:
    d = await get_config("servicenow", ServiceNowConfig().model_dump())
    return ServiceNowConfig(**d)

async def _sn_request(cfg: ServiceNowConfig, method: str, path: str, params: Optional[Dict]=None):
    if not cfg.instance_url:
        raise HTTPException(status_code=400, detail="ServiceNow not configured")
    url = cfg.instance_url.rstrip("/") + path
    auth = (cfg.username, cfg.password) if cfg.username else None
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.request(method, url, params=params, auth=auth, headers={"Accept": "application/json"})
    if r.status_code == 401:
        raise HTTPException(status_code=502, detail="ServiceNow authentication failed")
    if r.status_code >= 500:
        raise HTTPException(status_code=502, detail="ServiceNow unavailable")
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"ServiceNow error: {r.status_code}")
    return r.json()

@api.get("/admin/servicenow/config")
async def get_sn_config(_: dict = Depends(require_admin)):
    d = await get_config("servicenow", ServiceNowConfig().model_dump())
    return _sn_masked(d)

@api.put("/admin/servicenow/config")
async def put_sn_config(cfg: ServiceNowConfig, admin=Depends(require_admin)):
    existing = await get_config("servicenow", ServiceNowConfig().model_dump())
    payload = cfg.model_dump()
    # allow masked password to preserve existing
    if payload.get("password") in ("", "••••••••"):
        payload["password"] = existing.get("password", "")
    await set_config("servicenow", payload)
    await audit("config.servicenow.update", admin["email"], {"instance_url": payload.get("instance_url")})
    return _sn_masked(payload)

@api.post("/admin/servicenow/test")
async def test_sn(admin=Depends(require_admin)):
    cfg = await _sn_cfg()
    try:
        data = await _sn_request(cfg, "GET", f"/api/now/table/{cfg.table}", {"sysparm_limit": 1})
        await audit("servicenow.test", admin["email"], {"ok": True})
        return {"ok": True, "message": "Connected", "sample_count": len(data.get("result", []))}
    except HTTPException as e:
        await audit("servicenow.test", admin["email"], {"ok": False, "error": e.detail})
        return {"ok": False, "message": e.detail}

# ---------- Incidents (End User + Admin) ----------
async def _list_incidents(user_query: Optional[str], page: int, page_size: int):
    cfg = await _sn_cfg()
    # If SN not configured -> demo dataset
    demo_mode = not cfg.instance_url
    if demo_mode:
        demo = await db.demo_incidents.find({}, {"_id": 0}).to_list(2000)
        if user_query:
            q = user_query.lower()
            demo = [d for d in demo if q in d.get("number","").lower() or q in d.get("short_description","").lower() or q in d.get("cmdb_ci","").lower()]
        total = len(demo)
        start = (page-1) * page_size
        return {"items": demo[start:start+page_size], "total": total, "demo": True}
    # Real SN
    q = cfg.active_query
    if user_query:
        # add search on number/short_description
        q += f"^numberLIKE{user_query}^ORshort_descriptionLIKE{user_query}"
    params = {
        "sysparm_query": q,
        "sysparm_fields": ",".join(cfg.fields),
        "sysparm_limit": page_size,
        "sysparm_offset": (page - 1) * page_size,
        "sysparm_display_value": "true",
    }
    data = await _sn_request(cfg, "GET", f"/api/now/table/{cfg.table}", params)
    # total count via HEAD-style stats
    count_params = {"sysparm_query": q, "sysparm_count": "true"}
    try:
        stats = await _sn_request(cfg, "GET", f"/api/now/stats/{cfg.table}", count_params)
        total = int(stats.get("result", {}).get("stats", {}).get("count", 0))
    except Exception:
        total = len(data.get("result", []))
    return {"items": data.get("result", []), "total": total, "demo": False}

@api.get("/incidents")
async def list_incidents(request: Request, q: Optional[str] = None, page: int = 1, page_size: int = 25):
    await require_user(request)
    return await _list_incidents(q, page, max(1, min(page_size, 100)))

@api.get("/incidents/{sys_id}")
async def get_incident(sys_id: str, request: Request):
    user = await require_user(request)
    cfg = await _sn_cfg()
    if not re.match(r"^[a-zA-Z0-9_\-]+$", sys_id):
        raise HTTPException(status_code=400, detail="Invalid incident id")
    if not cfg.instance_url:
        doc = await db.demo_incidents.find_one({"sys_id": sys_id}, {"_id": 0})
        if not doc: raise HTTPException(status_code=404, detail="Incident not found")
        if not cfg.show_work_notes:
            doc.pop("work_notes", None); doc.pop("comments", None)
        return doc
    data = await _sn_request(cfg, "GET", f"/api/now/table/{cfg.table}/{sys_id}",
                              {"sysparm_fields": ",".join(cfg.fields), "sysparm_display_value": "true"})
    doc = data.get("result", {})
    if not doc: raise HTTPException(status_code=404, detail="Incident not found")
    if not cfg.show_work_notes:
        doc.pop("work_notes", None); doc.pop("comments", None)
    return doc

# ---------- AI Analysis ----------
async def _ai_cfg() -> AIConfig:
    d = await get_config("ai", AIConfig().model_dump())
    return AIConfig(**d)

@api.get("/admin/ai/config")
async def get_ai_config(_: dict = Depends(require_admin)):
    d = await get_config("ai", AIConfig().model_dump())
    if d.get("api_key"): d["api_key"] = "••••••••"
    return d

@api.put("/admin/ai/config")
async def put_ai_config(cfg: AIConfig, admin=Depends(require_admin)):
    existing = await get_config("ai", AIConfig().model_dump())
    payload = cfg.model_dump()
    if payload.get("api_key") in ("", "••••••••"):
        payload["api_key"] = existing.get("api_key", "")
    await set_config("ai", payload)
    await audit("config.ai.update", admin["email"], {"provider": payload["provider"], "model": payload["model"]})
    out = {**payload}
    if out.get("api_key"): out["api_key"] = "••••••••"
    return out

async def _run_llm(system_msg: str, user_msg: str, cfg: AIConfig) -> str:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    api_key = os.environ["EMERGENT_LLM_KEY"] if cfg.use_emergent_key or not cfg.api_key else cfg.api_key
    session_id = new_id("chat")
    chat = LlmChat(api_key=api_key, session_id=session_id, system_message=system_msg)
    chat = chat.with_model(cfg.provider, cfg.model).with_params(
        temperature=cfg.temperature, max_tokens=cfg.max_tokens,
    )
    resp = await chat.send_message(UserMessage(text=user_msg))
    return resp if isinstance(resp, str) else str(resp)

@api.post("/admin/ai/test")
async def test_ai(admin=Depends(require_admin)):
    cfg = await _ai_cfg()
    try:
        out = await _run_llm("You are a health check.", "Reply with the single word: PONG", cfg)
        ok = "PONG" in out.upper()
        await audit("ai.test", admin["email"], {"ok": ok, "provider": cfg.provider, "model": cfg.model})
        return {"ok": ok, "message": "AI reachable" if ok else "Unexpected response", "sample": out[:200]}
    except Exception as e:
        await audit("ai.test", admin["email"], {"ok": False, "error": str(e)[:200]})
        return {"ok": False, "message": f"AI error: {str(e)[:200]}"}

def _score(text: str, tokens: List[str]) -> int:
    t = text.lower()
    return sum(1 for tok in tokens if tok in t)

def _tokens(*parts: str) -> List[str]:
    txt = " ".join(p for p in parts if p).lower()
    words = re.findall(r"[a-z0-9]{4,}", txt)
    stop = {"with","from","that","this","have","been","were","when","incident","issue","error","system","user","request","service","after","before","during","because"}
    return list({w for w in words if w not in stop})[:20]

async def _build_context(inc: Dict[str, Any]) -> Dict[str, Any]:
    short = inc.get("short_description","")
    desc = inc.get("description","")
    ci = inc.get("cmdb_ci","") if isinstance(inc.get("cmdb_ci"), str) else (inc.get("cmdb_ci") or {}).get("display_value","") if isinstance(inc.get("cmdb_ci"), dict) else ""
    toks = _tokens(short, desc, ci)
    hist = await db.historical_incidents.find({}, {"_id": 0}).to_list(1000)
    for h in hist:
        h["_score"] = _score(f"{h.get('short_description','')} {h.get('description','')} {h.get('root_cause','')} {h.get('application','')}", toks)
    hist = sorted(hist, key=lambda x: x["_score"], reverse=True)[:5]
    hist = [h for h in hist if h["_score"] > 0][:5]

    kbs = await db.kb_articles.find({}, {"_id": 0}).to_list(1000)
    for k in kbs:
        k["_score"] = _score(f"{k.get('title','')} {k.get('content','')} {' '.join(k.get('tags',[]))}", toks)
    kbs = sorted(kbs, key=lambda x: x["_score"], reverse=True)[:5]
    kbs = [k for k in kbs if k["_score"] > 0][:5]

    rcas = await db.rcas.find({}, {"_id": 0}).to_list(1000)
    for r in rcas:
        r["_score"] = _score(f"{r.get('title','')} {r.get('root_cause','')} {r.get('resolution','')} {r.get('application','')}", toks)
    rcas = sorted(rcas, key=lambda x: x["_score"], reverse=True)[:5]
    rcas = [r for r in rcas if r["_score"] > 0][:5]

    return {"historical": hist, "kb": kbs, "rcas": rcas}

@api.post("/incidents/{sys_id}/analyze")
async def analyze(sys_id: str, request: Request):
    user = await require_user(request)
    cfg = await _sn_cfg()
    if not re.match(r"^[a-zA-Z0-9_\-]+$", sys_id):
        raise HTTPException(status_code=400, detail="Invalid incident id")
    # fetch
    if cfg.instance_url:
        data = await _sn_request(cfg, "GET", f"/api/now/table/{cfg.table}/{sys_id}",
                                  {"sysparm_fields": ",".join(cfg.fields), "sysparm_display_value": "true"})
        inc = data.get("result", {})
    else:
        inc = await db.demo_incidents.find_one({"sys_id": sys_id}, {"_id": 0})
    if not inc: raise HTTPException(status_code=404, detail="Incident not found")

    ctx = await _build_context(inc)
    ai_cfg = await _ai_cfg()

    def _val(x):
        if isinstance(x, dict): return x.get("display_value","")
        return x or ""

    incident_summary = {
        "number": _val(inc.get("number")),
        "short_description": _val(inc.get("short_description")),
        "description": _val(inc.get("description")),
        "application": _val(inc.get("cmdb_ci")),
        "category": _val(inc.get("category")),
        "subcategory": _val(inc.get("subcategory")),
        "priority": _val(inc.get("priority")),
        "impact": _val(inc.get("impact")),
        "urgency": _val(inc.get("urgency")),
        "assignment_group": _val(inc.get("assignment_group")),
        "state": _val(inc.get("state")),
    }

    system_msg = (
        "You are an expert SRE / production support analyst for a large bank. "
        "Given a live incident and internal knowledge, produce a rigorous, sober analysis. "
        "Return STRICT JSON only, with keys: likely_root_cause, business_impact, "
        "recommended_immediate_action, preventive_action, confidence (one of High/Medium/Low), "
        "confidence_explanation. Each value is plain text (not markdown). "
        "Root cause must clearly say it is AI-assisted and should be validated with logs/telemetry."
    )

    parts = [
        "### CURRENT INCIDENT",
        json.dumps(incident_summary, indent=2),
        "\n### INTERNAL HISTORICAL INCIDENTS (top matches)",
        json.dumps([{k:v for k,v in h.items() if k!='_score'} for h in ctx["historical"]], indent=2) or "None",
        "\n### INTERNAL KNOWLEDGE BASE (top matches)",
        json.dumps([{k:v for k,v in k2.items() if k!='_score'} for k2 in ctx["kb"]], indent=2) or "None",
        "\n### INTERNAL RCA REPOSITORY (top matches)",
        json.dumps([{k:v for k,v in r.items() if k!='_score'} for r in ctx["rcas"]], indent=2) or "None",
        "\nReturn STRICT JSON only. No prose outside JSON."
    ]
    user_msg = "\n".join(parts)

    status = "success"
    parsed: Dict[str, Any] = {}
    try:
        raw = await _run_llm(system_msg, user_msg, ai_cfg)
        # extract JSON
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m: raise ValueError("No JSON in AI response")
        parsed = json.loads(m.group(0))
    except Exception as e:
        status = "error"
        logger.exception("AI analyze failed")
        parsed = {
            "likely_root_cause": f"AI analysis unavailable ({str(e)[:120]}). Please retry or check AI configuration.",
            "business_impact": "Unable to determine automatically. Review incident and dependencies manually.",
            "recommended_immediate_action": "Engage on-call SRE for the affected application and check recent deployments/telemetry.",
            "preventive_action": "Ensure AI configuration is valid and re-run analysis once resolved.",
            "confidence": "Low",
            "confidence_explanation": "AI service could not produce a structured response.",
        }

    record = AnalysisRecord(
        incident_number=incident_summary["number"] or sys_id,
        incident_sys_id=sys_id,
        user_email=user["email"],
        model=f"{ai_cfg.provider}/{ai_cfg.model}",
        confidence=str(parsed.get("confidence","Medium")),
        status=status,
        result=parsed,
    )
    await db.analyses.insert_one(record.model_dump())
    await audit("incident.analyze", user["email"], {"incident": incident_summary["number"], "status": status})
    return {"analysis": parsed, "incident_number": incident_summary["number"], "model": record.model}

# ---------- Admin CRUD helpers ----------
def _crud_routes(name: str, collection: str, model_cls):
    @api.get(f"/admin/{name}")
    async def _list(_: dict = Depends(require_admin)):
        items = await db[collection].find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
        return items
    @api.post(f"/admin/{name}")
    async def _create(item: model_cls, admin=Depends(require_admin)):
        doc = item.model_dump()
        await db[collection].insert_one({**doc})  # copy so ObjectId is not injected into response
        await audit(f"{name}.create", admin["email"], {"id": doc.get("id")})
        return doc
    @api.put(f"/admin/{name}/{{item_id}}")
    async def _update(item_id: str, item: model_cls, admin=Depends(require_admin)):
        doc = item.model_dump(); doc["id"] = item_id
        res = await db[collection].update_one({"id": item_id}, {"$set": doc}, upsert=False)
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Not found")
        await audit(f"{name}.update", admin["email"], {"id": item_id})
        return doc
    @api.delete(f"/admin/{name}/{{item_id}}")
    async def _delete(item_id: str, admin=Depends(require_admin)):
        await db[collection].delete_one({"id": item_id})
        await audit(f"{name}.delete", admin["email"], {"id": item_id})
        return {"ok": True}

_crud_routes("applications", "applications", Application)
_crud_routes("kb", "kb_articles", KBArticle)
_crud_routes("rca", "rcas", RCA)
_crud_routes("historical", "historical_incidents", HistoricalIncident)

@api.get("/admin/analyses")
async def list_analyses(_: dict = Depends(require_admin), limit: int = 200):
    items = await db.analyses.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return items

@api.get("/analyses/mine")
async def my_analyses(request: Request, limit: int = 100):
    u = await require_user(request)
    items = await db.analyses.find({"user_email": u["email"]}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return items

@api.get("/admin/audit")
async def list_audit(_: dict = Depends(require_admin), limit: int = 500):
    items = await db.audit_logs.find({}, {"_id": 0}).sort("ts", -1).to_list(limit)
    return items

@api.get("/admin/dashboard")
async def admin_dashboard(_: dict = Depends(require_admin)):
    users = await db.users.count_documents({})
    analyses = await db.analyses.count_documents({})
    kb = await db.kb_articles.count_documents({})
    rca = await db.rcas.count_documents({})
    apps = await db.applications.count_documents({})
    hist = await db.historical_incidents.count_documents({})
    recent = await db.analyses.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    return {"users": users, "analyses": analyses, "kb": kb, "rca": rca, "applications": apps, "historical": hist, "recent_analyses": recent}

# ---------- Seed demo data ----------
DEMO_INCIDENTS = [
    {"sys_id":"sn_inc_0001","number":"INC0091823","short_description":"Core Payment API returning 504 timeouts during SWIFT processing","description":"SWIFT MT103 batch is failing with upstream 504 Gateway Timeout from Core Payment API. Elevated latency observed on payment-core-gw pods.","priority":"1 - Critical","impact":"1 - High","urgency":"1 - High","category":"Application","subcategory":"Performance","assignment_group":"Payments L2","state":"In Progress","opened_at":"2026-02-05 08:12:33","sys_updated_on":"2026-02-05 09:22:11","cmdb_ci":"Core Payment API","work_notes":"Latency spike after 08:05 UTC deploy","comments":""},
    {"sys_id":"sn_inc_0002","number":"INC0091824","short_description":"PostgreSQL connection pool exhaustion on Auth cluster","description":"pgbouncer reporting max_client_conn reached on auth-db-primary. New logins failing intermittently across retail channels.","priority":"1 - Critical","impact":"1 - High","urgency":"2 - Medium","category":"Database","subcategory":"Availability","assignment_group":"DB Ops","state":"New","opened_at":"2026-02-05 09:41:02","sys_updated_on":"2026-02-05 09:43:00","cmdb_ci":"Auth PostgreSQL Cluster","work_notes":"","comments":""},
    {"sys_id":"sn_inc_0003","number":"INC0091825","short_description":"Mobile Banking OTP delivery delayed on Airtel MSISDN range","description":"Users on 98xxx range reporting 3-5 min OTP delay. Suspected SMPP throttling from telco.","priority":"2 - High","impact":"2 - Medium","urgency":"2 - Medium","category":"Network","subcategory":"Telco","assignment_group":"Channels L2","state":"In Progress","opened_at":"2026-02-05 07:22:11","sys_updated_on":"2026-02-05 08:14:00","cmdb_ci":"Mobile Auth Service","work_notes":"","comments":""},
    {"sys_id":"sn_inc_0004","number":"INC0091826","short_description":"Kafka lag on fraud-events topic exceeding 500k","description":"Consumer group fraud-scorer lag rising. Real-time fraud scoring delayed.","priority":"2 - High","impact":"2 - Medium","urgency":"2 - Medium","category":"Application","subcategory":"Streaming","assignment_group":"Data Platform","state":"On Hold","opened_at":"2026-02-04 22:00:00","sys_updated_on":"2026-02-05 06:15:00","cmdb_ci":"Fraud Scoring Platform","work_notes":"","comments":""},
    {"sys_id":"sn_inc_0005","number":"INC0091827","short_description":"Internet Banking login page slow (>8s TTFB)","description":"Elevated TTFB from CDN. Users report slow logins across regions.","priority":"3 - Moderate","impact":"3 - Low","urgency":"2 - Medium","category":"Application","subcategory":"Performance","assignment_group":"Channels L2","state":"New","opened_at":"2026-02-05 06:00:00","sys_updated_on":"2026-02-05 06:20:00","cmdb_ci":"Internet Banking Portal","work_notes":"","comments":""},
    {"sys_id":"sn_inc_0006","number":"INC0091828","short_description":"ATM switch reporting intermittent ISO8583 timeouts to Visa","description":"Timeouts on 0100/0110 for Visa Direct. Failover to secondary link ok.","priority":"1 - Critical","impact":"1 - High","urgency":"1 - High","category":"Network","subcategory":"Card Scheme","assignment_group":"Cards Ops","state":"In Progress","opened_at":"2026-02-05 04:11:00","sys_updated_on":"2026-02-05 05:03:00","cmdb_ci":"ATM Switch","work_notes":"","comments":""},
    {"sys_id":"sn_inc_0007","number":"INC0091829","short_description":"Statement PDF generation queue backlog","description":"Nightly PDF batch delayed 4h. Downstream email dispatch impacted.","priority":"3 - Moderate","impact":"3 - Low","urgency":"3 - Low","category":"Application","subcategory":"Batch","assignment_group":"Retail Batch","state":"New","opened_at":"2026-02-05 02:15:00","sys_updated_on":"2026-02-05 02:16:00","cmdb_ci":"Statement Service","work_notes":"","comments":""},
    {"sys_id":"sn_inc_0008","number":"INC0091830","short_description":"UPI response drops after 09:30 IST spike","description":"NPCI reporting elevated RC91 on our BIN. UPI PSP under load.","priority":"1 - Critical","impact":"1 - High","urgency":"1 - High","category":"Application","subcategory":"Payments","assignment_group":"Payments L2","state":"New","opened_at":"2026-02-05 09:32:00","sys_updated_on":"2026-02-05 09:33:00","cmdb_ci":"UPI PSP Gateway","work_notes":"","comments":""},
]

DEMO_HISTORICAL = [
    {"id":"hist_h001","number":"INC0089123","short_description":"Payment API 504 timeouts after gateway deploy","description":"Config drift on payment-core-gw ingress caused upstream timeouts during deploy.","application":"Core Payment API","priority":"1","resolution":"Rolled back ingress, restored keepalive settings.","root_cause":"Missing upstream_connect_timeout override in new ingress template introduced by helm chart bump.","resolved_at":"2025-11-14","tags":["payment","504","gateway","timeout"]},
    {"id":"hist_h002","number":"INC0087742","short_description":"pgbouncer connection pool exhaustion on auth-db","description":"Batch retry storm caused max_client_conn saturation.","application":"Auth PostgreSQL Cluster","priority":"1","resolution":"Increased max_client_conn, added circuit breaker on retry lib, throttled batch client.","root_cause":"Client library retry storm combined with under-sized pool.","resolved_at":"2025-10-02","tags":["postgres","pool","auth","exhaustion"]},
    {"id":"hist_h003","number":"INC0086551","short_description":"OTP SMS delivery delay via Airtel SMPP","description":"Telco throttled our SMPP binds due to burst rate.","application":"Mobile Auth Service","priority":"2","resolution":"Added second SMPP bind, staggered dispatch.","root_cause":"Insufficient concurrent SMPP binds during peak.","resolved_at":"2025-08-19","tags":["otp","sms","smpp","telco"]},
    {"id":"hist_h004","number":"INC0085320","short_description":"Kafka consumer lag on fraud-events","description":"GC pauses on scorer JVM caused lag buildup.","application":"Fraud Scoring Platform","priority":"2","resolution":"Tuned G1 heap, added consumer instance.","root_cause":"JVM heap misconfigured after image upgrade.","resolved_at":"2025-07-11","tags":["kafka","lag","fraud","jvm"]},
    {"id":"hist_h005","number":"INC0084001","short_description":"CDN TTFB spike on IB portal","description":"Origin shield miss ratio spiked after cache key change.","application":"Internet Banking Portal","priority":"3","resolution":"Reverted cache key, purged origin shield.","root_cause":"Cache key normalization change reduced hit ratio.","resolved_at":"2025-06-04","tags":["cdn","ttfb","cache","portal"]},
    {"id":"hist_h006","number":"INC0083112","short_description":"Visa ISO8583 timeouts during BAU","description":"Primary link intermittent packet loss.","application":"ATM Switch","priority":"1","resolution":"Failed over to secondary; ISP replaced SFP.","root_cause":"Faulty SFP transceiver on primary uplink.","resolved_at":"2025-05-22","tags":["iso8583","visa","atm","switch"]},
    {"id":"hist_h007","number":"INC0082004","short_description":"UPI RC91 spike at market open","description":"PSP thread pool saturation.","application":"UPI PSP Gateway","priority":"1","resolution":"Increased executor threads; async NPCI client.","root_cause":"Blocking IO in NPCI client caused thread starvation.","resolved_at":"2025-04-18","tags":["upi","npci","rc91","psp"]},
]

DEMO_KB = [
    {"id":"kb_k001","title":"Playbook: Core Payment API 504 timeouts","tags":["payment","504","gateway"],"application":"Core Payment API","content":"1) Check recent deploys of payment-core-gw. 2) Inspect ingress upstream_connect_timeout. 3) Roll back last helm release if timeouts started within 5m of deploy. 4) Validate downstream Core Banking latency."},
    {"id":"kb_k002","title":"Runbook: pgbouncer pool saturation","tags":["postgres","pgbouncer","pool"],"application":"Auth PostgreSQL Cluster","content":"1) SHOW POOLS/CLIENTS. 2) Identify top client_addr. 3) Enable server_reset_query_always. 4) Increase max_client_conn temporarily. 5) Add retry circuit breaker on offending client."},
    {"id":"kb_k003","title":"OTP delivery via SMPP - triage","tags":["otp","smpp","sms"],"application":"Mobile Auth Service","content":"1) Check bind status per telco. 2) Compare TPS with contracted limit. 3) Rotate bind if throttled. 4) Fallback to secondary SMSC."},
    {"id":"kb_k004","title":"Kafka consumer lag diagnosis","tags":["kafka","lag","jvm"],"application":"Fraud Scoring Platform","content":"1) kafka-consumer-groups describe. 2) Check JVM GC pauses via GC log. 3) Scale consumers horizontally. 4) Inspect skewed partitions."},
    {"id":"kb_k005","title":"CDN cache hit ratio troubleshooting","tags":["cdn","cache","ttfb"],"application":"Internet Banking Portal","content":"1) Check cache key config. 2) Purge origin shield. 3) Analyze top MISS URLs. 4) Revert recent config changes."},
    {"id":"kb_k006","title":"ISO8583 timeouts to card schemes","tags":["iso8583","visa","atm"],"application":"ATM Switch","content":"1) Check both primary and secondary link stats. 2) Inspect SFP/optical errors. 3) Trigger link failover. 4) Open ticket with ISP."},
    {"id":"kb_k007","title":"UPI PSP overload runbook","tags":["upi","npci","psp"],"application":"UPI PSP Gateway","content":"1) Watch executor queue depth. 2) Ensure async NPCI client enabled. 3) Scale pods. 4) Coordinate with NPCI if RC91 continues."},
]

DEMO_RCA = [
    {"id":"rca_r001","title":"RCA - INC0089123 Payment API 504","application":"Core Payment API","incident_number":"INC0089123","root_cause":"Helm chart upgrade removed custom upstream_connect_timeout on ingress; default was too low for SWIFT batch calls.","resolution":"Rollback ingress; add value guard in chart values.yaml.","tags":["payment","gateway","ingress"]},
    {"id":"rca_r002","title":"RCA - INC0087742 Auth DB pool exhaustion","application":"Auth PostgreSQL Cluster","incident_number":"INC0087742","root_cause":"Retry storm from batch client with unbounded retries hit under-provisioned pool.","resolution":"Circuit breaker + increased pool + client rate-limit.","tags":["postgres","pool"]},
    {"id":"rca_r003","title":"RCA - INC0084001 IB Portal TTFB","application":"Internet Banking Portal","incident_number":"INC0084001","root_cause":"Cache key normalization reduced hit ratio drastically.","resolution":"Revert cache key change; add hit-ratio SLO monitor.","tags":["cdn","cache"]},
]

DEMO_APPS = [
    {"id":"app_a001","name":"Core Payment API","tier":"T1","owner":"payments-lead@bank.com","sla_minutes":15,"disabled":False,"created_at":iso(utcnow())},
    {"id":"app_a002","name":"Auth PostgreSQL Cluster","tier":"T1","owner":"dbops-lead@bank.com","sla_minutes":15,"disabled":False,"created_at":iso(utcnow())},
    {"id":"app_a003","name":"Mobile Auth Service","tier":"T2","owner":"channels-lead@bank.com","sla_minutes":30,"disabled":False,"created_at":iso(utcnow())},
    {"id":"app_a004","name":"Fraud Scoring Platform","tier":"T2","owner":"data-lead@bank.com","sla_minutes":30,"disabled":False,"created_at":iso(utcnow())},
    {"id":"app_a005","name":"Internet Banking Portal","tier":"T2","owner":"channels-lead@bank.com","sla_minutes":30,"disabled":False,"created_at":iso(utcnow())},
    {"id":"app_a006","name":"ATM Switch","tier":"T1","owner":"cards-lead@bank.com","sla_minutes":15,"disabled":False,"created_at":iso(utcnow())},
    {"id":"app_a007","name":"UPI PSP Gateway","tier":"T1","owner":"payments-lead@bank.com","sla_minutes":15,"disabled":False,"created_at":iso(utcnow())},
]

@app.on_event("startup")
async def seed():
    # seed only if empty
    if await db.demo_incidents.count_documents({}) == 0:
        await db.demo_incidents.insert_many([{**d} for d in DEMO_INCIDENTS])
    if await db.historical_incidents.count_documents({}) == 0:
        await db.historical_incidents.insert_many([{**d} for d in DEMO_HISTORICAL])
    if await db.kb_articles.count_documents({}) == 0:
        await db.kb_articles.insert_many([{**d, "created_at": iso(utcnow())} for d in DEMO_KB])
    if await db.rcas.count_documents({}) == 0:
        await db.rcas.insert_many([{**d, "created_at": iso(utcnow())} for d in DEMO_RCA])
    if await db.applications.count_documents({}) == 0:
        await db.applications.insert_many([{**d} for d in DEMO_APPS])
    logger.info("Seed check complete")

@app.on_event("shutdown")
async def shutdown_db_client():
    mongo_client.close()

# ---------- Health ----------
@api.get("/health")
async def health():
    return {"status": "ok", "time": iso(utcnow())}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)
