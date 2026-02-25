import json
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from pydantic import BaseModel, Field
from .state import SwarmState

load_dotenv()
# KEEP: 70B model because logistical reasoning is complex
llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)

class PolicyOutput(BaseModel):
    primary_action: str = Field(description="Main deployment action in under 15 words")
    contingency_route: str = Field(description="Alternative route or fallback protocol")

def policy_agent(state: SwarmState):
    print(f"⚖️  [Policy] Reviewing municipal protocols and traffic routing...")
    structured_llm = llm.with_structured_output(PolicyOutput)

    prompt = f"""
    You are the Policy & Logistics AI planner.
    Threat Context: {state['sentinel_alert']}
    Infrastructure Context: {state['infrastructure_report']}

    Formulate a logistics routing plan. Anticipate one failure point based on the infrastructure status.
    """

    response = structured_llm.invoke(prompt)
    return {"policy_directive": response.model_dump_json()}