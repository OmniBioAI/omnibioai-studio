#!/usr/bin/env python3
"""
OmniBioAI License Key Generator
Usage: python generate_license.py user@example.com [days] [tier]
"""
import sys
import hashlib
import datetime

SECRET_SALT = "omnibioai-secret-change-in-production"

def generate_key(email: str, tier: str, expiry: datetime.date) -> str:
    raw = f"{email}|{tier}|{expiry}|{SECRET_SALT}"
    cs = hashlib.sha256(raw.encode()).hexdigest()[:16].upper()
    return f"OMNI-{cs[:4]}-{cs[4:8]}-{cs[8:12]}-{cs[12:16]}"

def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_license.py <email> [days=30] [tier=beta]")
        sys.exit(1)

    email = sys.argv[1]
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    tier = sys.argv[3] if len(sys.argv) > 3 else "beta"

    expiry = datetime.date.today() + datetime.timedelta(days=days)
    key = generate_key(email, tier, expiry)

    print(f"""
╔══════════════════════════════════════════════╗
║         OmniBioAI License Key                ║
╠══════════════════════════════════════════════╣
║ Email  : {email:<36} ║
║ Key    : {key:<36} ║
║ Tier   : {tier:<36} ║
║ Expiry : {str(expiry):<36} ║
║ Days   : {days:<36} ║
╚══════════════════════════════════════════════╝

Send this to the user:
Subject: Your OmniBioAI Beta License Key

Your OmniBioAI Studio license key:

  {key}

Valid for {days} days (expires {expiry}).
Download: https://github.com/man4ish/omnibioai-studio/releases/latest
""")

if __name__ == "__main__":
    main()
