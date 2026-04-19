"""
Run a SQL file against Supabase cloud project via Management API.
Usage: python scripts/run_sql_cloud.py <path-to-sql>
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

if len(sys.argv) < 2:
    print("usage: python scripts/run_sql_cloud.py <sql-file>", file=sys.stderr)
    sys.exit(2)

sql_path = sys.argv[1]
with open(sql_path, encoding="utf-8") as f:
    query = f.read()

env = load_env(os.path.join(os.path.dirname(__file__), "..", ".env.local"))
ref = env["SUPABASE_PROJECT_REF"]
token = env["SUPABASE_ACCESS_TOKEN"]

req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{ref}/database/query",
    data=json.dumps({"query": query}).encode("utf-8"),
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "friendta-devops/1.0",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(req) as resp:
        print(f"HTTP {resp.status}")
        body = resp.read().decode("utf-8")
        print(body[:500] if body else "(empty)")
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode('utf-8')}", file=sys.stderr)
    sys.exit(1)
