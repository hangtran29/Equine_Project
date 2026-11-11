"""
Giáo án mẫu theo chuyên môn (mỗi CLB, mỗi chuyên môn 1 bản; Head Trainer sửa được).

Quy trình:
  1. Head Trainer đánh giá ngựa, chọn chuyên môn, giao trainer có chuyên môn đó
     -> hệ thống tạo GIÁO ÁN NHÁP (Draft) chép từ giáo án mẫu của chuyên môn, đổi "ngày thứ mấy" thành ngày thật.
  2. Trainer đọc (kèm phiếu đánh giá ngựa), sửa hoặc giữ nguyên, đổi ngày bắt đầu (các giai đoạn tự dời theo), gửi duyệt.
  3. Head Trainer xem "đã sửa gì so với mẫu" (template_review), duyệt hoặc trả về kèm lý do -> trainer sửa tiếp.
  4. Giáo án Active -> trainer xếp buổi tập theo giai đoạn và lịch tuần mẫu.
Mẫu không nhất thiết hợp với từng con ngựa: trainer chỉnh theo phiếu đánh giá (điểm chất lượng, thể trạng).
"""
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.audit import log_action

from .models import Specialization, TrainingPlan, TrainingPlanStage, TrainingPlanTemplate, TrainingPlanTemplateStage

DAILY_STRUCTURE = (
    "1. Khởi động 10–15 phút: đi bộ thả lỏng cương 5–10 phút cho khớp và cơ giãn ra; nước kiệu nhẹ 5–10 phút "
    "(vòng tròn hoặc đường thẳng, dây cương dài) để kích hoạt tuần hoàn.\n"
    "2. Bài tập chính 20–30 phút: theo giai đoạn (chạy bền, tập dưới nước, ô xuất phát, kiểm soát tốc độ...).\n"
    "3. Thả lỏng 10 phút: đi bộ chậm cho nhịp tim và thân nhiệt hạ dần.\n"
    "4. Sau buổi tập: tắm sạch mồ hôi, kiểm tra móng sắt, chân và cơ; Kỵ sĩ tập luyện ghi kết quả, Huấn luyện viên đánh giá.\n"
    "Dừng buổi tập ngay khi: đi lệch chân / què, chảy máu mũi, thở rít, nhịp tim không hạ sau thả lỏng, "
    "ngựa hoảng loạn không kiểm soát được (báo cáo sức khỏe cho bác sĩ thú y)."
)
WEEKLY_PATTERN = (
    "Thứ 2: nhẹ (nước kiệu, đi bộ) · Thứ 3: bài chính (nặng) · Thứ 4: phục hồi (tập dưới nước / đi bộ) · "
    "Thứ 5: kỹ năng (ô xuất phát, kiểm soát tốc độ) · Thứ 6: bài chính (nặng) · Thứ 7: nhẹ (địa hình đa dạng) · "
    "Chủ nhật: nghỉ. Tối đa 2 buổi nặng mỗi tuần, không xếp 2 buổi nặng liền nhau."
)
COMMON_NOTE = (
    "Nghỉ ít nhất 1 ngày/tuần. bác sĩ thú y kiểm tra trước khi sang giai đoạn mới và trước ngày đua. Đóng / thay móng sắt "
    "4–6 tuần/lần, kiểm tra răng 6–12 tháng/lần. Khẩu phần lập theo giai đoạn (Flow 4). Các con số là mức tham "
    "khảo: huấn luyện viên chỉnh theo phiếu đánh giá ngựa."
)
VET_EXIT = "bác sĩ thú y xác nhận đủ sức khỏe thi đấu."

# (thứ tự, tên, ngày bắt đầu, số ngày, cường độ, tải, quãng đường mục tiêu km, mặt sân, mục tiêu, nội dung, điều kiện sang giai đoạn sau)
DEFAULT_TEMPLATES = {
    "FLAT_RACING": ("Chương trình chuẩn – Đua đường bằng 1.200–2.000 m", 84, "Moderate",
                    "Thể lực (phổi, tim, cơ xương), tốc độ và sải vó, tâm lý ổn định trước ô xuất phát.", [
        (1, "Làm quen & giảm nhạy cảm", 1, 14, "Low", 25, 30, "Cát, đường đất",
         "Quen yên cương, tiếng động lớn, sự điều khiển bằng chân / giọng nói của nài.",
         "Đi bộ, nước kiệu; tập với tiếng ồn; điều khiển bằng chân và giọng nói.",
         "Ngựa bình tĩnh khi có tiếng ồn; điểm phong độ trung bình ≥ 60."),
        (2, "Phát triển cơ bắp & sức bền", 15, 28, "Moderate", 45, 100, "Đồi dốc, cát, đường đất",
         "Tăng sức bền tim phổi và hệ cơ xương.",
         "Tăng dần quãng đường; địa hình đa dạng; tập dưới nước 1 buổi/tuần.",
         "Thời gian hồi phục ngắn hơn giai đoạn 1; điểm phong độ trung bình ≥ 70."),
        (3, "Tăng tốc độ", 43, 28, "High", 70, 80, "Đường đua (cỏ / cát)",
         "Tăng tốc độ, tần suất và độ mở sải vó; xuất phát đúng tín hiệu.",
         "Phi nước đại 200–400 m rồi kéo dài 600–1.000 m; tập ô xuất phát; kiểm soát tốc độ.",
         "Tốc độ tối đa tăng ổn định; xuất phát đúng tín hiệu; điểm phong độ trung bình ≥ 75."),
        (4, "Siết phong độ (Tapering)", 71, 14, "Low", 30, 25, "Đường đua",
         "Tích trữ tối đa năng lượng trước ngày đua.",
         "Giảm dần cường độ, vẫn giữ độ linh hoạt.", VET_EXIT),
    ]),
    "STEEPLECHASE_HURDLE": ("Chương trình chuẩn – Đua vượt rào", 98, "Moderate",
                            "Sức bền, kỹ thuật nhảy rào an toàn, giữ tốc độ qua chuỗi rào.", [
        (1, "Làm quen & nền tảng", 1, 14, "Low", 25, 30, "Cát, đường đất",
         "Quen yên cương, tiếng động, sự điều khiển của nài.", "Đi bộ, nước kiệu, tập với tiếng ồn.",
         "Ngựa bình tĩnh; điểm phong độ trung bình ≥ 60."),
        (2, "Sức bền", 15, 28, "Moderate", 45, 100, "Đồi dốc, đường đất",
         "Tăng sức bền và sức mạnh chân sau.", "Tăng dần quãng đường; leo dốc; tập dưới nước.",
         "Thời gian hồi phục ngắn hơn; điểm phong độ trung bình ≥ 70."),
        (3, "Kỹ thuật nhảy", 43, 28, "Moderate", 50, 70, "Sân tập chướng ngại",
         "Nhảy rào đúng kỹ thuật, tiếp đất cân bằng.",
         "Nhảy chướng ngại thấp rồi tăng dần độ cao; giữ nhịp trước rào; tập tiếp đất an toàn.",
         "Qua rào chuẩn không chạm; tiếp đất cân bằng; điểm phong độ trung bình ≥ 72."),
        (4, "Tốc độ trên đường rào", 71, 21, "High", 70, 70, "Đường đua có rào",
         "Giữ tốc độ đua qua chuỗi rào.", "Phi qua chuỗi rào ở tốc độ đua; kiểm soát nhịp giữa các rào.",
         "Hoàn thành cự ly có rào ổn định; điểm phong độ trung bình ≥ 75."),
        (5, "Siết phong độ (Tapering)", 92, 7, "Low", 30, 15, "Đường đua",
         "Tích trữ năng lượng trước ngày đua.", "Giảm cường độ, giữ độ linh hoạt.", VET_EXIT),
    ]),
    "HARNESS_RACING": ("Chương trình chuẩn – Đua kéo xe", 84, "Moderate",
                       "Nước kiệu / nước kiệu đi ngang ổn định, sức bền và tốc độ khi kéo xe.", [
        (1, "Làm quen xe kéo & dây cương", 1, 14, "Low", 25, 30, "Đường đất",
         "Quen dây kéo và xe.", "Đi bộ và nước kiệu chậm có xe kéo.", "Kéo xe bình tĩnh, giữ thẳng hướng."),
        (2, "Sức bền nước kiệu", 15, 28, "Moderate", 45, 120, "Đường đua",
         "Giữ dáng chạy trên quãng đường dài.",
         "Nước kiệu / nước kiệu đi ngang đường dài; không để ngựa chuyển sang phi.",
         "Giữ dáng chạy suốt cự ly; điểm phong độ trung bình ≥ 70."),
        (3, "Tốc độ nước kiệu", 43, 28, "High", 70, 100, "Đường đua",
         "Tăng tốc độ mà không phá dáng chạy.", "Biến tốc nước kiệu nhanh 400–800 m; tập xuất phát sau xe dẫn.",
         "Tốc độ tăng, không phá dáng (không phi); điểm phong độ trung bình ≥ 75."),
        (4, "Siết phong độ (Tapering)", 71, 14, "Low", 30, 30, "Đường đua",
         "Tích trữ năng lượng trước ngày đua.", "Giảm cường độ, giữ độ linh hoạt.", VET_EXIT),
    ]),
    "ENDURANCE": ("Chương trình chuẩn – Đua đường dài 80–120 km", 84, "Moderate",
                  "Hoàn thành cự ly 80–120 km; nhịp tim hồi phục ≤ 64 nhịp/phút trong 20 phút sau mỗi chặng.", [
        (1, "Làm quen & nền tảng", 1, 14, "Low", 25, 60, "Đường mòn, cát",
         "Xây nền thể lực, lấy mốc nhịp tim.", "4 buổi/tuần, đi bộ và nước kiệu chậm 6–8 km; đo nhịp tim nghỉ.",
         "Nhịp tim nghỉ ổn định; điểm phong độ trung bình ≥ 60."),
        (2, "Xây sức bền", 15, 28, "Moderate", 45, 220, "Đường mòn",
         "Chạy bền tốc độ chậm đều.", "4–5 buổi/tuần, mỗi tuần 1 buổi dài 15–25 km.",
         "Nhịp tim hồi phục < 64 nhịp/phút trong 15 phút."),
        (3, "Đồi dốc & nhịp độ", 43, 21, "High", 65, 200, "Đồi, đường mòn",
         "Sức mạnh và nhịp độ trên địa hình khó.",
         "Leo dốc 2 buổi/tuần; biến tốc nước kiệu nhanh; kiểm tra chân sau mỗi buổi.",
         "Hoàn thành buổi dốc không mệt quá mức; điểm phong độ trung bình ≥ 72."),
        (4, "Mô phỏng thi đấu", 64, 14, "Very High", 75, 160, "Địa hình hỗn hợp",
         "Quen nhịp độ và trạm kiểm tra của giải.",
         "Mỗi tuần 1 buổi 40–60 km chia chặng; kiểm tra nhịp tim giữa chặng như trạm thú y (≤ 64 nhịp/phút).",
         "Qua kiểm tra nhịp tim ở mọi chặng."),
        (5, "Giảm tải trước giải", 78, 7, "Low", 30, 40, "Đường mòn",
         "Tích trữ năng lượng trước ngày đua.", "Giảm quãng đường, giữ độ linh hoạt.", VET_EXIT),
    ]),
    "OTHER": ("Chương trình cơ bản – Thể lực tổng quát", 56, "Moderate",
              "Thể lực tổng quát; theo dõi để chọn chuyên môn phù hợp.", [
        (1, "Nền tảng", 1, 14, "Low", 25, 30, "Cát, đường đất", "Làm quen, xây nền thể lực.",
         "Đi bộ, nước kiệu, tập với tiếng ồn.", "Ngựa bình tĩnh; điểm phong độ trung bình ≥ 60."),
        (2, "Phát triển thể lực", 15, 28, "Moderate", 45, 80, "Địa hình đa dạng", "Tăng sức bền và sức mạnh.",
         "Tăng dần quãng đường; tập dưới nước 1 buổi/tuần.", "Điểm phong độ trung bình ≥ 70."),
        (3, "Duy trì & đánh giá lại", 43, 14, "Moderate", 40, 40, "Đường đua", "Giữ phong độ.",
         "Duy trì tải; thử một số bài của các chuyên môn.", "Huấn luyện viên trưởng đánh giá lại để chọn chuyên môn."),
    ]),
}


# ---------------------------------------------------------------------------
# Giáo án mẫu
# ---------------------------------------------------------------------------
def _default_for(spec):
    return DEFAULT_TEMPLATES.get(spec.code) or (f"Chương trình cơ bản – {spec.name}",) + DEFAULT_TEMPLATES["OTHER"][1:]


def _create_default(club, spec):
    name, days, intensity, goal, stages = _default_for(spec)
    template = TrainingPlanTemplate.objects.create(
        club=club, specialization=spec, template_name=name, goal=goal, duration_days=days, overall_intensity=intensity,
        daily_structure=DAILY_STRUCTURE, weekly_pattern=WEEKLY_PATTERN, note=COMMON_NOTE, is_active=True)
    for order, title, start, length, level, load, km, surface, stage_goal, content, exit_rule in stages:
        TrainingPlanTemplateStage.objects.create(
            template=template, stage_order=order, stage_name=title, goal=stage_goal, start_day=start,
            duration_days=length, intensity=level, training_load=Decimal(load), distance_target_km=Decimal(km),
            surface=surface, note=content, exit_criteria=exit_rule)
    return template


def ensure_templates(club):
    """Mỗi chuyên môn đang dùng có 1 giáo án mẫu trong câu lạc bộ (thiếu thì tạo bản mặc định). {SpecializationID: mẫu}"""
    have = {t.specialization_id: t for t in TrainingPlanTemplate.objects.filter(club=club)}
    for spec in Specialization.objects.filter(status="Active"):
        if spec.id not in have:
            have[spec.id] = _create_default(club, spec)
    return have


def template_for(club, specialization):
    template = ensure_templates(club).get(specialization.id)
    return template if template is not None and template.is_active else None


def validate_template(values, stages):
    duration = values["duration_days"]
    if duration <= 0:
        raise ValidationError({"DurationDays": ["Phải lớn hơn 0."]})
    if not stages:
        raise ValidationError({"Stages": ["Giáo án mẫu cần ít nhất 1 giai đoạn."]})
    orders = [s["stage_order"] for s in stages]
    if len(set(orders)) != len(orders):
        raise ValidationError({"Stages": ["Thứ tự giai đoạn bị trùng."]})
    for s in stages:
        if s["start_day"] < 1 or s["duration_days"] < 1 or s["start_day"] + s["duration_days"] - 1 > duration:
            raise ValidationError({"Stages": [
                f"Giai đoạn {s['stage_order']}: phải nằm trong {duration} ngày của giáo án (ngày bắt đầu ≥ 1)."]})


@transaction.atomic
def update_template(template, user, values, stages):
    """Huấn luyện viên trưởng sửa giáo án mẫu: thông tin chung + thay toàn bộ giai đoạn. Giáo án đã tạo trước đó không đổi."""
    merged = {"duration_days": values.get("duration_days", template.duration_days)}
    if stages is None:
        stages = list(template.stages.values("stage_order", "start_day", "duration_days"))
        validate_template(merged, stages)
        stages = None
    else:
        validate_template(merged, stages)
    for attr, value in values.items():
        setattr(template, attr, value)
    template.updated_by, template.updated_at = user, timezone.now()
    template.save()
    if stages is not None:
        template.stages.all().delete()
        for s in sorted(stages, key=lambda x: x["stage_order"]):
            TrainingPlanTemplateStage.objects.create(template=template, **s)
    log_action(user, "UPDATE_PLAN_TEMPLATE", template, {"SpecializationID": template.specialization_id})
    return template


# ---------------------------------------------------------------------------
# Giáo án nháp từ mẫu
# ---------------------------------------------------------------------------
def _stage_note(stage):
    text = stage.note or ""
    if stage.exit_criteria:
        text += ("\n" if text else "") + f"Điều kiện sang giai đoạn sau: {stage.exit_criteria}"
    return text[:1500] or None


def draft_from_template(assignment, user, template):
    """Tạo giáo án Draft cho phân công từ giáo án mẫu (ngày thật tính từ ngày bắt đầu phân công)."""
    start = max(assignment.start_date, date.today())
    end = start + timedelta(days=template.duration_days - 1)
    plan = TrainingPlan.objects.create(
        assignment=assignment, goal=template.goal, start_date=start, end_date=end,
        overall_intensity=template.overall_intensity, status=TrainingPlan.Status.DRAFT, created_at=timezone.now(),
        template=template,
        note=(f"Tạo từ giáo án mẫu \"{template.template_name}\". Huấn luyện viên xem phiếu đánh giá ngựa, "
              "sửa cho phù hợp (hoặc giữ nguyên) rồi gửi Huấn luyện viên trưởng duyệt.")[:2000])
    for stage in template.stages.all():
        first = start + timedelta(days=stage.start_day - 1)
        last = min(first + timedelta(days=stage.duration_days - 1), end)
        TrainingPlanStage.objects.create(
            plan=plan, stage_name=stage.stage_name, stage_order=stage.stage_order, goal=stage.goal,
            start_date=first, end_date=last, intensity=stage.intensity, training_load=stage.training_load,
            distance_target_km=stage.distance_target_km, surface=stage.surface, note=_stage_note(stage))
    log_action(user, "CREATE_PLAN_FROM_TEMPLATE", plan, {"TemplateID": template.id, "HorseID": assignment.horse_id})
    return plan


def discard_untouched_template_drafts(assignment, user):
    """Huấn luyện viên tự soạn giáo án mới -> bản nháp từ mẫu chưa từng gửi duyệt của phân công đó bị hủy (không để 2 bản nháp)."""
    drafts = assignment.plans.filter(status=TrainingPlan.Status.DRAFT, template__isnull=False,
                                     submitted_at__isnull=True)
    ids = list(drafts.values_list("id", flat=True))
    if ids:
        drafts.update(status=TrainingPlan.Status.CANCELLED, review_note="Huấn luyện viên tự soạn giáo án khác thay bản mẫu")
        for plan_id in ids:
            log_action(user, "DISCARD_TEMPLATE_DRAFT", assignment.horse, {"TrainingPlanID": plan_id})
    return ids


def reschedule_plan(plan, user, new_start):
    """Đổi ngày bắt đầu giáo án nháp: mọi giai đoạn dời theo cùng số ngày."""
    from .services import ensure_plan_editable

    ensure_plan_editable(plan, user)
    delta = new_start - plan.start_date
    if delta.days == 0:
        return plan
    if new_start < date.today():
        raise ValidationError({"StartDate": ["Không chọn ngày bắt đầu đã qua."]})
    plan.start_date = new_start
    plan.end_date = plan.end_date + delta if plan.end_date else None
    plan.save(update_fields=["start_date", "end_date"])
    for stage in plan.stages.all():
        stage.start_date += delta
        stage.end_date = stage.end_date + delta if stage.end_date else None
        stage.save(update_fields=["start_date", "end_date"])
    log_action(user, "RESCHEDULE_TRAINING_PLAN", plan, {"ShiftDays": delta.days})
    return plan


# ---------------------------------------------------------------------------
# So sánh giáo án với mẫu (Head Trainer kiểm tra trainer đã sửa gì)
# ---------------------------------------------------------------------------
def _num(value):
    return float(value) if value is not None else None


def _stage_shape(plan, stage):
    return {
        "StageName": stage.stage_name,
        "StartDay": (stage.start_date - plan.start_date).days + 1,
        "DurationDays": (stage.end_date - stage.start_date).days + 1 if stage.end_date else None,
        "Intensity": stage.intensity,
        "TrainingLoad": _num(stage.training_load),
        "DistanceTargetKm": _num(stage.distance_target_km),
        "Surface": stage.surface,
        "Goal": stage.goal,
    }


def _template_shape(stage):
    return {
        "StageName": stage.stage_name, "StartDay": stage.start_day, "DurationDays": stage.duration_days,
        "Intensity": stage.intensity, "TrainingLoad": _num(stage.training_load),
        "DistanceTargetKm": _num(stage.distance_target_km), "Surface": stage.surface, "Goal": stage.goal,
    }


def compare_with_template(plan):
    template = plan.template
    if template is None:
        return None
    changes = []
    duration = (plan.end_date - plan.start_date).days + 1 if plan.end_date else None
    for field, mine, theirs in (("Goal", plan.goal, template.goal), ("DurationDays", duration, template.duration_days),
                                ("OverallIntensity", plan.overall_intensity, template.overall_intensity)):
        if mine != theirs:
            changes.append({"StageOrder": None, "Field": field, "Template": theirs, "Plan": mine})
    mine = {s.stage_order: s for s in plan.stages.all()}
    theirs = {s.stage_order: s for s in template.stages.all()}
    for order in sorted(set(mine) | set(theirs)):
        if order not in theirs:
            changes.append({"StageOrder": order, "Field": "Stage", "Template": None,
                            "Plan": mine[order].stage_name, "Change": "Added"})
            continue
        if order not in mine:
            changes.append({"StageOrder": order, "Field": "Stage", "Template": theirs[order].stage_name,
                            "Plan": None, "Change": "Removed"})
            continue
        a, b = _stage_shape(plan, mine[order]), _template_shape(theirs[order])
        for field in b:
            if a[field] != b[field]:
                changes.append({"StageOrder": order, "Field": field, "Template": b[field], "Plan": a[field],
                                "Change": "Changed"})
    return changes


def template_review(plan):
    """Thông tin để huấn luyện viên sửa / Huấn luyện viên trưởng duyệt: giáo án mẫu, phiếu đánh giá ngựa, các thay đổi so với mẫu."""
    from .models import HorseAssessment

    template = plan.template
    assessment = (HorseAssessment.objects.filter(horse=plan.assignment.horse, decision_status="Recommended")
                  .order_by("-assessment_date", "-id").first())
    changes = compare_with_template(plan)
    return {
        "TrainingPlanID": plan.id,
        "Status": plan.status,
        "TemplateID": template.id if template else None,
        "TemplateName": template.template_name if template else None,
        "DailyStructure": template.daily_structure if template else None,
        "WeeklyPattern": template.weekly_pattern if template else None,
        "TemplateNote": template.note if template else None,
        "Assessment": {
            "AssessmentID": assessment.id, "QualityScore": _num(assessment.quality_score),
            "FitnessLevel": assessment.fitness_level, "AssessmentNote": assessment.assessment_note,
            "SpecializationID": assessment.specialization_id,
        } if assessment else None,
        "ChangedFromTemplate": bool(changes) if changes is not None else None,
        "ChangeCount": len(changes) if changes is not None else None,
        "Changes": changes,
    }


def ensure_template_editor(user):
    if not user.has_perm("TRAINING_PLAN_APPROVE"):
        raise PermissionDenied("Chỉ Huấn luyện viên trưởng mới chỉnh sửa được giáo án mẫu.")
