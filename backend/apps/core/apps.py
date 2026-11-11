from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = "apps.core"
    label = "core"

    def ready(self):
        from . import drf_messages

        drf_messages.install()   # câu lỗi chuẩn tiếng Việt cho mọi ô nhập
