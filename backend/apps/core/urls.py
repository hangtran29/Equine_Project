from django.urls import path

from . import dashboard, support, views
from .notifications import NotificationReadView, NotificationUnreadCountView, NotificationView

urlpatterns = [
    path("health", views.health, name="health"),
    path("catalogs", views.catalogs, name="catalogs"),
    path("translate", views.translate_contents, name="translate"),
    path("notifications", NotificationView.as_view(), name="notifications"),
    path("notifications/unread-count", NotificationUnreadCountView.as_view(), name="notifications-unread"),
    path("notifications/read", NotificationReadView.as_view(), name="notifications-read"),
    path("support-requests/options", support.SupportOptionsView.as_view(), name="support-options"),
    path("support-requests", support.SupportRequestListView.as_view(), name="support-requests"),
    path("support-requests/<int:pk>/resolve", support.SupportResolveView.as_view(), name="support-resolve"),
    path("dashboard", dashboard.ClubDashboardView.as_view(), name="club-dashboard"),
]
