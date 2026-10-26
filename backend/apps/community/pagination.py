from core.pagination import CursorPagination


class ForumCursorPagination(CursorPagination):
    # Matches `forum_org_recent_idx` (organization, -created_at).
    ordering = "-created_at"
    page_size = 20
    max_page_size = 50
