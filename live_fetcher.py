import requests
import json
import time
import os
import random
from pathlib import Path

os.makedirs("stream", exist_ok=True)

# Default coordinates for Delhi/Noida Region
DEFAULT_LATITUDE = 28.5355
DEFAULT_LONGITUDE = 77.3910
DEFAULT_LOCATION = "Noida Sector 62"

ZONE_CONFIG_PATH = Path(__file__).parent / "active_zone.json"

def get_active_zone():
    """Read the active zone config (set by central server when user clicks the map)."""
    try:
        if ZONE_CONFIG_PATH.exists():
            with open(ZONE_CONFIG_PATH) as f:
                config = json.load(f)
            return config.get("location", DEFAULT_LOCATION), config.get("latitude", DEFAULT_LATITUDE), config.get("longitude", DEFAULT_LONGITUDE)
    except (json.JSONDecodeError, IOError):
        pass
    return DEFAULT_LOCATION, DEFAULT_LATITUDE, DEFAULT_LONGITUDE

print("🌍 Connecting to Open-Meteo Environmental Satellite Network...")
print("⛈️  Randomized Anomaly Injection Engine: ONLINE")

counter = 1
while True:
    try:
        # Re-read zone config each cycle so the map can change it live
        location_name, latitude, longitude = get_active_zone()
        API_URL = f"https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}&hourly=precipitation,soil_moisture_0_to_7cm,runoff&forecast_hours=1&timezone=Asia%2FKolkata"

        response = requests.get(API_URL)
        if response.status_code == 200:
            raw_data = response.json()

            hourly = raw_data.get("hourly", {})
            precip = hourly.get("precipitation", [0])[0] or 0
            soil = hourly.get("soil_moisture_0_to_7cm", [0])[0] or 0
            runoff_val = hourly.get("runoff", [0])[0] or 0

            # --- THE RANDOMIZED ANOMALY INJECTOR ---
            # 50% chance to inject a random severe storm event instead of real data
            if random.random() < 0.50:
                print("\n⚠️ [WARNING] ATMOSPHERIC ANOMALY DETECTED!")
                # Randomize the storm severity to prove the AI agents can scale their response
                precip = round(random.uniform(40.0, 150.0), 2)
                soil = round(random.uniform(0.80, 0.99), 2)
                runoff_val = round(random.uniform(10.0, 45.0), 2)
                print(f"⚡ Injecting Class {int(precip/30)} Storm Payload...")

            current_timestamp = time.time()
            unique_id = int(current_timestamp)

            payload = {
                "event_id": unique_id,
                "location": location_name,
                "precipitation_mm": precip,
                "soil_moisture_percent": soil * 100,
                "surface_runoff_mm": runoff_val,
                "timestamp": current_timestamp
            }

            filename = f"stream/open_meteo_{unique_id}.json"
            with open(filename, "w") as f:
                json.dump(payload, f)

            print(f"[{counter}] Dropped: {payload['precipitation_mm']}mm rain | {round(payload['soil_moisture_percent'], 2)}% soil")
            counter += 1

        else:
            print(f"[ERROR] API returned {response.status_code}: {response.text}")

    except Exception as e:
        print(f"[CONNECTION ERROR] {e}")

    # Maintain a 10-second sleep for fast demo cycles
    # while keeping the UI updates feeling brisk.
    time.sleep(10)