"""
Việc chăm sóc TỰ SINH theo chỉ tiêu (Groom không tự tạo việc).

Chỉ tiêu của mỗi CLB (bảng CareTaskRule, Head Trainer bật / tắt, đổi giờ):
  FEEDING_BY_DIET       Cho ăn  : mỗi bữa trong khẩu phần đang áp dụng (Approved / Adjusted), đúng giờ bữa ăn.
  DAILY_CLEANING        Dọn chuồng: mỗi ngày, lúc TimeOfDay (mặc định 07:30).
  BATH_AFTER_TRAINING   Tắm, kiểm tra chân: sau mỗi buổi tập đã xong trong ngày, EndTime + OffsetMinutes (30 phút).
  ICE_SOAK_WHEN_LOCKED  Ngâm chân nước đá: mỗi ngày ngựa đang bị Vet khóa tập (Flow 3), lúc TimeOfDay (16:00).
Chỉ sinh cho ngựa Approved, từ hôm nay đến tối đa 7 ngày tới (không sinh việc cho ngày đã qua).

Giao cho ai: Groom phụ trách ngựa (HorseGroom, Manager xếp); ngựa chưa có Groom phụ trách -> Groom đang hoạt động
ít việc nhất ngày đó.
Không sinh trùng: mỗi việc có SourceKey (vd "FEEDING_BY_DIET:2026-10-20:15" = bữa ăn 15 của ngày 20/10).
Nguồn thay đổi (khẩu phần mới, tắt chỉ tiêu, hết khóa tập...) -> việc tự sinh CHƯA LÀM, CHƯA TỚI GIỜ của ngày đó bị xóa.

Khi nào sinh: lúc xem danh sách việc (GET /api/care-tasks), lúc Groom mở thông báo,
POST /api/care-tasks/generate, hoặc lệnh `python manage.py generate_care_tasks`.
"""
from datetime import date, datetime, time, timedelta

from django.utils import timezone

from apps.accounts.models import User
from apps.core import flows
from apps.core.audit import log_action
from apps.horses.models import Horse

from .models import CareTask, CareTaskRule, HorseGroom

R = CareTaskRule.Code
DEFAULT_RULES = {
    R.FEEDING_BY_DIET: ("Feeding", "Cho ăn theo khẩu phần", None, None),
    R.DAILY_CLEANING: ("Cleaning", "Dọn vệ sinh chuồng", time(7, 30), None),
    R.BATH_AFTER_TRAINING: ("Bathing", "Tắm, kiểm tra chân sau buổi tập", None, 30),
    R.ICE_SOAK_WHEN_LOCKED: ("Ice Leg Soak", "Ngâm chân nước đá (ngựa đang bị khóa tập)", time(16, 0), None),
}
MAX_DAYS_AHEAD = 7


def ensure_rules(club):
    """Tạo chỉ tiêu mặc định còn thiếu cho CLB. Trả về {RuleCode: CareTaskRule}."""
    rules = {r.rule_code: r for r in CareTaskRule.objects.filter(club=club)}
    for code, (task_type, title, at, offset) in DEFAULT_RULES.items():
        if code not in rules:
            rules[code] = CareTaskRule.objects.create(club=club, rule_code=code, task_type=task_type, title=title,
                                                      time_of_day=at, offset_minutes=offset, is_active=True)
    return rules


def _combine(day, at):
    return datetime.combine(day, at)


def expected_tasks(club, day, rules):
    """Danh sách việc cần có của CLB trong ngày theo các chỉ tiêu đang bật: [(horse, rule, ScheduledAt, SourceKey, Note)]."""
    from .services import current_diet_plan

    horses = list(Horse.objects.filter(club=club, registration_status=Horse.RegistrationStatus.APPROVED))
    rows = []
    for horse in horses:
        rule = rules[R.FEEDING_BY_DIET]
        if rule.is_active:
            plan = current_diet_plan(horse, day)
            for meal in (plan.meals.all() if plan else []):
                rows.append((horse, rule, _combine(day, meal.meal_time), f"{rule.rule_code}:{day}:{meal.id}",
                             f"{rule.title}: {meal.feed_type} {format(meal.quantity.normalize(), 'f')} {meal.unit}"
                             + (f" ({meal.note})" if meal.note else "")))
        rule = rules[R.DAILY_CLEANING]
        if rule.is_active:
            rows.append((horse, rule, _combine(day, rule.time_of_day or time(7, 30)), f"{rule.rule_code}:{day}:",
                         rule.title))
    rule = rules[R.BATH_AFTER_TRAINING]
    if rule.is_active and flows.has_training() and day <= date.today():
        from apps.training.models import TrainingSession

        for session in TrainingSession.objects.filter(stage__plan__assignment__horse__in=horses, session_date=day,
                                                      status="Completed").select_related("stage__plan__assignment"):
            end = session.end_time or session.start_time
            # buổi tập xong muộn (vd 23:40 + 30 phút) -> vẫn tính là việc của ngày tập, không rơi sang hôm sau
            at = min(_combine(day, end) + timedelta(minutes=rule.offset_minutes or 0), _combine(day, time(23, 59)))
            rows.append((session.horse, rule, at, f"{rule.rule_code}:{day}:{session.id}",
                         f"{rule.title} ({session.training_type} lúc {session.start_time:%H:%M})"))
    rule = rules[R.ICE_SOAK_WHEN_LOCKED]
    if rule.is_active and flows.has_flow3():
        from apps.medical.models import TrainingLock

        for lock in TrainingLock.objects.filter(horse__in=horses, lock_status="Active").select_related("horse"):
            if lock.covers(day):
                rows.append((lock.horse, rule, _combine(day, rule.time_of_day or time(16, 0)),
                             f"{rule.rule_code}:{day}:{lock.id}", f"{rule.title}: {lock.reason}"))
    return rows


class GroomPicker:
    """Groom phụ trách ngựa; chưa có thì chia đều cho Groom đang hoạt động ít việc nhất trong ngày."""

    def __init__(self, club, day):
        self.fixed = {link.horse_id: link.groom for link in HorseGroom.objects.filter(
            horse__club=club, groom__status="Active").select_related("groom")}
        self.grooms = list(User.objects.filter(club=club, status="Active", roles__code="GROOM").distinct())
        loads = CareTask.objects.filter(horse__club=club, scheduled_at__date=day, status="Pending")
        self.load = {g.id: loads.filter(groom=g).count() for g in self.grooms}

    def pick(self, horse):
        groom = self.fixed.get(horse.id)
        if groom is None and self.grooms:
            groom = min(self.grooms, key=lambda g: (self.load[g.id], g.id))
        if groom is not None:
            self.load[groom.id] = self.load.get(groom.id, 0) + 1
        return groom


def generate_for_day(club, day, user=None):
    """Sinh việc còn thiếu / xóa việc tự sinh đã lỗi thời của 1 ngày. Trả về số việc tạo / xóa / không giao được."""
    today = date.today()
    if day < today or day > today + timedelta(days=MAX_DAYS_AHEAD):
        return {"Date": day, "Created": 0, "Removed": 0, "Unassigned": 0}
    rules = ensure_rules(club)
    expected = expected_tasks(club, day, rules)
    keys = {row[3] for row in expected}
    day_tasks = CareTask.objects.filter(horse__club=club, scheduled_at__date=day, rule_code__isnull=False)
    existing = set(day_tasks.values_list("source_key", flat=True))
    stale = day_tasks.filter(status="Pending", scheduled_at__gte=timezone.now().replace(tzinfo=None)) \
        .exclude(source_key__in=keys)
    removed = stale.count()
    stale.delete()
    # Nguồn đổi (vd Vet điều chỉnh khẩu phần -> bữa ăn có mã mới) nhưng việc cùng ngựa, cùng chỉ tiêu, cùng giờ
    # đã có (đã làm / bỏ qua / đang chờ) thì không sinh thêm bản trùng.
    taken = set(day_tasks.values_list("horse_id", "rule_code", "scheduled_at"))
    picker, created, unassigned = GroomPicker(club, day), [], 0
    for horse, rule, at, key, note in expected:
        if key in existing or (horse.id, rule.rule_code, at) in taken:
            continue
        groom = picker.pick(horse)
        if groom is None:
            unassigned += 1
            continue
        created.append(CareTask(horse=horse, groom=groom, assigned_by=None, task_type=rule.task_type,
                                scheduled_at=at, status="Pending", note=note[:1000], rule_code=rule.rule_code,
                                source_key=key))
    CareTask.objects.bulk_create(created)
    if user is not None and (created or removed):
        log_action(user, "GENERATE_CARE_TASKS", club, {"Date": str(day), "Created": len(created), "Removed": removed})
    return {"Date": day, "Created": len(created), "Removed": removed, "Unassigned": unassigned}


def generate_range(club, start, days=1, user=None):
    return [generate_for_day(club, start + timedelta(days=i), user) for i in range(max(1, days))]


def set_horse_groom(horse, groom, user):
    link = HorseGroom.objects.filter(horse=horse).first()
    if link is None:
        link = HorseGroom.objects.create(horse=horse, groom=groom, assigned_by=user, assigned_at=timezone.now())
    else:
        link.groom, link.assigned_by, link.assigned_at = groom, user, timezone.now()
        link.save()
    # mọi việc chưa làm của ngựa (tự sinh lẫn do Vet / Trainer giao) chuyển cho Groom mới
    moved = CareTask.objects.filter(horse=horse, status="Pending").exclude(groom=groom).update(groom=groom)
    log_action(user, "SET_HORSE_GROOM", horse, {"GroomID": groom.id, "MovedTaskCount": moved})
    return link, moved


def clear_horse_groom(horse, user):
    deleted, _ = HorseGroom.objects.filter(horse=horse).delete()
    if deleted:
        log_action(user, "CLEAR_HORSE_GROOM", horse)
    return bool(deleted)


def update_rule(rule, user, values):
    for attr, value in values.items():
        setattr(rule, attr, value)
    rule.updated_by, rule.updated_at = user, timezone.now()
    rule.save()
    log_action(user, "UPDATE_CARE_RULE", rule, {k: str(v) for k, v in values.items()})
    # áp dụng ngay: hôm nay và các ngày tới đã có việc tự sinh
    today = date.today()
    days = set(CareTask.objects.filter(horse__club=rule.club, rule_code__isnull=False, scheduled_at__date__gt=today,
                                       scheduled_at__date__lte=today + timedelta(days=MAX_DAYS_AHEAD))
               .values_list("scheduled_at__date", flat=True))
    for day in sorted({today, *days}):
        generate_for_day(rule.club, day, user)
    return rule
