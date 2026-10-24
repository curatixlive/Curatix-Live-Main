from core.errors import InvalidInputError, NotFoundError


class AgentUserNotFoundError(NotFoundError):
    """No account has that email."""

    code = "agent_user_not_found"


class AgentAccessNotFoundError(NotFoundError):
    """That access grant does not exist."""

    code = "agent_access_not_found"


class AgentToolInputError(InvalidInputError):
    """The assistant sent an argument we cannot use."""

    code = "agent_tool_input"
