from datetime import datetime
from zoneinfo import ZoneInfo
from django.conf import settings


def now():
    """SQL Server DATETIME2 stores wall time in the configured club time zone."""
    return datetime.now(ZoneInfo(settings.TIME_ZONE)).replace(tzinfo=None)


def today():
    return now().date()
