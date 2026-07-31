"""
OmniBioAI License Server
Deploy on Railway/Render free tier
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import hashlib
import datetime
import os
import pymysql
import pymysql.cursors

app = FastAPI(title="OmniBioAI License Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_SALT = os.getenv("LICENSE_SECRET", "omnibioai-secret-change-in-production")

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
    admin_key: str = ""


class ValidateRequest(BaseModel):
    key: str
    machine_id: str


def generate_key(email: str, tier: str, expiry: datetime.date) -> str:
    raw = f"{email}|{tier}|{expiry}|{SECRET_SALT}"
    cs = hashlib.sha256(raw.encode()).hexdigest()[:16].upper()
    return f"OMNI-{cs[:4]}-{cs[4:8]}-{cs[8:12]}-{cs[12:16]}"


def _require_admin(admin_key: str) -> None:
    if admin_key != os.getenv("ADMIN_KEY", "admin-secret"):
        raise HTTPException(status_code=403, detail="Unauthorized")


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
def generate(req: GenerateRequest):
    _require_admin(req.admin_key)
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
def list_licenses(admin_key: str = ""):
    _require_admin(admin_key)
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT `key`, email, tier, expiry, is_active FROM licenses")
        rows = cur.fetchall()
    conn.close()
    return [{"key": r[0], "email": r[1], "tier": r[2], "expiry": r[3], "active": r[4]} for r in rows]


@app.get("/health")
def health():
    return {"status": "ok", "service": "OmniBioAI License Server"}
