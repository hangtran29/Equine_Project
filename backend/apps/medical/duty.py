"""
Lịch trực bác sĩ thú y (Flow 1, dùng cả ở Flow 3).

Club Manager xếp ca trực theo ngày. Bác sĩ đang trực được báo trước:
  - Flow 1: ngựa vừa được xác minh hồ sơ, chờ khám đầu vào;
  - Flow 3: báo cáo sức khỏe khẩn (email ngay).
Bác sĩ khác vẫn thấy hàng chờ và nhận ca giúp được. Không ai trực -> báo mọi bác sĩ của CLB.
"""
from datetime import date, datetime, time, timedelta

from django.utils import timezone

from apps.core.audit import log_action
from apps.core.exceptions import BusinessRuleError
from apps.core.permissions import club_users_with_role, require_club_user

from .models import VetDutyShift

Shift = VetDutyShift.Shift
# Giờ bắt đầu / kết thúc của từng ca (Night kéo sang 06:00 hôm sau)
SHIFT_HOURS = {
    Shift.MORNING: (time(6, 0), time(14, 0)),
    Shift.AFTERNOON: (time(14, 0), time(22, 0)),
    Shift.NIGHT: (time(22, 0), time(6, 0)),
    Shift.FULL_DAY: (time(0, 0), time(23, 59, 59)),
}


def _local_now():
    now = timezone.now()
    return timezone.localtime(now) if timezone.is_aware(now) else now


def shift_covers(shift, duty_date, moment):
    """Ca `shift` của ngày `duty_date` có bao phủ thời điểm `moment` (datetime, giờ CLB) không."""
    start, end = SHIFT_HOURS[shift]
    begin = datetime.combine(duty_date, start)
    finish = datetime.combine(duty_date + timedelta(days=1) if end <= start else duty_date, end)
    if shift == Shift.FULL_DAY:
        finish = datetime.combine(duty_date + timedelta(days=1), time(0, 0))
    moment = moment.replace(tzinfo=None)
    return begin <= moment < finish


def shifts_now(club_id, moment=None):
    moment = moment or _local_now()
    day = moment.date()
    candidates = VetDutyShift.objects.filter(club_id=club_id, duty_date__in=(day, day - timedelta(days=1)),
                                             vet__status="Active").select_related("vet")
    return [s for s in candidates if shift_covers(s.shift, s.duty_date, moment)]


def on_duty_vets(club_id, moment=None):
    """Bác sĩ đang trực lúc này (danh sách User, có thể rỗng)."""
    seen = {}
    for shift in shifts_now(club_id, moment):
        seen.setdefault(shift.vet_id, shift.vet)
    return list(seen.values())


def is_on_duty(user, moment=None):
    return any(v.pk == user.pk for v in on_duty_vets(user.club_id, moment))


def vets_to_alert(club_id, moment=None):
    """Người cần báo ngay: bác sĩ đang trực; không ai trực thì mọi bác sĩ đang hoạt động của CLB."""
    vets = on_duty_vets(club_id, moment)
    return vets or list(club_users_with_role(club_id, "VETERINARIAN"))


def create_shift(user, vet_id, duty_date, shift, note=None):
    vet = require_club_user(vet_id, user.club_id, "VETERINARIAN", field="VetID")
    if duty_date < date.today():
        raise BusinessRuleError("Không xếp lịch trực cho ngày đã qua.", "PAST_DATE")
    if VetDutyShift.objects.filter(club_id=user.club_id, vet=vet, duty_date=duty_date, shift=shift).exists():
        raise BusinessRuleError("Bác sĩ này đã có ca trực này trong ngày.", "ALREADY_EXISTS")
    item = VetDutyShift.objects.create(club_id=user.club_id, vet=vet, duty_date=duty_date, shift=shift,
                                       note=(note or "").strip() or None, created_by=user)
    log_action(user, "CREATE_VET_DUTY_SHIFT", item, {"VetID": vet.pk, "DutyDate": duty_date, "Shift": shift})
    return item


def delete_shift(item, user):
    if item.duty_date < date.today():
        raise BusinessRuleError("Không xóa ca trực đã qua (giữ làm lịch sử).", "PAST_DATE")
    log_action(user, "DELETE_VET_DUTY_SHIFT", item, {"VetID": item.vet_id, "DutyDate": item.duty_date,
                                                     "Shift": item.shift})
    item.delete()
