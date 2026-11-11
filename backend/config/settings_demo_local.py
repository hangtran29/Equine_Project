"""Isolated SQLite configuration for tools/real_data; requires explicit paths."""
import os
from pathlib import Path

from .settings_test import *  # noqa: F401,F403


def required_path(name):
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Set {name} to an isolated local path before using the data tools.")
    return Path(value).resolve()


demo_database = required_path("EQUI_DEMO_DB")
MEDIA_ROOT = required_path("EQUI_DEMO_MEDIA")
if demo_database.suffix not in {".sqlite3", ".sqlite", ".db"}:
    raise RuntimeError("EQUI_DEMO_DB must be a SQLite file.")
production_media = (BASE_DIR / "media").resolve()  # noqa: F405
if MEDIA_ROOT == production_media or production_media in MEDIA_ROOT.parents:
    raise RuntimeError("EQUI_DEMO_MEDIA must be separate from backend/media.")
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": str(demo_database), "ATOMIC_REQUESTS": True}}
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "testserver"]
DEBUG = True
NOTIFICATION_EMAILS = False
CONTENT_TRANSLATION = False
