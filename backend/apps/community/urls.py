from django.urls import path

from . import api

urlpatterns = [
    path(
        "organizations/<uuid:organization_id>/community",
        api.CommunityView.as_view(),
        name="organization-community",
    ),
]
