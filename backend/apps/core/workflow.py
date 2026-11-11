from .models import WorkflowNotice


def notify(users, horse, kind, key, message):
    for user in {u.pk: u for u in users}.values():
        if user.status == "Active" and (user.club_id == horse.club_id or user.pk == horse.owner_id):
            WorkflowNotice.objects.get_or_create(user=user, source_key=key,
                defaults={"horse": horse, "kind": kind, "message": message[:1000]})


def clinical_recipients(horse, owner=False):
    from apps.core.permissions import club_users_with_role
    users = list(club_users_with_role(horse.club_id, "HEAD_TRAINER"))
    users += [a.trainer for a in horse.trainer_assignments.filter(status="Active").select_related("trainer")]
    if owner:
        users.append(horse.owner)
    return users


def items(user, make_item):
    qs = WorkflowNotice.objects.filter(user=user)
    qs = qs.filter(horse__owner=user) if user.has_perm("OWNER_VIEW") else qs.filter(horse__club_id=user.club_id)
    output = []
    for n in qs.select_related("horse").order_by("-created_at")[:200]:
        if not current_notice(n):
            continue
        kind, entity, pk, at = n.kind, "WorkflowNotice", n.pk, n.created_at
        urgent = kind in ("FEEDING_ALERT", "TRAINING_LOCK_CHANGED", "HEALTH_REPORT_ESCALATED")
        if kind == "HEALTH_REPORT_ESCALATED":
            entity, pk = "HealthReport", int(n.source_key.split(":")[-1])
        elif kind == "MEDICAL_REMINDER":
            from datetime import date
            from .clubtime import today
            source, resource_id, day = n.source_key.split(":", 2)
            kind, entity = ("MEDICAL_SCHEDULE", "MedicalSchedule") if source == "schedule" else ("VACCINATION_DUE", "Vaccination")
            pk, at = int(resource_id), date.fromisoformat(day)
            urgent = at < today()
        output.append(make_item(kind, n.message, entity, pk, n.horse, at, urgent))
    return output


def current_notice(notice):
    if notice.kind != "MEDICAL_REMINDER":
        return True
    from apps.medical.models import MedicalSchedule, Vaccination
    kind, pk, day = notice.source_key.split(":", 2)
    if kind == "schedule":
        return MedicalSchedule.objects.filter(pk=pk, horse=notice.horse, status__in=("Scheduled", "Overdue"), scheduled_date=day).exists()
    if kind == "vaccine":
        item = Vaccination.objects.filter(pk=pk, horse=notice.horse).first()
        return bool(item and item.status != "Cancelled" and str(item.next_due_date if item.status == "Completed" else item.vaccination_date) == day)
    return False
