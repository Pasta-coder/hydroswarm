from langgraph.graph import StateGraph, END
from .state import SwarmState
from .sentinel import sentinel_agent
from .infrastructure import infrastructure_agent
from .policy import policy_agent
from .commander import commander_agent

workflow = StateGraph(SwarmState)
workflow.add_node("sentinel", sentinel_agent)
workflow.add_node("infrastructure", infrastructure_agent)
workflow.add_node("policy", policy_agent)
workflow.add_node("commander", commander_agent)

workflow.set_entry_point("sentinel")
workflow.add_edge("sentinel", "infrastructure")
workflow.add_edge("infrastructure", "policy")
workflow.add_edge("policy", "commander")
workflow.add_edge("commander", END)

hydro_brain = workflow.compile()