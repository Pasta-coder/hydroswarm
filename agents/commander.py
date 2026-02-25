import json
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from pydantic import BaseModel, Field
from .state import SwarmState

load_dotenv()
# DOWNGRADE: 8B model, as this is purely a formatting/synthesis task
llm = ChatGroq(model="llama-3.1-8b-instant", temperature=0)

class CommanderOutput(BaseModel):
    alert_color: str = Field(description="GREEN, YELLOW, ORANGE, or RED")
    evacuation_required: str = Field(description="True if life is at risk")
    dispatch_message: str = Field(description="Strict, 2-sentence emergency action plan for ground workers")

def commander_agent(state: SwarmState):
    print(f"🎖️  [Commander] Synthesizing final execution plan...")
    structured_llm = llm.with_structured_output(CommanderOutput)

    prompt = f"""
    You are the HydroSwarm Commander. Review the committee's findings and synthesize a final dispatch order.
    1. Sentinel: {state['sentinel_alert']}
    2. Infrastructure: {state['infrastructure_report']}
    3. Policy: {state['policy_directive']}
    """

    response = structured_llm.invoke(prompt)
    return {"final_plan": response.model_dump_json()}