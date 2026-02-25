# HydroSwarm — Pathway Integration Assessment

> **Purpose of this document:** Evaluate how deeply and effectively Pathway is integrated into HydroSwarm. Identifies what's used, what's misused, and what's available but untapped. Feed this to an LLM for architecture improvement suggestions or to evaluate Pathway ROI in the project.

---

## 1. Pathway Features Used

### 1.1 In `main.py` (Streaming Pipeline)

| Pathway Feature | Code | Assessment |
|----------------|------|------------|
| `pw.io.fs.read()` | `pw.io.fs.read("./stream", format="json", schema=WeatherSchema, mode="streaming")` | ✅ **Correct.** This is the core value prop — turning a folder into a reactive stream. |
| `pw.Schema` | `class WeatherSchema(pw.Schema)` with typed fields | ✅ **Correct.** Enforces type safety at ingestion. |
| `.filter()` | `weather_stream.filter(weather_stream.precipitation_mm > 0.0)` | ✅ **Correct.** Declarative predicate pushdown. |
| `.select()` | `active_weather.select(active_weather.location, ...)` | ✅ **Correct.** Column projection. |
| `@pw.udf` | Wraps the entire LangGraph 4-agent chain | ⚠️ **Functional but anti-pattern.** UDF is synchronous, blocking, and performs 4 network calls (8–25s latency). |
| `pw.io.csv.write()` | `pw.io.csv.write(ai_decisions, "sys.stdout")` | ⚠️ **Misleading.** Writes to a file named `sys.stdout`, not actual stdout. |
| `pw.run()` | Starts the Pathway event loop | ✅ **Correct.** |

### 1.2 In `rag_memory.py` (Vector Store Server)

| Pathway Feature | Code | Assessment |
|----------------|------|------------|
| `pw.io.fs.read()` | `pw.io.fs.read("./data", format="binary", with_metadata=True)` | ✅ **Correct.** Watches data folder for document changes. |
| `VectorStoreServer` | `VectorStoreServer(data_sources, embedder=...)` | ✅ **Correct.** Pathway's built-in streaming vector store. |
| `SentenceTransformerEmbedder` | `SentenceTransformerEmbedder(model="all-MiniLM-L6-v2")` | ✅ **Correct.** Local embedding model. |
| `server.run_server()` | `server.run_server(host="0.0.0.0", port=8000)` | ✅ **Correct.** REST API for vector retrieval. |

---

## 2. What Pathway Does Well Here

### ✅ Real-Time File Watching
The `pw.io.fs.read("./stream", mode="streaming")` call is the architectural backbone. When `live_fetcher.py` writes a new JSON file, Pathway detects the OS-level file event and triggers the pipeline. This is the **single strongest use of Pathway** in the project — it turns a dumb folder into a reactive data stream without polling or cron jobs.

### ✅ Streaming RAG Re-Indexing
When the background thread in `rag_memory.py` overwrites `data/live_search_data.txt`, Pathway detects the change and re-embeds the document automatically. The vector index stays current without manual reloading. This is genuine streaming ETL for a knowledge base.

### ✅ Schema Enforcement at Ingestion
`WeatherSchema` catches malformed JSON at the boundary. If `simulator.py` drops files with the wrong schema, Pathway rejects them instead of propagating garbage downstream.

---

## 3. What Pathway Features Are Available But NOT Used

This is where the integration falls short. Pathway offers a rich set of streaming operators that are completely untapped:

### 3.1 Temporal Windowing — `pw.temporal.windowby()`

**What it does:** Aggregates streaming data over time windows (tumbling, sliding, session).

**Why HydroSwarm needs it:** A flood monitoring system should detect **trends**, not just react to individual events. Questions that require windowing:

- "Is rainfall increasing over the last 30 minutes?"
- "Has soil moisture been above 80% for more than 1 hour?"
- "What's the average runoff in the last 5 events?"

**Current behavior:** Each event is processed in **complete isolation**. The system has zero temporal memory. A slow 12-hour buildup of rainfall that crosses a threshold would be handled identically to a sudden 5-minute burst — both trigger the same single-event UDF.

**Realistic implementation:**
```python
import pathway as pw
from datetime import timedelta

# Create a sliding window over the last 30 minutes
windowed = weather_stream.windowby(
    weather_stream.timestamp,
    window=pw.temporal.sliding(duration=timedelta(minutes=30), hop=timedelta(minutes=5)),
    behavior=pw.temporal.common_behavior(cutoff=timedelta(minutes=60)),
).reduce(
    avg_precip=pw.reducers.avg(pw.this.precipitation_mm),
    max_precip=pw.reducers.max(pw.this.precipitation_mm),
    event_count=pw.reducers.count(),
    trend=pw.reducers.latest(pw.this.precipitation_mm) - pw.reducers.earliest(pw.this.precipitation_mm),
)

# Only trigger AI agents if the TREND is alarming, not just a single spike
alarming = windowed.filter(
    (windowed.avg_precip > 20.0) | (windowed.trend > 10.0)
)
```

### 3.2 Table Joins — `pw.Table.join()`

**What it does:** Joins two streaming tables on a key, reactively updating when either side changes.

**Why HydroSwarm needs it:** The weather data (`./stream/`) and infrastructure data (`./data/`) are currently in **two separate Pathway processes** communicating via HTTP. This is architecturally fragile (what if the RAG server is down?) and adds ~100–500ms of latency per event.

**Current architecture:**
```
main.py (Process 1)                    rag_memory.py (Process 2)
┌─────────────────┐    HTTP POST       ┌──────────────────┐
│ infrastructure   │──────────────────▶│ VectorStoreServer │
│ _agent          │◀──────────────────│ localhost:8000    │
└─────────────────┘    JSON response   └──────────────────┘
```

**What it should be:**
```python
# Single Pathway program
weather = pw.io.fs.read("./stream", format="json", schema=WeatherSchema, mode="streaming")
infra = pw.io.fs.read("./data", format="binary", with_metadata=True)

# Join on location — no HTTP needed
enriched = weather.join(
    infra,
    pw.left.location == pw.right.location
).select(
    pw.left.location,
    pw.left.precipitation_mm,
    pw.left.soil_moisture_percent,
    pw.right.infrastructure_text,  # directly available, no HTTP call
)
```

### 3.3 Groupby + Reduce — `.groupby().reduce()`

**What it does:** Groups streaming data by a key and applies aggregation.

**Why HydroSwarm needs it:** If the system ever monitors **multiple locations** (which it should), you'd need per-location aggregation:

```python
per_location = weather_stream.groupby(weather_stream.location).reduce(
    location=pw.reducers.any(pw.this.location),
    latest_precip=pw.reducers.latest(pw.this.precipitation_mm),
    max_precip_ever=pw.reducers.max(pw.this.precipitation_mm),
    event_count=pw.reducers.count(),
)
```

Currently, the system is hardcoded to a single location (`"Noida Sector 62"`), so this isn't needed — but it's also the reason the system can't scale.

### 3.4 Multiple Output Sinks

**What's available:**
- `pw.io.kafka.write()` — push to Kafka for downstream consumers
- `pw.io.postgres.write()` — persist to PostgreSQL for audit trails
- `pw.io.http.rest_connector()` — expose results as a REST API
- `pw.io.null.write()` — discard output (useful for side-effect-only pipelines)
- Custom connectors via `pw.io.subscribe()`

**What's used:** `pw.io.csv.write(ai_decisions, "sys.stdout")` — writes to a file named `sys.stdout`. This is the weakest possible output for an emergency response system. The data goes to a file that nobody watches.

**Realistic improvement:**
```python
# Write to multiple sinks simultaneously
pw.io.csv.write(ai_decisions, "audit_log.csv")          # Audit trail
pw.io.postgres.write(ai_decisions, connection_string, "flood_alerts")  # Persistent storage

# Or expose as a live REST API that a dashboard can poll
pw.io.http.rest_connector(
    host="0.0.0.0",
    port=8080,
    schema=AlertSchema,
    delete_completed_queries=True,
)
```

### 3.5 Async UDF Executor

**What's available:** `pw.udfs.async_executor(capacity=...)` — allows UDFs to run asynchronously with configurable concurrency.

**Why HydroSwarm needs it:** The current `@pw.udf` blocks the Pathway event loop for 8–25 seconds per event (4 sequential LLM calls). If events arrive faster than they can be processed, they queue up and the system falls behind real-time.

**Realistic implementation:**
```python
@pw.udf(executor=pw.udfs.async_executor(capacity=4))
async def trigger_swarm(location: str, precip: float, soil: float, runoff: float) -> str:
    initial_state = { ... }
    result = await asyncio.to_thread(hydro_brain.invoke, initial_state)
    return json.dumps(...)
```

### 3.6 Connectors for Real Data Sources

**What's available:**
- `pw.io.kafka.read()` — ingest from Kafka topics
- `pw.io.redis.read()` — ingest from Redis Streams
- `pw.io.http.rest_connector()` — ingest from HTTP/webhook pushes
- `pw.io.s3.read()` — ingest from S3 buckets
- `pw.io.airbyte.read()` — ingest from 300+ Airbyte connectors

**What's used:** `pw.io.fs.read()` — filesystem only. This works for a hackathon demo but is fundamentally not production-grade because:
- No ordering guarantees (filesystem events can arrive out of order)
- No replay (once a file is processed, you can't rewind)
- No partitioning (a single folder can't scale beyond one machine)
- No backpressure (the producer doesn't know if the consumer is overwhelmed)

---

## 4. Misuse: The `sys.stdout` Output Sink

```python
pw.io.csv.write(ai_decisions, "sys.stdout")
```

This writes to a **literal file on disk** named `sys.stdout`, NOT to the actual Python `sys.stdout` stream. Evidence:
- The file `./sys.stdout` exists on disk with 11 lines of CSV data
- It's listed in `.gitignore` as a file to ignore

If the intent was to print to the terminal, the correct approach would be:
```python
# Option A: Use Pathway's subscribe for custom output
pw.io.subscribe(ai_decisions, on_change=lambda key, row, time, is_addition: print(row))

# Option B: If you truly want CSV to stdout, some Pathway versions support "-" as a path
```

---

## 5. Misuse: Two Separate Pathway Runtimes

`main.py` calls `pw.run()`. `rag_memory.py` calls `server.run_server()` (which internally calls `pw.run()`). These are **two independent Pathway engines** in **two OS processes** with **no shared computation graph**.

**Problems:**
1. No startup ordering — `main.py` assumes `rag_memory.py` is already running on port 8000. If it's not, the infrastructure agent silently falls back to `"Database offline."`.
2. No health checking — neither process monitors the other.
3. Wasted resources — two Pathway runtimes, two sets of threads, two sets of file watchers.
4. Lost reactivity — updates to `./data/` are detected by `rag_memory.py` but `main.py` has no way to know the RAG index was updated. It just queries whatever's available at call time.

**Fix: Unify into a single Pathway program.**

```python
# unified_main.py
import pathway as pw

# Both data sources in one program
weather = pw.io.fs.read("./stream", format="json", schema=WeatherSchema, mode="streaming")
infra_docs = pw.io.fs.read("./data", format="binary", with_metadata=True)

# Embedded vector store as a Pathway table operation (no HTTP)
# ... process both in a single pw.run() call
```

---

## 6. Pathway Integration Scorecard

| Criterion | Score | Justification |
|-----------|-------|---------------|
| Correct API usage | 7/10 | All API calls are syntactically correct and functional |
| Streaming paradigm adherence | 3/10 | UDF blocks the stream; events processed in isolation; no windowing |
| Feature utilization breadth | 2/10 | Only `fs.read`, `filter`, `select`, `csv.write`, `VectorStoreServer` used out of 30+ available features |
| Architecture coherence | 3/10 | Two separate runtimes, HTTP glue instead of joins, file-based IPC |
| Production readiness | 2/10 | No error handling around the UDF, no monitoring, no backpressure, no cleanup |
| Scalability potential | 2/10 | Single-location, single-folder, single-threaded UDF; cannot scale horizontally |

**Overall: 3.2 / 10**

Pathway is present in the project and provides genuine value as a file watcher and RAG server, but its powerful streaming computation features (temporal windowing, joins, groupby, async UDFs, multi-sink output, connectors) are entirely untapped. The project uses Pathway as a reactive file reader, not as a streaming computation engine.

---

## 7. Realistic Path to Better Integration

### Quick Wins (< 1 day of work)

1. **Switch to async UDF** — add `executor=pw.udfs.async_executor(capacity=2)` to the `trigger_swarm` UDF.
2. **Increase RAG k** — change `k=1` to `k=5` in the infrastructure agent's retrieval call.
3. **Fix `sys.stdout` output** — use `pw.io.subscribe()` for terminal output or a proper file path like `output/alerts.csv`.
4. **Add `pw.io.subscribe()` for real-time logging** — print each AI decision to the terminal as it's produced.

### Medium-Term (1–3 days)

5. **Unify into a single Pathway runtime** — merge `rag_memory.py` into `main.py`, eliminating the HTTP round-trip.
6. **Add a 30-minute sliding window** — aggregate weather trends before triggering agents, reducing unnecessary LLM calls.
7. **Add a severity threshold** — use Pathway's `.filter()` with a UDF that classifies severity from raw metrics, only invoking the full agent cascade for MODERATE+ events.

### Longer-Term (1 week+)

8. **Replace filesystem IPC with Kafka** — use `pw.io.kafka.read()` for weather ingestion.
9. **Add PostgreSQL output sink** — use `pw.io.postgres.write()` for audit trails.
10. **Multi-location support** — use `.groupby(location)` to process multiple cities in parallel.
