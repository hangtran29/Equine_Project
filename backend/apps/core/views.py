from django.db import DatabaseError, connection
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    """
    GET /api/health - kiểm tra backend và database (giống API health của repo Java cũ).
    200 {"backend": "UP", "database": "UP"}   | 503 {"backend": "UP", "database": "DOWN"}
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            database_up = cursor.fetchone()[0] == 1
    except DatabaseError:
        database_up = False
    return Response(
        {"backend": "UP", "database": "UP" if database_up else "DOWN"},
        status=status.HTTP_200_OK if database_up else status.HTTP_503_SERVICE_UNAVAILABLE,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def catalogs(request):
    """GET /api/catalogs - danh mục giống ngựa, màu lông (ô chọn trên form hồ sơ ngựa)."""
    from .codes import BREEDS, COAT_COLORS
    from .i18n import is_english

    en = is_english()
    return Response({
        "Breeds": [{"Value": v, "Label": en_label if en else vi_label} for v, vi_label, en_label in BREEDS],
        "CoatColors": [{"Value": v, "Label": en_label if en else v} for v, en_label in COAT_COLORS],
    })


@api_view(["POST"])
def translate_contents(request):
    """POST /api/translate {"Texts": ["..."]} -> {"Translations": {"văn bản": "English"}} - dịch nội dung khi giao diện ở chế độ EN."""
    from .content_i18n import translate_contents as run

    texts = request.data.get("Texts")
    if not isinstance(texts, list):
        return Response({"Texts": ["Gửi danh sách văn bản cần dịch."]}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"Translations": run([t for t in texts[:200] if isinstance(t, str)])})
