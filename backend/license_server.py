"""
OmniBioAI License Server
Deploy on Railway/Render free tier

PR11 (Studio IAM Integration): admin-gated endpoints (/api/license/generate,
/api/license/list) no longer accept a static admin_key -- they require a
Bearer JWT issued by omnibioai-auth and check the manage_licenses IAM
permission, exactly like every other manage_licenses-gated route in that
service (routes_license.py). See _require_permission() below.

Architecture note: this deliberately does NOT use the omnibioai-iam-client
shared package, and does NOT implement local JWT signature verification.
omnibioai-control-center's own core/jwt_verify.py already documents why
the shared package is unsuitable (not imported by any live service, no
jti-blacklist revocation support) and built a local-decode module instead
-- but that choice was driven by needing sub-millisecond verification on
every gateway-scale request. License generation/listing is a low-frequency
admin action with no such performance requirement, so the simpler,
"do not introduce duplicate JWT verification" -- compliant choice is a
plain remote call to omnibioai-auth's own POST /auth/validate, exactly
mirroring what src/ui/lib/session.js's getCurrentUser() already does from
the frontend. No JWT secret or JWKS config is duplicated into this
service at all.
"""
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import datetime
import hashlib
import logging
import os
import pymysql
import pymysql.cursors
import requests

app = FastAPI(title="OmniBioAI License Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

audit_logger = logging.getLogger("omnibioai.studio.license_server.audit")

SECRET_SALT = os.getenv("LICENSE_SECRET", "omnibioai-secret-change-in-production")

# Same env var name ("IAM_URL") every other omnibioai-* service already
# uses for this in docker-compose.yml -- not a new convention.
AUTH_SERVICE_URL = os.getenv("IAM_URL", "http://auth-service:8001")
AUTH_REQUEST_TIMEOUT_SECONDS = int(os.getenv("IAM_TIMEOUT_SECONDS", "5"))

MYSQL_HOST = os.getenv("MYSQL_HOST", "mysql")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "omnibioai")
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "omnibioai_licenses")


def get_conn():
    return pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DATABASE,
        cursorclass=pymysql.cursors.Cursor,
    )


def init_db():
    conn = pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        cursorclass=pymysql.cursors.Cursor,
    )
    with conn.cursor() as cur:
        cur.execute(f"CREATE DATABASE IF NOT EXISTS `{MYSQL_DATABASE}`")
    conn.commit()
    conn.close()

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS licenses (
                `key` VARCHAR(255) PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                tier VARCHAR(50) NOT NULL,
                expiry VARCHAR(20) NOT NULL,
                machine_id VARCHAR(255),
                created_at VARCHAR(20) NOT NULL,
                activated_at VARCHAR(20),
                is_active TINYINT(1) DEFAULT 1
            )
        """)
    conn.commit()
    conn.close()


init_db()


class GenerateRequest(BaseModel):
    email: str
    days: int = 30
    tier: str = "beta"


class ValidateRequest(BaseModel):
    key: str
    machine_id: str


def generate_key(email: str, tier: str, expiry: datetime.date) -> str:
    raw = f"{email}|{tier}|{expiry}|{SECRET_SALT}"
    cs = hashlib.sha256(raw.encode()).hexdigest()[:16].upper()
    return f"OMNI-{cs[:4]}-{cs[4:8]}-{cs[8:12]}-{cs[12:16]}"


MANAGE_LICENSES = "manage_licenses"


def _validate_token(token: str) -> dict | None:
    """POSTs to omnibioai-auth's own POST /auth/validate -- the same
    endpoint src/ui/lib/session.js's getCurrentUser() already trusts from
    the frontend. Returns the parsed {user_id, email, roles, permissions}
    dict on a valid token, None on an invalid token or any network/auth-
    service failure (fails closed -- the caller treats None as
    unauthorized, never as "skip the check")."""
    try:
        resp = requests.post(
            f"{AUTH_SERVICE_URL}/auth/validate",
            json={"token": token},
            timeout=AUTH_REQUEST_TIMEOUT_SECONDS,
        )
        data = resp.json()
    except Exception:
        return None
    if not data.get("valid"):
        return None
    return data


def _require_permission(authorization: str | None, permission: str, action: str) -> dict:
    """Bearer-token IAM authorization, replacing the former static
    admin_key comparison. Every outcome (missing token, invalid token,
    missing permission, granted) is audit-logged -- see module docstring
    for why this is a local structured log rather than a call into
    omnibioai-auth's own persistent audit ledger (that ledger has no REST
    ingestion API for external callers today)."""
    if not authorization or not authorization.startswith("Bearer "):
        audit_logger.warning("iam_audit action=%s outcome=denied reason=missing_token", action)
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization[len("Bearer "):]
    user = _validate_token(token)
    if user is None:
        audit_logger.warning("iam_audit action=%s outcome=denied reason=invalid_token", action)
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if permission not in (user.get("permissions") or []):
        audit_logger.warning(
            "iam_audit action=%s outcome=denied reason=missing_permission "
            "actor_user_id=%s actor_email=%s required_permission=%s",
            action, user.get("user_id"), user.get("email"), permission,
        )
        raise HTTPException(status_code=403, detail=f"Missing required permission: {permission}")

    audit_logger.info(
        "iam_audit action=%s outcome=allowed actor_user_id=%s actor_email=%s",
        action, user.get("user_id"), user.get("email"),
    )
    return user


def _load_valid_license(key: str):
    """Core license lookup shared by /validate and /pull-token. Raises the
    same HTTPExceptions either endpoint would raise on its own."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT `key`, email, tier, expiry, machine_id, created_at, activated_at, is_active FROM licenses WHERE `key` = %s", (key,))
        row = cur.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Invalid license key")

    key, email, tier, expiry, machine_id, created_at, activated_at, is_active = row

    if not is_active:
        raise HTTPException(status_code=403, detail="License deactivated")

    expiry_date = datetime.date.fromisoformat(expiry)
    today = datetime.date.today()

    if today > expiry_date:
        raise HTTPException(status_code=402, detail="License expired")

    return {
        "key": key,
        "email": email,
        "tier": tier,
        "expiry": expiry,
        "machine_id": machine_id,
        "days_remaining": (expiry_date - today).days,
    }


@app.post("/api/license/generate")
def generate(req: GenerateRequest, authorization: str | None = Header(default=None)):
    _require_permission(authorization, MANAGE_LICENSES, action="license_generate")
    expiry = datetime.date.today() + datetime.timedelta(days=req.days)
    key = generate_key(req.email, req.tier, expiry)
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "REPLACE INTO licenses (`key`, email, tier, expiry, created_at, is_active) VALUES (%s, %s, %s, %s, %s, 1)",
            (key, req.email, req.tier, str(expiry), str(datetime.date.today())),
        )
    conn.commit()
    conn.close()
    return {
        "key": key,
        "email": req.email,
        "tier": req.tier,
        "expiry": str(expiry),
        "days": req.days,
    }


@app.post("/api/license/validate")
def validate(req: ValidateRequest):
    lic = _load_valid_license(req.key)

    # Bind to machine on first use
    if not lic["machine_id"]:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE licenses SET machine_id = %s, activated_at = %s WHERE `key` = %s",
                (req.machine_id, str(datetime.date.today()), req.key),
            )
        conn.commit()
        conn.close()

    return {
        "valid": True,
        "email": lic["email"],
        "tier": lic["tier"],
        "expiry": lic["expiry"],
        "days_remaining": lic["days_remaining"],
        "message": f"License valid for {lic['days_remaining']} more days",
    }


@app.post("/api/license/pull-token")
def pull_token(req: ValidateRequest):
    """Separate from /validate so the GHCR credential is only ever handed to
    a client that is specifically about to pull private images (Docker
    startup), not returned on every routine license check. Requires the
    exact same active/non-expired license as /validate."""
    _load_valid_license(req.key)
    return {"ghcr_token": os.getenv("GHCR_PULL_TOKEN", "")}


@app.get("/api/license/list")
def list_licenses(authorization: str | None = Header(default=None)):
    _require_permission(authorization, MANAGE_LICENSES, action="license_list")
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT `key`, email, tier, expiry, is_active FROM licenses")
        rows = cur.fetchall()
    conn.close()
    return [{"key": r[0], "email": r[1], "tier": r[2], "expiry": r[3], "active": r[4]} for r in rows]


@app.get("/health")
def health():
    return {"status": "ok", "service": "OmniBioAI License Server"}


# ---------------------------------------------------------------------------
# PR11: service identity. This license server, as a backend service in its
# own right (not acting on behalf of any specific end user), can hold its
# own OAuth 2.1 client_credentials identity in omnibioai-auth -- see PR9's
# GET /service/me. Registration itself is an operational step (POST
# /orgs/{org_id}/oauth-clients against omnibioai-auth, done once by whoever
# owns the internal-services organization), not something this file can or
# should do on its own; STUDIO_SERVICE_CLIENT_ID/_SECRET are populated
# after that registration happens. Confirmed as the first real consumer of
# this mechanism: today, nothing in the ecosystem calls /oauth/token or
# depends on a live client_credentials-gated route outside omnibioai-auth's
# own tests (see that repo's test_service_to_service_oauth.py).
#
# Deliberately NOT used for the manage_licenses-gated actions above --
# license generation needs a real human actor for accountability (see
# _require_permission's audit logging), which a faceless service identity
# cannot provide. This self-check exists to prove the service identity
# itself is correctly configured and active, not to authorize anything.
# ---------------------------------------------------------------------------

STUDIO_SERVICE_CLIENT_ID = os.getenv("STUDIO_SERVICE_CLIENT_ID", "")
STUDIO_SERVICE_CLIENT_SECRET = os.getenv("STUDIO_SERVICE_CLIENT_SECRET", "")


def verify_service_identity() -> bool:
    """Best-effort startup self-check: obtains a client_credentials token
    for this service's own identity, then confirms it via GET /service/me.
    Never raises -- an unconfigured or unreachable service identity must
    not prevent this server from starting and serving license validation,
    which has nothing to do with this mechanism. Returns True/False purely
    so tests can assert on the outcome without parsing log output."""
    if not STUDIO_SERVICE_CLIENT_ID or not STUDIO_SERVICE_CLIENT_SECRET:
        audit_logger.info("iam_audit action=service_identity_check outcome=skipped reason=not_configured")
        return False

    try:
        token_resp = requests.post(
            f"{AUTH_SERVICE_URL}/oauth/token",
            data={
                "grant_type": "client_credentials",
                "client_id": STUDIO_SERVICE_CLIENT_ID,
                "client_secret": STUDIO_SERVICE_CLIENT_SECRET,
            },
            timeout=AUTH_REQUEST_TIMEOUT_SECONDS,
        )
        if token_resp.status_code != 200:
            audit_logger.warning(
                "iam_audit action=service_identity_check outcome=failed reason=token_request_status_%s",
                token_resp.status_code,
            )
            return False
        access_token = token_resp.json()["access_token"]

        identity_resp = requests.get(
            f"{AUTH_SERVICE_URL}/service/me",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=AUTH_REQUEST_TIMEOUT_SECONDS,
        )
        if identity_resp.status_code != 200:
            audit_logger.warning(
                "iam_audit action=service_identity_check outcome=failed reason=service_me_status_%s",
                identity_resp.status_code,
            )
            return False

        identity = identity_resp.json()
        audit_logger.info(
            "iam_audit action=service_identity_check outcome=verified client_id=%s permissions=%s",
            identity.get("client_id"), identity.get("permissions"),
        )
        return True
    except Exception as e:
        audit_logger.warning("iam_audit action=service_identity_check outcome=failed reason=%s", e)
        return False


@app.on_event("startup")
def _on_startup() -> None:
    verify_service_identity()
