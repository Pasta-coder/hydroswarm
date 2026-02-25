from dotenv import load_dotenv
from langchain_groq import ChatGroq
from .state import SwarmState

load_dotenv()
llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)

def policy_agent(state: SwarmState):
    print(f"⚖️  [Policy] Reviewing municipal protocols and traffic routing...")
    prompt = f"""
    You are the Policy & Logistics AI planner.

    Context:
    1. Threat Level: {state['sentinel_alert']}
    2. Infrastructure Status: {state['infrastructure_report']}

    Task: Autonomously formulate a logistics routing plan. You must anticipate one potential bottleneck or failure point based on the infrastructure status (e.g., if drains are at capacity, standard routes might be blocked).

    Write a 2-sentence directive: Sentence 1 stating the primary deployment action, and Sentence 2 stating an alternative contingency route or fallback protocol.
    """
    response = llm.invoke(prompt)
    return {"policy_directive": response.content}