import pathway as pw

# 1. Define the incoming data structure using only basic types
class SensorSchema(pw.Schema):
    sensor_id: str
    water_level_cm: float
    timestamp: float  # <--- No datetime headaches. Just a number.

rdkafka_settings = {
    "bootstrap.servers": "localhost:9092",
    "group.id": "hydroswarm-analytics-v7",
    "session.timeout.ms": "6000",
    "auto.offset.reset": "latest"
}

print("⚡ Pathway initializing Kafka stream (Pure Float Mode)...")

sensor_stream = pw.io.kafka.read(
    rdkafka_settings,
    topic="drainage-v8",
    format="json",
    schema=SensorSchema,
    autocommit_duration_ms=100
)

# 2. Define the shape of the window using pure numbers (10 seconds, 2 sec hops)
window = pw.temporal.sliding(
    duration=10.0,
    hop=2.0
)

# 3. Aggregate the data
aggregated_grid = sensor_stream.windowby(
    sensor_stream.timestamp,
    window=window,
    instance=sensor_stream.sensor_id
).reduce(
    sensor_id=pw.this._pw_instance,
    avg_water_level=pw.reducers.avg(pw.this.water_level_cm)
)

# 4. Output to a JSON Lines file
pw.io.jsonlines.write(aggregated_grid, "frontend/public/grid_status.jsonl")

pw.run()