from dotenv import load_dotenv
from langchain_groq import ChatGroq
from .state import SwarmState

load_dotenv()
llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)

def sentinel_agent(state: SwarmState):
    print(f"\n🚨 [Sentinel] Analyzing stream for {state['location']}...")
    prompt = f"""
    You are the HydroSwarm Sentinel meteorology expert.
    Current Live Telemetry:
    - Rainfall: {state['precipitation']} mm/hr
    - Soil Saturation: {state['soil_moisture']}%
    - Surface Runoff: {state['runoff']} mm

    Task: Reason through this environmental data autonomously. Calculate the trajectory of the water accumulation. Is this a manageable rain event, an optimal harvesting opportunity, or a critical flash flood risk?
    Explain your reasoning briefly, then declare a final status alert in one concise sentence.
    """
    response = llm.invoke(prompt)
    return {"sentinel_alert": response.content}