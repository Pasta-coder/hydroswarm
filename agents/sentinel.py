import json
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from pydantic import BaseModel, Field
from .state import SwarmState

load_dotenv()
# DOWNGRADE: Using the ultra-fast 8B model to save compute/latency
llm = ChatGroq(model="llama-3.1-8b-instant", temperature=0)

class SentinelOutput(BaseModel):
    threat_level: str = Field(description="One of: LOW, MODERATE, SEVERE, CRITICAL")
    primary_driver: str = Field(description="The single most important environmental factor")
    summary: str = Field(description="One sentence summary of the threat")

def sentinel_agent(state: SwarmState):
    print(f"\n🚨 [Sentinel] Analyzing stream for {state['location']}...")

    # Bind the LLM to output ONLY our Pydantic schema
    structured_llm = llm.with_structured_output(SentinelOutput)

    prompt = f"""
    You are an environmental risk profiler.
    Telemetry for {state['location']}: {state['precipitation']}mm rain, {state['soil_moisture']}% soil saturation, {state['runoff']}mm runoff.
    Analyze the threat level. Do not calculate math.
    """

    response = structured_llm.invoke(prompt)
    # Store as a JSON string in the state
    return {"sentinel_alert": response.model_dump_json()}