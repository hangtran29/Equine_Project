"""
Tạo bộ dữ liệu thật cho EquiTrack bằng chính API của hệ thống, chạy lùi từng ngày từ 07/09/2026 đến 05/11/2026.
Chạy:  EQUI_DEMO_DB=<file.sqlite3> EQUI_DEMO_MEDIA=<thư mục> python build.py <đường dẫn backend>
"""
import os
from pathlib import Path
import random
import sys
from datetime import date, datetime, time, timedelta

sys.path.insert(0, sys.argv[1])
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings_demo_local"
import django  # noqa: E402

django.setup()

from freezegun import freeze_time  # noqa: E402
from rest_framework.test import APIClient  # noqa: E402
from rest_framework_simplejwt.tokens import RefreshToken  # noqa: E402

from apps.accounts.models import Club, Role, User, UserRole  # noqa: E402
from apps.accounts.rbac import ensure_rbac_seed  # noqa: E402

random.seed(20261105)
START = date(2026, 9, 7)
TODAY = date(2026, 11, 6)
NOW = datetime(2026, 11, 6, 14, 10)
INJURY_DAY = date(2026, 11, 5)     # Hắc Long khập khiễng trong buổi tập sáng 05/11, bị khóa tập
PASSWORD = os.environ.get("EQUI_REAL_PASSWORD", "Equi@2026")


class Clock:
    """Giờ hệ thống giả lập: mọi lệnh gọi API chạy ở thời điểm `at`."""

    def __init__(self):
        self.ctx = None

    def set(self, when):
        if self.ctx:
            self.ctx.stop()
        self.ctx = freeze_time(when)
        self.ctx.start()


clock = Clock()


def at(day, hh=8, mm=0):
    clock.set(datetime.combine(day, time(hh, mm)))


def call(user, method, path, body=None, ok=(200, 201, 204)):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    res = getattr(client, method)(f"/api{path}", body or {}, format="json")
    if res.status_code not in ok:
        raise RuntimeError(f"{method.upper()} {path} -> {res.status_code}: {getattr(res, 'data', res.content)}")
    return res.data


ASSETS = Path(__file__).resolve().parent / "assets"


def upload(user, horse_id, file_name, doc_type, title, content_type):
    """Tải ảnh / giấy tờ của ngựa qua API thật (multipart)."""
    from django.core.files.uploadedfile import SimpleUploadedFile

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    f = SimpleUploadedFile(title, (ASSETS / file_name).read_bytes(), content_type=content_type)
    res = client.post(f"/api/horses/{horse_id}/documents", {"File": f, "DocumentType": doc_type, "DocumentName": title},
                      format="multipart")
    if res.status_code not in (200, 201):
        raise RuntimeError(f"upload {horse_id} -> {res.status_code}: {res.data}")


# ------------------------------------------------------------------ người dùng
CLUB = dict(club_name="Câu lạc bộ Đua ngựa Equi", address="120 Lê Đại Hành, Phường 7, Quận 11, TP. Hồ Chí Minh",
            phone="02838551234", email="lienhe@equi.com", status="Active")
STAFF = [  # email, họ tên, vai trò, sđt, địa chỉ
    ("khoa.mn", "Nguyễn Minh Khoa", "CLUB_MANAGER", "0903125478", "45 Nguyễn Thị Minh Khai, Quận 1"),
    ("phuc.hd", "Lê Hoàng Phúc", "HEAD_TRAINER", "0912346870", "18 Võ Văn Tần, Quận 3"),
    ("nghia.hd", "Trương Văn Nghĩa", "HEAD_TRAINER", "0913572046", "72 Lý Thường Kiệt, Quận 10"),
    ("bao.tn", "Phạm Quốc Bảo", "TRAINER", "0938452116", "9 Trần Quang Khải, Quận 1"),
    ("mai.tn", "Huỳnh Thị Mai", "TRAINER", "0939264851", "31 Phan Xích Long, Phú Nhuận"),
    ("vinh.tn", "Đặng Quang Vinh", "TRAINER", "0936807193", "204 Cộng Hòa, Tân Bình"),
    ("ngoc.tn", "Trần Bảo Ngọc", "TRAINER", "0932174508", "56 Nguyễn Văn Đậu, Bình Thạnh"),
    ("tung.wr", "Võ Thanh Tùng", "WORK_RIDER", "0977215348", "14 Âu Cơ, Tân Phú"),
    ("bao.wr", "Lâm Gia Bảo", "WORK_RIDER", "0978346120", "88 Hậu Giang, Quận 6"),
    ("anh.wr", "Phan Ngọc Ánh", "WORK_RIDER", "0976518243", "33 Bà Hom, Quận 6"),
    ("duc.wr", "Châu Minh Đức", "WORK_RIDER", "0975630418", "120 Kinh Dương Vương, Bình Tân"),
    ("ha.vt", "Trần Thu Hà", "VETERINARIAN", "0908663192", "27 Nguyễn Trãi, Quận 5"),
    ("tuan.vt", "Ngô Minh Tuấn", "VETERINARIAN", "0935718264", "61 Lạc Long Quân, Quận 11"),
    ("thu.vt", "Lê Thị Thu", "VETERINARIAN", "0907123456", "15 Ba Tháng Hai, Quận 10"),
    ("loc.gr", "Đỗ Văn Lộc", "GROOM", "0962781405", "40 Tân Hóa, Quận 11"),
    ("tai.gr", "Nguyễn Văn Tài", "GROOM", "0963158027", "7 Lò Siêu, Quận 11"),
    ("hanh.gr", "Bùi Thị Hạnh", "GROOM", "0964902317", "92 Minh Phụng, Quận 6"),
    ("sang.gr", "Hồ Văn Sang", "GROOM", "0965281734", "11 Hòa Bình, Tân Phú"),
    ("thao.gr", "Mai Thị Thảo", "GROOM", "0966473915", "58 Phú Thọ Hòa, Tân Phú"),
    ("huy.own", "Hoàng Gia Huy", "HORSE_OWNER", "0918034567", "86 Nguyễn Văn Trỗi, Phú Nhuận"),
    ("son.own", "Lý Thanh Sơn", "HORSE_OWNER", "0909123456", "12 Pasteur, Quận 1"),
    ("diep.own", "Trịnh Ngọc Diệp", "HORSE_OWNER", "0917465230", "140 Điện Biên Phủ, Bình Thạnh"),
    ("tung.own", "Phạm Thanh Tùng", "HORSE_OWNER", "0903226718", "12 Lê Lợi, Quận 1"),
    ("thinh.own", "Võ Đức Thịnh", "HORSE_OWNER", "0977450321", "25 Hoàng Văn Thụ, Tân Bình"),
    ("duyen.own", "Lý Mỹ Duyên", "HORSE_OWNER", "0938112054", "9 Nguyễn Huệ, Quận 1"),
]
U = {}

at(START, 7, 30)
ensure_rbac_seed()
from apps.training.models import Specialization  # noqa: E402

SPEC = {}
for code, name in (("FLAT_RACING", "Flat Racing"), ("STEEPLECHASE_HURDLE", "Steeplechase / Hurdle Racing"),
                   ("HARNESS_RACING", "Harness Racing"), ("ENDURANCE", "Endurance / Long-distance Racing"),
                   ("OTHER", "Other")):
    SPEC[code] = Specialization.objects.get_or_create(code=code, defaults={"name": name})[0]
club = Club.objects.create(**CLUB)
for key, name, role, phone, addr in STAFF:
    user = User.objects.create_user(email=f"{key}@equi.com", password=PASSWORD, full_name=name, club=club,
                                    phone=phone, address=addr)
    UserRole.objects.create(user=user, role=Role.objects.get(code=role))
    User.objects.filter(pk=user.pk).update(date_joined=datetime(2026, 9, 7, 7, 30)) if hasattr(user, "date_joined") else None
    U[key] = user
M, HD1, HD2 = U["khoa.mn"], U["phuc.hd"], U["nghia.hd"]
VETS = [U["ha.vt"], U["tuan.vt"], U["thu.vt"]]
RIDERS = [U["tung.wr"], U["bao.wr"], U["anh.wr"], U["duc.wr"]]

# ------------------------------------------------------------------ chuồng, kho
STALL = {}
for zone in "ABCD":
    for n in range(1, 7):
        number = f"{zone}-{n:02d}"
        kind = "Chuồng cách ly" if zone == "D" and n >= 5 else ("Chuồng đôi" if zone == "C" and n == 6 else "Chuồng đơn")
        STALL[number] = call(M, "post", "/stalls", {"StallNumber": number, "StallType": kind})["StallID"]

ITEMS = {}
for name, kind, unit, qty, minimum in (
        ("Yến mạch", "Food", "kg", 650, 100), ("Cỏ khô", "Food", "kg", 1400, 200), ("Cám viên", "Food", "kg", 380, 80),
        ("Muối khoáng", "Food", "kg", 20, 10), ("Cà rốt", "Food", "kg", 90, 20), ("Thuốc sát trùng", "Medicine", "chai", 16, 5),
        ("Thuốc kháng viêm", "Medicine", "hộp", 8, 3), ("Băng chân", "Care Equipment", "cuộn", 50, 10),
        ("Bàn chải lông", "Care Equipment", "cái", 18, 5), ("Dầu dưỡng móng", "Care Equipment", "chai", 12, 4)):
    ITEMS[name] = call(M, "post", "/inventory-items", {"ItemName": name, "ItemType": kind, "Unit": unit,
                                                       "Quantity": qty, "MinimumQuantity": minimum})["InventoryItemID"]

# ------------------------------------------------------------------ hồ sơ huấn luyện viên
TRAINER_INFO = [  # user, chuyên môn, ngày bắt đầu, điểm, bằng cấp
    (U["bao.tn"], ["FLAT_RACING"], date(2013, 6, 1), 4.6, [("License", "Giấy phép huấn luyện ngựa đua hạng A", "Hội đồng Đua ngựa", date(2014, 10, 3)),
                                                            ("Certificate", "Chứng chỉ Dinh dưỡng và Thể lực ngựa đua", "Equi Racing Academy", date(2016, 9, 5)),
                                                            ("Award", "Huấn luyện viên xuất sắc mùa giải 2024", "Câu lạc bộ Đua ngựa Equi", date(2024, 12, 20))]),
    (U["mai.tn"], ["FLAT_RACING"], date(2019, 2, 10), 4.3, [("License", "Giấy phép huấn luyện ngựa đua hạng B", "Hội đồng Đua ngựa", date(2019, 11, 12))]),
    (U["vinh.tn"], ["ENDURANCE", "FLAT_RACING"], date(2020, 8, 5), 4.1, [("Certificate", "Chứng chỉ huấn luyện sức bền", "Equi Racing Academy", date(2021, 4, 18))]),
    (U["ngoc.tn"], ["STEEPLECHASE_HURDLE"], date(2021, 1, 20), 4.0, [("License", "Giấy phép huấn luyện ngựa đua hạng B", "Hội đồng Đua ngựa", date(2021, 12, 1))]),
]
for user, specs, career, rating, creds in TRAINER_INFO:
    for code in specs:
        call(HD1, "post", f"/trainers/{user.id}/specializations", {"SpecializationID": SPEC[code].id})
    call(HD1, "patch", f"/trainers/{user.id}/profile", {"CareerStartDate": career.isoformat(), "TrainerRating": rating})
    for kind, title, by, issued in creds:
        call(HD1, "post", f"/trainers/{user.id}/credentials",
             {"CredentialType": kind, "Title": title, "IssuedBy": by, "IssuedDate": issued.isoformat()})
RACES = ["Cúp Mùa Xuân", "Cúp Phú Thọ", "Giải Đua Đường Bằng Mở Rộng", "Cúp Hội Ngộ", "Giải Mùa Thu", "Cúp Sông Sài Gòn"]
for user, *_ in TRAINER_INFO:
    for i in range(random.randint(4, 9)):
        d = date(2025, 1, 10) + timedelta(days=random.randint(0, 560))
        field = random.randint(8, 14)
        call(HD1, "post", f"/trainers/{user.id}/race-results", {
            "RaceDate": d.isoformat(), "RaceName": f"{random.choice(RACES)} {d.year}", "RaceClass": random.choice(["Group", "Listed", "Handicap", "Other"]),
            "HorseName": random.choice(["Ánh Dương", "Phong Vân", "Thiết Mã", "Bạch Mã", "Kim Phượng", "Hải Âu"]),
            "FinishPosition": random.choice([1, 1, 2, 3, 4, 5, 6]), "FieldSize": field}, ok=(200, 201, 400))

# ------------------------------------------------------------------ lịch trực bác sĩ (cả giai đoạn + 2 tuần tới)
SHIFTS = ["Morning", "Afternoon", "Night"]
d = START
while d <= TODAY + timedelta(days=13):
    for i, shift in enumerate(SHIFTS):
        vet = VETS[(d.toordinal() + i) % 3]
        call(M, "post", "/vet-duty-shifts", {"VetID": vet.id, "DutyDate": d.isoformat(), "Shift": shift})
    d += timedelta(days=1)
print("setup ok")

# ------------------------------------------------------------------ ngựa (Flow 1)
HORSES = [
    # tên, chủ, giống, ngày sinh, giới tính, màu lông, bố, mẹ, ngày tạo, đích, chuồng, groom, trainer, chuyên môn, cân, cao, sk khai, tiền sử
    ("Sao Mai", "huy.own", "Thoroughbred", "2021-03-12", "Female", "Nâu đỏ", "Northern Ridge", "Morning Dew", date(2026, 9, 8), "Approved", "A-01", "loc.gr", "bao.tn", "FLAT_RACING", 465, 162, "Khỏe mạnh, ăn uống bình thường.", ""),
    ("Gió Bấc", "huy.own", "Thoroughbred", "2019-05-02", "Male", "Hạt dẻ", "Silver Gale", "River Song", date(2026, 9, 8), "Approved", "A-02", "loc.gr", "mai.tn", "FLAT_RACING", 498, 165, "Khỏe mạnh.", "Viêm gân chân sau phải năm 2024, đã hồi phục."),
    ("Hắc Long", "son.own", "Arabian", "2018-09-20", "Gelding", "Đen", "Desert Shadow", "Night Lily", date(2026, 9, 9), "Approved", "B-03", "tai.gr", "bao.tn", "FLAT_RACING", 452, 152, "Khỏe mạnh.", "Bong gân cổ chân trước năm 2023."),
    ("Tia Chớp", "son.own", "Quarter Horse", "2020-07-08", "Male", "Nâu", "Thunder Road", "Prairie Rose", date(2026, 9, 9), "Approved", "B-01", "tai.gr", "vinh.tn", "ENDURANCE", 510, 155, "Khỏe mạnh.", ""),
    ("Hoàng Kim", "diep.own", "Thoroughbred", "2022-04-30", "Male", "Vàng", "Golden Era", "Sunny Bay", date(2026, 9, 10), "Approved", "B-02", "hanh.gr", "ngoc.tn", "STEEPLECHASE_HURDLE", 470, 163, "Khỏe mạnh.", ""),
    ("Thanh Long", "diep.own", "Thoroughbred", "2020-11-11", "Male", "Nâu sẫm", "Dark Harbor", "Jade Lake", date(2026, 9, 10), "Approved", "C-01", "sang.gr", "mai.tn", "FLAT_RACING", 488, 164, "Khỏe mạnh.", ""),
    ("Ngân Hà", "tung.own", "Arabian", "2021-06-06", "Female", "Xám", "Star Dust", "Milky Way", date(2026, 9, 11), "Approved", "C-02", "sang.gr", "vinh.tn", "ENDURANCE", 430, 150, "Khỏe mạnh.", ""),
    ("Phi Vân", "thinh.own", "Standardbred", "2019-02-25", "Gelding", "Nâu đỏ", "Swift Cloud", "Rainy Day", date(2026, 9, 11), "Approved", "C-03", "thao.gr", "bao.tn", "FLAT_RACING", 476, 158, "Khỏe mạnh.", "Đau bụng nhẹ năm 2025, đã điều trị."),
    ("Hồng Ngọc", "duyen.own", "Thoroughbred", "2021-08-14", "Female", "Hạt dẻ", "Ruby Crown", "Rose Garden", date(2026, 9, 12), "Approved", "C-04", "thao.gr", "ngoc.tn", "STEEPLECHASE_HURDLE", 455, 160, "Khỏe mạnh.", ""),
    ("Lục Bảo", "diep.own", "Thoroughbred", "2016-05-09", "Male", "Hạt dẻ", "Emerald Isle", "Green Valley", date(2026, 9, 8), "Archived", "A-04", "hanh.gr", None, None, 502, 166, "Khỏe mạnh.", ""),
    ("Hắc Phong", "thinh.own", "Quarter Horse", "2020-07-05", "Gelding", "Đen", "Black Wind", "Midnight Rose", date(2026, 10, 20), "Rejected", None, None, None, None, 468, 150, "Đi lại hơi khập khiễng chân sau.", "Từng chấn thương chân sau phải."),
    ("Gió Nam", "son.own", "Standardbred", "2023-09-21", "Female", "Nâu đỏ", "South Breeze", "Summer Rain", date(2026, 11, 1), "Draft", None, None, None, None, 0, 0, "", ""),
    ("Bạch Vân", "huy.own", "Arabian", "2022-01-15", "Female", "Trắng xám", "White Falcon", "Cloud Dancer", date(2026, 11, 2), "Approved", "A-03", "hanh.gr", None, None, 412, 152, "Khỏe mạnh, ăn uống bình thường.", "Viêm gân chân trước trái năm 2024, đã hồi phục."),
    ("Kim Ngưu", "duyen.own", "Thoroughbred", "2022-03-03", "Male", "Nâu", "Taurus Gold", "Field Lady", date(2026, 11, 3), "PendingExam", None, None, None, None, 0, 0, "Khỏe mạnh.", ""),
    ("Tuyết Sơn", "tung.own", "Arabian", "2022-12-19", "Female", "Trắng", "Snow Peak", "Silver Mist", date(2026, 11, 4), "Submitted", None, None, None, None, 0, 0, "Khỏe mạnh.", ""),
]
H = {}        # tên -> dict(id, ...)
codes = 0
for i, (name, owner, breed, dob, sex, coat, sire, dam, created, target, stall, groom, trainer, spec, kg, cm, decl, hist) in enumerate(HORSES, start=1):
    o = U[owner]
    at(created, 9, 15 + i)
    body = {"ClubID": club.id, "HorseName": name, "Breed": breed, "DateOfBirth": dob, "Gender": sex, "CoatColor": coat,
            "SireName": sire, "DamName": dam, "MicrochipNumber": f"98514100012{3400 + i}",
            "PassportNumber": f"704EQI{dob[:4]}{400 + i:05d}",   # UELN 15 ký tự: 704 (Việt Nam) + EQI + 9 ký tự "DeclaredHealth": decl or None,
            "MedicalHistory": hist or None}
    hid = call(o, "post", "/horses", body)["HorseID"]
    upload(o, hid, "horse1.jpg" if i % 2 else "horse2.jpg", "Other", f"{name}.jpg", "image/jpeg")
    upload(o, hid, "ho-chieu.pdf", "Passport", f"Hộ chiếu {name}.pdf", "application/pdf")
    H[name] = dict(id=hid, owner=o, stall=stall, groom=groom, trainer=trainer, spec=spec, target=target, created=created)
    if target == "Draft":
        continue
    call(o, "post", f"/horses/{hid}/submit")
    if target == "Submitted":
        continue
    at(created + timedelta(days=1), 10, 2)
    call(M, "post", f"/horses/{hid}/verify")
    if target == "PendingExam":
        continue
    vet = VETS[i % 3]
    at(created + timedelta(days=2), 9, 30)
    fail = target == "Rejected"
    rec = call(vet, "post", f"/horses/{hid}/medical-records", {
        "ExamType": "Initial Exam", "WeightKg": kg, "HeightCm": cm,
        "BodyTemperatureC": 38.6 if fail else round(random.uniform(37.4, 38.0), 1),
        "HeartRateBpm": random.randint(32, 40), "RespiratoryRate": random.randint(10, 14),
        "Symptoms": "Què chân sau phải" if fail else "Không phát hiện bất thường",
        "Diagnosis": "Nghi tổn thương dây chằng treo chân sau phải" if fail else "Bình thường",
        "HealthStatus": "Injured" if fail else "Healthy", "TrainingEligibility": "Not Eligible" if fail else "Eligible",
        "Conclusion": ("Què chân sau phải độ 3/5, nghi tổn thương dây chằng treo. Cần điều trị trước khi xem xét tiếp nhận."
                       if fail else "Thể trạng tốt, tim phổi bình thường, đạt yêu cầu tiếp nhận.")})
    at(created + timedelta(days=2), 11, 26)
    call(vet, "post", f"/medical-records/{rec['MedicalRecordID']}/sign")
    at(created + timedelta(days=3), 13, 48) if not name == "Bạch Vân" else at(date(2026, 11, 4), 13, 48)
    if fail:
        call(M, "post", f"/horses/{hid}/reject", {"Reason": "Kết quả khám lâm sàng không đạt: què chân sau phải độ 3/5. "
                                                             "Chủ ngựa có thể gửi lại hồ sơ sau khi ngựa được điều trị."})
        continue
    codes += 1
    call(M, "post", f"/horses/{hid}/approve", {"HorseCode": f"EQ-{codes:03d}", "StallID": STALL[stall],
                                               "GroomID": U[groom].id})
print("flow 1 ok", len(H))

# Bạch Vân được tạo / gửi / duyệt trong tháng 11 nhưng vòng lặp trên dùng created+n; chỉnh mốc cho đúng câu chuyện
APPROVED = [n for n, h in H.items() if h["target"] == "Approved"]
TRAINED = [n for n in APPROVED if H[n]["trainer"]]

# ------------------------------------------------------------------ đánh giá, phân công, giáo án (Flow 2)
PLANS = {}
for n in TRAINED:
    h = H[n]
    day = h["created"] + timedelta(days=5)
    at(day, 9, 0)
    call(HD1, "post", f"/horses/{h['id']}/assessments", {"SpecializationID": SPEC[h["spec"]].id,
                                                          "QualityScore": random.randint(76, 90), "FitnessLevel": "Good",
                                                          "AssessmentNote": "Sải chân ổn định, nhịp tim hồi phục tốt."})
    at(day, 10, 0)
    call(HD1, "post", "/trainer-assignments", {"HorseID": h["id"], "TrainerID": U[h["trainer"]].id,
                                               "SpecializationID": SPEC[h["spec"]].id})
    start = day + timedelta(days=3)
    s1_end = start + timedelta(days=27)
    s2_end = s1_end + timedelta(days=33)
    end = s2_end + timedelta(days=30)
    at(day + timedelta(days=1), 10, 0)
    plan = call(U[h["trainer"]], "post", "/training-plans", {
        "HorseID": h["id"], "Goal": {"FLAT_RACING": "Chuẩn bị Cúp Mùa Đông (đua đường bằng 1.600 m)",
                                    "ENDURANCE": "Nâng sức bền cự ly 20 km cho mùa giải đường trường",
                                    "STEEPLECHASE_HURDLE": "Hoàn thiện kỹ thuật vượt rào 1.200 m"}[h["spec"]],
        "StartDate": start.isoformat(), "EndDate": end.isoformat(), "OverallIntensity": "Moderate",
        "Note": "Theo dõi nhịp tim sau mỗi buổi tập cường độ cao.",
        "Stages": [
            {"StageName": "Nền tảng", "StartDate": start.isoformat(), "EndDate": s1_end.isoformat(), "Intensity": "Low",
             "TrainingLoad": 30, "DistanceTargetKm": 25, "Surface": "Sân cỏ", "Goal": "Làm quen sân, xây nền thể lực."},
            {"StageName": "Tăng sức bền", "StartDate": (s1_end + timedelta(days=1)).isoformat(), "EndDate": s2_end.isoformat(),
             "Intensity": "Moderate", "TrainingLoad": 50, "DistanceTargetKm": 90, "Surface": "Sân cỏ",
             "Goal": "Tăng quãng đường lên 6 km mỗi buổi."},
            {"StageName": "Tăng tốc", "StartDate": (s2_end + timedelta(days=1)).isoformat(), "EndDate": end.isoformat(),
             "Intensity": "High", "TrainingLoad": 70, "DistanceTargetKm": 60, "Surface": "Cát, đường đất",
             "Goal": "Luyện nước rút 400 m cuối, giữ nhịp tim dưới 200 lần/phút."}]})
    call(U[h["trainer"]], "post", f"/training-plans/{plan['TrainingPlanID']}/submit")
    at(day + timedelta(days=2), 9, 0)
    approved = call(HD1, "post", f"/training-plans/{plan['TrainingPlanID']}/approve",
                    {"ReviewNote": "Đồng ý, theo dõi nhịp tim sau mỗi buổi tập tăng tốc."})
    PLANS[n] = dict(id=plan["TrainingPlanID"], stages=[s["TrainingPlanStageID"] for s in approved["Stages"]],
                    ranges=[(start, s1_end), (s1_end + timedelta(days=1), s2_end), (s2_end + timedelta(days=1), end)])
print("flow 2 plans ok", len(PLANS))

# ------------------------------------------------------------------ Flow 3, 4 chuẩn bị: khẩu phần, tiêm phòng
MEALS = [{"MealTime": "05:30", "FeedType": "Yến mạch", "Quantity": 3, "Unit": "kg"},
         {"MealTime": "11:30", "FeedType": "Cỏ khô", "Quantity": 4, "Unit": "kg"},
         {"MealTime": "17:30", "FeedType": "Cỏ khô", "Quantity": 5, "Unit": "kg", "Note": "Trộn muối khoáng 30 g"},
         {"MealTime": "21:00", "FeedType": "Cám viên", "Quantity": 1.5, "Unit": "kg"}]
DIET_DAY = {}
for n in APPROVED:
    h = H[n]
    first = date(2026, 11, 4) if n == "Bạch Vân" else h["created"] + timedelta(days=4)
    at(first, 15, 0)
    plan = call(HD1, "post", f"/horses/{h['id']}/diet-plans", {
        "DietDescription": "Khẩu phần nền tảng: đủ năng lượng cho giai đoạn làm quen sân.", "StartDate": first.isoformat(),
        "Meals": MEALS})
    at(first, 15, 20)
    call(HD1, "post", f"/diet-plans/{plan['DietPlanID']}/approve", {})
    DIET_DAY[n] = first
    h["diet"] = plan["DietPlanID"]

# ------------------------------------------------------------------ chạy từng ngày
DAYS_OF = {  # thứ trong tuần (0 = thứ Hai) ngựa được xếp tập
    "Sao Mai": (0, 2, 4), "Gió Bấc": (0, 2, 4), "Hắc Long": (1, 3, 5), "Tia Chớp": (1, 3, 5),
    "Hoàng Kim": (0, 2, 4), "Thanh Long": (1, 3, 5), "Ngân Hà": (0, 2, 4), "Phi Vân": (1, 3, 5), "Hồng Ngọc": (1, 3, 5)}
SLOTS = [(6, 0), (7, 10), (15, 30), (16, 40), (8, 20)]
SESSIONS = {}      # id -> info
LOCK = {}          # tên ngựa -> (mức, tải tối đa, từ, đến)
CREATED_WEEKS = set()


def stage_of(n, d):
    for idx, (a, b) in enumerate(PLANS[n]["ranges"]):
        if a <= d <= b:
            return idx
    return None


def create_week(monday):
    """Huấn luyện viên trưởng xếp lịch tập cả tuần vào sáng thứ Hai."""
    at(monday, 8, 0)
    for offset in range(7):
        d = monday + timedelta(days=offset)
        if d < START or d.weekday() == 6:
            continue
        horses = [n for n in TRAINED if d.weekday() in DAYS_OF[n] and stage_of(n, d) is not None]
        for slot, n in enumerate(horses):
            lock = LOCK.get(n)
            if lock and lock[2] <= d <= lock[3] and lock[0] == "Full":
                continue
            st = stage_of(n, d)
            hh, mm = SLOTS[slot % len(SLOTS)]
            gallop = st == 1 and d.weekday() in (4, 5)
            load = [28, 48, 65][st] - (0 if not gallop else -2)
            if lock and lock[2] <= d <= lock[3]:
                load = min(load, lock[1])
            dist = [3.5, 5.5, 4][st] if not gallop else 3
            body = {"TrainingPlanStageID": PLANS[n]["stages"][st], "WorkRiderID": RIDERS[slot % 4].id,
                    "SessionDate": d.isoformat(), "StartTime": f"{hh:02d}:{mm:02d}",
                    "TrainingType": "Phi nước đại" if gallop else "Phi nước kiệu",
                    "DurationPlannedMinutes": 45, "DistancePlannedKm": dist, "TargetSpeedKmh": 42 if gallop else 38,
                    "TrainingLoad": load, "Surface": "Sân cỏ", "Location": "Đường đua số 2" if slot % 2 else "Đường đua số 1",
                    "Instructions": "Khởi động 10 phút, 2 lượt phi nước đại 1.500 m, nghỉ 5 phút giữa hai lượt." if gallop
                    else "Khởi động 10 phút, giữ nhịp đều, tăng tốc nhẹ ở 1.000 m cuối."}
            head = HD2 if H[n]["spec"] == "STEEPLECHASE_HURDLE" else HD1
            res = call(head, "post", "/training-sessions", body, ok=(201, 400, 409))
            if "TrainingSessionID" not in res:
                print("  bỏ buổi", n, d, res)
                continue
            SESSIONS[res["TrainingSessionID"]] = dict(horse=n, day=d, start=(hh, mm), rider=RIDERS[slot % 4], stage=st,
                                                      load=load, gallop=gallop, trainer=U[H[n]["trainer"]])


EARLY_DONE = set()


def run_session(sid, info, review=True):
    d, (hh, mm) = info["day"], info["start"]
    rider, n = info["rider"], info["horse"]
    roll = random.random() if d < TODAY - timedelta(days=1) else 1
    if roll < 0.03:               # mưa lớn: huấn luyện viên trưởng hủy buổi tập từ sáng sớm
        at(d, 5, 15)
        call(HD1, "post", f"/training-sessions/{sid}/cancel", {"Reason": "Mưa lớn, đường đua ngập nước."})
        return
    if roll < 0.055:              # kỵ sĩ vắng
        at(d + timedelta(days=1), 7, 0)
        call(HD1, "post", f"/training-sessions/{sid}/missed", {"Reason": "Kỵ sĩ báo ốm đột xuất."}, ok=(200, 400))
        return
    at(d, hh, mm + 2 if mm < 57 else mm)
    call(rider, "post", f"/training-sessions/{sid}/start")
    progress = (d - START).days / 60
    if n in ("Ngân Hà", "Thanh Long") and d >= date(2026, 10, 20) and n not in EARLY_DONE:
        EARLY_DONE.add(n)         # kết thúc sớm: ngựa mệt, kỵ sĩ cho đi bộ thả lỏng
        end = datetime.combine(d, time(hh, mm)) + timedelta(minutes=28)
        clock.set(end)
        call(rider, "post", f"/training-sessions/{sid}/result", {
            "ActualDurationMinutes": 28, "ActualDistanceKm": 2.1, "AvgSpeedKmh": round(33 + 3 * progress, 1),
            "MaxSpeedKmh": round(44 + 3 * progress, 1), "AvgHeartRate": random.randint(150, 160), "MaxHeartRate": random.randint(196, 205),
            "RecoveryMinutes": random.randint(16, 20), "PerformanceScore": round(min(56 + 10 * progress, 70)),
            "RiderObservation": "Ngựa hụt hơi sớm, đã cho đi bộ thả lỏng và báo huấn luyện viên.",
            "EarlyEndReason": "Fatigue", "EarlyEndNote": "Ngựa thở gấp và chậm lại rõ sau khoảng 2 km.",
            "EndTime": end.strftime("%H:%M")})
        if review:
            clock.set(datetime.combine(d, time(17, 40)))
            call(info["trainer"], "post", f"/training-sessions/{sid}/review", {
                "Evaluation": "Needs Improvement", "TrainerComment": "Giảm cường độ buổi kế tiếp, theo dõi nhịp tim hồi phục."})
        return
    base = 66 + 18 * progress + random.uniform(-4, 4)
    dist = [3.5, 5.5, 4][info["stage"]] if not info["gallop"] else 3
    end = datetime.combine(d, time(hh, mm)) + timedelta(minutes=46)
    clock.set(end)
    call(rider, "post", f"/training-sessions/{sid}/result", {
        "ActualDurationMinutes": 46, "ActualDistanceKm": round(dist + random.uniform(-0.3, 0.2), 1),
        "AvgSpeedKmh": round(36 + 4 * progress + random.uniform(-1, 1), 1), "MaxSpeedKmh": round(48 + 4 * progress + random.uniform(-1.5, 1.5), 1),
        "AvgHeartRate": random.randint(142, 156), "MaxHeartRate": random.randint(188, 202), "RecoveryMinutes": random.randint(10, 15),
        "PerformanceScore": round(min(base, 95)), "RiderObservation": random.choice([
            "Ngựa hợp tác tốt, giữ nhịp đều cả buổi.", "Ngựa hơi nặng chân ở 800 m cuối.", "Ngựa phản ứng nhanh với hiệu lệnh, thở đều.",
            "Ngựa hơi nóng vội lúc khởi động, sau đó ổn định."])})
    if not review:
        return
    clock.set(datetime.combine(d, time(17, 30)) + timedelta(minutes=random.randint(0, 50)))
    score = round(min(base, 95))
    evaluation = "Excellent" if score >= 82 else "Good" if score >= 72 else "Average"
    adjust = random.random() < 0.04
    if adjust:
        rating, comment, note = random.choice(ADJUSTMENTS)
    else:
        rating, note = evaluation, None
        comment = random.choice(["Ngựa đạt tốc độ mục tiêu, hồi phục tốt.", "Sải chân ổn định, giữ nguyên cường độ cho buổi tiếp theo.",
                                 "Tiến bộ rõ so với tuần trước.", "Cần chú ý khởi động kỹ hơn trước khi tăng tốc."])
    call(info["trainer"], "post", f"/training-sessions/{sid}/review", {
        "Evaluation": rating, "TrainerComment": comment, "AdjustmentRequired": adjust, "AdjustmentNote": note})


# Đánh giá kèm đề xuất điều chỉnh giáo án (mức đánh giá, nhận xét, nội dung cần điều chỉnh)
ADJUSTMENTS = [
    ("Needs Improvement", "Ngựa hụt hơi ở 800 m cuối, nhịp tim hồi phục chậm hơn các buổi trước.",
     "Giảm mức tải giai đoạn hiện tại khoảng 10 điểm trong một tuần, thêm 1 buổi nghỉ chủ động."),
    ("Good", "Ngựa đạt tốc độ mục tiêu sớm hơn dự kiến, hồi phục dưới 11 phút.",
     "Rút ngắn giai đoạn nền tảng 1 tuần để chuyển sang giai đoạn tăng sức bền."),
    ("Average", "Ngựa nóng vội ở ô xuất phát, mất nhịp trong 400 m đầu.",
     "Bổ sung 2 buổi tập ô xuất phát mỗi tuần, giảm cự ly phi nước đại xuống 1.200 m."),
    ("Needs Improvement", "Chân trước trái hơi nặng sau buổi tập trên đường đất.",
     "Chuyển các buổi phi nước kiệu dài sang sân cỏ trong 2 tuần, theo dõi chân trước trái sau mỗi buổi."),
    ("Good", "Sức bền cải thiện rõ, nhịp tim ổn định ở cự ly dài.",
     "Tăng quãng đường mục tiêu của giai đoạn thêm 10 km, giữ nguyên cường độ."),
]


def complete_tasks(d, until=None):
    from apps.care.models import CareTask

    for t in CareTask.objects.filter(scheduled_at__date=d, status="Pending").select_related("groom").order_by("scheduled_at"):
        if t.groom is None:
            continue
        if until and t.scheduled_at.time() >= until:
            continue
        if until and t.scheduled_at.time() == time(7, 20) and d == TODAY:
            continue                     # để lại một việc quá giờ hôm nay
        clock.set(t.scheduled_at + timedelta(minutes=random.randint(6, 28)))
        if random.random() < 0.02:
            call(t.groom, "post", f"/care-tasks/{t.id}/skip", {"Reason": "Ngựa đang được bác sĩ thú y khám, chưa làm được."})
        else:
            call(t.groom, "post", f"/care-tasks/{t.id}/complete", {
                "Note": random.choice(["", "", "Ngựa ăn hết khẩu phần.", "Đã làm xong."]),
                **({"FeedingOutcome": "All"} if t.task_type == "Feeding" else {}),
            })


def lock_horse(n, vet, day, hh, mm, kind, reason, level, max_load, until, report_from=None, severity="Normal",
               description=None, session=None, location=None, treatments=(), follow_up=None):
    h = H[n]
    report = None
    if report_from:
        at(day, hh, mm)
        body = {"Severity": severity, "Description": description}
        if session:
            body["TrainingSessionID"] = session
        report = call(report_from, "post", f"/horses/{h['id']}/health-reports", body)
        at(day, hh, mm + 12)
        call(vet, "post", f"/health-reports/{report['HealthReportID']}/take")
    at(day, hh + 1, mm)
    rec = call(vet, "post", f"/horses/{h['id']}/medical-records", {
        "ExamType": kind, "HealthReportID": report["HealthReportID"] if report else None,
        "WeightKg": 470, "HeightCm": 158, "BodyTemperatureC": 38.4 if level == "Full" else 37.9,
        "HeartRateBpm": 48 if level == "Full" else 40, "RespiratoryRate": 16 if level == "Full" else 14,
        "InjuryLocation": location, "FollowUpDate": follow_up.isoformat() if follow_up else None,
        "TreatmentPlan": "; ".join(t["MedicineName"] for t in treatments) or None,
        "Symptoms": description or reason, "Diagnosis": reason,
        "HealthStatus": "Injured" if level == "Full" else "Monitor",
        "TrainingEligibility": "Not Eligible" if level == "Full" else "Restricted",
        "RestrictionNote": None if level == "Full" else f"Chỉ tập nhẹ, mức tải tối đa {max_load}.",
        "Conclusion": f"{reason}. {'Nghỉ tập hoàn toàn' if level == 'Full' else 'Tập nhẹ'} đến {until.strftime('%d/%m/%Y')}, chườm lạnh 2 lần mỗi ngày."})
    lock = {"Reason": reason, "LockLevel": level, "LockEndDate": f"{until.isoformat()}T18:00:00",
            "Details": "Tái khám trước khi mở khóa."}
    if level == "Restricted":
        lock["MaxIntensity"] = max_load
    for t in treatments:
        call(vet, "post", f"/medical-records/{rec['MedicalRecordID']}/treatments", t)
    call(vet, "post", f"/medical-records/{rec['MedicalRecordID']}/sign", {"TrainingLock": lock})
    if follow_up:
        call(vet, "post", f"/horses/{h['id']}/medical-schedules", {"ScheduleType": "Routine Examination",
             "ScheduledDate": follow_up.isoformat(), "Note": f"Tái khám {location.split(' · ')[1] if location and ' · ' in location else ''}, theo phiếu khám ngày {day.strftime('%d/%m')}".strip()})
    LOCK[n] = (level, max_load, day, until)
    return report, rec


d = min(r[0] for p in PLANS.values() for r in p["ranges"][:1]) - timedelta(days=1)
first_session_day = d
day = START
while day <= TODAY:
    # việc chăm sóc trong ngày (khi đã có khẩu phần)
    at(day, 0, 5)
    call(HD1, "post", "/care-tasks/generate", {"Date": day.isoformat()})
    if day.weekday() == 0 or day == START:
        monday = day - timedelta(days=day.weekday())
        if monday not in CREATED_WEEKS:
            CREATED_WEEKS.add(monday)
            create_week(monday)

    # sự kiện riêng theo ngày
    if day == date(2026, 9, 25):
        for n in TRAINED:
            at(date(2026, 9, 20), 9, 0)
            v = call(VETS[0], "post", f"/horses/{H[n]['id']}/vaccinations", {"VaccineName": "Cúm ngựa", "VaccinationDate": day.isoformat()})
            at(day, 9, 30)
            call(VETS[0], "patch", f"/vaccinations/{v['VaccinationID']}", {"Status": "Completed", "NextDueDate": "2027-03-25",
                                                                            "Note": "Mũi nhắc lại 6 tháng."})
    if day == date(2026, 10, 9):     # Gió Bấc: người chăm sóc báo chân sau sưng -> khóa giới hạn mức tập
        lock_horse("Gió Bấc", VETS[1], day, 7, 40, "Routine Exam", "Chân sau phải hơi sưng", "Restricted", 25,
                   date(2026, 10, 20), report_from=U["loc.gr"], description="Chân sau phải hơi sưng sau khi tắm, ăn uống bình thường.")
    if day == date(2026, 10, 11):
        at(day, 9, 0)
        call(VETS[1], "post", f"/diet-plans/{H['Gió Bấc']['diet']}/adjust", {
            "VetNote": "Giảm yến mạch trong thời gian tập nhẹ, bổ sung điện giải.",
            "Meals": [dict(MEALS[0], Quantity=2), *MEALS[1:]]}, ok=(200, 201, 400))
    if day == date(2026, 10, 15):
        for n in APPROVED:
            if n == "Bạch Vân":
                continue
            at(date(2026, 10, 10), 9, 0)
            s = call(VETS[2], "post", f"/horses/{H[n]['id']}/medical-schedules", {"ScheduleType": "Deworming", "ScheduledDate": day.isoformat()})
            at(day, 10, 0)
            call(VETS[2], "patch", f"/medical-schedules/{s['MedicalScheduleID']}", {"Status": "Completed"})
            # khám định kỳ cùng ngày tẩy giun
            rec = call(VETS[2], "post", f"/horses/{H[n]['id']}/medical-records", {
                "ExamType": "Routine Exam", "WeightKg": 455 + (H[n]['id'] * 7) % 60, "HeightCm": 152 + H[n]['id'] % 14,
                "BodyTemperatureC": round(37.6 + (H[n]["id"] % 5) / 10, 1), "HeartRateBpm": 36 + H[n]['id'] % 6, "RespiratoryRate": 12 + H[n]['id'] % 4,
                "Symptoms": "Không có triệu chứng bất thường. Ăn uống, đi lại bình thường.",
                "Diagnosis": "Bình thường, đã tẩy giun.", "HealthStatus": "Healthy", "TrainingEligibility": "Eligible",
                "Conclusion": "Duy trì chế độ tập hiện tại. Tẩy giun định kỳ tháng 01/2027."})
            call(VETS[2], "post", f"/medical-records/{rec['MedicalRecordID']}/sign")
    if day == date(2026, 10, 20):    # tái khám Gió Bấc, mở khóa
        at(day, 9, 0)
        from apps.medical.models import TrainingLock
        lock = TrainingLock.objects.get(horse_id=H["Gió Bấc"]["id"], lock_status="Active")
        rec = call(VETS[1], "post", f"/horses/{H['Gió Bấc']['id']}/medical-records", {
            "ExamType": "Follow-up", "FollowUpLockID": lock.id,
            "HealthStatus": "Healthy", "TrainingEligibility": "Eligible",
            "Conclusion": "Hết sưng, đi lại bình thường. Cho tập lại theo giáo án."})
        call(VETS[1], "post", f"/medical-records/{rec['MedicalRecordID']}/sign")
        from apps.medical.models import TrainingLock
        lock = TrainingLock.objects.get(horse_id=H["Gió Bấc"]["id"], lock_status="Active")
        at(day, 9, 30)
        call(VETS[1], "post", f"/training-locks/{lock.id}/release", {
            "Note": "Tái khám đạt.", "FollowUpMedicalRecordID": rec["MedicalRecordID"],
        })
        LOCK.pop("Gió Bấc")
        from apps.medical.models import HealthReport
        rep = HealthReport.objects.filter(horse_id=H["Gió Bấc"]["id"]).exclude(status="Resolved").first()
        if rep:
            call(VETS[1], "post", f"/health-reports/{rep.id}/resolve", {"VetNote": "Đã khám, khóa giới hạn 10 ngày, tái khám đạt."})
    if day == date(2026, 10, 28):    # Sao Mai ho nhẹ
        at(day, 7, 10)
        rep = call(U["tung.wr"], "post", f"/horses/{H['Sao Mai']['id']}/health-reports", {"Severity": "Normal", "Description": "Ho nhẹ sau buổi tập."})
        at(day, 8, 0)
        call(VETS[1], "post", f"/health-reports/{rep['HealthReportID']}/take")
        call(VETS[1], "post", f"/health-reports/{rep['HealthReportID']}/notes", {"Content": "Nghe phổi bình thường, theo dõi thêm 24 giờ."})
        at(day + timedelta(days=1), 9, 0)
        call(VETS[1], "post", f"/health-reports/{rep['HealthReportID']}/resolve", {"VetNote": "Hết ho, không cần điều trị."})
        at(day, 15, 40)
        call(H["Sao Mai"]["owner"], "post", f"/horses/{H['Sao Mai']['id']}/profile-change-requests",
             {"Changes": {"DamName": "Morning Dew II"}, "Reason": "Hộ chiếu gốc ghi tên ngựa mẹ là “Morning Dew II”, khi khai báo bị thiếu."})
    if day == date(2026, 10, 29):
        from apps.horses.models import ProfileChangeRequest
        req = ProfileChangeRequest.objects.filter(horse_id=H["Sao Mai"]["id"], status="Pending").first()
        at(day, 10, 0)
        call(M, "post", f"/profile-change-requests/{req.id}/approve", {"ReviewNote": "Đã đối chiếu hộ chiếu gốc."})
    if day == date(2026, 10, 30):
        at(day, 16, 0)
        call(M, "post", f"/horses/{H['Lục Bảo']['id']}/archive", {"Reason": "Chủ ngựa chuyển sang câu lạc bộ khác.", "LeftDate": day.isoformat()})
    if day in (date(2026, 10, 1), date(2026, 10, 15)):
        at(day, 7, 45)
        req = call(U["loc.gr"], "post", "/inventory-requests", {"Reason": "Bổ sung vật tư chăm sóc trong tháng.", "Items": [
            {"InventoryItemID": ITEMS["Băng chân"], "RequestedQuantity": 4}, {"InventoryItemID": ITEMS["Thuốc sát trùng"], "RequestedQuantity": 2}]})
        at(day, 10, 0)
        call(M, "post", f"/inventory-requests/{req['InventoryRequestID']}/approve", {"Note": "Đã đối chiếu tồn kho, cấp đủ."})
    if day == date(2026, 10, 1):
        at(day, 8, 30)
        call(M, "post", f"/inventory-items/{ITEMS['Yến mạch']}/stock", {"Change": 300, "Note": "Nhập kho theo đơn tháng 10."})
    if day == date(2026, 11, 1):
        for n, vac, when in (("Hắc Long", "Uốn ván", date(2026, 11, 10)), ("Sao Mai", "Uốn ván", date(2026, 11, 15))):
            at(day, 9, 0)
            call(VETS[0], "post", f"/horses/{H[n]['id']}/vaccinations", {"VaccineName": vac, "VaccinationDate": when.isoformat()})
        at(day, 9, 10)
        call(VETS[0], "post", f"/horses/{H['Gió Bấc']['id']}/medical-schedules", {
            "ScheduleType": "Farrier", "ScheduledDate": "2026-11-08", "ExternalVet": True, "Note": "Thợ đóng móng ngoài câu lạc bộ."})
    if day == date(2026, 11, 4):
        at(day, 15, 40)
        call(H["Hồng Ngọc"]["owner"], "post", f"/horses/{H['Hồng Ngọc']['id']}/profile-change-requests",
             {"Changes": {"DamName": "Rose Garden II"}, "Reason": "Giấy chứng nhận nguồn gốc ghi tên ngựa mẹ là “Rose Garden II”."})
        at(day, 16, 20)
        call(HD1, "post", "/inventory-requests", {"Reason": "Yến mạch cho giai đoạn tăng cường tập luyện.", "Items": [
            {"InventoryItemID": ITEMS["Yến mạch"], "RequestedQuantity": 50}]})

    # buổi tập trong ngày
    for sid, info in sorted(SESSIONS.items(), key=lambda kv: kv[1]["start"]):
        if info["day"] != day or info.get("done"):
            continue
        info["done"] = True
        if day == TODAY and info["start"][0] >= 14:
            continue                 # buổi chiều hôm nay chưa diễn ra
        if day == INJURY_DAY and info["horse"] == "Hắc Long":
            at(day, *info["start"])
            call(info["rider"], "post", f"/training-sessions/{sid}/start")
            lock_horse("Hắc Long", VETS[0], day, 6, 40, "Injury Exam", "Viêm gân gấp chân trước trái độ 2", "Full", 0,
                       date(2026, 11, 19), report_from=U["bao.tn"], severity="Urgent",
                       description="Đi khập khiễng chân trước trái sau 2 km phi nước kiệu. Buổi tập đã được dừng.", session=sid,
                       location="Gân gấp · chân trước trái · Độ 2", follow_up=date(2026, 11, 12), treatments=[
                           {"MedicineName": "Phenylbutazone", "Dose": "2 g/ngày, uống sau bữa sáng", "Route": "Oral",
                            "StartDate": "2026-11-05", "EndDate": "2026-11-11", "WithdrawalUntil": "2026-11-18",
                            "Note": "Kháng viêm"},
                           {"MedicineName": "Chườm lạnh chân trước trái", "Dose": "20 phút, 2 lần mỗi ngày", "Route": "Topical",
                            "StartDate": "2026-11-05", "EndDate": "2026-11-19", "Note": "Vật lý trị liệu"}])
            continue
        from apps.training.models import TrainingSession
        if TrainingSession.objects.get(pk=sid).status != "Assigned":
            continue                 # đã bị hủy do khóa tập
        run_session(sid, info, review=day != TODAY)

    # đóng giai đoạn 1
    for n, p in PLANS.items():
        if p["ranges"][0][1] == day:
            from apps.training.models import TrainingSession
            pend = TrainingSession.objects.filter(stage_id=p["stages"][0], status__in=("Assigned", "In Progress"))
            for s in pend:
                at(day, 19, 0)
                call(HD1, "post", f"/training-sessions/{s.id}/cancel", {"Reason": "Kết thúc giai đoạn."}, ok=(200, 400))
            at(day, 19, 30)
            call(U[H[n]["trainer"]], "post", f"/training-plan-stages/{p['stages'][0]}/close",
                 {"SummaryNote": "Ngựa thích nghi tốt, điểm hiệu suất tăng đều. Sẵn sàng tăng sức bền."}, ok=(200, 400))

    complete_tasks(day, until=time(13, 30) if day == TODAY else None)
    day += timedelta(days=1)
    if day.day in (1, 15):
        print("  đến", day)

# ------------------------------------------------------------------ hôm nay (06/11/2026)
at(TODAY, 2, 6)
call(U["loc.gr"], "post", f"/horses/{H['Gió Bấc']['id']}/health-reports",
     {"Severity": "Normal", "Description": "Chân sau phải hơi sưng sau khi tắm, ăn uống bình thường."})
at(TODAY, 13, 40)
call(HD1, "post", f"/horses/{H['Sao Mai']['id']}/diet-plans", {
    "DietDescription": "Khẩu phần giai đoạn tăng tốc: tăng năng lượng, bổ sung điện giải.", "StartDate": "2026-12-06",
    "Meals": [dict(MEALS[0], Quantity=3.5), *MEALS[1:3]]})
at(TODAY, 7, 45)
call(U["loc.gr"], "post", "/inventory-requests", {"Reason": "Bổ sung vật tư chăm sóc cho ngựa Sao Mai và Gió Bấc trong tuần.", "Items": [
    {"InventoryItemID": ITEMS["Băng chân"], "RequestedQuantity": 6}, {"InventoryItemID": ITEMS["Thuốc sát trùng"], "RequestedQuantity": 2}]})
at(TODAY, 9, 15)
call(H["Tuyết Sơn"]["owner"], "get", "/notifications")
# yêu cầu hỗ trợ (mục "Cần hỗ trợ?")
at(TODAY - timedelta(days=2), 8, 40)
req = call(U["tung.wr"], "post", "/support-requests", {"Topic": "Training", "Content": "Buổi tập ngày 07/11 trùng giờ với buổi tập khác của tôi."})
at(TODAY - timedelta(days=2), 10, 5)
call(M, "post", f"/support-requests/{req['SupportRequestID']}/resolve",
     {"Response": "Đã chuyển buổi tập của ngựa Hồng Ngọc sang 08:20, anh kiểm tra lại lịch giúp."})
at(TODAY - timedelta(days=1), 16, 5)
call(U["loc.gr"], "post", "/support-requests", {"Topic": "Care", "HorseID": H["Hắc Long"]["id"],
     "Content": "Tôi không xem được khẩu phần mới của ngựa Hắc Long sau khi bị khóa tập."})
at(TODAY, 9, 20)
call(U["huy.own"], "post", "/support-requests", {"Topic": "HorseProfile", "HorseID": H["Bạch Vân"]["id"],
     "Content": "Tôi muốn bổ sung giấy chứng nhận tiêm phòng cho ngựa Bạch Vân thì nộp ở mục nào?"})
# Bạch Vân (tiếp nhận 04/11): đã đánh giá, chờ Huấn luyện viên trưởng phân công huấn luyện viên
bv = H["Bạch Vân"]
at(TODAY, 8, 30)
call(HD1, "post", f"/horses/{bv['id']}/assessments", {"SpecializationID": SPEC["ENDURANCE"].id, "QualityScore": 81,
     "FitnessLevel": "Good", "DecisionStatus": "Recommended",
     "AssessmentNote": "Nhịp tim hồi phục nhanh, sải chân đều, hợp cự ly dài."})


def active_plan(name):
    return call(HD1, "get", f"/training-plans?HorseID={H[name]['id']}&Status=Active")[0]


def revise(trainer, name, goal, note, load_change=None):
    """Huấn luyện viên tạo bản điều chỉnh từ giáo án đang áp dụng, sửa mục tiêu và mức tải giai đoạn hiện tại."""
    plan = call(U[trainer], "post", f"/training-plans/{active_plan(name)['TrainingPlanID']}/revise")
    call(U[trainer], "patch", f"/training-plans/{plan['TrainingPlanID']}", {"Goal": goal, "Note": note})
    if load_change and plan["Stages"]:
        call(U[trainer], "patch", f"/training-plan-stages/{plan['Stages'][0]['TrainingPlanStageID']}", load_change)
    return plan


# Gió Bấc: huấn luyện viên Mai điều chỉnh giáo án sau đánh giá buổi tập và gửi duyệt (chờ duyệt)
at(TODAY, 10, 10)
gb = revise("mai.tn", "Gió Bấc", "Nâng tốc độ nước rút cự ly 1.200 m",
            "Điều chỉnh theo đánh giá buổi tập: giảm mức tải trong tuần đầu, tăng dần tốc độ nước rút.", {"TrainingLoad": 45})
at(TODAY, 11, 20)
call(U["mai.tn"], "post", f"/training-plans/{gb['TrainingPlanID']}/submit")
# Thanh Long: bản điều chỉnh bị Huấn luyện viên trưởng trả về, chờ huấn luyện viên chỉnh sửa
at(TODAY - timedelta(days=1), 9, 0)
tl = revise("mai.tn", "Thanh Long", "Tăng sức bền cự ly trung bình 1.600–2.000 m",
            "Bổ sung buổi phi nước kiệu dài để cải thiện hồi phục.", {"TrainingLoad": 60})
call(U["mai.tn"], "post", f"/training-plans/{tl['TrainingPlanID']}/submit")
at(TODAY - timedelta(days=1), 14, 10)
call(HD1, "post", f"/training-plans/{tl['TrainingPlanID']}/return",
     {"ReviewNote": "Mức tải giai đoạn tăng sức bền quá cao so với nhịp tim hồi phục hiện tại. Vui lòng giảm mức tải xuống 50 và kéo dài giai đoạn thêm 1 tuần."})
# Phi Vân: huấn luyện viên Bảo đang soạn bản điều chỉnh (bản nháp)
at(TODAY, 13, 40)
revise("bao.tn", "Phi Vân", "Chuẩn bị Cúp Mùa Đông (đua đường bằng 1.600 m), tăng tốc độ ở 400 m cuối",
       "Bản nháp điều chỉnh sau buổi tập ngày 03/11.")
# lịch tập tuần sau
create_week(TODAY - timedelta(days=TODAY.weekday()) + timedelta(days=7))
clock.set(NOW)
# Bản nháp giáo án tự sinh từ mẫu (huấn luyện viên đã tự soạn giáo án khác nên hệ thống hủy) - bỏ cho danh sách gọn
from apps.training.models import TrainingPlan, TrainingPlanStage, TrainingSession  # noqa: E402
drafts = TrainingPlan.objects.filter(status="Cancelled", template_id__isnull=False)
TrainingPlanStage.objects.filter(plan__in=drafts).delete()
print("bỏ bản nháp mẫu", drafts.delete())
print("sessions", TrainingSession.objects.count(), "done")
