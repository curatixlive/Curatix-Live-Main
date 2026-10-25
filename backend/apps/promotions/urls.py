from django.urls import path

from . import api

urlpatterns = [
    path(
        "organizations/<uuid:organization_id>/promotions",
        api.PromotionListView.as_view(),
        name="promotion-list",
    ),
    path(
        "organizations/<uuid:organization_id>/promotions/<uuid:promotion_id>",
        api.PromotionDetailView.as_view(),
        name="promotion-detail",
    ),
    path(
        "organizations/<uuid:organization_id>/promotions/<uuid:promotion_id>/payouts",
        api.PromotionPayoutView.as_view(),
        name="promotion-payouts",
    ),
    path("promotions/click", api.PromotionClickView.as_view(), name="promotion-click"),
    path(
        "bookings/<uuid:booking_id>/promotion",
        api.BookingPromotionView.as_view(),
        name="booking-promotion",
    ),
]
