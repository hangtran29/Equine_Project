from functools import wraps

from django.db import transaction

from apps.horses.models import Horse


def horse_serialized(function):
    """Lock the stable parent even when a child row does not exist yet.

    All health/care/training writers acquire Horse before child rows. The database
    remains the arbiter; no process-local lock or FE-supplied identity is used.
    """
    @wraps(function)
    @transaction.atomic
    def call(obj, *args, **kwargs):
        horse = obj if isinstance(obj, Horse) else (
            obj.medical_record.horse if hasattr(obj, "medical_record") and not hasattr(obj, "horse") else obj.horse)
        Horse.objects.select_for_update().get(pk=horse.pk)
        fresh = type(obj).objects.select_for_update().get(pk=obj.pk)
        return function(fresh, *args, **kwargs)
    return call
