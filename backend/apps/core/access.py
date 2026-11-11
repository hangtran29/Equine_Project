"""Server-side horse scope shared by health and care endpoints."""
from django.db.models import Q
from rest_framework.exceptions import NotFound, PermissionDenied, NotAuthenticated

from apps.horses.models import Horse


def operational_horses(user):
    qs = Horse.objects.filter(club_id=user.club_id) if user.club_id else Horse.objects.none()
    if any(user.has_role(role) for role in ("CLUB_MANAGER", "HEAD_TRAINER", "VETERINARIAN")):
        return qs
    scope = Q(pk__in=[])
    if user.has_role("GROOM"):
        scope |= Q(groom_link__groom=user)
    if user.has_role("TRAINER"):
        scope |= Q(trainer_assignments__trainer=user, trainer_assignments__status="Active")
        scope |= Q(trainer_assignments__plans__stages__sessions__substitute_trainer=user,
                   trainer_assignments__plans__stages__sessions__status="In Progress")
    if user.has_role("WORK_RIDER"):
        from .clubtime import today
        rider = Q(trainer_assignments__plans__stages__sessions__work_rider=user)
        current = Q(trainer_assignments__plans__stages__sessions__status__in=("Assigned", "In Progress"))
        current |= Q(trainer_assignments__plans__stages__sessions__status__in=("Completed", "Cancelled", "Missed"),
                     trainer_assignments__plans__stages__sessions__session_date=today())
        scope |= rider & current
        scope |= (Q(work_rider_preferences__work_rider=user, work_rider_preferences__start_date__lte=today()) &
                  (Q(work_rider_preferences__end_date__isnull=True) | Q(work_rider_preferences__end_date__gte=today())))
    return qs.filter(scope).distinct()


def operational_horse(user, horse_id):
    horse = operational_horses(user).filter(pk=horse_id).first()
    if horse is None:
        raise NotFound("Không tìm thấy ngựa trong phạm vi được giao.")
    return horse


def require_care_access(user):
    if not user or not user.is_authenticated:
        raise NotAuthenticated()
    if not user.club_id or not any(user.has_role(role) for role in (
            "GROOM", "TRAINER", "HEAD_TRAINER", "VETERINARIAN", "CLUB_MANAGER")):
        raise PermissionDenied("Bạn không có quyền truy cập phân hệ chăm sóc.")


def care_horses(user):
    require_care_access(user)
    return operational_horses(user)
