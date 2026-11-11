"""Nạp file T-SQL vào một SQLite trống (dịch cú pháp), rồi đăng nhập và gọi API cho từng vai trò."""
import os
import re
import sqlite3
import sys

sys.path.insert(0, sys.argv[1])
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings_demo_local"
import django  # noqa: E402

django.setup()
from apps.accounts.rbac import ensure_rbac_seed  # noqa: E402
from apps.training.models import Specialization  # noqa: E402

ensure_rbac_seed()
for code in ("FLAT_RACING", "STEEPLECHASE_HURDLE", "HARNESS_RACING", "ENDURANCE", "OTHER"):
    Specialization.objects.get_or_create(code=code, defaults={"name": code})

text = open(sys.argv[2], encoding="utf-8-sig").read()
db = sqlite3.connect(os.environ["EQUI_DEMO_DB"])
values = {}
for name, table, col, code in re.findall(r"DECLARE (@\w+) INT = \(SELECT \w+ FROM dbo\.\[(\w+)\] WHERE (\w+) = N'([^']+)'\);", text):
    values[name] = db.execute(f'select {table}ID from "{table}" where {col}=?', (code,)).fetchone()[0]
body = text[text.index("BEGIN TRANSACTION;"):text.index("COMMIT TRANSACTION;")]
lines = [line for line in body.splitlines()
         if not re.match(r"\s*(BEGIN TRANSACTION|ALTER TABLE|SET IDENTITY_INSERT|--)", line)]
body = "\n".join(lines)
body = re.sub(r"dbo\.\[(\w+)\]", r'"\1"', body)
body = re.sub(r"(?<![A-Za-z0-9_'])N'", "'", body)
body = re.sub(r"'(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})'", r"'\1 \2'", body)   # SQLite lưu giờ dạng 'yyyy-mm-dd hh:mm:ss'
for name, v in sorted(values.items(), key=lambda kv: -len(kv[0])):
    body = body.replace(name, str(v))
db.executescript("BEGIN;" + body + "COMMIT;")
print("nạp xong:", {t: db.execute(f'select count(*) from "{t}"').fetchone()[0] for t in ("User", "Horse", "TrainingSession", "CareTask")})
db.close()

from django.conf import settings  # noqa: E402
from django.contrib.auth import hashers  # noqa: E402

settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.PBKDF2PasswordHasher"]   # như máy chủ thật
hashers.get_hashers.cache_clear()
hashers.get_hashers_by_algorithm.cache_clear()
from rest_framework.test import APIClient  # noqa: E402

client = APIClient()
password = os.environ.get("EQUI_REAL_PASSWORD", "Equi@2026")
CHECKS = {
    "khoa.mn": ["/horses", "/users", "/stalls", "/inventory-items", "/vet-duty-shifts", "/notifications", "/support-requests"],
    "phuc.hd": ["/training-dashboard", "/training-plans", "/training-sessions", "/notifications"],
    "bao.tn": ["/training-plans", "/training-sessions", "/notifications"],
    "tung.wr": ["/training-sessions", "/notifications"],
    "ha.vt": ["/health-reports?open=1", "/vaccinations", "/medical-schedules", "/notifications"],
    "loc.gr": ["/care-tasks?Date=2026-11-05&mine=1", "/care/training-today?Date=2026-11-05", "/notifications"],
    "huy.own": ["/horses", "/notifications"],
}
for key, paths in CHECKS.items():
    res = client.post("/api/auth/login", {"Email": f"{key}@equi.com", "Password": password}, format="json")
    assert res.status_code == 200, (key, res.status_code, res.data)
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
    out = []
    for path in paths:
        r = c.get(f"/api{path}")
        assert r.status_code == 200, (key, path, r.status_code, getattr(r, "data", None))
        data = r.data
        out.append(f"{path.split('?')[0]}={len(data) if isinstance(data, list) else 'ok'}")
    print(f"  {key:<10} đăng nhập được · " + ", ".join(out))
