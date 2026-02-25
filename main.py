import pathway as pw
from agents import hydro_brain

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

# 4. UPGRADED UDF: Passing all 3 variables to LangGraph
@pw.udf
def trigger_swarm(location: str, precip: float, soil: float, runoff: float) -> str:
    initial_state = {
        "location": location,
        "precipitation": precip,
        "soil_moisture": soil,
        "runoff": runoff,
        "infrastructure_status": "",
        "final_plan": ""
    }
    result = hydro_brain.invoke(initial_state)
    return result["final_plan"]

# 5. EXECUTION
ai_decisions = active_weather.select(
    active_weather.location,
    active_weather.precipitation_mm,
    action_plan=trigger_swarm(
        active_weather.location,
        active_weather.precipitation_mm,
        active_weather.soil_moisture_percent,
        active_weather.surface_runoff_mm
    )
)

pw.io.csv.write(ai_decisions, "sys.stdout")
pw.run()