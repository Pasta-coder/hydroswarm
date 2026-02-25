import requests
import json
import time
import os

os.makedirs("stream", exist_ok=True)

# Coordinates for Delhi/Noida Region
LATITUDE = 28.5355
LONGITUDE = 77.3910

API_URL = f"https://api.open-meteo.com/v1/forecast?latitude={LATITUDE}&longitude={LONGITUDE}&hourly=precipitation,soil_moisture_0_to_7cm,runoff&forecast_hours=1&timezone=Asia%2FKolkata"

print("🌍 Connecting to Open-Meteo Environmental Satellite Network...")

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

            # --- DEMO OVERRIDE ---
            if counter % 3 == 0:
                precip = 65.5
                soil = 0.95
                runoff_val = 12.0
                print("⚡ DEMO OVERRIDE: Injecting Severe Storm Payload!")

            # FIX 1: Generate a unique Unix timestamp for the ID and filename
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

            # FIX 1 (cont): File is now guaranteed to be completely unique
            filename = f"stream/open_meteo_{unique_id}.json"
            with open(filename, "w") as f:
                json.dump(payload, f)

            print(f"[{counter}] Fetched Live Data: {payload['precipitation_mm']}mm rain | {round(payload['soil_moisture_percent'], 2)}% soil moisture")
            counter += 1

        else:
            print(f"[ERROR] API returned {response.status_code}: {response.text}")

    except Exception as e:
        print(f"[CONNECTION ERROR] {e}")

    # FIX 2: Increased sleep to 15 seconds.
    # This ensures the 4-agent LangGraph Swarm has plenty of time to finish
    # its processing before the next file triggers the Pathway engine.
    time.sleep(15)