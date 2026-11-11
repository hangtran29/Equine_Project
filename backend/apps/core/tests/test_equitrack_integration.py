"""Contracts where SOURCE additions intersect TARGET's persisted workflows."""
from unittest.mock import patch
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from apps.core.exceptions import BusinessRuleError
from apps.core.models import AuditLog, WorkflowNotice
from apps.medical.models import HealthReport
from apps.training.models import TrainingResult, TrainingSession
from apps.training.tests.base import TrainingTestCase, result_body


class CodeStorageIntegrationTests(SimpleTestCase):
    def test_identifiers_reject_non_ascii_digits_before_varchar_storage(self):
        from apps.core.validators import clean_microchip, clean_phone_number
        for validator, value in ((clean_microchip, "985０００００００００００１"),
                                 (clean_phone_number, "090１２３４５６７")):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                validator(value, check_unique=False)


class EquiTrackIntegrationTests(TrainingTestCase):
    def test_early_injury_keeps_result_and_stops_reports_once(self):
        horse_id, _, stage_id = self.ready_horse()
        session_id = self.session(stage_id)["TrainingSessionID"]
        rider = self.client_for(self.rider)
        self.assertEqual(rider.post(f"/api/training-sessions/{session_id}/start").status_code, 200)
        body = result_body(ActualDurationMinutes=20, EarlyEndReason="Injury",
                           EarlyEndNote="Chân trước trái sưng khi tập", EndTime="06:20")
        response = rider.post(f"/api/training-sessions/{session_id}/result", body, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["Status"], "Cancelled")
        self.assertTrue(response.data["IsStopped"])
        self.assertEqual(response.data["Result"]["EarlyEndReason"], "Injury")
        report = HealthReport.objects.get(horse_id=horse_id)
        self.assertEqual((report.training_session_id, report.severity), (session_id, "Urgent"))
        self.assertEqual(str(TrainingSession.objects.get(pk=session_id).end_time), "06:20:00")
        self.assertEqual(rider.post(f"/api/training-sessions/{session_id}/result", body, format="json").status_code, 409)
        self.assertEqual(HealthReport.objects.filter(horse_id=horse_id).count(), 1)
        self.assertEqual(AuditLog.objects.filter(entity_name="TrainingSession", entity_id=session_id,
                                               action_type="STOP_TRAINING_SESSION").count(), 1)
        notices = self.client_for(self.vet).get("/api/notifications").data
        actionable = [n for n in notices if n["EntityName"] == "HealthReport" and n["EntityID"] == report.pk]
        self.assertEqual(len(actionable), 1)
        self.assertTrue(WorkflowNotice.objects.filter(user=self.vet, kind="HEALTH_REPORT_ESCALATED").exists())

    def test_early_injury_rolls_back_result_if_reporting_fails(self):
        _, _, stage_id = self.ready_horse()
        session_id = self.session(stage_id)["TrainingSessionID"]
        rider = self.client_for(self.rider)
        rider.post(f"/api/training-sessions/{session_id}/start")
        with patch("apps.medical.services.training_incident", side_effect=BusinessRuleError("Thử lại", "RETRY")):
            response = rider.post(f"/api/training-sessions/{session_id}/result", result_body(
                ActualDurationMinutes=20, EarlyEndReason="Injury", EarlyEndNote="Dấu hiệu bất thường",
                EndTime="06:20"), format="json")
        self.assertEqual(response.status_code, 409)
        self.assertFalse(TrainingResult.objects.filter(session_id=session_id).exists())
        self.assertEqual(TrainingSession.objects.get(pk=session_id).status, "In Progress")

    def test_support_and_owner_groom_read_keep_horse_scope(self):
        horse_id = self.approved_horse()
        other_groom = self.make_user("unassigned@one.test", "GROOM", self.club)
        options = self.client_for(other_groom).get("/api/support-requests/options")
        self.assertEqual(options.data["Horses"], [])
        denied = self.client_for(other_groom).post("/api/support-requests", {
            "Topic": "Care", "HorseID": horse_id, "Content": "Hỗ trợ chăm sóc"}, format="json")
        self.assertEqual(denied.status_code, 400)
        owner = self.client_for(self.owner)
        self.assertEqual(owner.get(f"/api/horses/{horse_id}/groom").data["GroomID"], self.groom.pk)
        self.assertEqual(self.client_for(self.other_owner).get(f"/api/horses/{horse_id}/groom").status_code, 404)
        self.assertEqual(owner.put(f"/api/horses/{horse_id}/groom", {"GroomID": other_groom.pk}, format="json").status_code, 403)

    def test_signed_record_activity_does_not_disclose_clinical_details_to_groom(self):
        horse_id = self.approved_horse()
        vet = self.client_for(self.vet)
        response = vet.post(f"/api/horses/{horse_id}/medical-records", {
            "ExamType": "Routine Exam", "Diagnosis": "Clinical confidential detail",
            "Conclusion": "Clinical confidential conclusion", "HealthStatus": "Healthy",
            "TrainingEligibility": "Eligible", "BodyTemperatureC": 38.2, "HeartRateBpm": 42,
            "RespiratoryRate": 18}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        record_id = response.data["MedicalRecordID"]
        signed = vet.post(f"/api/medical-records/{record_id}/sign", {}, format="json")
        self.assertEqual(signed.status_code, 200, signed.data)
        self.assertEqual(float(signed.data["BodyTemperatureC"]), 38.2)
        notice = next(n for n in self.client_for(self.groom).get("/api/notifications").data
                      if n["Type"] == "ACT_SIGN_MEDICAL_RECORD")
        self.assertIsNone(notice["Message"])
        self.assertEqual(vet.patch(f"/api/medical-records/{record_id}", {"HeartRateBpm": 60}, format="json").status_code, 409)

    def test_groom_activity_respects_a_revoked_horse_assignment(self):
        horse_id = self.approved_horse()
        groom = self.client_for(self.groom)
        report = groom.post(f"/api/horses/{horse_id}/health-reports", {
            "Severity": "Normal", "Description": "Cần bác sĩ kiểm tra"}, format="json")
        self.assertEqual(report.status_code, 201, report.data)
        self.client_for(self.vet).post(f"/api/health-reports/{report.data['HealthReportID']}/take", {}, format="json")
        self.assertTrue(any(n["Type"] == "ACT_TAKE_HEALTH_REPORT" for n in groom.get("/api/notifications").data))
        self.assertEqual(self.client_for(self.manager).delete(f"/api/horses/{horse_id}/groom").status_code, 204)
        self.assertFalse(any(n["HorseID"] == horse_id for n in groom.get("/api/notifications").data))
