from dotenv import load_dotenv
from langchain_groq import ChatGroq
from .state import SwarmState

load_dotenv()
llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)

def sentinel_agent(state: SwarmState):
    print(f"\n🚨 [Sentinel] Analyzing stream for {state['location']}...")
    prompt = f"""
    You are the HydroSwarm Sentinel, an expert in urban environmental risk assessment.

    Current Live Telemetry for {state['location']}:
    - Precipitation: {state['precipitation']} mm/hr
    - Soil Saturation: {state['soil_moisture']}%
    - Surface Runoff: {state['runoff']} mm

    Task: Do not calculate math. Your job is to interpret the qualitative human and urban impact of these metrics.
    Analyze the synergy between high saturation and runoff. Does this profile indicate a manageable event, severe property damage, or an immediate threat to life?

    Output exactly one concise sentence declaring the qualitative threat level and the primary environmental driver.
    """
    response = llm.invoke(prompt)
    return {"sentinel_alert": response.content}