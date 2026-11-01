"""
Ai xem / làm gì trong Flow 4 (mỗi người chỉ thấy phần liên quan tới mình).

  Xem việc chăm sóc, khẩu phần:
    Bác sĩ thú y, Head Trainer   toàn CLB
    Trainer                      ngựa mình đang phụ trách
    Groom                        việc của mình, khẩu phần ngựa mình giữ
    Manager, Work Rider, chủ ngựa không xem (Manager chỉ xem bảng xếp Groom và kho)
  Xếp Groom phụ trách ngựa:      Manager
  Chỉ tiêu chăm sóc chung:       Head Trainer chỉnh (Vet, Trainer, Groom xem)
  Giao việc phát sinh:           Vet (việc y tế, mọi ngựa), Trainer (việc tập luyện, ngựa mình phụ trách)
"""
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied

from apps.core import flows

ALL_CLUB = "ALL"

# Loại việc mỗi vai trò được giao thêm
VET_TASK_TYPES = ("Medical Care", "Ice Leg Soak")
TRAINER_TASK_TYPES = ("Training Care", "Bathing")


def is_vet(user):
    return user.has_perm("MEDICAL_MANAGE")


def is_head_trainer(user):
    return user.has_perm("TRAINING_PLAN_APPROVE")


def is_trainer(user):
    return user.has_perm("TRAINING_PLAN_MANAGE")


def is_groom(user):
    return user.has_perm("CARE_MANAGE")


def is_groom_manager(user):
    """Người xếp Groom phụ trách ngựa (Club Manager)."""
    return user.has_perm("CLUB_MANAGE")


def is_rule_owner(user):
    """Người chỉnh chỉ tiêu chăm sóc chung và sinh việc trước (Head Trainer)."""
    return user.has_perm("TRAINER_ASSIGN")


def trainer_horse_ids(user):
    if not flows.has_training():
        return set()
    from apps.training.models import TrainerHorseAssignment

    return set(TrainerHorseAssignment.objects.filter(trainer=user, status="Active").values_list("horse_id", flat=True))


def groom_horse_ids(user):
    """Ngựa Groom đang giữ (HorseGroom) + ngựa có việc chưa làm giao cho Groom (ngựa chưa có Groom phụ trách)."""
    from .models import CareTask, HorseGroom

    ids = set(HorseGroom.objects.filter(groom=user).values_list("horse_id", flat=True))
    ids |= set(CareTask.objects.filter(groom=user, status="Pending").values_list("horse_id", flat=True))
    return ids


def care_viewer(user):
    """True nếu người dùng được xem phần chăm sóc / dinh dưỡng."""
    return is_vet(user) or is_head_trainer(user) or is_trainer(user) or is_groom(user)


def ensure_care_viewer(user):
    if not care_viewer(user):
        raise PermissionDenied("Bạn không xem được phần chăm sóc / dinh dưỡng.")


def visible_horse_ids(user):
    """ALL_CLUB (Vet, Head Trainer) hoặc tập HorseID được xem; không có quyền -> 403."""
    ensure_care_viewer(user)
    if is_vet(user) or is_head_trainer(user):
        return ALL_CLUB
    ids = set()
    if is_trainer(user):
        ids |= trainer_horse_ids(user)
    if is_groom(user):
        ids |= groom_horse_ids(user)
    return ids


def ensure_horse_visible(user, horse):
    ids = visible_horse_ids(user)
    if ids != ALL_CLUB and horse.pk not in ids:
        raise PermissionDenied("Bạn chỉ xem được ngựa mình phụ trách / chăm sóc.")


def filter_tasks(user, queryset):
    """Việc chăm sóc người dùng được thấy."""
    ensure_care_viewer(user)
    if is_vet(user) or is_head_trainer(user):
        return queryset
    condition = Q(pk__in=[])
    if is_trainer(user):
        condition |= Q(horse_id__in=trainer_horse_ids(user)) | Q(assigned_by=user)
    if is_groom(user):
        condition |= Q(groom=user)
    return queryset.filter(condition)


def filter_horses(user, queryset, field="horse_id"):
    ids = visible_horse_ids(user)
    return queryset if ids == ALL_CLUB else queryset.filter(**{f"{field}__in": ids})


def allowed_task_types(user, horse):
    """Loại việc người dùng được giao thêm cho ngựa này (rỗng = không được giao)."""
    types = set()
    if is_vet(user):
        types |= set(VET_TASK_TYPES)
    if is_trainer(user) and horse.pk in trainer_horse_ids(user):
        types |= set(TRAINER_TASK_TYPES)
    return types
