"""LangGraph agent composition root."""

from langchain.agents import create_agent

from agent.model import model
from agent.prompts import SYSTEM_PROMPT
from agent.state import LineState
from agent.tools import apply_change, build_line_graph, run_simulation, simulate_change

# Exposed to the LangGraph server via langgraph.json.
graph = create_agent(
    model,
    tools=[build_line_graph, run_simulation, simulate_change, apply_change],
    system_prompt=SYSTEM_PROMPT,
    state_schema=LineState,
)
