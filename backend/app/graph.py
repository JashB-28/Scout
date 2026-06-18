"""LangGraph orchestration: fan out to six specialist agents in parallel,
then join at the synthesizer.

        START
   ┌──────┼──────┬─────────┬──────────┬─────────┐
   ▼      ▼      ▼         ▼          ▼         ▼
 values benefits ops   leadership   news    red_flags
   └──────┴──────┴─────────┴──────────┴─────────┘
                        ▼
                   synthesizer
                        ▼
                       END
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from .agents import (
    benefits_agent,
    business_ops_agent,
    leadership_agent,
    mission_values_agent,
    news_agent,
    red_flags_agent,
    synthesizer_agent,
)


class ResearchState(TypedDict, total=False):
    company: str
    role: str
    website: str
    profile: dict[str, Any]  # resolved entity identity shared by every agent
    llm_cfg: dict[str, Any]
    mission_values: dict[str, Any]
    benefits: dict[str, Any]
    business_ops: dict[str, Any]
    leadership: dict[str, Any]
    news: dict[str, Any]
    red_flags: dict[str, Any]
    synthesis: dict[str, Any]
    charts: dict[str, Any]


AGENT_NODES = {
    "mission_values": mission_values_agent,
    "benefits": benefits_agent,
    "business_ops": business_ops_agent,
    "leadership": leadership_agent,
    "news": news_agent,
    "red_flags": red_flags_agent,
}

AGENT_LABELS = {
    "mission_values": "Values & Mission Agent",
    "benefits": "Benefits Agent",
    "business_ops": "Business Operations Agent",
    "leadership": "Leadership Agent",
    "news": "News & Events Agent",
    "red_flags": "Red Flag Scanner",
    "synthesizer": "Synthesis Agent",
}


def build_graph():
    graph = StateGraph(ResearchState)
    for name, fn in AGENT_NODES.items():
        graph.add_node(name, fn)
    graph.add_node("synthesizer", synthesizer_agent)

    for name in AGENT_NODES:
        graph.add_edge(START, name)          # parallel fan-out
        graph.add_edge(name, "synthesizer")  # join barrier
    graph.add_edge("synthesizer", END)
    return graph.compile()


research_graph = build_graph()
