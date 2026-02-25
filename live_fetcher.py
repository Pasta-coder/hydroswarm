import requests
import json
import time
import os

os.makedirs("stream", exist_ok=True)

# The ID for the 2026-2030 Relative Humidity dataset you found
DATASET_ID = "956e00cb-c1a4-471e-ab60-dd10b79737c9"
URL = f"https://[INSERT_NWPD_BASE_URL_HERE]/resource/{DATASET_ID}"

# The payload simulating the "Go to Filter" button clicks
payload = {
    "format": "json",
    "filters": {
        "State": "Karnataka",
        "District": "Belagavi" # We can loop through the districts later
    }
}

print("🌍 Connecting to Karnataka Water Department API...")

while True:
    try:
        response = requests.post(URL, data=payload)
        if response.status_code == 200:
            data = response.json()

            # Save the live data for Pathway to ingest
            timestamp = int(time.time())
            filename = f"stream/karnataka_telemetry_{timestamp}.json"

            with open(filename, "w") as f:
                json.dump(data, f)

            print(f"[SUCCESS] Fetched live data for Belagavi. Pathway triggered.")
        else:
            print(f"[ERROR] API returned {response.status_code}")

    except Exception as e:
        print(f"[CONNECTION ERROR] {e}")

    # In production, this would be 3600 (1 hour). For hackathon testing, use 10 seconds.
    time.sleep(10)