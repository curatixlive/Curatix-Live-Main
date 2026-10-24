from django.urls import path

from . import api

urlpatterns = [
    path("seating/layouts", api.LayoutListView.as_view(), name="seating-layouts"),
    path("events/<uuid:event_id>/seating", api.EventSeatingView.as_view(), name="event-seating"),
]
