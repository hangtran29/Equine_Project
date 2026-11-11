"""
Dịch nội dung người dùng nhập (ghi chú bác sĩ, kết luận, mô tả triệu chứng, mục tiêu giáo án...) sang tiếng Anh
khi giao diện đang ở chế độ EN.

Thứ tự tra:
1. Tên riêng (người, ngựa, câu lạc bộ) giữ nguyên.
2. Bản dịch sẵn của dữ liệu mẫu (data/content_en.json) và câu thông báo hệ thống (i18n.translate_text).
3. Bộ nhớ đệm các câu đã dịch trước đó (translation_cache.json cạnh manage.py).
4. Câu dài được tách theo dòng / " · " / ": " ... để dịch từng phần.
5. Phần còn lại gửi dịch máy (Google Translate, dự phòng MyMemory), tên riêng được che trước khi gửi.
   Tắt bằng CONTENT_TRANSLATION=false; máy không có mạng thì giữ nguyên tiếng Việt.
"""
import json
import logging
import re
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from django.conf import settings

from .i18n import translate_text

logger = logging.getLogger(__name__)
VI = re.compile(r"[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]", re.I)
SEPARATORS = ["\n", " · ", " / ", ": "]          # tách theo trường
WEAK_SEPARATORS = [", ", "; ", " – "]            # chỉ tách khi mọi phần đều có bản dịch sẵn
SEED = json.loads((Path(__file__).parent / "data" / "content_en.json").read_text(encoding="utf-8"))
_lock = threading.Lock()
_cache = None
_names = {"at": 0, "set": frozenset()}


def _cache_file():
    return Path(getattr(settings, "TRANSLATION_CACHE_FILE", Path(settings.BASE_DIR) / "translation_cache.json"))


def _load_cache():
    global _cache
    if _cache is None:
        try:
            _cache = json.loads(_cache_file().read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _cache = {}
    return _cache


def _save_cache():
    try:
        _cache_file().write_text(json.dumps(_cache, ensure_ascii=False, indent=0), encoding="utf-8")
    except OSError:
        logger.warning("Không ghi được bộ nhớ đệm bản dịch %s", _cache_file())


def proper_names():
    """Tên người, ngựa, câu lạc bộ: không dịch (làm mới mỗi 60 giây)."""
    if time.time() - _names["at"] > 60:
        from apps.accounts.models import Club, User
        from apps.horses.models import Horse

        names = set(User.objects.values_list("full_name", flat=True))
        for row in Horse.objects.values_list("horse_name", "sire_name", "dam_name"):
            names.update(row)
        names.update(Club.objects.values_list("club_name", flat=True))
        _names.update(at=time.time(), set=frozenset(n.strip() for n in names if n and n.strip()))
    return _names["set"]


def _local(text, names):
    """Bản dịch có sẵn, hoặc None nếu cần dịch máy."""
    key = text.strip()
    if key in SEED:
        return SEED[key]
    if not key or not VI.search(key) or key in names:
        return key
    cached = _load_cache().get(key)
    if cached:
        return cached
    system = translate_text(key)
    if system and system != key and not VI.search(system):
        return system
    if len(key) >= 15 and not key.endswith((".", "?", "!")):                  # đoạn bị cắt ngắn trên giao diện
        full = next((k for k in SEED if k.startswith(key) and len(k) > len(key)), None)
        if full:
            english = SEED[full]
            return english[:max(12, round(len(english) * len(key) / len(full)))].rstrip() + "…"
    stem, dot, ext = key.rpartition(".")
    if dot and ext.lower() in ("pdf", "jpg", "jpeg", "png", "webp") and stem:      # tên tệp: "Hộ chiếu Sao Mai.pdf"
        if stem in names:
            return key
        if stem.startswith("Hộ chiếu ") and stem[9:] in names:
            return f"Passport {stem[9:]}.{ext}"
    return None


def _plan(text, names, leaves):
    """Trả hàm ghép bản dịch; các đoạn chưa có bản dịch được thêm vào leaves để dịch máy."""
    found = _local(text, names)
    if found is not None:
        lead, tail = text[:len(text) - len(text.lstrip())], text[len(text.rstrip()):]
        return lambda done: f"{lead}{found}{tail}"
    stripped = text.strip()
    lead = re.match(r"^([·•\-–:\s]+)(.+)$", stripped)                        # "· Hết ho, không cần điều trị."
    if lead:
        rest = _plan(lead[2], names, leaves)
        return lambda done: f"{lead[1]}{rest(done)}"
    prefix = re.match(r"^(Training Lock|Lý do:|Reason:) (.+)$", stripped)     # lý do hủy buổi do khóa tập
    if prefix:
        rest = _plan(prefix[2], names, leaves)
        label = {"Training Lock": "Training lock:", "Lý do:": "Reason:"}.get(prefix[1], prefix[1])
        return lambda done: f"{label} {rest(done)}"
    count = re.match(r"^([\d.,]+) ?([^\s\d]{1,8})$", stripped)                 # "2 chai"
    if count and _local(count[2], names) not in (None, count[2]):
        unit = _local(count[2], names)
        return lambda done: f"{count[1]} {unit}"
    qty = re.match(r"^(.+?) ([\d.,]+) ?([^\s\d]{0,6})$", stripped)          # "Yến mạch 3 kg", "Băng chân 6 cuộn"
    if qty and _local(qty[1], names) is not None:
        head, unit = _local(qty[1], names), (_local(qty[3], names) or qty[3]) if qty[3] else ""
        return lambda done: f"{head} {qty[2]} {unit}".strip()
    paren = re.match(r"^(.+?) \((.+)\)$", stripped)                         # "Cỏ khô 5 kg (Trộn muối khoáng 30 g)"
    if paren:
        left, inner = _plan(paren[1], names, leaves), _plan(paren[2], names, leaves)
        return lambda done: f"{left(done)} ({inner(done)})"
    for sep in SEPARATORS:
        if sep in stripped:
            parts = [_plan(p, names, leaves) for p in text.split(sep)]
            return lambda done: sep.join(p(done) for p in parts)
    for sep in WEAK_SEPARATORS:
        if sep in stripped:
            trial = set()
            parts = [_plan(p, names, trial) for p in stripped.split(sep)]
            if not trial:
                return lambda done: sep.join(p(done) for p in parts)
    leaves.add(text.strip())
    return lambda done: done.get(text.strip(), text)


# ---------------- dịch máy ----------------
def _protect(text, names):
    tokens = {}
    for i, name in enumerate(sorted((n for n in names if n in text and len(n) > 2), key=len, reverse=True)):
        token = f"XQ{i}Z"
        tokens[token] = name
        text = text.replace(name, token)
    return text, tokens


def _google(text):
    url = ("https://translate.googleapis.com/translate_a/single?client=gtx&sl=vi&tl=en&dt=t&q="
           + urllib.parse.quote(text))
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "EquiTrack"}), timeout=4) as res:
        data = json.loads(res.read().decode("utf-8"))
    return "".join(part[0] for part in data[0] if part and part[0])


def _mymemory(text):
    url = "https://api.mymemory.translated.net/get?langpair=vi|en&q=" + urllib.parse.quote(text)
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "EquiTrack"}), timeout=4) as res:
        data = json.loads(res.read().decode("utf-8"))
    return (data.get("responseData") or {}).get("translatedText") or ""


def _machine_one(text, names):
    masked, tokens = _protect(text, names)
    for provider in (_google, _mymemory):
        try:
            out = provider(masked).strip()
        except Exception:  # noqa: BLE001 - mất mạng / bị chặn: thử nhà cung cấp khác
            continue
        if not out:
            continue
        if all(token in out for token in tokens):
            for token, name in tokens.items():
                out = out.replace(token, name)
            return out
    return None


_offline = {"until": 0}
_failed = {}


def machine_translate(texts, names):
    if not texts or not getattr(settings, "CONTENT_TRANSLATION", False) or time.time() < _offline["until"]:
        return {}
    now = time.time()
    texts = [t for t in texts if _failed.get(t, 0) < now][:60]
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda t: _machine_one(t, names), texts))
    done = {t: r for t, r in zip(texts, results) if r}
    for t, r in zip(texts, results):
        if not r:
            _failed[t] = now + 600            # không dịch được: 10 phút sau mới thử lại
    if texts and not done:
        _offline["until"] = now + 300         # có vẻ mất mạng: tạm dừng dịch máy 5 phút
    if done:
        with _lock:
            _load_cache().update(done)
            _save_cache()
    return done


def translate_contents(texts):
    """{"văn bản": "bản dịch"} cho các văn bản dịch được; văn bản không dịch được thì không có trong kết quả."""
    names = proper_names()
    leaves, plans = set(), {}
    for text in texts:
        if isinstance(text, str) and text.strip() and len(text) <= 5000:
            plans[text] = _plan(text, names, leaves)
    done = machine_translate(leaves, names)
    out = {}
    for text, build in plans.items():
        result = build(done)
        if result != text:
            out[text] = result
    return out
