"""A simple LangGraph agent that can tell the current time via a tool call."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from langchain.agents import create_agent
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI


@tool
def get_current_time(timezone: str = "UTC") -> str:
    """Get the current date and time.

    Args:
        timezone: An IANA timezone name, e.g. "UTC", "Europe/Kyiv",
            "America/New_York". Defaults to "UTC".
    """
    try:
        tz = ZoneInfo(timezone)
    except Exception:
        return f"Unknown timezone: {timezone!r}. Use an IANA name like 'Europe/Kyiv'."
    now = datetime.now(tz)
    return now.strftime("%Y-%m-%d %H:%M:%S %Z")


model = ChatOpenAI(model="gpt-4o-mini", max_completion_tokens=1024)

SYSTEM_PROMPT = (
    "You are a helpful assistant. When the user asks about the current time or "
    "date, call the get_current_time tool. If they mention a city or region, "
    "pass the matching IANA timezone."
)

# Exposed to the LangGraph server via langgraph.json.
graph = create_agent(model, tools=[get_current_time], system_prompt=SYSTEM_PROMPT)
