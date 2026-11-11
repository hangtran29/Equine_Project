"""Reconcile future Pending work; retain completed, skipped and past history.

Missing assignments are stored as GroomID=NULL. Ice soaking requires a Vet
order; a training lock alone never prescribes it. Also called by the worker.
"""
from datetime import datetime, time, timedelta
from django.db import transaction
from apps.accounts.models import Club
from apps.core.audit import log_action
from apps.core.clubtime import now, today
from apps.core.locking import horse_serialized
from apps.horses.models import Horse
from .models import CareTask, CareTaskRule, HorseGroom, VetCareOrder

R = CareTaskRule.Code
DEFAULT_RULES = {
    R.FEEDING_BY_DIET: ("Feeding", "Cho ăn theo khẩu phần", None, None),
    R.DAILY_CLEANING: ("Cleaning", "Dọn vệ sinh chuồng", time(7, 30), None),
    R.BATH_AFTER_TRAINING: ("Bathing", "Tắm, kiểm tra chân sau buổi tập", None, 30),
    R.ICE_SOAK_WHEN_LOCKED: ("Ice Leg Soak", "Ngâm chân theo chỉ định Vet", time(16), None),
}
MAX_DAYS_AHEAD = 7


def ensure_rules(club):
    rules = {}
    for code, (kind, title, at, offset) in DEFAULT_RULES.items():
        rules[code], _ = CareTaskRule.objects.get_or_create(club=club, rule_code=code,
            defaults={"task_type": kind, "title": title, "time_of_day": at, "offset_minutes": offset,
                      "is_active": code != R.ICE_SOAK_WHEN_LOCKED})
    return rules


def _combine(day, at):
    return datetime.combine(day, at)


def expected_tasks(club, day, rules):
    from .services import current_diet_plan
    horses = list(Horse.objects.filter(club=club, registration_status="Approved").order_by("pk"))
    rows = []
    for horse in horses:
        rule = rules[R.FEEDING_BY_DIET]
        plan = current_diet_plan(horse, day) if rule.is_active else None
        for meal in plan.meals.all() if plan else []:
            rows.append((horse, rule, _combine(day, meal.meal_time), f"{rule.rule_code}:{day}:{meal.pk}",
                         f"{rule.title}: {meal.feed_type} {format(meal.quantity.normalize(), 'f')} {meal.unit}" + (f" ({meal.note})" if meal.note else ""), {"diet_meal": meal}))
        rule = rules[R.DAILY_CLEANING]
        if rule.is_active:
            rows.append((horse, rule, _combine(day, rule.time_of_day or time(7, 30)), f"{rule.rule_code}:{day}:", rule.title, {}))
    rule = rules[R.BATH_AFTER_TRAINING]
    if rule.is_active:
        from apps.training.models import TrainingSession
        for s in TrainingSession.objects.filter(stage__plan__assignment__horse__in=horses,
                result__recorded_at__date__in=(day, day - timedelta(days=1)), status="Completed").select_related("stage__plan__assignment", "result"):
            at = s.result.recorded_at + timedelta(minutes=rule.offset_minutes or 0)
            if at.date() == day:
                rows.append((s.horse, rule, at, f"{rule.rule_code}:{s.pk}", f"{rule.title} ({s.training_type})", {}))
    for order in VetCareOrder.objects.filter(medical_record__horse__in=horses, medical_record__record_status="Signed",
            is_active=True, start_date__lte=day, end_date__gte=day).select_related("medical_record__horse", "training_lock"):
        if order.training_lock_id and order.training_lock.lock_status != "Active":
            continue
        rows.append((order.medical_record.horse, None, _combine(day, order.time_of_day), f"VET_ORDER:{order.pk}:{day}",
                     order.instructions, {"task_type": order.task_type, "medical_record": order.medical_record,
                                          "training_lock": order.training_lock, "assigned_by": order.created_by}))
    return rows


class GroomPicker:
    def __init__(self, club, day):
        self.fixed = {link.horse_id: link.groom for link in HorseGroom.objects.filter(
            horse__club=club, groom__status="Active", groom__roles__code="GROOM").select_related("groom")}

    def pick(self, horse):
        return self.fixed.get(horse.pk)


@transaction.atomic
def generate_for_day(club, day, user=None):
    if day < today() or day > today() + timedelta(days=MAX_DAYS_AHEAD):
        return {"Date": day, "Created": 0, "Removed": 0, "Unassigned": 0}
    Club.objects.select_for_update().get(pk=club.pk)
    list(Horse.objects.select_for_update().filter(club=club).order_by("pk"))
    expected = expected_tasks(club, day, ensure_rules(club))
    keys = {row[3] for row in expected}
    tasks = CareTask.objects.filter(horse__club=club, scheduled_at__date=day, source_key__isnull=False)
    stale = tasks.filter(status="Pending", scheduled_at__gt=now()).exclude(source_key__in=keys)
    removed = stale.count()
    for task in stale:
        task.status = "Skipped"
        task.outcome_note = "Nguồn thay đổi; hủy trước giờ thực hiện."
        task.save(update_fields=["status", "outcome_note"])
        log_action(user, "SUPERSEDE_CARE_TASK", task)
    picker, created = GroomPicker(club, day), 0
    for horse, rule, at, key, note, extra in expected:
        defaults = {"groom": picker.pick(horse), "task_type": rule.task_type if rule else extra["task_type"],
                    "scheduled_at": at, "note": note[:1000], "rule_code": rule.rule_code if rule else "VET_ORDER", **extra}
        task, new = CareTask.objects.get_or_create(horse=horse, source_key=key, defaults=defaults)
        created += int(new)
        if not new and task.status == "Pending" and task.scheduled_at > now():
            for attr, value in defaults.items():
                setattr(task, attr, value)
            task.save()
    unassigned = CareTask.objects.filter(horse__club=club, scheduled_at__date=day, status="Pending", groom__isnull=True).count()
    if user and (created or removed):
        log_action(user, "GENERATE_CARE_TASKS", club, {"Date": str(day), "Created": created, "Removed": removed})
    return {"Date": day, "Created": created, "Removed": removed, "Unassigned": unassigned}


def generate_range(club, start, days=1, user=None):
    return [generate_for_day(club, start + timedelta(days=i), user) for i in range(min(MAX_DAYS_AHEAD + 1, max(1, days)))]


@horse_serialized
def set_horse_groom(horse, groom, user):
    old = HorseGroom.objects.filter(horse=horse).first()
    previous = old.groom_id if old else None
    link, _ = HorseGroom.objects.update_or_create(horse=horse, defaults={"groom": groom, "assigned_by": user, "assigned_at": now()})
    pending = CareTask.objects.filter(horse=horse, status="Pending").exclude(groom=groom)
    ids = list(pending.values_list("pk", flat=True))
    pending.update(groom=groom)
    log_action(user, "SET_HORSE_GROOM", horse, {"PreviousGroomID": previous, "GroomID": groom.pk, "MovedTaskIDs": ids})
    return link, len(ids)


@horse_serialized
def clear_horse_groom(horse, user):
    link = HorseGroom.objects.filter(horse=horse).first()
    previous = link.groom_id if link else None
    ids = list(CareTask.objects.filter(horse=horse, status="Pending").values_list("pk", flat=True))
    CareTask.objects.filter(pk__in=ids).update(groom=None)
    HorseGroom.objects.filter(horse=horse).delete()
    log_action(user, "CLEAR_HORSE_GROOM", horse, {"PreviousGroomID": previous, "MovedTaskIDs": ids})
    return bool(link)


@transaction.atomic
def update_rule(rule, user, values):
    Club.objects.select_for_update().get(pk=rule.club_id)
    for attr, value in values.items():
        setattr(rule, attr, value)
    rule.updated_by, rule.updated_at = user, now()
    rule.save()
    log_action(user, "UPDATE_CARE_RULE", rule, {k: str(v) for k, v in values.items()})
    generate_range(rule.club, today(), MAX_DAYS_AHEAD + 1, user)
    return rule
