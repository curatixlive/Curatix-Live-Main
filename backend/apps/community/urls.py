from django.urls import path

from . import api

urlpatterns = [
    path(
        "organizations/<uuid:organization_id>/community",
        api.CommunityView.as_view(),
        name="organization-community",
    ),
    path(
        "organizations/<uuid:organization_id>/forum",
        api.ForumView.as_view(),
        name="organization-forum",
    ),
    path(
        "organizations/<uuid:organization_id>/forum/me",
        api.ForumMeView.as_view(),
        name="organization-forum-me",
    ),
    path("forum/<uuid:post_id>/replies", api.ForumRepliesView.as_view(), name="forum-replies"),
    path("forum/<uuid:post_id>", api.ForumPostDetailView.as_view(), name="forum-post"),
]
