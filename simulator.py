import json
import time
import random
import os

# Ensure the stream directory exists
os.makedirs("stream", exist_ok=True)

print("⛈️  HydroSwarm Weather Simulator Started...")
print("Dropping live rainfall data into ./stream folder. Press Ctrl+C to stop.")

counter = 1
try:
    while True:
        # Generate mock data mimicking an API payload
        payload = {
            "event_id": counter,
            "location": "Sector 62, Noida",
            "rainfall_mm_per_hr": round(random.uniform(0, 150), 2),
            "timestamp": time.time()
        }

        # Drop the new data into the watched folder
        filename = f"stream/rain_event_{counter}.json"
        with open(filename, "w") as f:
            json.dump(payload, f)

        print(f"[{counter}] Generated: {payload['rainfall_mm_per_hr']} mm/hr at {payload['location']}")

        counter += 1
        time.sleep(3) # Wait 3 seconds before the next event
except KeyboardInterrupt:
    print("\nSimulator stopped.")