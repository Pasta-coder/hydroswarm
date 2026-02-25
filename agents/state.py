from typing import TypedDict

class SwarmState(TypedDict):
    location: str
    precipitation: float
    soil_moisture: float
    runoff: float
    sentinel_alert: str        # Will now hold JSON
    infrastructure_report: str # Will now hold JSON
    policy_directive: str      # Will now hold JSON
    final_plan: str            # Will now hold JSON