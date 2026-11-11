"""Archive updates preserve club isolation and controlled account recovery."""
from django.test import override_settings
from rest_framework.test import APIClient

from apps.core.audit import log_action
from apps.core.models import SupportRequest
from apps.training.tests.base import TrainingTestCase


class G1UpdateTests(TrainingTestCase):
    def test_audit_filters_accept_action_groups_and_actor_name_with_club_scope(self):
        log_action(self.manager, "UPDATE_CLUB", self.club)
        log_action(self.manager, "REQUEST_PASSWORD_RESET", self.manager)
        log_action(self.other_vet, "UPDATE_CLUB", self.other_club)
        client = self.client_for(self.manager)
        response = client.get("/api/audit-logs", {
            "UserName": self.manager.full_name,
            "ActionType": " UPDATE_CLUB, REQUEST_PASSWORD_RESET ",
        })
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["Total"], 2)
        self.assertEqual({row["ActionType"] for row in response.data["Items"]},
                         {"UPDATE_CLUB", "REQUEST_PASSWORD_RESET"})
        self.assertTrue(all(row["UserID"] == self.manager.pk for row in response.data["Items"]))
        self.assertEqual(client.get("/api/audit-logs", {"UserName": "no-such-actor"}).data["Total"], 0)
        self.assertEqual(self.client_for(self.trainer).get("/api/audit-logs").status_code, 403)

    @override_settings(NO_MAILBOX_DOMAINS=["one.test"])
    def test_club_account_recovery_queues_one_request_without_returning_a_reset_token(self):
        client = APIClient()
        client.defaults["REMOTE_ADDR"] = "198.51.100.77"
        # Keep recovery anonymous even if the browser has a different account signed in.
        responses = [client.post("/api/auth/password-reset", {"Email": self.owner.email, "Phone": self.owner.phone},
                                 format="json") for _ in range(2)]
        for response in responses:
            self.assertEqual(response.status_code, 200, response.data)
            self.assertTrue(response.data["ContactManager"])
            self.assertNotIn("ResetLink", response.data)
        requests = SupportRequest.objects.filter(requester=self.owner, topic="Account", status="Open")
        self.assertEqual(requests.count(), 1)
        self.assertEqual(requests.get().club_id, self.owner.club_id)
        unknown = client.post("/api/auth/password-reset", {"Email": "missing@one.test"}, format="json")
        self.assertEqual(unknown.data, responses[0].data)
