"""G1 UI additions retain TARGET horse scope and active-lock semantics."""
from datetime import timedelta

from apps.care.models import HorseGroom
from apps.core.clubtime import today
from apps.horses.models import Horse, Stall, StallAssignment
from apps.medical.models import TrainingLock
from apps.training.tests.base import TrainingTestCase


class G1IntegrationTests(TrainingTestCase):
    def test_groom_map_shares_club_stalls_but_only_exposes_assigned_horses(self):
        horse_id = self.approved_horse()
        horse = Horse.objects.get(pk=horse_id)
        StallAssignment.objects.create(horse=horse, stall=self.stall, start_date=today())
        Stall.objects.filter(pk=self.stall.pk).update(status="Occupied")
        hidden_horse = Horse.objects.create(club=self.club, owner=self.owner, horse_name="Other groom horse",
                                            breed="Thoroughbred", gender="Male", date_of_birth="2021-01-01")
        hidden_stall = Stall.objects.create(club=self.club, stall_number="B01", status="Occupied")
        StallAssignment.objects.create(horse=hidden_horse, stall=hidden_stall, start_date=today())
        empty_stall = Stall.objects.create(club=self.club, stall_number="C01")
        maintenance_stall = Stall.objects.create(club=self.club, stall_number="D01", status="Maintenance")
        groom = self.client_for(self.groom)
        response = groom.get("/api/stalls")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([s["StallNumber"] for s in response.data], ["A01", "B01", "C01", "D01"])
        self.assertEqual(response.data[0]["CurrentHorse"]["HorseID"], horse_id)
        self.assertIsNone(response.data[1]["CurrentHorse"])
        self.assertEqual(response.data[1]["Status"], "Occupied")
        self.assertEqual(response.data[2]["Status"], "Available")
        self.assertEqual(response.data[3]["Status"], "Maintenance")
        self.assertNotIn("Other groom horse", str(response.data))
        manager_rows = self.client_for(self.manager).get("/api/stalls").data
        self.assertEqual([s["StallID"] for s in response.data], [s["StallID"] for s in manager_rows])
        self.assertEqual(manager_rows[1]["CurrentHorse"]["HorseID"], hidden_horse.pk)
        self.assertNotIn(self.other_stall.pk, {s["StallID"] for s in manager_rows})
        self.assertEqual(self.client_for(self.trainer).get("/api/stalls").data, [])
        available = groom.get("/api/stalls?Status=Available")
        self.assertEqual([s["StallID"] for s in available.data], [empty_stall.pk])
        maintenance = groom.get("/api/stalls?Status=Maintenance")
        self.assertEqual([s["StallID"] for s in maintenance.data], [maintenance_stall.pk])
        HorseGroom.objects.filter(horse=horse).delete()
        revoked = groom.get("/api/stalls").data
        self.assertEqual([s["StallID"] for s in revoked], [s["StallID"] for s in manager_rows])
        self.assertTrue(all(s["CurrentHorse"] is None for s in revoked))
        self.assertEqual(groom.get(f"/api/horses/{horse_id}").status_code, 404)

    def test_groom_cannot_mutate_stalls_or_move_horses(self):
        horse_id = self.approved_horse()
        groom = self.client_for(self.groom)
        for response in (
            groom.post("/api/stalls", {"StallNumber": "A99"}, format="json"),
            groom.patch(f"/api/stalls/{self.stall.pk}", {"Status": "Maintenance"}, format="json"),
            groom.post(f"/api/horses/{horse_id}/move-stall", {"StallID": self.stall.pk}, format="json"),
        ):
            self.assertEqual(response.status_code, 403, response.data)

    def test_scheduling_rejects_expired_planned_lock_and_explains_restricted_load(self):
        horse_id, _, stage_id = self.ready_horse()
        lock = TrainingLock.objects.create(horse_id=horse_id, created_by=self.vet,
                                           lock_start_date=today() - timedelta(days=3),
                                           lock_end_date=today() - timedelta(days=1),
                                           reason="Veterinary review required", lock_level="Full")
        response = self.session(stage_id, expect=409)
        self.assertEqual(response["code"], "TRAINING_LOCK_FULL")
        lock.lock_level, lock.max_intensity = "Restricted", 25
        lock.save()
        client = self.client_for(self.head)
        response = client.post("/api/training-sessions", {
            "TrainingPlanStageID": stage_id, "WorkRiderID": self.rider.pk,
            "SessionDate": today().isoformat(), "StartTime": "06:00", "TrainingType": "Walk", "TrainingLoad": 30,
        }, format="json", HTTP_X_LANGUAGE="en")
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data["code"], "TRAINING_LOCK_RESTRICTED")
        self.assertIn("maximum training load is 25.", response.data["detail"])
