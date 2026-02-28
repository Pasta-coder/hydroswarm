import json
import time
import random
import re
from pathlib import Path
from confluent_kafka import Producer

# Connect to Redpanda/Kafka
conf = {'bootstrap.servers': 'localhost:9092'}
producer = Producer(conf)
topic = "drainage-v7"

ZONE_CONFIG_PATH = Path(__file__).parent / "active_zone.json"

def get_location_slug():
    """Read active_zone.json and return a short slug for sensor naming."""
    try:
        if ZONE_CONFIG_PATH.exists():
            with open(ZONE_CONFIG_PATH) as f:
                config = json.load(f)
            loc = config.get("location", "unknown")
            # Extract first meaningful word (skip coordinates-only names)
            # e.g. "Mumbai, Maharashtra" → "mumbai"
            # e.g. "28.5355, 77.3910" → "sector"
            parts = loc.split(",")
            word = parts[0].strip().lower()
            # If it looks like a number (coordinate), use a fallback
            if re.match(r'^-?\d+\.?\d*$', word):
                return "sector"
            # Clean to alphanumeric + underscore
            slug = re.sub(r'[^a-z0-9]', '_', word).strip('_')
            return slug[:20] if slug else "zone"
    except (json.JSONDecodeError, IOError):
        pass
    return "zone"

print(f"🌊 Starting HydroSwarm IoT Firehose on topic: {topic}...")

last_slug = None
sensors = []

try:
    while True:
        # Re-read zone config each cycle so sensors update when location changes
        slug = get_location_slug()
        if slug != last_slug:
            sensors = [f"{slug}_drain_1", f"{slug}_drain_2", f"{slug}_drain_3"]
            last_slug = slug
            print(f"📍 Location updated → sensors: {sensors}")

        for sensor in sensors:
            payload = {
                "sensor_id": sensor,
                "water_level_cm": round(45.0 + random.uniform(-2.0, 8.0), 2),
                "timestamp": time.time()
            }
            producer.produce(topic, json.dumps(payload).encode('utf-8'))
            producer.poll(0)

        time.sleep(0.05)  # Blast 20 events per second

except KeyboardInterrupt:
    print("\nShutting down firehose.")
    producer.flush()