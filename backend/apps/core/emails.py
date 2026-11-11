"""
Gửi email thông báo (Gmail SMTP). Cấu hình trong .env:

    EMAIL_HOST_USER=ten.clb@gmail.com
    EMAIL_HOST_PASSWORD=<App Password 16 ký tự của Gmail, KHÔNG phải mật khẩu Gmail>

- Chưa cấu hình: email được IN RA CỬA SỔ CHẠY BACKEND (console) để xem khi demo.
- Đã cấu hình Gmail: gửi thật; bỏ qua địa chỉ demo đuôi ".local" (không tồn tại ngoài đời).
- Gửi SAU KHI lưu database thành công (on_commit) và chạy luồng nền, nên mail lỗi / chậm
  không làm hỏng hay chậm thao tác của người dùng; lỗi chỉ ghi log.
"""
import logging
import threading
from contextlib import contextmanager

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction

logger = logging.getLogger("equi.email")
_state = threading.local()


@contextmanager
def suppressed():
    """Tắt gửi mail trong khối lệnh (vd. seed_demo tạo dữ liệu mẫu)."""
    previous = getattr(_state, "off", False)
    _state.off = True
    try:
        yield
    finally:
        _state.off = previous


def _deliverable(address: str | None) -> bool:
    if not address or "@" not in address:
        return False
    using_smtp = settings.EMAIL_BACKEND.endswith("smtp.EmailBackend")
    return not (using_smtp and address.lower().endswith(".local"))


def _send(recipients, subject, body, html=None):
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, recipients, fail_silently=False, html_message=html)
    except Exception:  # noqa: BLE001 - mail lỗi không được làm hỏng nghiệp vụ
        logger.exception("Không gửi được email '%s' tới %s", subject, recipients)


def send_email(recipients, subject: str, body: str, essential: bool = False, html: str | None = None):
    """essential=True: email bắt buộc (đặt lại mật khẩu), gửi cả khi đã tắt email thông báo."""
    if getattr(_state, "off", False):
        return
    if not essential and not getattr(settings, "NOTIFICATION_EMAILS", True):
        return
    recipients = sorted({r.strip().lower() for r in recipients if _deliverable(r)})
    if not recipients:
        return
    footer = f"\n\n—\nEquiTrack · {settings.FRONTEND_URL}\nEmail tự động, vui lòng không trả lời."
    full_subject = f"[EquiTrack] {subject}"

    def dispatch():
        if getattr(settings, "EMAIL_ASYNC", True):
            threading.Thread(target=_send, args=(recipients, full_subject, body + footer, html), daemon=True).start()
        else:
            _send(recipients, full_subject, body + footer, html)

    transaction.on_commit(dispatch)


def _managers_of(club_id):
    from apps.accounts.models import User
    return User.objects.filter(club_id=club_id, roles__code="CLUB_MANAGER", status="Active") \
        .values_list("email", flat=True)


def _horse_label(horse):
    return f"{horse.horse_name}" + (f" ({horse.horse_code})" if horse.horse_code else f" (hồ sơ #{horse.pk})")


# ---------------- tài khoản ----------------
def account_registered(user):
    send_email([user.email], "Tạo tài khoản thành công", (
        f"Chào {user.full_name},\n\n"
        "Tài khoản chủ ngựa của bạn trên EquiTrack đã được tạo.\n"
        "Bạn có thể đăng nhập để đăng ký hồ sơ ngựa và theo dõi tình trạng xét duyệt."
    ))


def account_created_by_manager(user, manager):
    send_email([user.email], "Câu lạc bộ đã tạo tài khoản cho bạn", (
        f"Chào {user.full_name},\n\n"
        f"{manager.full_name} đã tạo tài khoản EquiTrack cho bạn với email {user.email}.\n"
        "Mật khẩu tạm sẽ được câu lạc bộ báo riêng. Nếu email này là Gmail, bạn cũng có thể "
        "bấm \"Đăng nhập với Google\" mà không cần mật khẩu."
    ))


def password_reset_link(user, link, english=False):
    """Email đặt lại mật khẩu: bản chữ thường + bản HTML có nút bấm (Gmail hiển thị nút)."""
    from html import escape

    if english:
        subject, hello = "Reset your password", f"Hello {user.full_name},"
        lines = ["We received a request to reset the password of your EquiTrack account.",
                 "Click the button below within 1 hour to set a new password:",
                 "If you did not request this, ignore this email; your current password stays the same."]
        button = "Set a new password"
    else:
        subject, hello = "Đặt lại mật khẩu", f"Chào {user.full_name},"
        lines = ["Có yêu cầu đặt lại mật khẩu cho tài khoản EquiTrack của bạn.",
                 "Bấm vào nút dưới đây trong vòng 1 giờ để đặt mật khẩu mới:",
                 "Nếu bạn không yêu cầu, hãy bỏ qua email này; mật khẩu hiện tại vẫn giữ nguyên."]
        button = "Đặt mật khẩu mới"
    body = f"{hello}\n\n{lines[0]}\n{lines[1]}\n{link}\n\n{lines[2]}"
    html = (f'<div style="font-family:Arial,sans-serif;font-size:15px;color:#2f3527;line-height:1.6">'
            f'<p>{escape(hello)}</p><p>{escape(lines[0])}<br>{escape(lines[1])}</p>'
            f'<p><a href="{escape(link)}" style="display:inline-block;background:#4c5b36;color:#fff;padding:12px 22px;'
            f'border-radius:8px;text-decoration:none;font-weight:bold">{escape(button)}</a></p>'
            f'<p style="font-size:13px;color:#6b705f">{escape(link)}</p><p>{escape(lines[2])}</p>'
            f'<p style="font-size:12px;color:#8a8d82">EquiTrack · {escape(settings.FRONTEND_URL)}</p></div>')
    send_email([user.email], subject, body, essential=True, html=html)


def password_reset_by_manager(user, manager):
    send_email([user.email], "Mật khẩu của bạn đã được đặt lại", (
        f"Chào {user.full_name},\n\n"
        f"Quản lý câu lạc bộ {manager.full_name} vừa đặt lại mật khẩu tài khoản EquiTrack của bạn.\n"
        "Mật khẩu tạm sẽ được quản lý báo riêng. Đăng nhập xong hãy đổi mật khẩu ở mục Tài khoản."
    ))


def account_status_changed(user, locked, reason=None):
    if locked:
        body = (f"Chào {user.full_name},\n\nTài khoản EquiTrack của bạn đã bị tạm khóa."
                + (f"\nLý do: {reason}" if reason else "") + "\nVui lòng liên hệ quản lý câu lạc bộ nếu cần hỗ trợ.")
    else:
        body = f"Chào {user.full_name},\n\nTài khoản EquiTrack của bạn đã được mở khóa, bạn có thể đăng nhập lại."
    send_email([user.email], "Tài khoản đã bị tạm khóa" if locked else "Tài khoản đã được mở khóa", body)


# ---------------- Flow 1: hồ sơ ngựa ----------------
def registration_submitted(horse):
    send_email(_managers_of(horse.club_id), f"Hồ sơ ngựa mới cần xác minh: {horse.horse_name}", (
        f"Chủ ngựa {horse.owner.full_name} vừa gửi hồ sơ {_horse_label(horse)}.\n"
        "Vui lòng vào mục Danh sách ngựa → Cần xử lý để kiểm tra giấy tờ và xác minh."
    ))


def registration_verified(horse):
    send_email([horse.owner.email], f"Hồ sơ {horse.horse_name} đã được xác minh", (
        f"Chào {horse.owner.full_name},\n\n"
        f"Hồ sơ {_horse_label(horse)} đã qua bước kiểm tra giấy tờ.\n"
        "Bước tiếp theo: bác sĩ thú y trực ca sẽ khám sức khỏe đầu vào cho ngựa."
    ))


def initial_exam_needed(horse):
    """Hồ sơ vừa xác minh: báo bác sĩ đang trực (không ai trực thì mọi bác sĩ của câu lạc bộ) để khám đầu vào."""
    from apps.medical.duty import vets_to_alert

    send_email([vet.email for vet in vets_to_alert(horse.club_id)], f"Ngựa chờ khám đầu vào: {horse.horse_name}", (
        f"Hồ sơ {_horse_label(horse)} đã được quản lý xác minh giấy tờ.\n"
        "Vui lòng vào hàng chờ khám đầu vào để nhận ca và khám sức khỏe cho ngựa."
    ))


def initial_exam_signed(record):
    horse = record.horse
    send_email(_managers_of(horse.club_id), f"Đã khám đầu vào: {horse.horse_name}", (
        f"Bác sĩ {record.vet.full_name} đã chốt phiếu khám đầu vào cho {_horse_label(horse)}.\n"
        f"Kết luận sức khỏe: {record.health_status} · Khả năng tập: {record.training_eligibility}.\n"
        "Vui lòng vào trang Xử lý Flow 1 để duyệt hoặc từ chối hồ sơ."
    ))


def registration_approved(horse):
    send_email([horse.owner.email], f"Ngựa {horse.horse_name} đã được tiếp nhận", (
        f"Chào {horse.owner.full_name},\n\n"
        f"Câu lạc bộ đã tiếp nhận ngựa {horse.horse_name}. Mã ngựa: {horse.horse_code}.\n"
        "Bạn có thể xem hồ sơ và tình trạng sức khỏe trong mục Ngựa của tôi."
    ))


def registration_rejected(horse, reason):
    send_email([horse.owner.email], f"Hồ sơ {horse.horse_name} chưa được tiếp nhận", (
        f"Chào {horse.owner.full_name},\n\n"
        f"Hồ sơ {_horse_label(horse)} chưa được tiếp nhận.\n"
        f"Lý do: {reason}\n\n"
        "Bạn có thể sửa hồ sơ, bổ sung giấy tờ rồi gửi lại."
    ))
