from typing import TypedDict

class SwarmState(TypedDict):
    location: str
    precipitation: float
    soil_moisture: float
    runoff: float
    # Agent Outputs
    sentinel_alert: str
    infrastructure_report: str
    policy_directive: str
    final_plan: str