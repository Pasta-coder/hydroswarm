from dotenv import load_dotenv
from langchain_groq import ChatGroq
from .state import SwarmState

load_dotenv()
llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)

def policy_agent(state: SwarmState):
    print(f"⚖️  [Policy] Reviewing municipal protocols and traffic routing...")
    prompt = f"""
    You are the Policy & Logistics AI planner.
    Infrastructure state: {state['infrastructure_report']}

    Task: Based on the infrastructure report, autonomously determine the best logistical response. Do we need to deploy emergency fleets, activate water harvesting, or close roads?
    Write a 1-to-2 sentence logistics and routing directive.
    """
    response = llm.invoke(prompt)
    return {"policy_directive": response.content}