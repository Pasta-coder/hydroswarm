import os
from typing import TypedDict
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, END

# 1. Securely load the API key from the .env file we just created
load_dotenv()

# 2. Define the Shared Memory
class SwarmState(TypedDict):
    location: str
    rainfall: float
    infrastructure_status: str
    final_plan: str

# 3. Initialize the Groq LLM Engine
llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)

# 4. Define Agent 1: The Infrastructure Specialist
def infrastructure_agent(state: SwarmState):
    print(f"\n🏗️  [Infrastructure Agent] Assessing {state['location']}...")
    if state['rainfall'] > 100:
        status = "CRITICAL: Drainage at 95% capacity. Immediate flooding risk."
    else:
        status = "WARNING: Drainage at 75% capacity. Water harvesting systems ready."

    return {"infrastructure_status": status}

# 5. Define Agent 2: The Commander
def commander_agent(state: SwarmState):
    print("🎖️  [Commander Agent] Formulating execution plan...")
    prompt = f"""
    You are the autonomous HydroSwarm Commander.
    Emergency Input: {state['rainfall']} mm/hr rain detected at {state['location']}.
    Infrastructure Report: {state['infrastructure_status']}

    Provide a strict, 2-sentence emergency action plan for municipal workers.
    """
    response = llm.invoke(prompt)
    return {"final_plan": response.content}

# 6. Wire the Graph Together
workflow = StateGraph(SwarmState)
workflow.add_node("infrastructure", infrastructure_agent)
workflow.add_node("commander", commander_agent)

workflow.set_entry_point("infrastructure")
workflow.add_edge("infrastructure", "commander")
workflow.add_edge("commander", END)

# Export the compiled brain
hydro_brain = workflow.compile()