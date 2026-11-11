"""Dữ liệu mẫu Flow 4 cho `python manage.py seed_demo`: vật tư, người chăm sóc ngựa phụ trách, khẩu phần, việc chăm sóc hôm nay."""

# (tên vật tư, loại, đơn vị, số lượng tồn, mức tối thiểu)
DEMO_ITEMS = [("Yến mạch", "Food", "kg", 500, 100), ("Cỏ khô", "Food", "kg", 1000, 200),
              ("Băng chân", "Care Equipment", "cuộn", 40, 10), ("Thuốc sát trùng", "Medicine", "chai", 12, 5),
              ("Muối khoáng", "Food", "kg", 8, 10)]


def seed_demo(club):
    """Vật tư nào đã có (cùng tên, cùng câu lạc bộ) thì giữ nguyên."""
    from .models import InventoryItem

    for name, item_type, unit, quantity, minimum in DEMO_ITEMS:
        if not InventoryItem.objects.filter(club=club, item_name=name).exists():
            item = InventoryItem(club=club, item_name=name, item_type=item_type, unit=unit, quantity=quantity,
                                 minimum_quantity=minimum)
            item.refresh_status()
            item.save()
    seed_care_demo(club)


# Groom phụ trách ngựa mẫu (ngựa Approved của seed_demo) và khẩu phần mẫu
DEMO_GROOMS = {"Sao Mai": "groom@equi.local", "Gió Bấc": "groom@equi.local", "Hắc Long": "groom2@equi.local"}
DEMO_MEALS = [("05:30", "Yến mạch", "3", "kg", None), ("11:30", "Cỏ khô", "4", "kg", None),
              ("17:30", "Cỏ khô", "5", "kg", "Trộn muối khoáng 30 g"), ("21:00", "Cám viên", "1.5", "kg", None)]


def seed_care_demo(club):
    """Groom phụ trách, chỉ tiêu mặc định, khẩu phần đã duyệt cho Sao Mai (theo giáo án đang chạy nếu có),
    rồi sinh việc chăm sóc hôm nay. Có rồi thì giữ nguyên."""
    from datetime import date, time
    from decimal import Decimal

    from django.utils import timezone

    from apps.accounts.models import User
    from apps.horses.models import Horse

    from . import automation, services
    from .models import DietMeal, DietPlan, HorseGroom

    users = {u.email: u for u in User.objects.filter(club=club)}
    for horse_name, email in DEMO_GROOMS.items():
        horse = Horse.objects.filter(club=club, horse_name=horse_name, registration_status="Approved").first()
        if horse and email in users and not HorseGroom.objects.filter(horse=horse).exists():
            HorseGroom.objects.create(horse=horse, groom=users[email], assigned_at=timezone.now())
    automation.ensure_rules(club)
    horse = Horse.objects.filter(club=club, horse_name="Sao Mai", registration_status="Approved").first()
    head, vet = users.get("headtrainer@equi.local"), users.get("vet@equi.local")
    if horse and head and vet and not horse.diet_plans.exists():
        training = services.active_training_plan(horse)
        plan = DietPlan.objects.create(
            horse=horse, created_by=head, reviewed_by=vet, status="Approved", start_date=date.today(),
            diet_description="Khẩu phần giai đoạn tăng sức bền: tăng tinh bột buổi sáng, bổ sung điện giải.",
            vet_note="Đồng ý, theo dõi cân nặng hằng tuần.", created_at=timezone.now(), approved_at=timezone.now(),
            training_plan_id=training.id if training else None)
        for at, feed, quantity, unit, note in DEMO_MEALS:
            hour, minute = map(int, at.split(":"))
            DietMeal.objects.create(diet_plan=plan, meal_time=time(hour, minute), feed_type=feed,
                                    quantity=Decimal(quantity), unit=unit, note=note)
    automation.generate_for_day(club, date.today())
