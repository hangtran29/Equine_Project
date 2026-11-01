"""Flow 4: khẩu phần theo giáo án (diet-context), việc chăm sóc tự sinh theo chỉ tiêu, Groom phụ trách ngựa."""
from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from apps.care.models import CareTask

from apps.training.tests.base import TODAY, TrainingTestCase

from apps.horses.models import Horse

from .test_care import MEALS, activate_diet


def another_horse(case, number):
    """Ngựa Approved thứ hai, thứ ba... (microchip, hộ chiếu, mã ngựa không trùng)."""
    horse_id = case.owner_creates_horse(MicrochipNumber=f"98514100099990{number}", PassportNumber=f"VN-T-{number}")
    case.submit_and_verify(horse_id)
    case.vet_signs_initial_exam(horse_id)
    res = case.client_for(case.manager).post(f"/api/horses/{horse_id}/approve", {"HorseCode": f"EQ-90{number}"},
                                             format="json")
    case.assertEqual(res.status_code, 200, res.data)
    return horse_id


class DietByTrainingPlanTests(TrainingTestCase):
    def test_diet_context_and_link_to_active_plan(self):
        horse_id, plan, stage_id = self.ready_horse()
        head = self.client_for(self.head)
        ctx = head.get(f"/api/horses/{horse_id}/diet-context").data
        self.assertEqual(ctx["ActiveTrainingPlan"]["TrainingPlanID"], plan["TrainingPlanID"])
        self.assertEqual(ctx["CurrentStage"]["StageName"], "Nền tảng")
        self.assertEqual(ctx["Last14Days"]["CompletedSessions"], 0)
        self.assertIn("chưa có khẩu phần", " ".join(ctx["Notes"]))
        self.assertIn("DIET_REVIEW_NEEDED", {n["Type"] for n in head.get("/api/notifications").data})

        other_horse = another_horse(self, 2)
        bad = head.post(f"/api/horses/{other_horse}/diet-plans", {
            "StartDate": TODAY.isoformat(), "Meals": MEALS, "TrainingPlanID": plan["TrainingPlanID"]}, format="json")
        self.assertIn("TrainingPlanID", bad.data)
        diet = head.post(f"/api/horses/{horse_id}/diet-plans", {"StartDate": TODAY.isoformat(), "Meals": MEALS},
                         format="json").data
        self.assertEqual(diet["TrainingPlanID"], plan["TrainingPlanID"])         # tự gắn giáo án đang chạy
        activate_diet(self, diet["DietPlanID"])
        ctx = head.get(f"/api/horses/{horse_id}/diet-context").data
        self.assertEqual(ctx["CurrentDiet"]["TrainingPlanID"], plan["TrainingPlanID"])
        self.assertNotIn("DIET_REVIEW_NEEDED", {n["Type"] for n in head.get("/api/notifications").data})


class CareAutomationTests(TrainingTestCase):
    def mine(self, groom=None, day=None):
        return self.client_for(groom or self.groom).get(
            f"/api/care-tasks?mine=1&Date={(day or TODAY).isoformat()}").data

    def test_tasks_generated_by_rules(self):
        horse_id, plan, stage_id = self.ready_horse()
        head = self.client_for(self.head)
        diet = head.post(f"/api/horses/{horse_id}/diet-plans", {"StartDate": TODAY.isoformat(), "Meals": MEALS},
                         format="json").data
        activate_diet(self, diet["DietPlanID"])

        # Buổi tập hôm nay xong -> việc tắm, kiểm tra chân
        sid = self.session(stage_id)["TrainingSessionID"]
        rider = self.client_for(self.rider)
        rider.post(f"/api/training-sessions/{sid}/start")
        rider.post(f"/api/training-sessions/{sid}/result", {"PerformanceScore": 75}, format="json")

        tasks = self.mine()
        rules = sorted(t["RuleCode"] for t in tasks)
        self.assertEqual(rules, ["BATH_AFTER_TRAINING", "DAILY_CLEANING", "FEEDING_BY_DIET", "FEEDING_BY_DIET"])
        self.assertTrue(all(t["GroomID"] == self.groom.id and t["IsAuto"] for t in tasks))
        feeding = sorted(t["Note"] for t in tasks if t["RuleCode"] == "FEEDING_BY_DIET")
        self.assertIn("Yến mạch 3 kg", feeding[0] + feeding[1])
        self.assertEqual(len(self.mine()), 4)                                  # xem lại không sinh trùng

        # Vet khóa tập -> thêm việc ngâm chân mỗi ngày
        self.client_for(self.vet).post(f"/api/horses/{horse_id}/training-locks",
                                       {"Reason": "Viêm gân", "LockLevel": "Full"}, format="json")
        self.assertIn("ICE_SOAK_WHEN_LOCKED", {t["RuleCode"] for t in self.mine()})

        # Head Trainer sinh trước việc ngày mai, rồi tắt chỉ tiêu dọn chuồng -> việc ngày mai bị gỡ
        tomorrow = TODAY + timedelta(days=1)
        res = head.post("/api/care-tasks/generate", {"Date": tomorrow.isoformat()}, format="json")
        self.assertGreater(res.data[0]["Created"], 0)
        self.assertIn("DAILY_CLEANING", {t["RuleCode"] for t in self.mine(day=tomorrow)})
        self.assertEqual(self.client_for(self.groom).patch("/api/care-rules/DAILY_CLEANING", {"IsActive": False},
                                                           format="json").status_code, 403)
        res = head.patch("/api/care-rules/DAILY_CLEANING", {"IsActive": False}, format="json")
        self.assertFalse(res.data["IsActive"])
        self.assertNotIn("DAILY_CLEANING", {t["RuleCode"] for t in self.mine(day=tomorrow)})
        self.assertEqual(len(head.get("/api/care-rules").data), 4)
        self.assertEqual(head.post("/api/care-tasks/generate", {"Date": (TODAY - timedelta(days=1)).isoformat()},
                                   format="json").data[0]["Created"], 0)        # không sinh việc ngày đã qua

    def test_vet_adjust_does_not_duplicate_done_meal(self):
        horse_id, plan, stage_id = self.ready_horse()
        Horse.objects.filter(pk=horse_id).update(current_health_status="Recovering")   # Vet duyệt / chỉnh khẩu phần
        head, vet = self.client_for(self.head), self.client_for(self.vet)
        diet = head.post(f"/api/horses/{horse_id}/diet-plans", {"StartDate": TODAY.isoformat(), "Meals": MEALS},
                         format="json").data
        vet.post(f"/api/diet-plans/{diet['DietPlanID']}/approve", {}, format="json")
        feeding = [t for t in self.mine() if t["RuleCode"] == "FEEDING_BY_DIET"]
        done = self.client_for(self.groom).post(f"/api/care-tasks/{feeding[0]['CareTaskID']}/complete", {}, format="json")
        self.assertEqual(done.status_code, 200, done.data)
        meals = [{**m, "Quantity": 2} for m in MEALS]
        res = vet.post(f"/api/diet-plans/{diet['DietPlanID']}/adjust", {"VetNote": "Giảm lượng", "Meals": meals}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        after = [t for t in self.mine() if t["RuleCode"] == "FEEDING_BY_DIET"]
        times = [t["ScheduledAt"] for t in after]
        self.assertEqual(len(times), len(set(times)))                         # mỗi giờ ăn chỉ 1 việc
        self.assertIn("Completed", {t["Status"] for t in after})

    def test_groom_in_charge_and_load_balancing(self):
        groom2 = self.make_user("groom2@one.test", "GROOM", self.club)
        first, second = self.approved_horse(), another_horse(self, 3)
        head = self.client_for(self.head)
        tomorrow = TODAY + timedelta(days=1)
        head.post("/api/care-tasks/generate", {"Date": tomorrow.isoformat()}, format="json")
        owners = {t["HorseID"]: t["GroomID"] for t in head.get(f"/api/care-tasks?Date={tomorrow.isoformat()}").data}
        self.assertEqual(set(owners.values()), {self.groom.id, groom2.id})    # chia đều 2 Groom

        manager = self.client_for(self.manager)                                 # Manager xếp Groom
        res = manager.put(f"/api/horses/{first}/groom", {"GroomID": groom2.id}, format="json")
        self.assertEqual(res.data["GroomName"], groom2.full_name)
        tasks = head.get(f"/api/care-tasks?Date={tomorrow.isoformat()}&HorseID={first}").data
        self.assertTrue(all(t["GroomID"] == groom2.id for t in tasks))          # việc chưa làm chuyển theo
        self.assertEqual(manager.put(f"/api/horses/{second}/groom", {"GroomID": self.rider.id}, format="json")
                         .status_code, 400)
        self.assertEqual(self.client_for(self.groom).put(f"/api/horses/{second}/groom", {"GroomID": self.groom.id},
                                                         format="json").status_code, 403)
        self.assertEqual(head.put(f"/api/horses/{second}/groom", {"GroomID": self.groom.id},
                                  format="json").status_code, 403)
        self.assertEqual(self.client_for(groom2).get(f"/api/horses/{first}/groom").data["GroomID"], groom2.id)
        self.assertEqual(manager.delete(f"/api/horses/{first}/groom").status_code, 204)

    def test_command_generates_for_all_clubs(self):
        self.approved_horse()
        out = StringIO()
        call_command("generate_care_tasks", "--days=2", stdout=out)
        self.assertIn("Club One", out.getvalue())
        self.assertEqual(CareTask.objects.filter(rule_code="DAILY_CLEANING").count(), 2)


class SeedCareAutomationTests(TestCase):
    def test_seed_demo_adds_grooms_rules_diet_and_tasks_once(self):
        import secrets

        from apps.care.models import CareTaskRule, DietPlan, HorseGroom

        def seed():
            call_command("seed_demo", f"--password={secrets.token_urlsafe(18)}", stdout=StringIO())

        seed()
        counts = (HorseGroom.objects.count(), CareTaskRule.objects.count(), DietPlan.objects.count(),
                  CareTask.objects.filter(rule_code__isnull=False).count())
        self.assertEqual(counts[:3], (3, 4, 1))
        self.assertGreaterEqual(counts[3], 3 + 4)          # dọn chuồng 3 ngựa + 4 bữa ăn của Sao Mai
        seed()
        self.assertEqual((HorseGroom.objects.count(), CareTaskRule.objects.count(), DietPlan.objects.count(),
                          CareTask.objects.filter(rule_code__isnull=False).count()), counts)
