r"""Verify the additive upgrades on a newly named SQL Server database only.

Run from backend:
    .venv\Scripts\python.exe -m apps.core.tests.sql_server_g1 --source-archive <EquiTrack_G1.zip>
The isolated database is kept for inspection. This never upgrades the configured business database.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import uuid
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-archive", type=Path, required=True)
    args = parser.parse_args()
    with zipfile.ZipFile(args.source_archive) as archive:
        schema = archive.read("EquiTrack_G1/EquiTrack/sql/horse_v2.sql").decode("utf-8-sig")
    # Discard the SOURCE database creation/switch preamble; only the schema body enters our test DB.
    parts = re.split(r"^USE RacehorseTrainingManagement;\s*\r?\nGO\s*$", schema, flags=re.M)
    if len(parts) != 2:
        raise RuntimeError("Unexpected source schema preamble; no database changes made.")
    schema = parts[1]
    root = Path(__file__).resolve().parents[4]
    upgrades = [(root / "sql/migrations" / filename).read_text(encoding="utf-8-sig") for filename in (
        "20261102_health_care_workflows.sql", "20261108_equitrack_integration.sql",
    )]
    for sql in [schema, *upgrades]:
        if re.search(r"\b(?:USE\s+\[?\w+|(?:CREATE|DROP)\s+DATABASE)\b", sql, re.I):
            raise RuntimeError("Database switch in schema body; no database changes made.")

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django
    from django.conf import settings

    test_name = "EquineG1Test_20261108_" + uuid.uuid4().hex[:8]
    if settings.DATABASES["default"]["ENGINE"] != "mssql":
        raise RuntimeError("A SQL Server connection is required.")
    assert test_name != settings.DATABASES["default"]["NAME"]
    settings.DATABASES["default"]["NAME"] = "master"
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    settings.EMAIL_ASYNC = False
    settings.CONTENT_TRANSLATION = False
    settings.ALLOWED_HOSTS = ["testserver"]
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
    django.setup()
    from django.apps import apps
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute("SELECT DB_ID(%s)", [test_name])
        assert cursor.fetchone()[0] is None, "Refusing to reuse a database."
        cursor.execute(f"CREATE DATABASE [{test_name}]")
    connection.close()
    connection.settings_dict["NAME"] = test_name
    settings.DATABASES["default"]["NAME"] = test_name
    print(json.dumps({"isolated_test_database": test_name}), flush=True)

    def run_sql(sql):
        for batch in re.split(r"^\s*GO\s*$", sql, flags=re.M | re.I):
            if not batch.strip():
                continue
            with connection.cursor() as cursor:
                cursor.execute("SELECT DB_NAME()")
                assert cursor.fetchone()[0] == test_name
                cursor.execute(batch)
                while cursor.nextset():
                    pass

    try:
        run_sql(schema)
        from apps.core.tests.helpers import Flow1TestCase
        from apps.horses.models import Horse
        Flow1TestCase.setUpTestData()
        case = Flow1TestCase()
        groom = case.make_user("groom@one.test", "GROOM", case.club)
        Horse.objects.create(owner=case.owner, club=case.club, horse_name="Existing G1 test horse",
                             breed="Thoroughbred", gender="Male", date_of_birth="2021-01-01")
        # Capture every original table/column value without printing any row contents.
        with connection.cursor() as cursor:
            cursor.execute("SELECT t.name,c.name FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id WHERE s.name='dbo' ORDER BY t.name,c.column_id")
            columns = {}
            for table, column in cursor.fetchall():
                columns.setdefault(table, []).append(column)

        def snapshot():
            result = {}
            with connection.cursor() as cursor:
                for table, fields in columns.items():
                    selected = ", ".join(connection.ops.quote_name(f) for f in fields)
                    cursor.execute(f"SELECT {selected} FROM dbo.{connection.ops.quote_name(table)}")
                    rows = sorted(repr(tuple(row)).encode("utf-8") for row in cursor.fetchall())
                    result[table] = hashlib.sha256(b"\n".join(rows)).hexdigest()
            return result

        before = snapshot()
        for pass_number in (1, 2):
            for upgrade in upgrades:
                run_sql(upgrade)
            assert snapshot() == before, "Original schema data changed."
            print(f"Additive upgrade pass {pass_number}: original data preserved", flush=True)

        with connection.cursor() as cursor:
            cursor.execute("SELECT t.name,c.name FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id WHERE s.name='dbo'")
            actual = {}
            for table, column in cursor.fetchall():
                actual.setdefault(table, set()).add(column)
        missing = {}
        for model in apps.get_models():
            if model._meta.app_label not in {"accounts", "core", "horses", "medical", "training", "care"}:
                continue
            absent = [field.column for field in model._meta.concrete_fields if field.column not in actual.get(model._meta.db_table, set())]
            if absent:
                missing[model._meta.db_table] = absent
        assert not missing, missing

        horse_id = case.approved_horse()
        manager = case.client_for(case.manager)
        response = manager.put(f"/api/horses/{horse_id}/groom", {"GroomID": groom.pk}, format="json")
        assert response.status_code == 200
        response = manager.post(f"/api/horses/{horse_id}/move-stall", {"StallID": case.stall.pk}, format="json")
        assert response.status_code == 200
        for url, user in ((f"/api/horses/{horse_id}", case.manager),
                          ("/api/notifications/unread-count", case.manager),
                          ("/api/stalls", groom)):
            response = case.client_for(user).get(url)
            assert response.status_code == 200, (url, response.status_code)
            print(json.dumps({"endpoint": url, "status": response.status_code}), flush=True)
        print("PASS: SQL Server upgrades/reruns, preserved data, model columns and API smoke.", flush=True)
    finally:
        connection.close()


if __name__ == "__main__":
    main()
