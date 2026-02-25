import pathway as pw
from agents import hydro_brain
import json

print("🚀 Booting up HydroSwarm Advanced AI Engine...")

# 1. UPGRADED SCHEMA
class WeatherSchema(pw.Schema):
    event_id: int
    location: str
    precipitation_mm: float
    soil_moisture_percent: float
    surface_runoff_mm: float
    timestamp: float

# 2. INGESTION
weather_stream = pw.io.fs.read(
    "./stream",
    format="json",
    schema=WeatherSchema,
    mode="streaming"
)

# 3. THE TRIGGER FILTER: Only wake up the AI if there is actual rain
active_weather = weather_stream.filter(
    weather_stream.precipitation_mm > 0.0
)

# 4. UPGRADED UDF
@pw.udf
def trigger_swarm(location: str, precip: float, soil: float, runoff: float) -> str:
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

    # Run the full 4-agent cascade
    result = hydro_brain.invoke(initial_state)

    # Package all 4 agent outputs into a single JSON string for the frontend
    debate_output = {
        "sentinel": result["sentinel_alert"],
        "infrastructure": result["infrastructure_report"],
        "policy": result["policy_directive"],
        "commander": result["final_plan"]
    }
    return json.dumps(debate_output)

# 5. EXECUTION
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

pw.io.csv.write(ai_decisions, "sys.stdout")
pw.run()