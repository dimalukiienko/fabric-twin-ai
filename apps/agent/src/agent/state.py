"""Agent state schema."""

from langchain.agents import AgentState
from typing_extensions import NotRequired


class LineState(AgentState):
    """Agent state plus the current production line \u2014 the single source of truth."""

    line_graph: NotRequired[dict | None]
