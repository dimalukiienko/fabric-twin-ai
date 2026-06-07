"""Model configuration for the LangGraph agent."""

from langchain_openai import ChatOpenAI


model = ChatOpenAI(model="gpt-4o-mini", max_completion_tokens=2048)
