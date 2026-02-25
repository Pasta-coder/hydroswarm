import pathway as pw
from agents import hydro_brain # Import our newly created LangGraph brain

print("🚀 Booting up HydroSwarm AI Engine...")

# 1. Define the Schema
class WeatherSchema(pw.Schema):
    event_id: int
    location: str
    rainfall_mm_per_hr: float
    timestamp: float

# 2. Ingest the Live Stream
weather_stream = pw.io.fs.read(
    "./stream",
    format="json",
    schema=WeatherSchema,
    mode="streaming"
)

# 3. Filter for Heavy Rain
heavy_rain_alerts = weather_stream.filter(
    weather_stream.rainfall_mm_per_hr > 50.0
)

# 4. The Magic Link: Pathway UDF calling LangGraph
@pw.udf
def trigger_swarm(location: str, rainfall: float) -> str:
    # This function runs instantly for every new data point
    initial_state = {
        "location": location,
        "rainfall": rainfall,
        "infrastructure_status": "",
        "final_plan": ""
    }
    # Execute the multi-agent debate
    result = hydro_brain.invoke(initial_state)
    return result["final_plan"]

# 5. Apply the AI Brain to the Stream
ai_decisions = heavy_rain_alerts.select(
    heavy_rain_alerts.location,
    heavy_rain_alerts.rainfall_mm_per_hr,
    action_plan=trigger_swarm(heavy_rain_alerts.location, heavy_rain_alerts.rainfall_mm_per_hr)
)

# 6. Output the AI's real-time decisions
pw.io.csv.write(ai_decisions, "sys.stdout")

pw.run()