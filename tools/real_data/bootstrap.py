"""Create an empty, isolated SQLite database for the optional data tools."""
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings_demo_local"

import django  # noqa: E402

django.setup()
from django.apps import apps  # noqa: E402
from django.conf import settings  # noqa: E402
from django.core.management import call_command  # noqa: E402

database = Path(settings.DATABASES["default"]["NAME"])
database.parent.mkdir(parents=True, exist_ok=True)
# Refuse existing files; never replace or clear a database.
with database.open("xb"):
    pass
settings.MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
for model in apps.get_models():
    model._meta.managed = True
call_command("migrate", run_syncdb=True, interactive=False, verbosity=0)
print(f"Created isolated SQLite database: {database}")
