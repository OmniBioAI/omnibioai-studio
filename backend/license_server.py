"""
OmniBioAI License Server
Deploy on Railway/Render free tier
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import hashlib
import datetime
import secrets
import sqlite3
import os

app = FastAPI(title="OmniBioAI License Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_SALT = os.getenv("LICENSE_SECRET", "omnibioai-secret-change-in-production")
DB_PATH = os.getenv("LICENSE_DB", "licenses.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS licenses (
            key TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            tier TEXT NOT NULL,
            expiry TEXT NOT NULL,
            machine_id TEXT,
            created_at TEXT NOT NULL,
            activated_at TEXT,
            is_active INTEGER DEFAULT 1
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

@app.post("/api/license/generate")
def generate(req: GenerateRequest):
    expiry = datetime.date.today() + datetime.timedelta(days=req.days)
    key = generate_key(req.email, req.tier, expiry)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT OR REPLACE INTO licenses (key, email, tier, expiry, created_at, is_active) VALUES (?,?,?,?,?,1)",
        (key, req.email, req.tier, str(expiry), str(datetime.date.today()))
    )
    conn.commit()
    conn.close()
    return {
        "key": key,
        "email": req.email,
        "tier": req.tier,
        "expiry": str(expiry),
        "days": req.days
    }

@app.post("/api/license/validate")
def validate(req: ValidateRequest):
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT * FROM licenses WHERE key=?", (req.key,)
    ).fetchone()
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

    days_remaining = (expiry_date - today).days

    # Bind to machine on first use
    if not machine_id:
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            "UPDATE licenses SET machine_id=?, activated_at=? WHERE key=?",
            (req.machine_id, str(today), req.key)
        )
        conn.commit()
        conn.close()

    return {
        "valid": True,
        "email": email,
        "tier": tier,
        "expiry": expiry,
        "days_remaining": days_remaining,
        "ghcr_token": os.getenv("GHCR_PULL_TOKEN", ""),
        "message": f"License valid for {days_remaining} more days"
    }

@app.get("/api/license/list")
def list_licenses(admin_key: str = ""):
    if admin_key != os.getenv("ADMIN_KEY", "admin-secret"):
        raise HTTPException(status_code=403, detail="Unauthorized")
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("SELECT key, email, tier, expiry, is_active FROM licenses").fetchall()
    conn.close()
    return [{"key": r[0], "email": r[1], "tier": r[2], "expiry": r[3], "active": r[4]} for r in rows]

@app.get("/health")
def health():
    return {"status": "ok", "service": "OmniBioAI License Server"}
