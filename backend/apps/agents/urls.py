from django.urls import path

from . import api

urlpatterns = [
    path("mcp", api.McpView.as_view(), name="mcp"),
    path("mcp/<str:token>", api.McpView.as_view(), name="mcp-token"),
    path("admin/agent-access", api.AgentAccessListView.as_view(), name="admin-agent-access"),
    path(
        "admin/agent-access/<uuid:access_id>",
        api.AgentAccessDetailView.as_view(),
        name="admin-agent-access-detail",
    ),
]
