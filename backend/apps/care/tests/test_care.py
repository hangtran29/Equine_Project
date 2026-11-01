"""Flow 4: khẩu phần (Head Trainer lập, Vet góp ý, Head Trainer chốt), việc chăm sóc của Groom, kho vật tư."""
from datetime import timedelta

from django.test import TestCase

from apps.care.models import CareTask, DietPlan, InventoryItem
from apps.horses.models import Horse

from apps.training.tests.base import TODAY, TrainingTestCase

MEALS = [
    {"MealTime": "06:00", "FeedType": "Yến mạch", "Quantity": 3, "Unit": "kg"},
    {"MealTime": "17:00", "FeedType": "Cỏ khô", "Quantity": 6.5, "Unit": "kg", "Note": "Ngâm nước"},
]


def activate_diet(test, plan_id):
    """Ngựa khỏe: bác sĩ góp ý rồi HLV trưởng chốt."""
    res = test.client_for(test.vet).post(f"/api/diet-plans/{plan_id}/comment", {"VetNote": "Hợp lý"}, format="json")
    test.assertEqual(res.status_code, 200, res.data)
    res = test.client_for(test.head).post(f"/api/diet-plans/{plan_id}/finalize")
    test.assertEqual(res.status_code, 200, res.data)
    return res.data


class DietTests(TrainingTestCase):
    def create_plan(self, horse_id, start=None):
        res = self.client_for(self.head).post(f"/api/horses/{horse_id}/diet-plans", {
            "DietDescription": "Khẩu phần giai đoạn tăng tốc", "StartDate": (start or TODAY).isoformat(),
            "Meals": MEALS}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_vet_comments_head_trainer_finalizes(self):
        horse_id = self.approved_horse()
        head, vet = self.client_for(self.head), self.client_for(self.vet)
        self.assertEqual(vet.post(f"/api/horses/{horse_id}/diet-plans", {
            "StartDate": TODAY.isoformat(), "Meals": MEALS}, format="json").status_code, 403)
        res = head.post(f"/api/horses/{horse_id}/diet-plans", {"StartDate": TODAY.isoformat(), "Meals": []},
                        format="json")
        self.assertIn("Meals", res.data)

        plan = self.create_plan(horse_id)
        plan_id = plan["DietPlanID"]
        self.assertEqual((plan["Status"], plan["VetCommented"], plan["NeedsVetApproval"]), ("Pending", False, False))
        self.assertEqual(len(plan["Meals"]), 2)
        self.assertEqual(plan["Meals"][1]["Quantity"], 6.5)
        self.assertIn(("DIET_TO_REVIEW", plan_id), {(n["Type"], n["EntityID"]) for n in vet.get("/api/notifications").data})
        # chưa có góp ý thì chưa chốt được; ngựa khỏe thì bác sĩ không duyệt thay
        self.assertEqual(head.post(f"/api/diet-plans/{plan_id}/finalize").data["code"], "VET_COMMENT_REQUIRED")
        self.assertEqual(vet.post(f"/api/diet-plans/{plan_id}/approve", {}, format="json").data["code"],
                         "VET_APPROVAL_NOT_NEEDED")
        self.assertEqual(head.post(f"/api/diet-plans/{plan_id}/comment", {"VetNote": "x"}, format="json")
                         .status_code, 403)
        self.assertIn("VetNote", vet.post(f"/api/diet-plans/{plan_id}/comment", {}, format="json").data)
        res = vet.post(f"/api/diet-plans/{plan_id}/comment", {"VetNote": "Nên bớt yến mạch buổi chiều"},
                       format="json")
        self.assertEqual((res.data["Status"], res.data["VetCommented"]), ("Pending", True))
        notes = {(n["Type"], n["EntityID"]): n for n in head.get("/api/notifications").data}
        self.assertEqual(notes[("DIET_COMMENTED", plan_id)]["Message"], "Nên bớt yến mạch buổi chiều")
        self.assertEqual(vet.post(f"/api/diet-plans/{plan_id}/finalize").status_code, 403)
        res = head.post(f"/api/diet-plans/{plan_id}/finalize")
        self.assertEqual(res.data["Status"], "Approved")
        self.assertEqual(res.data["ReviewedByVetID"], self.vet.id)          # bác sĩ đã góp ý
        # Groom phụ trách ngựa xem khẩu phần đang áp dụng
        self.client_for(self.manager).put(f"/api/horses/{horse_id}/groom", {"GroomID": self.groom.id}, format="json")
        self.assertEqual(self.client_for(self.groom).get(f"/api/horses/{horse_id}/current-diet").data["DietPlanID"],
                         plan_id)
        # khẩu phần mới chốt -> khẩu phần cũ Expired; ngựa khỏe thì bác sĩ không chỉnh trực tiếp
        new_id = activate_diet(self, self.create_plan(horse_id)["DietPlanID"])["DietPlanID"]
        self.assertEqual(DietPlan.objects.get(pk=plan_id).status, "Expired")
        self.assertEqual(vet.post(f"/api/diet-plans/{new_id}/adjust", {"VetNote": "x", "Meals": MEALS},
                                  format="json").data["code"], "VET_APPROVAL_NOT_NEEDED")

    def test_sick_horse_needs_vet_approval(self):
        horse_id = self.approved_horse()
        Horse.objects.filter(pk=horse_id).update(current_health_status="Recovering")
        head, vet = self.client_for(self.head), self.client_for(self.vet)
        plan_id = self.create_plan(horse_id)["DietPlanID"]
        vet.post(f"/api/diet-plans/{plan_id}/comment", {"VetNote": "Đang dùng thuốc"}, format="json")
        self.assertEqual(head.post(f"/api/diet-plans/{plan_id}/finalize").data["code"], "VET_APPROVAL_REQUIRED")
        res = vet.post(f"/api/diet-plans/{plan_id}/reject", {"VetNote": "Giảm yến mạch vì đang dùng thuốc"},
                       format="json")
        self.assertEqual(res.data["Status"], "Rejected")
        res = head.patch(f"/api/diet-plans/{plan_id}", {"Meals": [
            {"MealTime": "06:00", "FeedType": "Yến mạch", "Quantity": 2, "Unit": "kg"}]}, format="json")
        self.assertEqual((res.data["Status"], len(res.data["Meals"])), ("Pending", 1))
        res = vet.post(f"/api/diet-plans/{plan_id}/approve", {"VetNote": "OK"}, format="json")
        self.assertEqual(res.data["Status"], "Approved")
        res = vet.post(f"/api/diet-plans/{plan_id}/adjust", {"VetNote": "Thêm điện giải", "Meals": MEALS},
                       format="json")
        self.assertEqual(res.data["Status"], "Adjusted")
        self.assertEqual(head.patch(f"/api/diet-plans/{plan_id}", {"DietDescription": "x"}, format="json")
                         .data["code"], "INVALID_STATUS")


class CareTaskTests(TrainingTestCase):
    def test_vet_and_trainer_assign_extra_tasks(self):
        horse_id = self.approved_horse()
        self.assign(horse_id)
        self.client_for(self.manager).put(f"/api/horses/{horse_id}/groom", {"GroomID": self.groom.id}, format="json")
        head, groom, vet, trainer = (self.client_for(u) for u in (self.head, self.groom, self.vet, self.trainer))
        at = f"{TODAY.isoformat()}T15:00:00"
        # HLV trưởng, Manager, Groom không giao việc
        for client in (head, self.client_for(self.manager), groom):
            self.assertEqual(client.post("/api/care-tasks", {"HorseID": horse_id, "TaskType": "Medical Care",
                                                             "ScheduledAt": at}, format="json").status_code, 403)
        # Vet: việc y tế; không giao việc tập luyện
        self.assertIn("TaskType", vet.post("/api/care-tasks", {"HorseID": horse_id, "TaskType": "Training Care",
                                                               "ScheduledAt": at}, format="json").data)
        res = vet.post("/api/care-tasks", {"HorseID": horse_id, "TaskType": "Medical Care", "ScheduledAt": at,
                                           "Note": "Thay băng chân trước trái"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        task_id = res.data["CareTaskID"]
        self.assertEqual((res.data["AssignedBy"], res.data["GroomID"]), (self.vet.id, self.groom.id))
        # Trainer phụ trách: việc tập luyện; trainer khác không giao được
        res = trainer.post("/api/care-tasks", {"HorseID": horse_id, "TaskType": "Training Care",
                                               "ScheduledAt": at, "Note": "Dắt đi bộ 20 phút"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(self.client_for(self.trainer2).post("/api/care-tasks", {
            "HorseID": horse_id, "TaskType": "Training Care", "ScheduledAt": at}, format="json").status_code, 403)

        mine = groom.get(f"/api/care-tasks?mine=1&Date={TODAY.isoformat()}").data
        auto = [t for t in mine if t["IsAuto"]]
        self.assertEqual([t["RuleCode"] for t in auto], ["DAILY_CLEANING"])
        own_id = auto[0]["CareTaskID"]
        self.assertIn(task_id, {t["CareTaskID"] for t in mine})
        self.assertIn(("CARE_TASK", task_id), {(n["Type"], n["EntityID"]) for n in groom.get("/api/notifications").data})

        # chỉ người giao sửa việc; Groom chỉ làm / bỏ qua
        self.assertEqual(groom.patch(f"/api/care-tasks/{task_id}", {"Note": "x"}, format="json").data["code"],
                         "NOT_TASK_OWNER")
        self.assertEqual(vet.patch(f"/api/care-tasks/{task_id}", {"Note": "Thay băng + sát trùng"},
                                   format="json").data["Note"], "Thay băng + sát trùng")
        self.assertEqual(vet.post(f"/api/care-tasks/{task_id}/complete").data["code"], "NOT_TASK_GROOM")
        self.assertIn("IntakeStatus", groom.post(f"/api/care-tasks/{task_id}/complete", {"IntakeStatus": "Full"},
                                                 format="json").data)       # mức ăn chỉ cho việc cho ăn
        res = groom.post(f"/api/care-tasks/{task_id}/complete", {"Note": "Xong"}, format="json")
        self.assertEqual(res.data["Status"], "Completed")
        self.assertEqual(groom.post(f"/api/care-tasks/{own_id}/skip", {}, format="json").status_code, 400)
        self.assertEqual(groom.post(f"/api/care-tasks/{own_id}/skip", {"Reason": "Ngựa đi khám"}, format="json")
                         .data["Status"], "Skipped")

    def test_archive_skips_pending_tasks(self):
        horse_id = self.approved_horse()
        res = self.client_for(self.vet).post("/api/care-tasks", {
            "HorseID": horse_id, "TaskType": "Medical Care",
            "ScheduledAt": f"{(TODAY + timedelta(days=1)).isoformat()}T06:00:00"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.client_for(self.manager).post(f"/api/horses/{horse_id}/archive", {"Reason": "Rời CLB"}, format="json")
        self.assertEqual(CareTask.objects.get(pk=res.data["CareTaskID"]).status, "Skipped")

    def test_view_scope(self):
        horse_id = self.approved_horse()
        self.assign(horse_id)
        other_id = self.approved_horse_named("Gió Bấc", "985000000000077")
        self.client_for(self.manager).put(f"/api/horses/{horse_id}/groom", {"GroomID": self.groom.id}, format="json")
        groom2 = self.make_user("groom2@one.test", "GROOM", self.club)
        self.client_for(self.manager).put(f"/api/horses/{other_id}/groom", {"GroomID": groom2.id}, format="json")
        self.client_for(self.vet).get("/api/care-tasks")                     # sinh việc hôm nay
        # Work Rider, Manager không xem việc chăm sóc / khẩu phần
        for user in (self.rider, self.manager):
            client = self.client_for(user)
            self.assertEqual(client.get("/api/care-tasks").status_code, 403)
            self.assertEqual(client.get("/api/diet-plans").status_code, 403)
            self.assertEqual(client.get(f"/api/horses/{horse_id}/diet-plans").status_code, 403)
        self.assertEqual(self.client_for(self.rider).get("/api/care-rules").status_code, 403)
        horses = lambda user: {t["HorseID"] for t in self.client_for(user).get("/api/care-tasks").data}  # noqa: E731
        self.assertEqual(horses(self.groom), {horse_id})                     # Groom: việc của mình
        self.assertEqual(horses(self.trainer), {horse_id})                   # Trainer: ngựa mình phụ trách
        self.assertEqual(horses(self.trainer2), set())
        self.assertEqual(horses(self.vet), {horse_id, other_id})             # Vet, HLV trưởng: toàn CLB
        self.assertEqual(horses(self.head), {horse_id, other_id})
        self.assertEqual(self.client_for(self.groom).get(f"/api/horses/{other_id}/current-diet").status_code, 403)
        # Manager xem bảng xếp Groom
        board = self.client_for(self.manager).get("/api/horse-grooms").data
        self.assertEqual({r["HorseID"]: r["GroomID"] for r in board}, {horse_id: self.groom.id, other_id: groom2.id})


class GroomAssignmentTests(TrainingTestCase):
    def test_manager_assigns_groom_and_tasks_follow(self):
        horse_id = self.approved_horse()
        manager = self.client_for(self.manager)
        self.assertIn(("HORSE_WITHOUT_GROOM", horse_id),
                      {(n["Type"], n["EntityID"]) for n in manager.get("/api/notifications").data})
        for client in (self.client_for(self.head), self.client_for(self.vet)):
            self.assertEqual(client.put(f"/api/horses/{horse_id}/groom", {"GroomID": self.groom.id},
                                        format="json").status_code, 403)
        res = manager.put(f"/api/horses/{horse_id}/groom", {"GroomID": self.groom.id}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((res.data["GroomHorseCount"], res.data["Warning"]), (1, None))
        task = self.client_for(self.vet).post("/api/care-tasks", {
            "HorseID": horse_id, "TaskType": "Medical Care",
            "ScheduledAt": f"{(TODAY + timedelta(days=1)).isoformat()}T09:00:00"}, format="json").data
        groom2 = self.make_user("groom2@one.test", "GROOM", self.club)
        res = manager.put(f"/api/horses/{horse_id}/groom", {"GroomID": groom2.id}, format="json")
        self.assertGreaterEqual(res.data["MovedTaskCount"], 1)
        self.assertEqual(CareTask.objects.get(pk=task["CareTaskID"]).groom_id, groom2.id)  # việc giao tay cũng chuyển
        self.assertEqual({g["UserID"]: g["HorseCount"] for g in manager.get("/api/grooms").data},
                         {self.groom.id: 0, groom2.id: 1})
        self.assertNotIn(("HORSE_WITHOUT_GROOM", horse_id),
                         {(n["Type"], n["EntityID"]) for n in manager.get("/api/notifications").data})


class FeedingIntakeTests(TrainingTestCase):
    def test_refused_twice_alerts_trainer_and_vet(self):
        horse_id = self.approved_horse()
        self.assign(horse_id)
        self.client_for(self.manager).put(f"/api/horses/{horse_id}/groom", {"GroomID": self.groom.id}, format="json")
        res = self.client_for(self.head).post(f"/api/horses/{horse_id}/diet-plans", {
            "StartDate": TODAY.isoformat(), "Meals": MEALS}, format="json")
        activate_diet(self, res.data["DietPlanID"])
        groom = self.client_for(self.groom)
        feeding = [t for t in groom.get(f"/api/care-tasks?mine=1&Date={TODAY.isoformat()}").data
                   if t["TaskType"] == "Feeding"]
        self.assertEqual(len(feeding), 2)
        self.assertIn("IntakeStatus", groom.post(f"/api/care-tasks/{feeding[0]['CareTaskID']}/complete",
                                                 {"IntakeStatus": "Some"}, format="json").data)
        res = groom.post(f"/api/care-tasks/{feeding[0]['CareTaskID']}/complete", {"IntakeStatus": "Refused"},
                         format="json")
        self.assertEqual(res.data["IntakeStatus"], "Refused")
        alerts = lambda user: {n["Type"] for n in self.client_for(user).get("/api/notifications").data}  # noqa: E731
        self.assertNotIn("FEED_REFUSED", alerts(self.vet))                  # mới bỏ 1 bữa
        groom.post(f"/api/care-tasks/{feeding[1]['CareTaskID']}/complete", {"IntakeStatus": "Refused"}, format="json")
        for user in (self.vet, self.trainer):
            self.assertIn("FEED_REFUSED", alerts(user))
        self.assertNotIn("FEED_REFUSED", alerts(self.trainer2))


class InventoryTests(TrainingTestCase):
    def test_inventory_flow(self):
        manager, groom = self.client_for(self.manager), self.client_for(self.groom)
        res = manager.post("/api/inventory-items", {"ItemName": "Cám viên", "ItemType": "Food", "Unit": "kg",
                                                    "Quantity": 100, "MinimumQuantity": 30}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["Status"], "Available")
        feed = res.data["InventoryItemID"]
        bandage = manager.post("/api/inventory-items", {"ItemName": "Băng chân", "ItemType": "Care Equipment",
                                                        "Unit": "cuộn", "Quantity": 5}, format="json").data
        self.assertEqual(groom.post("/api/inventory-items", {}, format="json").status_code, 403)
        self.assertEqual(len(groom.get("/api/inventory-items").data), 2)

        res = groom.post("/api/inventory-requests", {"Reason": "Hết cám buổi chiều", "Items": [
            {"InventoryItemID": feed, "RequestedQuantity": 80},
            {"InventoryItemID": bandage["InventoryItemID"], "RequestedQuantity": 10}]}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        req_id = res.data["InventoryRequestID"]
        self.assertIn(("INVENTORY_REQUEST", req_id),
                      {(n["Type"], n["EntityID"]) for n in manager.get("/api/notifications").data})

        res = manager.post(f"/api/inventory-requests/{req_id}/approve", {}, format="json")
        self.assertEqual(res.data["code"], "INSUFFICIENT_STOCK")        # băng chân chỉ còn 5
        res = manager.post(f"/api/inventory-requests/{req_id}/approve", {"Items": [
            {"InventoryItemID": bandage["InventoryItemID"], "ApprovedQuantity": 5}]}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["Status"], "Approved")
        self.assertEqual({i["InventoryItemID"]: i["ApprovedQuantity"] for i in res.data["Items"]},
                         {feed: 80, bandage["InventoryItemID"]: 5})
        self.assertEqual(InventoryItem.objects.get(pk=feed).status, "Low Stock")              # còn 20 <= 30
        self.assertEqual(InventoryItem.objects.get(pk=bandage["InventoryItemID"]).status, "Out of Stock")
        self.assertIn("LOW_STOCK", {n["Type"] for n in manager.get("/api/notifications").data})

        res = manager.post(f"/api/inventory-items/{feed}/stock", {"Change": 200, "Note": "Nhập kho"}, format="json")
        self.assertEqual(res.data["Quantity"], 220)
        self.assertEqual(res.data["Status"], "Available")
        self.assertEqual(manager.post(f"/api/inventory-items/{feed}/stock", {"Change": -500}, format="json")
                         .data["code"], "INSUFFICIENT_STOCK")

        # Từ chối, hủy
        res = groom.post("/api/inventory-requests", {"Items": [{"InventoryItemID": feed, "RequestedQuantity": 5}]},
                         format="json")
        second = res.data["InventoryRequestID"]
        res = manager.post(f"/api/inventory-requests/{second}/reject", {"Note": "Đã cấp hôm qua"}, format="json")
        self.assertEqual(res.data["RejectNote"], "Đã cấp hôm qua")
        third = groom.post("/api/inventory-requests", {"Items": [{"InventoryItemID": feed, "RequestedQuantity": 5}]},
                           format="json").data["InventoryRequestID"]
        self.assertEqual(self.client_for(self.head).post(f"/api/inventory-requests/{third}/cancel").status_code, 404)
        self.assertEqual(groom.post(f"/api/inventory-requests/{third}/cancel").data["Status"], "Cancelled")
        self.assertEqual(len(self.client_for(self.head).get("/api/inventory-requests").data), 0)   # chỉ thấy của mình

        res = manager.patch(f"/api/inventory-items/{feed}", {"Status": "Inactive"}, format="json")
        self.assertEqual(res.data["Status"], "Inactive")
        res = groom.post("/api/inventory-requests", {"Items": [{"InventoryItemID": feed, "RequestedQuantity": 1}]},
                         format="json")
        self.assertEqual(res.status_code, 400)
        res = manager.patch(f"/api/inventory-items/{feed}", {"Reactivate": True}, format="json")
        self.assertEqual(res.data["Status"], "Available")
        self.assertEqual(self.client_for(self.other_manager).get("/api/inventory-items").data, [])


class CareRegressionTests(TrainingTestCase):
    def test_future_diet_keeps_current_until_start(self):
        horse_id = self.approved_horse()
        head = self.client_for(self.head)
        meals = [{"MealTime": "06:00", "FeedType": "Yến mạch", "Quantity": 3, "Unit": "kg"}]
        current = head.post(f"/api/horses/{horse_id}/diet-plans", {"StartDate": TODAY.isoformat(), "Meals": meals},
                            format="json").data["DietPlanID"]
        activate_diet(self, current)
        future_start = TODAY + timedelta(days=30)
        future = head.post(f"/api/horses/{horse_id}/diet-plans", {"StartDate": future_start.isoformat(),
                                                                  "Meals": meals}, format="json").data["DietPlanID"]
        activate_diet(self, future)
        self.assertEqual(head.get(f"/api/horses/{horse_id}/current-diet").data["DietPlanID"], current)
        plan = DietPlan.objects.get(pk=current)
        self.assertEqual((plan.status, plan.end_date), ("Approved", future_start - timedelta(days=1)))

    def test_bad_query_params_return_400(self):
        self.assertEqual(self.client_for(self.head).get("/api/care-tasks?From=2026-13-01").status_code, 400)


class SeedCareTests(TestCase):
    def test_seed_demo_adds_inventory_once(self):
        import secrets
        from io import StringIO

        from django.core.management import call_command

        call_command("seed_demo", f"--password={secrets.token_urlsafe(18)}", stdout=StringIO())
        self.assertEqual(InventoryItem.objects.count(), 5)
        self.assertEqual(InventoryItem.objects.get(item_name="Muối khoáng").status, "Low Stock")
        call_command("seed_demo", f"--password={secrets.token_urlsafe(18)}", stdout=StringIO())
        self.assertEqual(InventoryItem.objects.count(), 5)
