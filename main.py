import pathway as pw
import json
import asyncio
import os
from agents import hydro_brain

print("🚀 Booting up HydroSwarm Advanced AI Engine...")

class WeatherSchema(pw.Schema):
    event_id: int
    location: str
    precipitation_mm: float
    soil_moisture_percent: float
    surface_runoff_mm: float
    timestamp: float

weather_stream = pw.io.fs.read(
    "./stream",
    format="json",
    schema=WeatherSchema,
    mode="streaming"
)

active_weather = weather_stream.filter(
    weather_stream.precipitation_mm > 0.0
)

# ==========================================
# FIX 1: ASYNC UDF (Non-blocking execution)
# ==========================================
@pw.udf(executor=pw.udfs.async_executor(capacity=4))
async def trigger_swarm(location: str, precip: float, soil: float, runoff: float) -> str:
    initial_state = {
        "location": location,
        "precipitation": precip,
        "soil_moisture": soil,
        "runoff": runoff,
        "sentinel_alert": "",
        "infrastructure_report": "",
        "policy_directive": "",
        "final_plan": ""
    }

    # Run the synchronous LangGraph brain inside an async thread
    result = await asyncio.to_thread(hydro_brain.invoke, initial_state)

    debate_output = {
        "sentinel": result["sentinel_alert"],
        "infrastructure": result["infrastructure_report"],
        "policy": result["policy_directive"],
        "commander": result["final_plan"]
    }
    return json.dumps(debate_output)

ai_decisions = active_weather.select(
    active_weather.location,
    active_weather.precipitation_mm,
    ai_debate=trigger_swarm(
        active_weather.location,
        active_weather.precipitation_mm,
        active_weather.soil_moisture_percent,
        active_weather.surface_runoff_mm
    )
)

# ==========================================
# FIX 2: PROPER OUTPUT SINKS (The Next.js Cheat Code)
# ==========================================
# Ensure Next.js public folder exists
os.makedirs("frontend/public", exist_ok=True)

# Print cleanly to terminal AND write to Next.js public folder
def push_to_dashboard(row):
    print(f"\n✅ [Pathway Output] Decision ready for {row['location']}")
    try:
        with open("frontend/public/latest_alert.json", "w") as f:
            json.dump(row, f)
    except Exception as e:
        print(f"Error writing to dashboard: {e}")

pw.io.subscribe(
    ai_decisions,
    on_change=lambda key, row, time, is_addition: push_to_dashboard(row) if is_addition else None
)

pw.run()