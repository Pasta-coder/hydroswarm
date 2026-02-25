import os
import json
from typing import TypedDict
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, END

load_dotenv()

# 1. THE COMPLETE SHARED MEMORY (The Pathway State)
class SwarmState(TypedDict):
    location: str
    precipitation: float
    soil_moisture: float
    runoff: float
    # Agent Outputs
    sentinel_alert: str
    infrastructure_report: str
    policy_directive: str
    final_plan: str

# 2. THE LLM ENGINE (Groq is fast enough to run 4 sequential calls in ~1.5 seconds)
llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)

# ==========================================
# THE HYDROSWARM COMMITTEE
# ==========================================

# AGENT 1: The Sentinel (Detects and raises the alarm)
def sentinel_agent(state: SwarmState):
    print(f"\n🚨 [Sentinel] Analyzing stream for {state['location']}...")
    prompt = f"""
    You are the HydroSwarm Sentinel monitoring live telemetry.
    Data: {state['precipitation']}mm rain, {state['soil_moisture']}% soil saturation, {state['runoff']}mm runoff.
    If rain > 20 and soil > 80%, declare a 'CRITICAL FLOOD ALERT'.
    Otherwise, declare a 'STANDARD HARVESTING OPPORTUNITY'.
    Output exactly one sentence.
    """
    response = llm.invoke(prompt)
    return {"sentinel_alert": response.content}

# AGENT 2: Infrastructure (Mocks a Pathway Document Store RAG lookup)
def infrastructure_agent(state: SwarmState):
    print(f"🏗️  [Infrastructure] Querying Central Ground Water Board (CGWB) records...")
    prompt = f"""
    You are the Infrastructure AI.
    Alert received: {state['sentinel_alert']}
    Simulated Database Context for {state['location']}: Groundwater is 150% over-exploited. Local drainage is at 80% capacity.
    Write a 1-sentence infrastructure impact report based on this context.
    """
    response = llm.invoke(prompt)
    return {"infrastructure_report": response.content}

# AGENT 3: Policy & Logistics (Mocks standard operating procedures lookup)
def policy_agent(state: SwarmState):
    print(f"⚖️  [Policy] Reviewing municipal protocols and traffic routing...")
    prompt = f"""
    You are the Policy & Logistics AI.
    Infrastructure state: {state['infrastructure_report']}
    If critical, state standard protocol: 'Divert to Okhla reservoir and clear Route 3 for municipal fleet.'
    If standard, state: 'Activate local rainwater harvesting grids.'
    Write a 1-sentence logistics directive.
    """
    response = llm.invoke(prompt)
    return {"policy_directive": response.content}

# AGENT 4: The Commander (Synthesizes the debate into execution)
def commander_agent(state: SwarmState):
    print(f"🎖️  [Commander] Synthesizing final execution plan...")
    prompt = f"""
    You are the HydroSwarm Commander. Review the committee's findings:
    1. Sentinel: {state['sentinel_alert']}
    2. Infrastructure: {state['infrastructure_report']}
    3. Policy: {state['policy_directive']}

    Synthesize this into a strict, 2-sentence emergency action plan for ground workers.
    """
    response = llm.invoke(prompt)
    return {"final_plan": response.content}

# ==========================================
# WIRING THE LANGGRAPH CASCADE
# ==========================================
workflow = StateGraph(SwarmState)
workflow.add_node("sentinel", sentinel_agent)
workflow.add_node("infrastructure", infrastructure_agent)
workflow.add_node("policy", policy_agent)
workflow.add_node("commander", commander_agent)

# Define the sequential debate flow
workflow.set_entry_point("sentinel")
workflow.add_edge("sentinel", "infrastructure")
workflow.add_edge("infrastructure", "policy")
workflow.add_edge("policy", "commander")
workflow.add_edge("commander", END)

hydro_brain = workflow.compile()