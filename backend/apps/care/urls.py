from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views
from . import orders

router = DefaultRouter(trailing_slash=False)
router.include_root_view = False
router.register("diet-plans", views.DietPlanViewSet, basename="diet-plan")
router.register("care-tasks", views.CareTaskViewSet, basename="care-task")
router.register("inventory-items", views.InventoryItemViewSet, basename="inventory-item")
router.register("inventory-requests", views.InventoryRequestViewSet, basename="inventory-request")

urlpatterns = [
    path("horses/<int:horse_id>/care-orders", orders.CareOrderView.as_view()),
    path("care-orders/<int:order_id>/stop", orders.CareOrderStopView.as_view()),
    path("horses/<int:horse_id>/diet-restrictions", orders.DietRestrictionView.as_view()),
    path("diet-restrictions/<int:restriction_id>/stop", orders.DietRestrictionStopView.as_view()),

    path("care/training-today", views.GroomTrainingTodayView.as_view()),
    path("horses/<int:horse_id>/diet-plans", views.HorseDietPlanView.as_view()),
    path("horses/<int:horse_id>/current-diet", views.CurrentDietView.as_view()),
    path("horses/<int:horse_id>/diet-context", views.DietContextView.as_view()),
    path("horses/<int:horse_id>/groom", views.HorseGroomView.as_view()),
    path("care-rules", views.CareRuleListView.as_view()),
    path("care-rules/<str:rule_code>", views.CareRuleDetailView.as_view()),
    *router.urls,
]
