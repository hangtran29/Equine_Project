"""
Kiểm tra dữ liệu SQLite theo CHECK / UNIQUE của sql/horse_v2.sql, rồi xuất file T-SQL cho SQL Server.
Chạy:  EQUI_DEMO_DB=... EQUI_DEMO_MEDIA=... python export.py <backend> <horse_v2.sql> <file ra .sql>
"""
import os
import re
import sqlite3
import sys
from datetime import date, datetime, time
from decimal import Decimal

sys.path.insert(0, sys.argv[1])
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings_demo_local"
import django  # noqa: E402

django.setup()
from django.apps import apps  # noqa: E402
from django.contrib.auth.hashers import PBKDF2PasswordHasher  # noqa: E402
from django.utils.crypto import get_random_string  # noqa: E402

SQL = open(sys.argv[2], encoding="utf-8").read()
OUT = sys.argv[3]
PASSWORD = os.environ.get("EQUI_REAL_PASSWORD", "Equi@2026")
REFERENCE = {"Role": "RoleCode", "Permission": "PermissionCode", "Specialization": "SpecializationCode"}
SKIP = set(REFERENCE) | {"RolePermission"}
LOAD_TRIGGERS = ["TrainingSession", "TrainingPlan", "TrainingLock", "MedicalRecord"]

db = sqlite3.connect(os.environ["EQUI_DEMO_DB"])
clean = re.sub(r"--[^\n]*", "", SQL)

# ---------------------------------------------------------------- kiểm tra CHECK / UNIQUE
problems = []
tables = {}
for m in re.finditer(r"CREATE TABLE dbo\.\[?(\w+)\]?\s*\((.*?)\n\);", clean, re.S):
    tables[m.group(1)] = m.group(2)
for table, body in tables.items():
    if not db.execute("select 1 from sqlite_master where name=?", (table,)).fetchone():
        continue
    for c in re.finditer(r"CHECK\s*\(", body):
        i, depth = c.end(), 1
        while depth:
            depth += {"(": 1, ")": -1}.get(body[i], 0)
            i += 1
        expr = " ".join(body[c.end():i - 1].split())
        lite = re.sub(r"CAST\((\w+) AS DATE\)", r"date(\1)", expr)
        lite = re.sub(r"\bLEN\(", "length(", lite)
        lite = re.sub(r"(?<![A-Za-z0-9_'])N'", "'", lite)        # chuỗi Unicode N'...' của SQL Server
        try:
            bad = db.execute(f'select count(*) from "{table}" where not ({lite})').fetchone()[0]
        except sqlite3.Error as e:
            problems.append(f"{table}: không kiểm được CHECK ({expr[:60]}): {e}")
            continue
        if bad:
            problems.append(f"{table}: {bad} dòng vi phạm CHECK ({expr[:100]})")
    for u in re.finditer(r"UNIQUE\s*\(([^)]*)\)", body):
        cols = [c.strip() for c in u.group(1).split(",")]
        q = f'select count(*) from (select {",".join(cols)} from "{table}" group by {",".join(cols)} having count(*) > 1)'
        if db.execute(q).fetchone()[0]:
            problems.append(f"{table}: trùng UNIQUE({','.join(cols)})")
unique_checked = 0
for m in re.finditer(r"CREATE UNIQUE (?:NONCLUSTERED )?INDEX (\w+)\s+ON dbo\.\[?(\w+)\]?\s*\(([^)]*)\)(?:\s*WHERE\s+(.*?))?\s*;",
                     clean, re.S):
    name, table, cols, where = m.groups()
    cols = [c.strip().split()[0] for c in cols.split(",")]
    cond = f"where {' '.join(where.split())}" if where else ""
    q = f'select count(*) from (select 1 from "{table}" {cond} group by {",".join(cols)} having count(*) > 1)'
    unique_checked += 1
    try:
        if db.execute(q).fetchone()[0]:
            problems.append(f"{table}: trùng chỉ mục {name}")
    except sqlite3.Error as e:
        problems.append(f"{table}: không kiểm được {name}: {e}")
if problems:
    print("\n".join(problems))
    sys.exit(1)
print("CHECK / UNIQUE: không có vi phạm; chỉ mục UNIQUE đã kiểm:", unique_checked)

# ---------------------------------------------------------------- thứ tự bảng theo khóa ngoại
models = {}
for model in apps.get_models():
    if model.__module__.startswith("apps.") and not model._meta.proxy:
        models.setdefault(model._meta.db_table, model)
order, seen = [], set()


sql_refs = {t: set(re.findall(r"REFERENCES dbo\.\[?(\w+)\]?", body)) - {t} for t, body in tables.items()}


def visit(table, stack=()):
    if table in seen or table not in models:
        return
    refs = {f.related_model._meta.db_table for f in models[table]._meta.concrete_fields
            if f.is_relation and f.related_model} | sql_refs.get(table, set())
    for ref in sorted(refs - {table}):
        if ref in stack:
            raise SystemExit(f"vòng khóa ngoại: {stack + (table, ref)}")
        visit(ref, stack + (table,))
    seen.add(table)
    order.append(table)


for t in sorted(models):
    visit(t)
identity = {t for t, body in tables.items() if "IDENTITY" in body}
sql_cols = {t: set(re.findall(r"^\s*\[?(\w+)\]?\s+[A-Z]", body, re.M)) for t, body in tables.items()}


def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, Decimal, float)):
        return str(v)
    if isinstance(v, datetime):
        return f"'{v.isoformat(timespec='seconds')}'"
    if isinstance(v, date):
        return f"'{v.isoformat()}'"
    if isinstance(v, time):
        return f"'{v.strftime('%H:%M:%S')}'"
    return "N'" + str(v).replace("'", "''") + "'"


ref_value = {}
for t, code_col in REFERENCE.items():
    model = models[t]
    code_field = next(f.attname for f in model._meta.concrete_fields if f.column == code_col)
    ref_value[t] = {o.pk: getattr(o, code_field) for o in model.objects.all()}

hasher = PBKDF2PasswordHasher()
out = [
    "/*",
    "  Dữ liệu thật EquiTrack - Câu lạc bộ Đua ngựa Equi (dữ liệu tính đến 05/11/2026 14:10).",
    "  Chạy SAU KHI đã chạy sql/horse_v2.sql và mọi file trong sql/migrations (database mới, chưa có câu lạc bộ nào).",
    "  Mọi tài khoản dùng chung mật khẩu ban đầu được gửi riêng.",
    "*/",
    "SET NOCOUNT ON;",
    "SET XACT_ABORT ON;",
    "GO",
    "IF EXISTS (SELECT 1 FROM dbo.Club)",
    "BEGIN",
    "    RAISERROR(N'Database đã có dữ liệu câu lạc bộ. Hãy chạy trên database mới tạo từ horse_v2.sql.', 16, 1);",
    "    SET NOEXEC ON;",
    "END;",
    "IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.TrainingSession') AND name = 'TrainingType'"
    " AND system_type_id = TYPE_ID('varchar'))",
    "BEGIN",
    "    RAISERROR(N'Chưa chạy sql/migrations/20261105_unicode_text_columns.sql (cột chữ tiếng Việt).', 16, 1);",
    "    SET NOEXEC ON;",
    "END;",
    "IF OBJECT_ID(N'dbo.SupportRequest', N'U') IS NULL OR COL_LENGTH('dbo.TrainingResult', 'EarlyEndReason') IS NULL",
    "BEGIN",
    "    RAISERROR(N'Chưa chạy các file sql/migrations/20261106_*.sql (yêu cầu hỗ trợ, kết thúc sớm).', 16, 1);",
    "    SET NOEXEC ON;",
    "END;",
    "GO",
]
var_of = {}
for t, mapping in ref_value.items():
    for code in sorted(set(mapping.values())):
        name = "@" + t[:4] + "_" + re.sub(r"\W", "_", code)
        var_of[(t, code)] = name
        out.append(f"DECLARE {name} INT = (SELECT {t}ID FROM dbo.[{t}] WHERE {REFERENCE[t]} = {lit(code)});")
out += ["BEGIN TRY", "BEGIN TRANSACTION;"]
for t in LOAD_TRIGGERS:
    out.append(f"ALTER TABLE dbo.[{t}] DISABLE TRIGGER ALL;")
counts = {}
for table in order:
    if table in SKIP:
        continue
    model = models[table]
    fields = [f for f in model._meta.concrete_fields if f.column and f.column in sql_cols.get(table, set())]
    rows = list(model.objects.all().order_by("pk").values_list(*[f.attname for f in fields]))
    if not rows:
        continue
    counts[table] = len(rows)
    cols = ", ".join(f"[{f.column}]" for f in fields)
    out.append(f"-- {table}: {len(rows)} dòng")
    if table in identity:
        out.append(f"SET IDENTITY_INSERT dbo.[{table}] ON;")
    values = []
    for row in rows:
        cells = []
        for f, v in zip(fields, row):
            target = f.related_model._meta.db_table if f.is_relation and f.related_model else None
            if target in REFERENCE and v is not None:
                cells.append(var_of[(target, ref_value[target][v])])
            elif table == "User" and f.column == "PasswordHash":
                cells.append(lit(hasher.encode(PASSWORD, get_random_string(22))))
            else:
                cells.append(lit(v))
        values.append("(" + ", ".join(cells) + ")")
    for i in range(0, len(values), 400):
        out.append(f"INSERT INTO dbo.[{table}] ({cols}) VALUES\n" + ",\n".join(values[i:i + 400]) + ";")
    if table in identity:
        out.append(f"SET IDENTITY_INSERT dbo.[{table}] OFF;")
for t in LOAD_TRIGGERS:
    out.append(f"ALTER TABLE dbo.[{t}] ENABLE TRIGGER ALL;")
out += ["COMMIT TRANSACTION;",
        "PRINT N'Đã nạp dữ liệu thật EquiTrack.';",
        "END TRY",
        "BEGIN CATCH",
        "    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;   -- lỗi ở bất kỳ dòng nào: hoàn tác toàn bộ",
        "    PRINT N'Nạp dữ liệu thất bại, database được giữ nguyên.';",
        "    THROW;",
        "END CATCH;",
        "GO",
        "SET NOEXEC OFF;",
        "GO"]
open(OUT, "w", encoding="utf-8-sig").write("\n".join(out) + "\n")
print("đã ghi", OUT, sum(counts.values()), "dòng")
for t in order:
    if t in counts:
        print(f"  {t:<28}{counts[t]}")
