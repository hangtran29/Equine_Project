from apps.core.clubtime import now as club_now
from django.conf import settings
from django.db import models
from django.utils import timezone


class AuditLog(models.Model):
    """dbo.AuditLog: ai làm gì, lúc nào, trên đối tượng nào."""

    id = models.BigAutoField(primary_key=True, db_column="AuditLogID")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, null=True, blank=True,
        db_column="UserID", related_name="+",
    )
    action_type = models.CharField(max_length=50, db_column="ActionType")
    entity_name = models.CharField(max_length=100, db_column="EntityName")
    entity_id = models.IntegerField(null=True, blank=True, db_column="EntityID")
    action_time = models.DateTimeField(default=club_now, db_column="ActionTime")
    details = models.TextField(null=True, blank=True, db_column="Details")

    class Meta:
        managed = False
        db_table = "AuditLog"
        ordering = ["-action_time", "-id"]


class NotificationRead(models.Model):
    """
    dbo.NotificationRead: thông báo người dùng đã đọc. Thông báo vẫn được TÍNH lại mỗi lần gọi;
    bảng này chỉ nhớ khóa (NotificationKey = Type|EntityName|EntityID|At) của thông báo đã đọc.
    """

    pk = models.CompositePrimaryKey("user", "notification_key")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="UserID",
                             related_name="+")
    notification_key = models.CharField(max_length=200, db_column="NotificationKey")
    read_at = models.DateTimeField(default=club_now, db_column="ReadAt")

    class Meta:
        managed = False
        db_table = "NotificationRead"


class WorkflowNotice(models.Model):
    id = models.AutoField(primary_key=True, db_column="WorkflowNoticeID")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="UserID", related_name="+")
    horse = models.ForeignKey("horses.Horse", on_delete=models.DO_NOTHING, db_column="HorseID", related_name="+")
    kind = models.CharField(max_length=50, db_column="Kind")
    source_key = models.CharField(max_length=160, db_column="SourceKey")
    message = models.CharField(max_length=1000, db_column="Message")
    created_at = models.DateTimeField(default=club_now, db_column="CreatedAt")

    class Meta:
        managed = False
        db_table = "WorkflowNotice"
        constraints = [models.UniqueConstraint(fields=["user", "source_key"], name="UQ_WorkflowNotice_User_Source")]

class SupportRequest(models.Model):
    """dbo.SupportRequest: yêu cầu hỗ trợ gửi đến Quản lý câu lạc bộ (mục "Cần hỗ trợ?" ở menu)."""

    TOPICS = {
        "HorseProfile": "Hồ sơ ngựa",
        "Account": "Tài khoản và đăng nhập",
        "Training": "Lịch tập và huấn luyện",
        "Health": "Sức khỏe và thú y",
        "Care": "Chăm sóc và dinh dưỡng",
        "Other": "Vấn đề khác",
    }

    id = models.AutoField(primary_key=True, db_column="SupportRequestID")
    club = models.ForeignKey("accounts.Club", on_delete=models.DO_NOTHING, db_column="ClubID", related_name="+")
    requester = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="RequesterID",
                                  related_name="+")
    topic = models.CharField(max_length=30, choices=list(TOPICS.items()), db_column="Topic")
    horse = models.ForeignKey("horses.Horse", on_delete=models.DO_NOTHING, null=True, blank=True,
                              db_column="HorseID", related_name="+")
    content = models.CharField(max_length=1000, db_column="Content")
    status = models.CharField(max_length=20, default="Open", choices=[("Open", "Open"), ("Resolved", "Resolved")],
                              db_column="Status")
    response = models.CharField(max_length=1000, null=True, blank=True, db_column="Response")
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, null=True, blank=True,
                                    db_column="ResolvedByID", related_name="+")
    created_at = models.DateTimeField(default=timezone.now, db_column="CreatedAt")
    resolved_at = models.DateTimeField(null=True, blank=True, db_column="ResolvedAt")

    class Meta:
        managed = False
        db_table = "SupportRequest"
        ordering = ["-created_at", "-id"]
