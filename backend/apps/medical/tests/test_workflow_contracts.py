"""Health/care acceptance tests on the disposable SQLite database only.

Stale-object tests exercise the reload under the lock. SQLite does not validate
SQL Server row-lock behavior; the filtered unique constraints are also tested.
"""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import override_settings
from apps.core.clubtime import now, today
from apps.core.exceptions import BusinessRuleError
from apps.core.models import AuditLog, WorkflowNotice
from apps.care.models import CareTask, DietPlan, InventoryItem, InventoryRequest, HorseGroom
from apps.care import automation, services as care
from apps.medical import services
from apps.medical.models import HealthReport, InjuryMarker, MedicalRecord, TrainingLock
from apps.training.models import TrainingSession
from apps.training.tests.base import TrainingTestCase


class WorkflowContracts(TrainingTestCase):
    def report(self, horse_id, severity="Normal", **extra):
        return self.client_for(self.groom).post(f"/api/horses/{horse_id}/health-reports",
            {"Description": "Chân trước sưng", "Severity": severity, **extra}, format="json")

    def record(self, horse_id, **extra):
        response = self.client_for(self.vet).post(f"/api/horses/{horse_id}/medical-records", {
            "ExamType": "Injury Exam", "HealthStatus": "Healthy", "TrainingEligibility": "Eligible", **extra}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["MedicalRecordID"]

    def test_direct_task_and_diet_access_is_scoped_without_mine(self):
        hid = self.approved_horse()
        groom2 = self.make_user("scoped-groom@one.test", "GROOM", self.club)
        task = CareTask.objects.create(horse_id=hid, groom=groom2, task_type="Cleaning", scheduled_at=now())
        client = self.client_for(self.groom)
        self.assertNotIn(task.pk, [r["CareTaskID"] for r in client.get("/api/care-tasks?mine=0").data])
        for url, method in [(f"/api/care-tasks/{task.pk}", "get"), (f"/api/care-tasks/{task.pk}/complete", "post"),
                            (f"/api/care-tasks/{task.pk}/skip", "post")]:
            response = client.get(url) if method == "get" else client.post(url, {"Reason": "X"}, format="json")
            self.assertEqual(response.status_code, 404)
        self.assertEqual(client.patch(f"/api/care-tasks/{task.pk}", {"Note": "X"}, format="json").status_code, 404)
        task.refresh_from_db()
        self.assertEqual(task.status, "Pending")
        draft_id = self.client_for(self.head).post(f"/api/horses/{hid}/diet-plans", {"StartDate": str(today()),
            "Meals": [{"MealTime": "06:00", "FeedType": "Hay", "Quantity": 1, "Unit": "kg"}]}, format="json").data["DietPlanID"]
        self.assertEqual(client.get(f"/api/diet-plans/{draft_id}").status_code, 404)
        for user in (self.rider, self.owner):
            self.assertEqual(self.client_for(user).get("/api/care-tasks").status_code, 403)
        self.assertEqual(client.get(f"/api/horses/{hid}/treatments").status_code, 403)

    def test_cross_club_all_list_detail_and_write_paths(self):
        hid = self.approved_horse()
        report = self.report(hid).data
        task = CareTask.objects.create(horse_id=hid, groom=self.groom, task_type="Cleaning", scheduled_at=now())
        other = self.client_for(self.other_vet)
        for path in ("/api/health-reports", "/api/care-tasks", "/api/diet-plans", "/api/training-locks"):
            self.assertEqual(other.get(path).data, [])
        self.assertEqual(other.get(f"/api/health-reports/{report['HealthReportID']}").status_code, 404)
        self.assertEqual(other.post(f"/api/health-reports/{report['HealthReportID']}/take").status_code, 404)
        self.assertEqual(other.get(f"/api/care-tasks/{task.pk}").status_code, 404)
        self.assertEqual(other.get(f"/api/horses/{hid}/injury-markers").status_code, 404)

    def test_emergency_escalation_stops_without_session_input_and_no_duplicate(self):
        hid, plan, stage = self.ready_horse()
        sid = self.session(stage)["TrainingSessionID"]
        self.assertEqual(self.client_for(self.rider).post(f"/api/training-sessions/{sid}/start").status_code, 200)
        first = self.report(hid)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(self.report(hid).status_code, 409)
        with patch("apps.core.emails.send_mail", side_effect=OSError("Test SMTP offline")), self.assertLogs("equi.email", level="ERROR"):
            with self.captureOnCommitCallbacks(execute=True):
                urgent = self.report(hid, "Urgent")
        self.assertEqual(urgent.status_code, 200, urgent.data)
        self.assertTrue(urgent.data["ReusedOpenReport"])
        self.assertTrue(urgent.data["StoppedSession"])
        self.assertEqual(HealthReport.objects.filter(horse_id=hid).count(), 1)
        self.assertEqual(TrainingSession.objects.get(pk=sid).status, "Cancelled")
        self.assertTrue(AuditLog.objects.filter(entity_id=sid, action_type="HEALTH_REPORT_STOP_SESSION").exists())
        with self.assertRaises(IntegrityError), transaction.atomic():
            HealthReport.objects.create(horse_id=hid, reported_by=self.groom, description="Duplicate")

    def test_two_vets_cannot_claim_using_stale_objects(self):
        hid = self.approved_horse()
        rid = self.report(hid).data["HealthReportID"]
        a, b = HealthReport.objects.get(pk=rid), HealthReport.objects.get(pk=rid)
        services.take_report(a, self.vet)
        with self.assertRaises(BusinessRuleError):
            services.take_report(b, self.vet2)
        self.assertEqual(HealthReport.objects.get(pk=rid).vet_id, self.vet.pk)
        self.assertEqual(self.client_for(self.vet2).post(f"/api/horses/{hid}/medical-records", {
            "ExamType": "Emergency", "HealthReportID": rid}, format="json").status_code, 409)

    def test_image_upload_attach_reopen_and_file_permissions(self):
        hid = self.approved_horse()
        upload = self.client_for(self.groom).post(f"/api/horses/{hid}/health-report-attachments", {
            "File": SimpleUploadedFile("leg.png", b"\x89PNG\r\n\x1a\nimage", content_type="image/png")}, format="multipart")
        self.assertEqual(upload.status_code, 201, upload.data)
        rid = self.report(hid, AttachmentIDs=[upload.data["AttachmentID"]]).data["HealthReportID"]
        row = self.client_for(self.vet2).get(f"/api/health-reports/{rid}").data
        url = "/api" + row["Attachments"][0]["FilePath"]
        response = self.client_for(self.vet).get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), b"\x89PNG\r\n\x1a\nimage")
        self.assertEqual(self.client_for(self.other_vet).get(url).status_code, 404)
        self.assertEqual(self.client_for(self.owner).get(url).status_code, 403)

    def test_marker_persistence_signed_immutability_and_follow_up_history(self):
        hid = self.approved_horse()
        rid = self.record(hid)
        marker = {"medicalRecordId": rid, "bodyRegion": "foreleg", "bodySide": "left", "view": "left",
                  "xRatio": .65, "yRatio": .78, "diagramVersion": "equi-horse-photo-v3", "description": "Sưng",
                  "severity": "moderate", "status": "treating", "detectedAt": str(today()), "notes": "Theo dõi"}
        client = self.client_for(self.vet)
        response = client.post(f"/api/horses/{hid}/injury-markers", marker, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        mid = response.data["id"]
        self.assertEqual(self.client_for(self.vet2).get(f"/api/horses/{hid}/injury-markers").data[0]["bodySide"], "left")
        self.assertEqual(self.client_for(self.vet2).patch(f"/api/injury-markers/{mid}", marker, format="json").status_code, 409)
        self.assertEqual(client.post(f"/api/medical-records/{rid}/sign").status_code, 200)
        self.assertEqual(client.patch(f"/api/injury-markers/{mid}", marker, format="json").status_code, 409)
        self.assertEqual(client.patch(f"/api/medical-records/{rid}", {"Diagnosis": "Changed"}, format="json").status_code, 409)
        follow = self.record(hid, ExamType="Follow-up")
        response = client.post(f"/api/injury-markers/{mid}/assessments", {"medicalRecordId": follow,
            "date": str(today()), "status": "monitoring", "comment": "Giảm sưng"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        reloaded = self.client_for(self.vet2).get(f"/api/horses/{hid}/injury-markers").data[0]
        self.assertEqual(reloaded["history"][0]["comment"], "Giảm sưng")
        self.assertEqual(InjuryMarker.objects.get(pk=mid).status, "treating")

    def test_release_requires_eligible_follow_up_for_exact_lock_episode(self):
        hid, plan, stage = self.ready_horse()
        client = self.client_for(self.vet)
        lock = client.post(f"/api/horses/{hid}/training-locks", {"Reason": "Injury", "LockLevel": "Full",
            "LockStartDate": (now() - timedelta(days=2)).isoformat(), "LockEndDate": (now() - timedelta(days=1)).isoformat()}, format="json").data
        lid = lock["TrainingLockID"]
        self.assertEqual(self.session(stage, expect=409)["code"], "TRAINING_LOCK_FULL")
        routine = self.record(hid)
        client.post(f"/api/medical-records/{routine}/sign")
        self.assertEqual(client.post(f"/api/training-locks/{lid}/release").status_code, 409)
        follow = self.record(hid, ExamType="Follow-up", FollowUpLockID=lid)
        client.post(f"/api/medical-records/{follow}/sign")
        self.assertEqual(client.post(f"/api/training-locks/{lid}/release").status_code, 200)

    def test_assignment_keeps_completed_actor_and_moves_all_pending(self):
        hid = self.approved_horse()
        done = CareTask.objects.create(horse_id=hid, groom=self.groom, task_type="Cleaning", scheduled_at=now())
        care.complete_care_task(done, self.groom)
        pending = CareTask.objects.create(horse_id=hid, groom=self.groom, task_type="Cleaning", scheduled_at=now() - timedelta(days=1))
        groom2 = self.make_user("replacement@one.test", "GROOM", self.club)
        response = self.client_for(self.manager).put(f"/api/horses/{hid}/groom", {"GroomID": groom2.pk}, format="json")
        self.assertEqual(response.data["MovedTaskCount"], 1)
        done.refresh_from_db(); pending.refresh_from_db()
        self.assertEqual((done.groom_id, done.completed_by_id), (self.groom.pk, self.groom.pk))
        self.assertEqual(pending.groom_id, groom2.pk)
        self.assertIn(str(pending.pk), AuditLog.objects.filter(action_type="SET_HORSE_GROOM").first().details)

    def test_automation_retains_unassigned_and_requires_vet_order_for_ice(self):
        hid = self.approved_horse()
        self.client_for(self.manager).delete(f"/api/horses/{hid}/groom")
        first = automation.generate_for_day(self.club, today())
        self.assertEqual(first["Unassigned"], 1)
        self.assertEqual(automation.generate_for_day(self.club, today())["Created"], 0)
        self.assertTrue(CareTask.objects.filter(horse_id=hid, groom__isnull=True).exists())
        self.client_for(self.vet).post(f"/api/horses/{hid}/training-locks", {"Reason": "Fever"}, format="json")
        automation.generate_for_day(self.club, today())
        self.assertFalse(CareTask.objects.filter(horse_id=hid, task_type="Ice Leg Soak").exists())

    @override_settings(CARE_REFUSAL_THRESHOLD=2)
    def test_feeding_refusal_alert_is_per_episode_and_duplicate_completion_rejected(self):
        hid = self.approved_horse()
        self.assign(hid)
        for index in range(3):
            task = CareTask.objects.create(horse_id=hid, groom=self.groom, task_type="Feeding", scheduled_at=now() + timedelta(minutes=index))
            care.complete_care_task(task, self.groom, "Không ăn", "Refused")
        self.assertEqual(WorkflowNotice.objects.filter(kind="FEEDING_ALERT", user=self.trainer).count(), 1)
        self.assertEqual(WorkflowNotice.objects.filter(kind="FEEDING_ALERT", user=self.vet).count(), 1)
        with self.assertRaises(BusinessRuleError):
            care.complete_care_task(task, self.groom, "Again", "All")

    def test_inventory_stale_request_only_deducts_once_and_rolls_back_shortage(self):
        item = InventoryItem.objects.create(club=self.club, item_name="Hay", item_type="Food", quantity=10, unit="kg")
        req = care.create_inventory_request(self.groom, "Need hay", [{"InventoryItemID": item.pk, "RequestedQuantity": Decimal(6)}])
        stale = InventoryRequest.objects.get(pk=req.pk)
        care.approve_inventory_request(req, self.manager, note="Cấp")
        with self.assertRaises(BusinessRuleError):
            care.approve_inventory_request(stale, self.manager, note="Retry")
        item.refresh_from_db()
        self.assertEqual(item.quantity, 4)
        req2 = care.create_inventory_request(self.groom, "Need hay", [{"InventoryItemID": item.pk, "RequestedQuantity": Decimal(6)}])
        with self.assertRaises(BusinessRuleError):
            care.approve_inventory_request(req2, self.manager, note="Cấp")
        item.refresh_from_db(); req2.refresh_from_db()
        self.assertEqual((item.quantity, req2.status), (Decimal(4), "Pending"))

    def test_head_finalizes_diet_and_medical_limits_are_enforced(self):
        hid = self.approved_horse()
        head, vet = self.client_for(self.head), self.client_for(self.vet)
        response = vet.post(f"/api/horses/{hid}/diet-restrictions", {"Instructions": "Giảm tinh bột", "FeedType": "Oats",
            "MaxDailyQuantity": 1, "Unit": "kg", "StartDate": str(today())}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        plan = head.post(f"/api/horses/{hid}/diet-plans", {"StartDate": str(today()), "Meals": [
            {"MealTime": "06:00", "FeedType": "Oats", "Quantity": .75, "Unit": "kg"},
            {"MealTime": "17:00", "FeedType": "Oats", "Quantity": .75, "Unit": "kg"}]}, format="json").data
        pid = plan["DietPlanID"]
        self.assertEqual(vet.post(f"/api/diet-plans/{pid}/approve", {}, format="json").status_code, 403)
        self.assertEqual(head.post(f"/api/diet-plans/{pid}/approve", {}, format="json").status_code, 400)
        self.assertEqual(DietPlan.objects.get(pk=pid).status, "Pending")
        head.patch(f"/api/diet-plans/{pid}", {"Meals": [{"MealTime": "06:00", "FeedType": "Hay", "Quantity": 2, "Unit": "kg"}]}, format="json")
        self.assertEqual(head.post(f"/api/diet-plans/{pid}/approve", {}, format="json").status_code, 200)

    def test_background_worker_and_prescribed_care_are_idempotent(self):
        from apps.care.management.commands.run_operations import run_once
        from apps.medical.models import MedicalSchedule
        hid = self.approved_horse()
        rid = self.record(hid)
        client = self.client_for(self.vet)
        client.post(f"/api/medical-records/{rid}/sign")
        response = client.post(f"/api/horses/{hid}/care-orders", {"MedicalRecordID": rid, "TaskType": "Ice Leg Soak",
            "Instructions": "Chỉ định thử nghiệm", "StartDate": str(today()), "EndDate": str(today() + timedelta(days=1)),
            "TimeOfDay": "16:00"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        MedicalSchedule.objects.create(horse_id=hid, schedule_type="Farrier", scheduled_date=today())
        run_once()
        counts = CareTask.objects.count(), WorkflowNotice.objects.count()
        run_once()
        self.assertEqual((CareTask.objects.count(), WorkflowNotice.objects.count()), counts)
        from apps.core.notifications import build_notifications
        reminders = [n for n in build_notifications(self.vet) if n["EntityName"] == "MedicalSchedule"]
        self.assertEqual(len(reminders), 1)
        self.assertEqual(CareTask.objects.filter(horse_id=hid, task_type="Ice Leg Soak").count(), 2)
        self.assertTrue(CareTask.objects.filter(horse_id=hid, medical_record_id=rid, groom=self.groom).exists())

    def test_restricted_limit_stops_in_progress_and_is_checked_at_start(self):
        hid, plan, stage = self.ready_horse()
        sid = self.session(stage, load=20)["TrainingSessionID"]
        rider, vet = self.client_for(self.rider), self.client_for(self.vet)
        rider.post(f"/api/training-sessions/{sid}/start")
        response = vet.post(f"/api/horses/{hid}/training-locks", {"Reason": "Giới hạn", "LockLevel": "Restricted", "MaxIntensity": 25}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(TrainingSession.objects.get(pk=sid).status, "In Progress")
        lid = response.data["TrainingLockID"]
        vet.patch(f"/api/training-locks/{lid}", {"MaxIntensity": 10}, format="json")
        self.assertEqual(TrainingSession.objects.get(pk=sid).status, "Cancelled")
        self.assertEqual(self.session(stage, load=15, expect=409)["code"], "TRAINING_LOCK_RESTRICTED")
        pending = self.session(stage, load=5)["TrainingSessionID"]
        # Simulate a stale schedule written before a newer restriction was applied.
        TrainingSession.objects.filter(pk=pending).update(training_load=15)
        self.assertEqual(rider.post(f"/api/training-sessions/{pending}/start").data["code"], "TRAINING_LOCK_RESTRICTED")

    def test_urgent_mail_prioritizes_current_duty_vet(self):
        from django.core import mail
        from apps.medical.models import VetDutyShift
        hid = self.approved_horse()
        VetDutyShift.objects.create(club=self.club, vet=self.vet2, duty_date=today(), shift="Full Day", created_by=self.manager)
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            response = self.report(hid, "Urgent")
        self.assertEqual(response.status_code, 201)
        messages = [m for m in mail.outbox if "báo cáo sức khỏe" in m.subject]
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0].to, [self.vet2.email])

    def test_sign_cannot_bypass_full_lock_with_partial_payload(self):
        hid = self.approved_horse()
        client = self.client_for(self.vet)
        lock = client.post(f"/api/horses/{hid}/training-locks", {
            "Reason": "Limited load", "LockLevel": "Restricted", "MaxIntensity": 10}, format="json").data
        rid = self.record(hid, TrainingEligibility="Not Eligible")
        response = client.post(f"/api/medical-records/{rid}/sign", {"TrainingLock": {"Reason": "Still unfit"}}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(MedicalRecord.objects.get(pk=rid).record_status, "Draft")
        self.assertEqual(TrainingLock.objects.get(pk=lock["TrainingLockID"]).lock_level, "Restricted")

    def test_locked_medical_tasks_need_prescription_and_server_assigns_groom(self):
        hid = self.approved_horse()
        client = self.client_for(self.vet)
        lock = client.post(f"/api/horses/{hid}/training-locks", {"Reason": "Injury"}, format="json").data
        body = {"HorseID": hid, "TaskType": "Medical Care", "ScheduledAt": now().isoformat(), "Note": "Chỉ định chăm sóc"}
        self.assertEqual(client.post("/api/care-tasks", body, format="json").status_code, 400)
        body["MedicalRecordID"] = self.record(hid)
        body["GroomID"] = self.other_vet.pk  # FE identity must not choose the assignee.
        response = client.post("/api/care-tasks", body, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        task = CareTask.objects.get(pk=response.data["CareTaskID"])
        self.assertEqual((task.groom_id, task.training_lock_id), (self.groom.pk, lock["TrainingLockID"]))

    def test_completion_notes_do_not_truncate_long_instructions(self):
        hid = self.approved_horse()
        task = CareTask.objects.create(horse_id=hid, groom=self.groom, task_type="Cleaning", scheduled_at=now(), note="x" * 1000)
        care.complete_care_task(task, self.groom, "Ghi nhận cần lưu đầy đủ")
        task.refresh_from_db()
        self.assertEqual(task.note, "x" * 1000)
        self.assertEqual(task.outcome_note, "Ghi nhận cần lưu đầy đủ")
