# HydroSwarm — Data Flow Architecture

> **Purpose of this document:** Provide a complete, auditable map of how data moves through HydroSwarm from raw API ingestion to final AI decision output. Feed this to an LLM for architecture review, optimization suggestions, or onboarding new contributors.

---

## 1. System Topology (Bird's Eye)

HydroSwarm runs as **three independent OS processes** that communicate via the filesystem and HTTP:

```
Process A: live_fetcher.py          Process B: rag_memory.py              Process C: main.py
┌──────────────────────┐            ┌───────────────────────────┐         ┌──────────────────────────┐
│ Polls Open-Meteo API │            │ BG Thread: DuckDuckGo     │         │ Pathway streaming engine │
│ every 10 seconds     │            │   search every 60s        │         │                          │
│                      │            │         │                 │         │  fs.read("./stream")     │
│  Writes JSON ────────────────┐    │  Writes ▼ to ./data/     │         │         │                │
│  to ./stream/        │      │     │         │                 │         │  filter(precip > 0)      │
└──────────────────────┘      │     │  Pathway fs.read("./data")│         │         │                │
                              │     │         │                 │         │  UDF: trigger_swarm()    │
                              │     │  SentenceTransformer embed│         │    │                     │
                              │     │         │                 │         │    ├─ sentinel_agent      │
                              │     │  VectorStoreServer        │         │    │   (Groq LLM)        │
                              │     │    localhost:8000   ◀──────────────────  ├─ infrastructure_agent│
                              │     │                           │  HTTP   │    │   (Groq + RAG)      │
                              │     └───────────────────────────┘  POST   │    ├─ policy_agent       │
                              │                                           │    │   (Groq LLM)        │
                              ▼                                           │    └─ commander_agent    │
                        ┌──────────┐                                      │         │                │
                        │./stream/ │──────────────────────────────────────▶│  pw.io.csv.write        │
                        │  folder  │                                      │    → "sys.stdout" file   │
                        └──────────┘                                      └──────────────────────────┘
```

**Key takeaway:** The filesystem (`./stream/` and `./data/`) is the sole integration bus. There is no message queue, database, or WebSocket.

---

## 2. Data Journey — Step by Step

### Phase 1: Data Acquisition

| Step | File | What Happens | Output |
|------|------|-------------|--------|
| 1a | `live_fetcher.py` | HTTP GET to `api.open-meteo.com` with coordinates `(28.5355, 77.3910)` — Noida region. Extracts `precipitation`, `soil_moisture_0_to_7cm`, and `runoff` from the `hourly` response array. | Raw weather metrics |
| 1b | `live_fetcher.py` | **Demo Override:** Every 3rd request (`counter % 3 == 0`), hard-coded storm values replace real data: `precip=65.5`, `soil=0.95`, `runoff=12.0`. | Overridden metrics |
| 1c | `live_fetcher.py` | Assembles a JSON payload and writes it to `./stream/open_meteo_{counter}.json`. | JSON file on disk |

**Alternative Path:** `simulator.py` generates random `rainfall_mm_per_hr` (0–150) with a **different schema** (`rainfall_mm_per_hr` instead of `precipitation_mm`, missing `soil_moisture_percent` and `surface_runoff_mm`). These files are **incompatible** with `main.py`'s `WeatherSchema` and will cause runtime schema errors if `main.py` tries to ingest them.

### Phase 2: RAG Knowledge Base (Parallel Sidecar)

| Step | File | What Happens | Output |
|------|------|-------------|--------|
| 2a | `rag_memory.py` (bg thread) | DuckDuckGo text search for `"Noida Sector 62 drainage capacity waterlogging infrastructure news"`, retrieves top 3 results. | Web snippets |
| 2b | `rag_memory.py` (bg thread) | Formats results + appends hardcoded baseline metric (`"Sector 62 baseline drainage limit is 45mm/hr"`) and writes to `./data/live_search_data.txt`. | Text file on disk |
| 2c | `rag_memory.py` (Pathway) | `pw.io.fs.read("./data", format="binary")` detects the file change and re-ingests both `live_search_data.txt` and `infrastructure_data.txt`. | Pathway Table rows |
| 2d | `rag_memory.py` (Pathway) | `SentenceTransformerEmbedder("all-MiniLM-L6-v2")` embeds the documents. `VectorStoreServer` serves the index on `0.0.0.0:8000`. | Searchable vector index via REST API |

**Static data also present:** `data/infrastructure_data.txt` (4 lines of handwritten infrastructure specs for Noida Sector 62) is permanently indexed alongside the dynamic web data.

### Phase 3: Streaming Ingestion & Filtering

| Step | File | What Happens | Output |
|------|------|-------------|--------|
| 3a | `main.py` | `pw.io.fs.read("./stream", format="json", schema=WeatherSchema, mode="streaming")` watches the `./stream/` folder for new JSON files. | Pathway streaming table |
| 3b | `main.py` | `.filter(weather_stream.precipitation_mm > 0.0)` — only events with non-zero precipitation pass through. All dry-weather events are silently discarded. | Filtered table |

### Phase 4: AI Agent Cascade (Inside Pathway UDF)

The entire 4-agent LangGraph chain runs **synchronously inside a single `@pw.udf`** call per weather event:

| Step | Agent | Reads From State | External Calls | Writes to State |
|------|-------|--------------------|----------------|-----------------|
| 4a | **Sentinel** | `location`, `precipitation`, `soil_moisture`, `runoff` | Groq API (`llama-3.3-70b-versatile`, temp=0) | `sentinel_alert` |
| 4b | **Infrastructure** | `sentinel_alert`, `location` | Groq API + HTTP POST to `localhost:8000/v1/retrieve` (RAG, k=1) | `infrastructure_report` |
| 4c | **Policy** | `sentinel_alert`, `infrastructure_report` | Groq API | `policy_directive` |
| 4d | **Commander** | `sentinel_alert`, `infrastructure_report`, `policy_directive` | Groq API | `final_plan` |

**Execution model:** Strictly sequential via LangGraph `StateGraph` with linear edges. No branching, no conditional routing, no parallelism. Each agent must complete before the next begins.

### Phase 5: Output

| Step | File | What Happens | Output |
|------|------|-------------|--------|
| 5a | `main.py` (UDF return) | All 4 agent outputs are packed into a single JSON string via `json.dumps()`. | `str` containing nested JSON |
| 5b | `main.py` | `pw.io.csv.write(ai_decisions, "sys.stdout")` appends a CSV row with columns: `location`, `precipitation_mm`, `ai_debate`, `time`, `diff`. | Appended to file `./sys.stdout` on disk |

---

## 3. Data Schemas at Each Boundary

### 3a. `live_fetcher.py` Output / `main.py` Input (JSON on disk)

```json
{
  "event_id": 3,
  "location": "Noida Sector 62",
  "precipitation_mm": 65.5,
  "soil_moisture_percent": 95.0,
  "surface_runoff_mm": 12.0,
  "timestamp": 1772001533.19
}
```

### 3b. `simulator.py` Output (JSON on disk) — ⚠️ INCOMPATIBLE

```json
{
  "event_id": 1,
  "location": "Sector 62, Noida",
  "rainfall_mm_per_hr": 82.41,
  "timestamp": 1772000000.0
}
```

Missing fields: `precipitation_mm`, `soil_moisture_percent`, `surface_runoff_mm`. Location string also differs (`"Sector 62, Noida"` vs `"Noida Sector 62"`). **This will crash `main.py` at ingest time.**

### 3c. `SwarmState` TypedDict (LangGraph Internal)

```python
{
    "location": str,              # from weather event
    "precipitation": float,       # from weather event
    "soil_moisture": float,       # from weather event
    "runoff": float,              # from weather event
    "sentinel_alert": str,        # populated by Sentinel agent
    "infrastructure_report": str, # populated by Infrastructure agent
    "policy_directive": str,      # populated by Policy agent
    "final_plan": str             # populated by Commander agent
}
```

### 3d. RAG Retrieval Request/Response (HTTP at `localhost:8000`)

**Request:**
```json
POST /v1/retrieve
{"query": "Infrastructure drainage capacity and protocol for Noida Sector 62", "k": 1}
```

**Response:**
```json
[{"text": "Location: Noida Sector 62\nClassification: High-Risk...", "metadata": {...}}]
```

Only `k=1` document is retrieved. The `infrastructure_agent` reads `docs[0].get("text")`.

### 3e. Final CSV Output (`sys.stdout` file)

```csv
"location","precipitation_mm","ai_debate","time","diff"
"Noida Sector 62","65.5","{\"sentinel\":\"...\",\"infrastructure\":\"...\",\"policy\":\"...\",\"commander\":\"...\"}","1772001525014","1"
```

The `time` and `diff` columns are auto-generated by Pathway's streaming engine.

---

## 4. Timing & Throughput Analysis

| Component | Frequency / Trigger | Estimated Latency |
|-----------|---------------------|-------------------|
| `live_fetcher.py` polling | Every 10 seconds | ~200ms per API call |
| `rag_memory.py` web search | Every 60 seconds | 2–5 seconds |
| Pathway file detection | On OS file write (inotify) | <100ms |
| Sentinel LLM call | Per weather event | 2–6 seconds |
| Infrastructure RAG retrieval | Per weather event | 100–500ms |
| Infrastructure LLM call | Per weather event | 2–6 seconds |
| Policy LLM call | Per weather event | 2–6 seconds |
| Commander LLM call | Per weather event | 2–6 seconds |
| **Total per-event latency** | — | **~8–25 seconds** |

**Critical bottleneck:** The UDF is synchronous and blocking. If `live_fetcher.py` drops 3 files in 30 seconds but each UDF invocation takes 15 seconds, events **queue up and fall behind real-time**. There is no backpressure or rate-limiting mechanism.

---

## 5. Failure Modes & Missing Error Paths

| Failure Scenario | Current Handling | Downstream Impact |
|-----------------|------------------|--------------------|
| Open-Meteo API down | `print("[CONNECTION ERROR]")`, loop continues | No new data enters the system; AI agents are never triggered; system goes silent with no alert |
| `rag_memory.py` not started before `main.py` | `infrastructure_agent` catches the `requests.post` exception, uses `"Database offline. Fallback mode engaged."` | LLM receives zero grounding context and hallucinates infrastructure data freely |
| Groq API rate limit / timeout | **No handling whatsoever** — exception propagates up | UDF crashes, Pathway may halt the entire stream permanently |
| Groq API key missing or invalid | **No handling** — `ChatGroq` raises at import time | `main.py` fails to start entirely |
| Malformed JSON in `./stream/` | Pathway schema validation rejects the row | Row is silently dropped with no alert or log |
| DuckDuckGo search returns 0 results | Writes header + hardcoded baseline only | RAG context is minimal but functional |
| `./stream/` folder doesn't exist at `main.py` start | **Not created by `main.py`** — only by `live_fetcher.py` | Pathway throws an error if folder is missing |
| `sys.stdout` file grows unbounded | **No handling** — file is appended to forever | Disk space exhaustion over long runs |

---

## 6. File Accumulation Problem

The `./stream/` directory currently contains **131+ JSON files** (`open_meteo_*` and `rain_event_*`). These are never cleaned up. On each restart of `live_fetcher.py`, the counter resets to `1` and **overwrites** old files (potential data loss or replay). Over long operation:

- Disk usage grows linearly.
- Pathway may attempt to re-ingest old files on restart depending on its checkpointing behavior.
- No deduplication: if the same file is overwritten, Pathway may process it again.

---

## 7. Suggested Architectural Improvements

| Current | Problem | Suggested Replacement |
|---------|---------|----------------------|
| Filesystem IPC (`./stream/` folder) | Fragile, no ordering guarantees, no cleanup | Kafka topic or Redis Stream with consumer groups |
| Two separate Pathway runtimes | No shared state, HTTP glue between them | Single Pathway program with `pw.Table.join()` |
| Synchronous UDF with 4 LLM calls | Blocks the stream for 8–25 seconds per event | `pw.udfs.async_executor()` or an external async task queue (Celery) |
| CSV file output (`sys.stdout`) | Misleading name, grows unbounded, not actionable | WebSocket push to dashboard + PostgreSQL for audit + webhook for SMS/email alerts |
| No temporal windowing | Each event processed in isolation | `pw.temporal.windowby()` for 15/30/60 min trend aggregation |
| No event deduplication | Counter resets on restart → overwrites | Include a UUID or hash-based event ID; Pathway dedup filter |
