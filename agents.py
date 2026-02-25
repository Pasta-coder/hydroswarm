import os
from typing import TypedDict
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, END

load_dotenv()

# 1. NEW SHARED MEMORY: Now includes soil and runoff
class SwarmState(TypedDict):
    location: str
    precipitation: float
    soil_moisture: float
    runoff: float
    infrastructure_status: str
    final_plan: str

llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)

# 2. UPGRADED AGENT 1: Multi-Variable Reasoning
def infrastructure_agent(state: SwarmState):
    print(f"\n🏗️  [Infrastructure Agent] Assessing {state['location']}...")

    if state['precipitation'] > 20 and state['soil_moisture'] > 80:
        status = f"CRITICAL: Soil is heavily saturated at {state['soil_moisture']}%. Expected runoff: {state['runoff']}mm. Severe urban flooding imminent."
    elif state['precipitation'] > 20 and state['soil_moisture'] < 40:
        status = f"WARNING: Heavy rain on dry soil ({state['soil_moisture']}%). Flash flood risk, but optimal for rapid rainwater harvesting."
    else:
        status = "STABLE: Standard atmospheric conditions. Normal operations."

    return {"infrastructure_status": status}

# 3. UPGRADED AGENT 2: The Commander
def commander_agent(state: SwarmState):
    print("🎖️  [Commander Agent] Formulating execution plan...")
    prompt = f"""
    You are the autonomous HydroSwarm Commander.
    Emergency Input: {state['precipitation']} mm/hr rain, {state['soil_moisture']}% soil moisture, {state['runoff']}mm runoff detected at {state['location']}.
    Infrastructure Report: {state['infrastructure_status']}

    Provide a strict, 2-sentence emergency action plan for municipal workers.
    """
    response = llm.invoke(prompt)
    return {"final_plan": response.content}

workflow = StateGraph(SwarmState)
workflow.add_node("infrastructure", infrastructure_agent)
workflow.add_node("commander", commander_agent)

workflow.set_entry_point("infrastructure")
workflow.add_edge("infrastructure", "commander")
workflow.add_edge("commander", END)

hydro_brain = workflow.compile()