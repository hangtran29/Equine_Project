"""Danh mục chuyên môn giống phần SEED DATA của sql/horse_v2.sql (test kiểm tra luôn khớp) và huấn luyện viên mẫu."""
from datetime import date, timedelta
from decimal import Decimal

SPECIALIZATIONS = {
    "FLAT_RACING": "Flat Racing",
    "STEEPLECHASE_HURDLE": "Steeplechase / Hurdle Racing",
    "HARNESS_RACING": "Harness Racing",
    "ENDURANCE": "Endurance / Long-distance Racing",
    "OTHER": "Other",
}


def ensure_specializations():
    from .models import Specialization

    return {code: Specialization.objects.get_or_create(code=code, defaults={"name": name})[0]
            for code, name in SPECIALIZATIONS.items()}


# Trainer mẫu của seed_demo (đủ 3 cấp để thử gợi ý trainer). Tên giải / đơn vị cấp là dữ liệu mẫu.
#   specs: chuyên môn; start: ngày bắt đầu làm nghề; credentials: (loại, tên, đơn vị cấp, ngày cấp);
#   recent / earlier: (số lần ra đường đua, số lần về nhất, số lần vào top 3) trong 12 tháng gần nhất / trước đó.
DEMO_TRAINERS = {
    "trainer@equi.local": {
        "specs": ["FLAT_RACING"], "start": date(2013, 6, 1), "rating": Decimal("4.6"),
        "credentials": [
            ("License", "Giấy phép huấn luyện ngựa đua hạng A", "Hội đồng Đua ngựa (dữ liệu mẫu)", date(2014, 3, 10)),
            ("Certificate", "Chứng chỉ Dinh dưỡng & Thể lực ngựa đua", "Equi Racing Academy", date(2016, 9, 5)),
            ("Award", "Huấn luyện viên xuất sắc mùa giải 2024", "Equi Racing Club", date(2024, 12, 20)),
            ("Award", "Ngựa vô địch Cúp Mùa Xuân 2025", "Equi Racing Club", date(2025, 4, 6)),
        ],
        "recent": (40, 9, 18), "earlier": (200, 49, 95),
    },
    "trainer2@equi.local": {
        "specs": ["STEEPLECHASE_HURDLE", "FLAT_RACING"], "start": date(2019, 1, 15), "rating": Decimal("4.2"),
        "credentials": [
            ("Certificate", "Chứng chỉ Huấn luyện đua vượt rào", "Equi Racing Academy", date(2019, 5, 20)),
            ("Award", "Bằng khen huấn luyện viên trẻ 2022", "Equi Racing Club", date(2022, 11, 30)),
        ],
        "recent": (25, 4, 9), "earlier": (95, 18, 40),
    },
    "trainer3@equi.local": {
        "specs": ["ENDURANCE", "FLAT_RACING"], "start": date(2025, 3, 1), "rating": Decimal("3.5"),
        "credentials": [
            ("Certificate", "Chứng chỉ Huấn luyện ngựa cơ bản", "Equi Racing Academy", date(2025, 8, 1)),
        ],
        "recent": (8, 1, 3), "earlier": (0, 0, 0),
    },
}
RACE_NAMES = ["Cúp Mùa Xuân", "Cúp Phú Thọ", "Giải Nước Rút", "Cúp Mùa Thu", "Giải Ngựa Non", "Cúp Cuối Năm"]
RACE_CLASSES = ["Group 1", "Group 2", "Group 3", "Listed", "Handicap", "Maiden", "Handicap", "Other"]
DEMO_HORSE_NAMES = ["Sao Mai", "Gió Bấc", "Hắc Long", "Phi Vân", "Bão Lửa", "Thiên Mã", "Kim Ô", "Bạch Hổ"]


def demo_results(plan, first_day, last_day):
    """(số lần chạy, số lần nhất, số lần top 3) rải đều từ first_day đến last_day: [(ngày, thứ hạng, số ngựa)]."""
    starts, wins, places = plan
    rows = []
    span = max((last_day - first_day).days, 1)
    for i in range(starts):
        position = 1 if i < wins else (2 + i % 2 if i < places else 4 + i % 6)
        rows.append((last_day - timedelta(days=span * i // max(starts, 1)), position, 10 + i % 4))
    return rows


def seed_demo(club):
    """Gọi từ `python manage.py seed_demo` khi đã có Flow 2. Chạy lại không tạo trùng, không ghi đè dữ liệu đã có."""
    from apps.accounts.models import User

    from .models import TrainerCredential, TrainerProfile, TrainerRaceResult, TrainerSpecialization

    specializations = ensure_specializations()
    manager = User.objects.filter(email__iexact="headtrainer@equi.local").first()
    today = date.today()
    for email, info in DEMO_TRAINERS.items():
        trainer = User.objects.filter(email__iexact=email, club=club).first()
        if trainer is None:
            continue
        for code in info["specs"]:
            if not TrainerSpecialization.objects.filter(trainer=trainer, specialization=specializations[code]).exists():
                TrainerSpecialization.objects.create(trainer=trainer, specialization=specializations[code])
        if not TrainerProfile.objects.filter(trainer=trainer).exists():
            TrainerProfile.objects.create(trainer=trainer, career_start_date=info["start"],
                                          trainer_rating=info["rating"], updated_by=manager)
        if not TrainerCredential.objects.filter(trainer=trainer).exists():
            for kind, title, issued_by, issued in info["credentials"]:
                TrainerCredential.objects.create(trainer=trainer, credential_type=kind, title=title,
                                                 issued_by=issued_by, issued_date=issued, created_by=manager or trainer)
        if not TrainerRaceResult.objects.filter(trainer=trainer).exists():
            rows = demo_results(info["recent"], today - timedelta(days=360), today - timedelta(days=3))
            rows += demo_results(info["earlier"], info["start"] + timedelta(days=200), today - timedelta(days=370))
            TrainerRaceResult.objects.bulk_create([
                TrainerRaceResult(trainer=trainer, horse_name=DEMO_HORSE_NAMES[i % len(DEMO_HORSE_NAMES)], race_date=day,
                                  race_name=f"{RACE_NAMES[i % len(RACE_NAMES)]} {day.year}",
                                  race_class=RACE_CLASSES[i % len(RACE_CLASSES)], finish_position=position,
                                  field_size=size, created_by=manager or trainer)
                for i, (day, position, size) in enumerate(rows)
            ])
    from .plan_templates import ensure_templates

    ensure_templates(club)          # giáo án mẫu mặc định cho mỗi chuyên môn
    seed_plan_demo(club)


# ---------------------------------------------------------------------------
# Giáo án mẫu để demo trang của Trainer / Work Rider / chủ ngựa (owner@equi.local -> ngựa Sao Mai)
# ---------------------------------------------------------------------------
DEMO_PLAN_HORSE = "Sao Mai"
# (ngày so với hôm nay, trạng thái, quãng đường km, tốc độ TB, điểm, đánh giá, nhận xét trainer / lý do)
DEMO_STAGE1_SESSIONS = [
    (-14, "Completed", Decimal("4.0"), Decimal("35.5"), Decimal("68"), "Average", "Còn hụt hơi ở 1 km cuối."),
    (-12, "Completed", Decimal("4.2"), Decimal("36.2"), Decimal("71"), "Good", "Nhịp chạy đều hơn buổi trước."),
    (-10, "Cancelled", None, None, None, None, "Trời mưa to, sân trơn"),
    (-8, "Completed", Decimal("4.5"), Decimal("37.0"), Decimal("74"), "Good", "Hồi phục nhanh, giữ tải hiện tại."),
    (-6, "Missed", None, None, None, None, "kỵ sĩ tập luyện ốm, không có người thay"),
    (-4, "Completed", Decimal("4.8"), Decimal("38.1"), Decimal("77"), "Good", "Sải chân tốt, có thể tăng quãng đường."),
    (-2, "Completed", Decimal("5.0"), Decimal("38.9"), Decimal("80"), "Excellent", "Đạt mục tiêu giai đoạn nền tảng."),
]


def seed_plan_demo(club):
    """Ngựa Sao Mai: phân công trainer@, 1 giáo án Active (giai đoạn 1 đã chốt, giai đoạn 2 đang chạy), buổi tập
    đã có kết quả + đánh giá, 1 buổi hủy, 1 buổi vắng, 2 buổi sắp tới. Đã có giáo án thì bỏ qua."""
    from datetime import datetime, time

    from apps.accounts.models import User
    from apps.core.audit import log_action
    from apps.horses.models import Horse

    from .models import (
        HorseAssessment, Specialization, TrainerHorseAssignment, TrainingPlan, TrainingPlanStage, TrainingResult,
        TrainingReview, TrainingSession,
    )

    horse = Horse.objects.filter(club=club, horse_name=DEMO_PLAN_HORSE, registration_status="Approved").first()
    people = {e: User.objects.filter(email__iexact=e, club=club).first() for e in (
        "headtrainer@equi.local", "trainer@equi.local", "rider@equi.local", "rider2@equi.local")}
    if horse is None or None in people.values() or TrainingPlan.objects.filter(assignment__horse=horse).exists():
        return
    head, trainer, rider, rider2 = people.values()
    today = date.today()

    def at(days, hour=6, minute=0):   # USE_TZ = False: ngày giờ không kèm múi giờ
        return datetime.combine(today + timedelta(days=days), time(hour, minute))

    flat = Specialization.objects.get(code="FLAT_RACING")
    assignment = TrainerHorseAssignment.objects.filter(horse=horse, status="Active").first()
    if assignment is None:
        assessment = HorseAssessment.objects.create(
            horse=horse, head_trainer=head, specialization=flat, assessment_date=at(-20, 9), quality_score=86,
            fitness_level="Good", assessment_note="Sải chân dài, hợp đua đường bằng cự ly ngắn - trung bình.")
        assignment = TrainerHorseAssignment.objects.create(
            horse=horse, trainer=trainer, specialization=flat, assigned_by=head, assessment=assessment,
            start_date=today - timedelta(days=19), status="Active")
    plan = TrainingPlan.objects.create(
        assignment=assignment, goal="Chuẩn bị Cúp Mùa Đông (đua đường bằng 1.600 m)", start_date=today - timedelta(days=14),
        end_date=today + timedelta(days=30), overall_intensity="Moderate", status="Active", created_at=at(-17, 10),
        submitted_at=at(-16, 10), approved_by=head, approved_at=at(-15, 9), review_note="Đồng ý, theo dõi nhịp tim.")
    stage1 = TrainingPlanStage.objects.create(
        plan=plan, stage_name="Nền tảng", stage_order=1, goal="Làm quen sân, xây nền thể lực",
        start_date=today - timedelta(days=14), end_date=today - timedelta(days=1), intensity="Low",
        training_load=30, distance_target_km=25, surface="Turf",
        closed_at=at(-1, 18), closed_by=trainer,
        summary_note="Ngựa thích nghi tốt, điểm phong độ tăng đều từ 68 lên 80. Sẵn sàng tăng sức bền.")
    stage2 = TrainingPlanStage.objects.create(
        plan=plan, stage_name="Tăng sức bền", stage_order=2, goal="Tăng quãng đường lên 6 km/buổi",
        start_date=today, end_date=today + timedelta(days=30), intensity="Moderate", training_load=50,
        distance_target_km=100, surface="Turf")

    def session(stage, days, status, start=(6, 0), worker=rider, seq=1):
        return TrainingSession.objects.create(
            stage=stage, work_rider=worker, assigned_by=trainer, session_date=today + timedelta(days=days),
            start_time=time(*start), end_time=time(start[0], 50) if status == "Completed" else None, sequence_no=seq,
            training_type="Canter", duration_planned_minutes=45, distance_planned_km=Decimal("5.0"),
            target_speed_kmh=Decimal("38"), training_load=stage.training_load, surface="Turf",
            location="Đường chạy số 2", instructions="Khởi động 10 phút, giữ nhịp đều.", status=status)

    def finish(s, days, distance, speed, score, evaluation, comment):
        TrainingResult.objects.create(
            session=s, actual_duration_minutes=46, actual_distance_km=distance, avg_speed_kmh=speed,
            max_speed_kmh=speed + 14, avg_heart_rate=150, max_heart_rate=200, recovery_minutes=12,
            performance_score=score, rider_observation="Ngựa hợp tác tốt, hơi nặng chân cuối buổi.",
            recorded_at=at(days, 7))
        TrainingReview.objects.create(session=s, trainer=trainer, review_date=at(days, 10), evaluation=evaluation,
                                      trainer_comment=comment)

    for days, status, distance, speed, score, evaluation, note in DEMO_STAGE1_SESSIONS:
        s = session(stage1, days, status)
        if status == "Completed":
            finish(s, days, distance, speed, score, evaluation, note)
        else:
            log_action(trainer, "CANCEL_TRAINING_SESSION" if status == "Cancelled" else "MISS_TRAINING_SESSION",
                       s, {"Reason": note})
    log_action(trainer, "CLOSE_PLAN_STAGE", stage1, {"TrainingPlanID": plan.id})
    today_session = session(stage2, 0, "Completed")
    finish(today_session, 0, Decimal("5.5"), Decimal("39.4"), Decimal("82"), "Good", "Bắt đầu tăng tải ổn định.")
    session(stage2, 2, "Assigned")
    session(stage2, 4, "Assigned", worker=rider2)
