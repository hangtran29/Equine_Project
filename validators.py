"""Kiểm tra dữ liệu dùng chung."""
from django.core.validators import RegexValidator

# Cột lưu dạng VARCHAR trên SQL Server chỉ giữ được ký tự Latin cơ bản; chữ có dấu sẽ bị đổi thành "?".
# Các mã (số chuồng, số hộ chiếu, mã định danh, mã ngựa) vì vậy chỉ nhận chữ không dấu, số và vài ký tự nối.
ascii_code = RegexValidator(
    r"^[A-Za-z0-9 ._/\-]*$",
    "Chỉ dùng chữ không dấu, chữ số và các ký tự - _ /.",
    code="ascii_code",
)


# ---------------------------------------------------------------------------
# Thông báo lỗi chuẩn (dùng chung backend và frontend, xem frontend/src/utils/validation.js)
# ---------------------------------------------------------------------------
MSG_REQUIRED = "Vui lòng nhập thông tin này."
MSG_SELECT = "Vui lòng chọn thông tin này."
MSG_WHITESPACE = "Nội dung không được chỉ chứa khoảng trắng."
MSG_SYMBOLS_ONLY = "Nội dung phải có chữ hoặc chữ số, không chỉ gồm ký tự đặc biệt."


def msg_too_long(limit):
    return f"Nội dung vượt quá {limit} ký tự cho phép."


def clean_text(value, limit, required=True):
    """Ô nhập nội dung: bỏ trống / chỉ khoảng trắng / vượt giới hạn / chỉ ký tự đặc biệt. Trả về chuỗi đã bỏ khoảng trắng hai đầu."""
    from rest_framework.exceptions import ValidationError

    raw = "" if value is None else str(value)
    text = raw.strip()
    if not text:
        if required:
            raise ValidationError(MSG_WHITESPACE if raw else MSG_REQUIRED)
        return ""
    if len(text) > limit:
        raise ValidationError(msg_too_long(limit))
    if not any(ch.isalnum() for ch in text):
        raise ValidationError(MSG_SYMBOLS_ONLY)
    return text


# ---------------------------------------------------------------------------
# Từng loại dữ liệu. Mỗi hàm trả về giá trị đã chuẩn hóa hoặc ném ValidationError với một câu lỗi.
# ---------------------------------------------------------------------------
import re as _re
from datetime import date as _date

import unicodedata

from .codes import BREED_VALUES, COAT_VALUES, ISO_COUNTRY_NUMERIC, MANUFACTURER_PREFIX

MOBILE_PREFIXES = frozenset(
    ["032", "033", "034", "035", "036", "037", "038", "039", "052", "055", "056", "058", "059", "070", "076", "077",
     "078", "079"] + [f"08{i}" for i in range(1, 10)] + [f"09{i}" for i in range(10)])
MSG_CODE = {
    "short": "Mã chưa đủ số ký tự theo quy định.",
    "long": "Mã vượt quá số ký tự cho phép.",
    "structure": "Mã không đúng cấu trúc quy định.",
    "prefix": "Mã phải bắt đầu bằng tiền tố được cấp.",
    "chars": "Chỉ được sử dụng các ký tự theo quy định.",
    "missing": "Không tìm thấy thông tin ngựa tương ứng với mã đã nhập.",
    "exists": "Mã này đã được sử dụng trong hệ thống.",
}


def _fail(message):
    from rest_framework.exceptions import ValidationError

    raise ValidationError(message)


def _required(value):
    raw = "" if value is None else str(value)
    text = raw.strip()
    if not text:
        _fail(MSG_WHITESPACE if raw else MSG_REQUIRED)
    return raw, text


def clean_email(value, exclude_user_id=None, check_unique=True):
    raw, _ = _required(value)
    if _re.search(r"\s", raw):
        _fail("Email không được chứa khoảng trắng.")
    email = raw
    if "@" not in email:
        _fail("Email phải có ký tự @.")
    if email.count("@") > 1:
        _fail("Email chỉ được có một ký tự @.")
    local, domain = email.split("@")
    if not local:
        _fail("Email thiếu tên người dùng trước ký tự @.")
    if not domain:
        _fail("Email thiếu tên miền sau ký tự @.")
    if not _re.fullmatch(r"[A-Za-z0-9._%+\-]+", local) or not _re.fullmatch(r"[A-Za-z0-9.\-]+", domain):
        _fail("Email chứa ký tự không hợp lệ.")
    if local.startswith(".") or local.endswith(".") or ".." in email:
        _fail("Dấu chấm trong email đặt sai vị trí.")
    if "." not in domain:
        _fail("Email thiếu phần đuôi tên miền.")
    if domain.startswith("."):
        _fail("Email thiếu tên miền trước dấu chấm.")
    if domain.endswith("."):
        _fail("Email thiếu nội dung sau dấu chấm.")
    labels = domain.split(".")
    if any(not label or label.startswith("-") or label.endswith("-") for label in labels):
        _fail("Tên miền của email không hợp lệ.")
    if not _re.fullmatch(r"[A-Za-z]{2,}", labels[-1]):
        _fail("Phần đuôi tên miền không hợp lệ.")
    if len(email) > 100:
        _fail("Email vượt quá 100 ký tự cho phép.")
    email = email.lower()
    if check_unique:
        from apps.accounts.models import User

        if User.objects.filter(email__iexact=email).exclude(pk=exclude_user_id).exists():
            _fail("Email này đã được sử dụng trong hệ thống.")
    return email


def clean_phone_number(value, exclude_user_id=None, check_unique=True, landline=False):
    """10 chữ số di động (đầu số nhà mạng); landline=True nhận thêm số bàn 10–11 chữ số bắt đầu bằng 02."""
    raw, _ = _required(value)
    if _re.search(r"\s", raw):
        _fail("Số điện thoại không được chứa khoảng trắng.")
    if _re.search(r"[A-Za-zÀ-ỹ]", raw):
        _fail("Số điện thoại chỉ được chứa chữ số.")
    if not raw.isdigit():
        _fail("Số điện thoại không được chứa ký tự đặc biệt.")
    if not raw.startswith("0"):
        _fail("Số điện thoại phải bắt đầu bằng số 0.")
    if landline and raw.startswith("02"):
        if len(raw) < 10:
            _fail("Số điện thoại bàn phải có 10 hoặc 11 chữ số.")
        if len(raw) > 11:
            _fail("Số điện thoại bàn vượt quá 11 chữ số.")
    else:
        if len(raw) < 10:
            _fail("Số điện thoại chưa đủ 10 chữ số.")
        if len(raw) > 10:
            _fail("Số điện thoại vượt quá 10 chữ số.")
        if raw[:3] not in MOBILE_PREFIXES:
            _fail("Đầu số điện thoại không hợp lệ.")
    if check_unique:
        from apps.accounts.models import User

        if User.objects.filter(phone=raw).exclude(pk=exclude_user_id).exists():
            _fail("Số điện thoại này đã được sử dụng trong hệ thống.")
    return raw


def clean_full_name(value):
    _, text = _required(value)
    text = " ".join(text.split())
    if len(text) > 150:
        _fail("Họ và tên vượt quá 150 ký tự cho phép.")
    if any(ch.isdigit() for ch in text):
        _fail("Họ và tên không được chứa chữ số.")
    if not all(ch.isalpha() or ch in " '-." for ch in text):
        _fail("Họ và tên không được chứa ký tự đặc biệt.")
    if sum(ch.isalpha() for ch in text) < 2:
        _fail("Họ và tên phải có ít nhất 2 ký tự.")
    return text


def clean_address(value, limit=255):
    _, text = _required(value)
    if len(text) > limit:
        _fail(msg_too_long(limit))
    return " ".join(text.split())


def clean_horse_name(value, label="Tên ngựa", required=True, limit=100):
    raw = "" if value is None else str(value)
    text = " ".join(raw.split())
    if not text:
        if required:
            _fail(MSG_WHITESPACE if raw else MSG_REQUIRED)
        return ""
    if len(text) > limit:
        _fail(f"{label} vượt quá {limit} ký tự cho phép.")
    if not any(ch.isalpha() for ch in text):
        _fail(f"{label} phải có chữ cái, không chỉ gồm chữ số hoặc ký tự đặc biệt.")
    if not all(ch.isalnum() or ch in " '-.&" for ch in text):
        _fail(f"{label} chứa ký tự không hợp lệ.")
    return text


def clean_choice(value, allowed):
    if value in (None, ""):
        _fail(MSG_SELECT)
    if value not in allowed:
        _fail("Lựa chọn không có trong danh mục.")
    return value


_FREE_CHOICE_EXTRA = " '.,&()/–-"


def clean_choice_or_text(value, allowed, label, limit):
    """Giá trị trong danh mục, hoặc do người dùng tự nhập (giống ngựa, màu lông chưa có trong danh mục)."""
    text = " ".join(("" if value is None else str(value)).split())
    if not text:
        _fail(f"Vui lòng chọn hoặc nhập {label.lower()}.")
    if text in allowed:
        return text
    if len(text) > limit:
        _fail(f"{label} vượt quá {limit} ký tự cho phép.")
    if not any(ch.isalpha() for ch in text):
        _fail(f"{label} phải có chữ cái, không chỉ gồm chữ số hoặc ký tự đặc biệt.")
    if not all(ch.isalnum() or unicodedata.category(ch).startswith("M") or ch in _FREE_CHOICE_EXTRA for ch in text):
        _fail(f"{label} chứa ký tự không hợp lệ.")
    return text


def clean_breed(value):
    return clean_choice_or_text(value, BREED_VALUES, "Giống ngựa", 100)


def clean_coat_color(value):
    return clean_choice_or_text(value, COAT_VALUES, "Màu lông", 50)


def clean_birth_date(value, max_age_years=40):
    if value in (None, ""):
        _fail(MSG_REQUIRED)
    if not isinstance(value, _date):
        _fail("Ngày không đúng định dạng dd/mm/yyyy.")
    today = _date.today()
    if value > today:
        _fail("Ngày sinh không được sau ngày hiện tại.")
    if value.year < today.year - max_age_years:
        _fail("Năm sinh không hợp lệ.")
    return value


def _code_text(value):
    raw, text = _required(value)
    if _re.search(r"\s", raw):
        _fail(MSG_CODE["chars"])
    return text


def clean_microchip(value, exclude_horse_id=None, check_unique=True):
    """ISO 11784/11785: 15 chữ số; 3 số đầu là mã quốc gia (704 = Việt Nam) hoặc mã nhà sản xuất 900–998."""
    code = _code_text(value)
    if not code.isdigit():
        _fail(MSG_CODE["chars"])
    if len(code) < 15:
        _fail(MSG_CODE["short"])
    if len(code) > 15:
        _fail(MSG_CODE["long"])
    if code[:3] not in ISO_COUNTRY_NUMERIC and code[:3] not in MANUFACTURER_PREFIX:
        _fail(MSG_CODE["prefix"])
    if check_unique:
        from apps.horses.models import Horse

        if Horse.objects.filter(microchip_number=code).exclude(pk=exclude_horse_id).exists():
            _fail(MSG_CODE["exists"])
    return code


def clean_ueln(value, exclude_horse_id=None, check_unique=True):
    """UELN 15 ký tự: 3 số mã quốc gia nơi cấp + 3 ký tự mã cơ sở dữ liệu + 9 ký tự định danh (chữ in hoa, chữ số)."""
    code = _code_text(value).upper()
    if not _re.fullmatch(r"[A-Z0-9]+", code):
        _fail(MSG_CODE["chars"])
    if len(code) < 15:
        _fail(MSG_CODE["short"])
    if len(code) > 15:
        _fail(MSG_CODE["long"])
    if not code[:3].isdigit():
        _fail(MSG_CODE["structure"])
    if code[:3] not in ISO_COUNTRY_NUMERIC:
        _fail(MSG_CODE["prefix"])
    if check_unique:
        from apps.horses.models import Horse

        if Horse.objects.filter(passport_number=code).exclude(pk=exclude_horse_id).exists():
            _fail(MSG_CODE["exists"])
    return code
