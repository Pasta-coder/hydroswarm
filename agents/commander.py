from dotenv import load_dotenv
from langchain_groq import ChatGroq
from .state import SwarmState

load_dotenv()
llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)

def commander_agent(state: SwarmState):
    print(f"🎖️  [Commander] Synthesizing final execution plan...")
    prompt = f"""
    You are the HydroSwarm Commander. Review the committee's findings:
    1. Sentinel: {state['sentinel_alert']}
    2. Infrastructure: {state['infrastructure_report']}
    3. Policy: {state['policy_directive']}

    Task: Synthesize this debate into a strict, highly actionable 2-sentence emergency action plan for ground workers and municipal authorities.
    """
    response = llm.invoke(prompt)
    return {"final_plan": response.content}