import json
import glob
import os
from pathlib import Path
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from pydantic import BaseModel, Field
from .state import SwarmState

load_dotenv()
# DOWNGRADE: 8B model, as this is purely a formatting/synthesis task
llm = ChatGroq(model="llama-3.1-8b-instant", temperature=0)

DATA_DIR = Path(__file__).parent.parent / "data"

class CommanderOutput(BaseModel):
    alert_color: str = Field(description="GREEN, YELLOW, ORANGE, or RED")
    evacuation_required: str = Field(description="True if life is at risk")
    dispatch_message: str = Field(description="Strict, 2-sentence emergency action plan for ground workers mentioning the specific location name")


def _load_citizen_sos(location: str) -> str:
    """Load any citizen SOS reports from ./data/ to feed into commander reasoning."""
    sos_files = sorted(DATA_DIR.glob("citizen_sos_*.txt"), key=os.path.getmtime, reverse=True)
    if not sos_files:
        return ""

    sos_texts = []
    for f in sos_files[:5]:  # latest 5 reports
        try:
            content = f.read_text().strip()
            sos_texts.append(content)
        except (IOError, OSError):
            pass

    if not sos_texts:
        return ""

    return "\n\nCITIZEN SOS GROUND REPORTS:\n" + "\n---\n".join(sos_texts)


def commander_agent(state: SwarmState):
    print(f"🎖️  [Commander] Synthesizing final execution plan for {state['location']}...")
    structured_llm = llm.with_structured_output(CommanderOutput)

    citizen_sos = _load_citizen_sos(state["location"])

    prompt = f"""
    You are the HydroSwarm Commander issuing a final dispatch order for {state['location']}.
    The location being monitored is: {state['location']}.
    Current weather telemetry: {state['precipitation']}mm precipitation, {state['soil_moisture']}% soil moisture, {state['runoff']}mm runoff.

    Review the committee's findings:
    1. Sentinel: {state['sentinel_alert']}
    2. Infrastructure: {state['infrastructure_report']}
    3. Policy: {state['policy_directive']}
    {citizen_sos}

    CRITICAL INSTRUCTIONS:
    - Your dispatch_message MUST mention "{state['location']}" by name.
    - Your dispatch_message MUST reference the actual precipitation ({state['precipitation']}mm) and conditions.
    - If any Citizen SOS ground reports are provided above, you MUST acknowledge them and factor the on-ground reality into your plan.
    - Do NOT use generic boilerplate. Be specific to this location and these exact conditions.
    """

    response = structured_llm.invoke(prompt)
    return {"final_plan": response.model_dump_json()}