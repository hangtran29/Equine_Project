"""Giáo án mẫu theo chuyên môn: phân công -> nháp từ mẫu -> trainer sửa -> Head Trainer duyệt / trả về -> Active."""
from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from apps.training.models import TrainingPlan, TrainingPlanTemplate

from .base import TODAY, TrainingTestCase


class PlanTemplateTests(TrainingTestCase):
    def draft_for_new_horse(self):
        horse_id = self.approved_horse()
        res = self.client_for(self.head).post("/api/trainer-assignments", {
            "HorseID": horse_id, "TrainerID": self.trainer.id, "SpecializationID": self.flat.id}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertIsNotNone(res.data["DraftTrainingPlanID"])
        return horse_id, res.data["DraftTrainingPlanID"]

    def test_templates_listed_per_specialization(self):
        head = self.client_for(self.head)
        rows = head.get("/api/training-plan-templates").data
        self.assertEqual({r["SpecializationCode"] for r in rows}, {"FLAT_RACING", "ENDURANCE"})
        flat = head.get(f"/api/training-plan-templates?SpecializationID={self.flat.id}").data
        self.assertEqual(len(flat), 1)
        self.assertEqual(flat[0]["DurationDays"], 84)
        self.assertEqual([s["StageOrder"] for s in flat[0]["Stages"]], [1, 2, 3, 4])
        self.assertTrue(flat[0]["Stages"][0]["ExitCriteria"])
        endurance = head.get(f"/api/training-plan-templates?SpecializationID={self.endurance.id}").data[0]
        self.assertEqual(len(endurance["Stages"]), 5)
        self.assertEqual(len(head.get("/api/training-plan-templates").data), 2)              # không tạo trùng
        self.assertEqual(self.client_for(self.other_head).get("/api/training-plan-templates").data[0]["ClubID"],
                         self.other_club.id)                                                 # mỗi CLB 1 bộ riêng
        self.assertEqual(self.client_for(self.owner).get("/api/training-plan-templates").status_code, 403)

    def test_assignment_creates_draft_from_template(self):
        horse_id, plan_id = self.draft_for_new_horse()
        trainer = self.client_for(self.trainer)
        plan = trainer.get(f"/api/training-plans/{plan_id}").data
        self.assertEqual(plan["Status"], "Draft")
        self.assertTrue(plan["TemplateName"].startswith("Chương trình chuẩn"))
        self.assertEqual(plan["StartDate"], TODAY.isoformat())
        self.assertEqual(plan["EndDate"], (TODAY + timedelta(days=83)).isoformat())
        stages = plan["Stages"]
        self.assertEqual(stages[1]["StartDate"], (TODAY + timedelta(days=14)).isoformat())   # ngày 15
        self.assertEqual(stages[-1]["EndDate"], plan["EndDate"])
        self.assertIn("Điều kiện sang giai đoạn sau", stages[0]["Note"])
        types = {n["Type"]: n for n in trainer.get("/api/notifications").data}
        self.assertEqual(types["PLAN_DRAFT_FROM_TEMPLATE"]["EntityID"], plan_id)

        review = trainer.get(f"/api/training-plans/{plan_id}/template-review").data
        self.assertFalse(review["ChangedFromTemplate"])
        self.assertTrue(review["WeeklyPattern"])

    def test_edit_submit_return_approve_loop(self):
        horse_id, plan_id = self.draft_for_new_horse()
        trainer, head = self.client_for(self.trainer), self.client_for(self.head)
        stage = trainer.get(f"/api/training-plans/{plan_id}").data["Stages"][0]
        res = trainer.patch(f"/api/training-plan-stages/{stage['TrainingPlanStageID']}", {"TrainingLoad": 20},
                            format="json")
        self.assertEqual(res.status_code, 200, res.data)
        changes = head.get(f"/api/training-plans/{plan_id}/template-review").data["Changes"]
        self.assertEqual([(c["StageOrder"], c["Field"], c["Template"], c["Plan"]) for c in changes],
                         [(1, "TrainingLoad", 25.0, 20.0)])

        self.assertEqual(trainer.post(f"/api/training-plans/{plan_id}/submit").status_code, 200)
        self.assertNotIn("PLAN_DRAFT_FROM_TEMPLATE", {n["Type"] for n in trainer.get("/api/notifications").data})
        res = head.post(f"/api/training-plans/{plan_id}/return", {"ReviewNote": "Giai đoạn 1 cần 21 ngày"},
                        format="json")
        self.assertEqual(res.data["Status"], "Draft")
        self.assertIn("PLAN_RETURNED", {n["Type"] for n in trainer.get("/api/notifications").data})
        trainer.patch(f"/api/training-plan-stages/{stage['TrainingPlanStageID']}",
                      {"EndDate": (TODAY + timedelta(days=20)).isoformat()}, format="json")
        self.assertEqual(trainer.post(f"/api/training-plans/{plan_id}/submit").status_code, 200)
        res = head.post(f"/api/training-plans/{plan_id}/approve", {}, format="json")
        self.assertEqual(res.data["Status"], "Active", res.data)
        self.assertEqual(res.data["TemplateID"], TrainingPlanTemplate.objects.get(
            club=self.club, specialization=self.flat).id)
        # giáo án Active -> trainer xếp buổi tập theo giai đoạn
        res = trainer.post("/api/training-sessions", {
            "TrainingPlanStageID": stage["TrainingPlanStageID"], "WorkRiderID": self.rider.id,
            "SessionDate": TODAY.isoformat(), "StartTime": "06:00", "TrainingType": "Walk",
            "DurationPlannedMinutes": 40, "TrainingLoad": 20}, format="json")
        self.assertEqual(res.status_code, 201, res.data)

    def test_reschedule_shifts_all_stages(self):
        horse_id, plan_id = self.draft_for_new_horse()
        trainer = self.client_for(self.trainer)
        new_start = TODAY + timedelta(days=7)
        res = trainer.post(f"/api/training-plans/{plan_id}/reschedule", {"StartDate": new_start.isoformat()},
                           format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["StartDate"], new_start.isoformat())
        self.assertEqual(res.data["Stages"][1]["StartDate"], (new_start + timedelta(days=14)).isoformat())
        self.assertEqual(res.data["EndDate"], (new_start + timedelta(days=83)).isoformat())
        self.assertEqual(trainer.get(f"/api/training-plans/{plan_id}/template-review").data["Changes"], [])
        self.assertEqual(trainer.post(f"/api/training-plans/{plan_id}/reschedule",
                                      {"StartDate": (TODAY - timedelta(days=1)).isoformat()},
                                      format="json").status_code, 400)
        self.assertEqual(self.client_for(self.trainer2).post(
            f"/api/training-plans/{plan_id}/reschedule", {"StartDate": new_start.isoformat()},
            format="json").status_code, 409)                                   # không phải trainer phụ trách

    def test_manual_plan_replaces_untouched_draft_and_from_template_recreates(self):
        horse_id, plan_id = self.draft_for_new_horse()
        self.active_plan(horse_id)                       # trainer tự soạn -> bản nháp từ mẫu bị hủy
        self.assertEqual(TrainingPlan.objects.get(pk=plan_id).status, "Cancelled")

        trainer = self.client_for(self.trainer)
        # ngựa đã có giáo án Active (không còn nháp) -> trainer được tạo lại nháp từ mẫu để điều chỉnh
        res = trainer.post("/api/training-plans/from-template", {"HorseID": horse_id}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(trainer.post("/api/training-plans/from-template", {"HorseID": horse_id},
                                      format="json").status_code, 400)          # đã có nháp
        self.assertEqual(self.client_for(self.trainer2).post("/api/training-plans/from-template",
                                                             {"HorseID": horse_id}, format="json").status_code, 404)

    def test_only_head_trainer_edits_template(self):
        head = self.client_for(self.head)
        template = head.get(f"/api/training-plan-templates?SpecializationID={self.flat.id}").data[0]
        url = f"/api/training-plan-templates/{template['TemplateID']}"
        self.assertEqual(self.client_for(self.trainer).patch(url, {"DurationDays": 70}, format="json").status_code,
                         403)
        self.assertEqual(self.client_for(self.other_head).get(url).status_code, 404)
        res = head.patch(url, {"DurationDays": 60}, format="json")             # giai đoạn 4 vượt 60 ngày
        self.assertEqual(res.status_code, 400)
        stages = [
            {"StageOrder": 1, "StageName": "Nền", "StartDay": 1, "DurationDays": 20, "Intensity": "Low",
             "TrainingLoad": 30, "ExitCriteria": "Điểm ≥ 65"},
            {"StageOrder": 2, "StageName": "Tốc độ", "StartDay": 21, "DurationDays": 30, "Intensity": "High",
             "TrainingLoad": 70},
        ]
        res = head.put(url, {"TemplateName": "Mẫu ngắn CLB", "Goal": "Đua 1.200 m", "DurationDays": 50,
                             "OverallIntensity": "Moderate", "IsActive": True, "Stages": stages}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["UpdatedByName"], self.head.full_name)
        self.assertEqual([s["StageName"] for s in res.data["Stages"]], ["Nền", "Tốc độ"])
        _, plan_id = self.draft_for_new_horse()
        plan = self.client_for(self.trainer).get(f"/api/training-plans/{plan_id}").data
        self.assertEqual((plan["EndDate"], len(plan["Stages"])), ((TODAY + timedelta(days=49)).isoformat(), 2))

        head.patch(url, {"IsActive": False}, format="json")                   # tắt mẫu -> phân công không tạo nháp
        horse_id = self.approved_horse_other()
        res = head.post("/api/trainer-assignments", {
            "HorseID": horse_id, "TrainerID": self.trainer.id, "SpecializationID": self.flat.id}, format="json")
        self.assertIsNone(res.data["DraftTrainingPlanID"])

    def approved_horse_other(self):
        from apps.care.tests.test_care_automation import another_horse

        return another_horse(self, 5)


class SeedTemplateTests(TestCase):
    def test_seed_demo_creates_templates_once(self):
        import secrets

        def seed():
            call_command("seed_demo", f"--password={secrets.token_urlsafe(18)}", stdout=StringIO())

        seed()
        count = TrainingPlanTemplate.objects.count()
        self.assertGreaterEqual(count, 5)
        seed()
        self.assertEqual(TrainingPlanTemplate.objects.count(), count)
