import requests
import json
import time
import os
import random

os.makedirs("stream", exist_ok=True)

# Coordinates for Delhi/Noida Region
LATITUDE = 28.5355
LONGITUDE = 77.3910

API_URL = f"https://api.open-meteo.com/v1/forecast?latitude={LATITUDE}&longitude={LONGITUDE}&hourly=precipitation,soil_moisture_0_to_7cm,runoff&forecast_hours=1&timezone=Asia%2FKolkata"

print("🌍 Connecting to Open-Meteo Environmental Satellite Network...")
print("⛈️  Randomized Anomaly Injection Engine: ONLINE")

counter = 1
while True:
    try:
        response = requests.get(API_URL)
        if response.status_code == 200:
            raw_data = response.json()

            hourly = raw_data.get("hourly", {})
            precip = hourly.get("precipitation", [0])[0] or 0
            soil = hourly.get("soil_moisture_0_to_7cm", [0])[0] or 0
            runoff_val = hourly.get("runoff", [0])[0] or 0

            # --- THE RANDOMIZED ANOMALY INJECTOR ---
            # 30% chance to inject a random severe storm event instead of real data
            if random.random() < 0.30:
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
                "location": "Noida Sector 62",
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

    # Maintain a 20-second sleep to ensure we stay under the API rate limit
    # while keeping the UI updates feeling brisk.
    time.sleep(20)