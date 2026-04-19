"""
Build FriendTa email templates and sync them to BOTH:
  1. supabase/templates/*.html (used by local Supabase via config.toml)
  2. Supabase cloud project (via Management API)
Single source of truth: edit this script, re-run, both envs updated.
"""
import os
import sys
import json
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TEMPLATE_DIR = os.path.join(ROOT, "supabase", "templates")

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

def wrap(title_html, body_html, footer_html):
    return f"""<!DOCTYPE html>
<html lang="th">
<body style="margin:0;padding:0;background:#f7f9fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fb;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;">
        <tr><td>
          <img src="https://friendta.com/assets/img/logo.png" alt="FriendTa" width="140" style="display:block;width:140px;height:auto;border:0;outline:none;text-decoration:none;">
          <div style="font-size:13px;color:#64748b;margin-top:8px;">ชุมชนหาเพื่อนคุย เพื่อนเที่ยว เพื่อนคู่ใจ</div>
          {title_html}
          {body_html}
          <div style="border-top:1px solid #e2e8f0;margin:28px 0 20px 0;"></div>
          <p style="font-size:12px;color:#94a3b8;line-height:1.65;margin:0;">
            {footer_html}<br>
            มีคำถาม? ติดต่อ <a href="mailto:support@friendta.com" style="color:#2563eb;text-decoration:none;">support@friendta.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

def cta_block(heading, lead, button_label, footer):
    title = f'<h1 style="font-size:18px;font-weight:700;color:#0f172a;margin:32px 0 12px 0;">{heading}</h1>'
    body = f"""
          <p style="font-size:15px;line-height:1.65;color:#334155;margin:0 0 24px 0;">{lead}</p>
          <a href="{{{{ .ConfirmationURL }}}}" style="display:inline-block;background:#2563eb;color:#ffffff;font-weight:600;font-size:15px;padding:12px 28px;border-radius:999px;text-decoration:none;">{button_label}</a>
          <p style="font-size:13px;color:#64748b;margin:24px 0 0 0;line-height:1.6;">
            ถ้าปุ่มคลิกไม่ได้ ก็อปลิงก์นี้วางในเบราว์เซอร์:<br>
            <span style="color:#475569;word-break:break-all;">{{{{ .ConfirmationURL }}}}</span>
          </p>"""
    return wrap(title, body, footer)

TEMPLATES = {
    "confirmation": {
        "subject": "ยืนยันอีเมลของคุณ · FriendTa",
        "html": cta_block(
            heading="ยืนยันอีเมลของคุณ",
            lead="ขอบคุณที่สมัครสมาชิก FriendTa<br>คลิกปุ่มด้านล่างเพื่อยืนยันอีเมลและเริ่มใช้งานบัญชีของคุณ",
            button_label="ยืนยันอีเมล",
            footer="ถ้าคุณไม่ได้สมัคร FriendTa เพิกเฉยอีเมลนี้ได้เลย — บัญชีจะไม่ถูกสร้างโดยไม่มีการยืนยัน",
        ),
    },
    "recovery": {
        "subject": "รีเซ็ตรหัสผ่าน · FriendTa",
        "html": cta_block(
            heading="รีเซ็ตรหัสผ่าน",
            lead="เรารับคำขอรีเซ็ตรหัสผ่านของบัญชีคุณ<br>คลิกปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ ลิงก์จะหมดอายุใน 1 ชั่วโมง",
            button_label="รีเซ็ตรหัสผ่าน",
            footer="ถ้าคุณไม่ได้ขอรีเซ็ตรหัสผ่าน เพิกเฉยอีเมลนี้ได้เลย — รหัสผ่านเดิมจะไม่ถูกเปลี่ยน",
        ),
    },
    "magic_link": {
        "subject": "ลิงก์เข้าสู่ระบบ · FriendTa",
        "html": cta_block(
            heading="ลิงก์เข้าสู่ระบบ",
            lead="คลิกปุ่มด้านล่างเพื่อเข้าสู่ระบบ FriendTa<br>ลิงก์นี้ใช้ได้ครั้งเดียวและหมดอายุใน 1 ชั่วโมง",
            button_label="เข้าสู่ระบบ",
            footer="ถ้าคุณไม่ได้ขอลิงก์นี้ เพิกเฉยอีเมลนี้ได้เลย",
        ),
    },
    "email_change": {
        "subject": "ยืนยันเปลี่ยนอีเมล · FriendTa",
        "html": cta_block(
            heading="ยืนยันการเปลี่ยนอีเมล",
            lead="เรารับคำขอเปลี่ยนอีเมลของบัญชี FriendTa ของคุณ<br>คลิกปุ่มด้านล่างเพื่อยืนยันการเปลี่ยนแปลง",
            button_label="ยืนยันเปลี่ยนอีเมล",
            footer="ถ้าคุณไม่ได้ขอเปลี่ยนอีเมล เพิกเฉยอีเมลนี้ และเปลี่ยนรหัสผ่านบัญชีทันทีเพื่อความปลอดภัย",
        ),
    },
}

# 1. Write HTML files to supabase/templates/ — consumed by local Supabase via config.toml
os.makedirs(TEMPLATE_DIR, exist_ok=True)
for key, t in TEMPLATES.items():
    path = os.path.join(TEMPLATE_DIR, f"{key}.html")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(t["html"])
    print(f"wrote {path}")

# 2. Push to cloud via Supabase Management API
env = load_env(os.path.join(ROOT, ".env.local"))
ref = env["SUPABASE_PROJECT_REF"]
token = env["SUPABASE_ACCESS_TOKEN"]

payload = {
    "mailer_subjects_confirmation": TEMPLATES["confirmation"]["subject"],
    "mailer_templates_confirmation_content": TEMPLATES["confirmation"]["html"],
    "mailer_subjects_recovery": TEMPLATES["recovery"]["subject"],
    "mailer_templates_recovery_content": TEMPLATES["recovery"]["html"],
    "mailer_subjects_magic_link": TEMPLATES["magic_link"]["subject"],
    "mailer_templates_magic_link_content": TEMPLATES["magic_link"]["html"],
    "mailer_subjects_email_change": TEMPLATES["email_change"]["subject"],
    "mailer_templates_email_change_content": TEMPLATES["email_change"]["html"],
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
        print(f"cloud push: HTTP {resp.status}")
except urllib.error.HTTPError as e:
    print(f"cloud push failed HTTP {e.code}: {e.read().decode('utf-8')}", file=sys.stderr)
    sys.exit(1)
