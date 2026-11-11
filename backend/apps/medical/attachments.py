from pathlib import Path

from django.http import FileResponse
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.access import operational_horse
from apps.core.permissions import HasAnyPermission
from apps.horses import documents
from .models import HealthReportAttachment


class AttachmentUploadView(APIView):
    permission_classes = [HasAnyPermission("HEALTH_REPORT", "MEDICAL_MANAGE")]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, horse_id):
        horse = operational_horse(request.user, horse_id)
        file = request.FILES.get("File")
        if not file or Path(file.name).suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            raise ValidationError({"File": ["Chọn ảnh JPG, PNG hoặc WEBP."]})
        url = documents.save_upload(horse.pk, file)
        try:
            a = HealthReportAttachment.objects.create(horse=horse, uploaded_by=request.user, file_url=url)
        except Exception:
            documents.delete_file(url)
            raise
        return Response({"AttachmentID": a.pk}, status=201)


class AttachmentFileView(APIView):
    permission_classes = [HasAnyPermission("HEALTH_REPORT", "MEDICAL_MANAGE")]

    def get(self, request, attachment_id):
        a = HealthReportAttachment.objects.filter(pk=attachment_id).first()
        if not a:
            raise NotFound()
        operational_horse(request.user, a.horse_id)
        if not a.report_id and a.uploaded_by_id != request.user.pk:
            raise PermissionDenied()
        path = documents.stored_path(a.file_url)
        if not path.is_file():
            raise NotFound("Không tìm thấy tệp ảnh.")
        response = FileResponse(path.open("rb"), content_type=documents.content_type(a.file_url))
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
