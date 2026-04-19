"""
Configure Supabase Auth to use Resend SMTP.
Reads creds from .env.local, PATCHes Supabase Management API.
"""
import os
import sys
import json
import urllib.request

def load_env(path):
    env = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env

env = load_env(os.path.join(os.path.dirname(__file__), "..", ".env.local"))
ref = env["SUPABASE_PROJECT_REF"]
token = env["SUPABASE_ACCESS_TOKEN"]
resend_key = env["RESEND_API_KEY"]

payload = {
    "smtp_admin_email": "noreply@friendta.com",
    "smtp_host": "smtp.resend.com",
    "smtp_port": "465",
    "smtp_user": "resend",
    "smtp_pass": resend_key,
    "smtp_sender_name": "FriendTa",
    "smtp_max_frequency": 60,
}

req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{ref}/config/auth",
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "friendta-devops/1.0",
    },
    method="PATCH",
)
try:
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode("utf-8")
        print(f"HTTP {resp.status}")
        print("SMTP configured → Resend ·", payload["smtp_admin_email"])
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode('utf-8')}", file=sys.stderr)
    sys.exit(1)
