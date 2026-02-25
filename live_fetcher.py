import requests
import json
import time
import os

os.makedirs("stream", exist_ok=True)

# Coordinates for Delhi/Noida Region
LATITUDE = 28.5355
LONGITUDE = 77.3910

# THE FIX: Changed 'surface_runoff' to just 'runoff' in the URL
API_URL = f"https://api.open-meteo.com/v1/forecast?latitude={LATITUDE}&longitude={LONGITUDE}&hourly=precipitation,soil_moisture_0_to_7cm,runoff&forecast_hours=1&timezone=Asia%2FKolkata"

print("🌍 Connecting to Open-Meteo Environmental Satellite Network...")

counter = 1
while True:
    try:
        response = requests.get(API_URL)
        if response.status_code == 200:
            raw_data = response.json()

            # Extract the hourly arrays
            hourly = raw_data.get("hourly", {})

            # THE FIX: Changed the dictionary lookup to 'runoff'
            precip = hourly.get("precipitation", [0])[0] or 0
            soil = hourly.get("soil_moisture_0_to_7cm", [0])[0] or 0
            runoff_val = hourly.get("runoff", [0])[0] or 0

            # --- THE HACKATHON DEMO INJECTOR ---
            # Every 3rd request, we simulate a massive storm for the demo
            if counter % 3 == 0:
                precip = 65.5  # Heavy rain
                soil = 0.95    # 95% saturated soil
                runoff_val = 12.0 # High runoff
                print("⚡ DEMO OVERRIDE: Injecting Severe Storm Payload!")

            payload = {
                "event_id": counter,
                "location": "Noida Sector 62",
                "precipitation_mm": precip,
                "soil_moisture_percent": soil * 100,
                "surface_runoff_mm": runoff_val,
                "timestamp": time.time()
            }

            # Write to the stream folder for Pathway to instantly read
            filename = f"stream/open_meteo_{counter}.json"
            with open(filename, "w") as f:
                json.dump(payload, f)

            print(f"[{counter}] Fetched Live Data: {payload['precipitation_mm']}mm rain | {round(payload['soil_moisture_percent'], 2)}% soil moisture | {payload['surface_runoff_mm']}mm runoff")
            counter += 1

        else:
            print(f"[ERROR] API returned {response.status_code}: {response.text}")

    except Exception as e:
        print(f"[CONNECTION ERROR] {e}")

    # Poll the API every 10 seconds for the hackathon demo
    time.sleep(10)