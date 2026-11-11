"""Isolated real API for browser smoke tests; never connects to the project database.

Run from backend: python -m apps.core.tests.browser_fixture
Uses a new temporary SQLite database and temporary media directory on every run.
"""
import os
import tempfile
from pathlib import Path


def main():
    os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings_test"
    import django
    from django.conf import settings

    temporary = tempfile.TemporaryDirectory(prefix="equi-browser-")
    root = Path(temporary.name)
    settings.DATABASES["default"]["NAME"] = str(root / "browser.sqlite3")
    settings.MEDIA_ROOT = root / "media"
    settings.EMAIL_ASYNC = False
    django.setup()
    from django.apps import apps
    from django.core.management import call_command
    from django.core.files.uploadedfile import SimpleUploadedFile
    from apps.horses import documents as store
    from apps.horses.models import Horse, HorseDocument
    from apps.training.tests.base import TrainingTestCase as BrowserCase

    for model in apps.get_models():
        model._meta.managed = True
    call_command("migrate", run_syncdb=True, verbosity=0)
    BrowserCase.setUpTestData()
    horse = Horse.objects.create(
        owner=BrowserCase.owner, club=BrowserCase.club, horse_name="Thunder",
        breed="Thoroughbred", gender="Male", date_of_birth="2021-03-10", coat_color="Bay",
        sire_name="Storm King", dam_name="Lady Rain", microchip_number="985000000000001",
        passport_number="VN-001", horse_code="EQ-001", registration_status="Approved")
    photo = settings.BASE_DIR.parent / "frontend" / "public" / "landing-horse.jpg"
    HorseDocument.objects.create(
        horse=horse, document_name="Thunder", document_type="Other", uploaded_by=BrowserCase.owner,
        file_url=store.save_upload(horse.id, SimpleUploadedFile("thunder.jpg", photo.read_bytes())),
        is_primary=True, is_profile_image=True)
    HorseDocument.objects.create(
        horse=horse, document_name="Registration certificate", document_type="Passport", uploaded_by=BrowserCase.owner,
        file_url=store.save_upload(horse.id, SimpleUploadedFile("passport.pdf", b"%PDF-1.4\n%%EOF")))
    from apps.care.automation import set_horse_groom
    set_horse_groom(horse, BrowserCase.groom, BrowserCase.manager)
    port = int(os.environ.get("EQUI_BROWSER_PORT", "8001"))
    print(f"Browser fixture: isolated SQLite database ready on 127.0.0.1:{port}", flush=True)
    try:
        call_command("runserver", f"127.0.0.1:{port}", use_reloader=False)
    finally:
        from django.db import connections
        connections.close_all()
        temporary.cleanup()


if __name__ == "__main__":
    main()
