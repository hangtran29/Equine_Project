"""
Email Flow 3 gửi nhân sự CLB (gửi sau khi lưu database; lỗi gửi mail không làm hỏng thao tác):
  - báo cáo sức khỏe KHẨN -> bác sĩ đang trực (không ai trực -> mọi bác sĩ của CLB);
  - Vet khóa tập / đổi mức khóa / mở khóa -> Trainer phụ trách và Head Trainer, kèm nhắc xem lại giáo án.
"""
from apps.core.emails import send_email
from apps.core.permissions import club_users_with_role

from .duty import vets_to_alert

LEVEL_TEXT = {"Full": "dừng tập hoàn toàn", "Restricted": "chỉ được tập dưới cường độ cho phép"}


def _label(horse):
    return f"{horse.horse_name}" + (f" ({horse.horse_code})" if horse.horse_code else "")


def _training_staff(horse):
    """Trainer đang phụ trách ngựa + mọi Head Trainer của CLB."""
    emails = [u.email for u in club_users_with_role(horse.club_id, "HEAD_TRAINER")]
    try:
        from apps.training.services import active_assignment
    except ImportError:          # chưa có Flow 2
        return emails
    assignment = active_assignment(horse)
    if assignment is not None:
        emails.append(assignment.trainer.email)
    return emails


def urgent_report(report):
    horse = report.horse
    send_email([vet.email for vet in vets_to_alert(horse.club_id)], f"[KHẨN] Báo cáo sức khỏe: {horse.horse_name}", (
        f"{report.reported_by.full_name} vừa báo sự cố KHẨN cho {_label(horse)}.\n"
        f"Mô tả: {report.description}\n"
        + ("Buổi tập đang diễn ra đã được dừng.\n" if getattr(report, "stopped_session", False) else "")
        + "\nVui lòng vào hàng chờ báo cáo sức khỏe để nhận ca ngay."
    ))


def lock_changed(lock, event):
    """event: 'created' | 'changed' | 'released'."""
    horse = lock.horse
    if event == "released":
        subject = f"{horse.horse_name} được tập lại"
        text = (f"Bác sĩ thú y {lock.released_by.full_name} đã mở khóa huấn luyện cho {_label(horse)} "
                "sau khi tái khám đạt.")
    else:
        subject = f"[Khẩn] {horse.horse_name} {'bị khóa tập' if event == 'created' else 'đổi mức khóa tập'}"
        limit = f" (cường độ tối đa {lock.max_intensity})" if lock.max_intensity is not None else ""
        text = (f"Bác sĩ thú y đã {'khóa' if event == 'created' else 'đổi mức khóa'} huấn luyện {_label(horse)}: "
                f"{LEVEL_TEXT.get(lock.lock_level, lock.lock_level)}{limit}.\nLý do: {lock.reason}")
        cancelled = getattr(lock, "cancelled_session_ids", None)
        if cancelled:
            text += f"\nĐã tự hủy {len(cancelled)} buổi tập bị ảnh hưởng."
    send_email(_training_staff(horse), subject, text + "\n\nVui lòng xem lại giáo án và lịch tập của ngựa.")
