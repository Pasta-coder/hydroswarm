from email.mime import message
import json
import glob
import os
from pathlib import Path
from xmlrpc import client
from dotenv import load_dotenv
from httpx import Client
from langchain_groq import ChatGroq
from pydantic import BaseModel, Field
from .state import SwarmState

try:
    from twilio.rest import Client as TwilioClient
except ImportError:
    TwilioClient = None  # type: ignore
    print("[Commander] twilio not installed — WhatsApp alerts disabled")

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
    send_whatsapp_message(response.dispatch_message)
    return {"final_plan": response.model_dump_json()}

def send_whatsapp_message(report: str, recipient: str | None = None) -> None:
    """Send a WhatsApp message containing *report*.

    Configuration is read from environment variables so that callers
    (or deployment) can change numbers without touching code.

    - TWILIO_ACCOUNT_SID
    - TWILIO_AUTH_TOKEN
    - TWILIO_WHATSAPP_FROM  (optional, defaults to Twilio sandbox number)
    - TWILIO_WHATSAPP_TO    (optional, used if *recipient* not provided)

    The helper will silently return if configuration is missing.
    """
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
    to_number = recipient or os.getenv("TWILIO_WHATSAPP_TO")

    if not account_sid or not auth_token or not to_number:
        print("[Commander] Twilio credentials or recipient not set, message not sent.")
        return

    if TwilioClient is None:
        print("[Commander] twilio package not installed, message not sent.")
        return

    client = TwilioClient(account_sid, auth_token)
    try:
        msg = client.messages.create(
            from_=from_number,
            body=report,
            to=to_number,
        )
        print(f"[Commander] WhatsApp message sent; sid={msg.sid}")
    except Exception as e:
        print(f"[Commander] failed to send WhatsApp message: {e}")