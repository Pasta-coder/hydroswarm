# HydroSwarm — Improvement Roadmap

> **Purpose of this document:** Concrete, prioritized improvements for HydroSwarm. Each improvement includes the problem it solves, the exact files to change, estimated effort, and a realistic drop-in implementation. Organized by priority tier. Feed this to an LLM to generate implementation PRs or discuss trade-offs.

---

## Tier 1: Critical Fixes (< 2 hours each)

### 1.1 Create a Centralized Config System

**Problem:** 17 hardcoded values scattered across 6 files (see `04_HARDCODED_LOGIC.md`). Changing anything requires editing source code.

**Files to create/modify:** New `config.py`, modify all agent files + `live_fetcher.py` + `rag_memory.py` + `main.py`

**Implementation:**
```python
# config.py
import os
from dotenv import load_dotenv

load_dotenv()

# Location
LOCATION_NAME = os.getenv("LOCATION_NAME", "Noida Sector 62")
LATITUDE = float(os.getenv("LATITUDE", "28.5355"))
LONGITUDE = float(os.getenv("LONGITUDE", "77.3910"))

# LLM
LLM_MODEL = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0"))

# RAG
RAG_ENDPOINT = os.getenv("RAG_ENDPOINT", "http://127.0.0.1:8000/v1/retrieve")
RAG_K = int(os.getenv("RAG_K", "5"))
RAG_HOST = os.getenv("RAG_HOST", "0.0.0.0")
RAG_PORT = int(os.getenv("RAG_PORT", "8000"))

# Intervals
FETCH_INTERVAL = int(os.getenv("FETCH_INTERVAL", "10"))
SEARCH_INTERVAL = int(os.getenv("SEARCH_INTERVAL", "60"))
SEARCH_MAX_RESULTS = int(os.getenv("SEARCH_MAX_RESULTS", "5"))

# Demo
DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"
DEMO_INTERVAL = int(os.getenv("DEMO_INTERVAL", "3"))

# Thresholds
PRECIP_THRESHOLD_CASCADE = float(os.getenv("PRECIP_THRESHOLD_CASCADE", "10.0"))
```

Then add a `.env.example`:
```env
LOCATION_NAME=Noida Sector 62
LATITUDE=28.5355
LONGITUDE=77.3910
LLM_MODEL=llama-3.3-70b-versatile
LLM_TEMPERATURE=0
RAG_ENDPOINT=http://127.0.0.1:8000/v1/retrieve
RAG_K=5
DEMO_MODE=false
PRECIP_THRESHOLD_CASCADE=10.0
```

---

### 1.2 Fix `simulator.py` Schema Mismatch or Delete It

**Problem:** `simulator.py` generates JSON with fields `rainfall_mm_per_hr` and location `"Sector 62, Noida"`. `main.py` expects `precipitation_mm`, `soil_moisture_percent`, `surface_runoff_mm`, and location `"Noida Sector 62"`. The 131 stale `rain_event_*.json` files in `./stream/` are poisoning the data folder.

**Fix option A — align the simulator:**
```python
# simulator.py
from config import LOCATION_NAME
import random, json, time, os

os.makedirs("stream", exist_ok=True)
counter = 1
try:
    while True:
        payload = {
            "event_id": counter,
            "location": LOCATION_NAME,
            "precipitation_mm": round(random.uniform(0, 150), 2),
            "soil_moisture_percent": round(random.uniform(10, 100), 2),
            "surface_runoff_mm": round(random.uniform(0, 20), 2),
            "timestamp": time.time()
        }
        filename = f"stream/sim_event_{counter}.json"
        with open(filename, "w") as f:
            json.dump(payload, f)
        print(f"[{counter}] Generated: {payload['precipitation_mm']}mm | {payload['soil_moisture_percent']}% soil | {payload['surface_runoff_mm']}mm runoff")
        counter += 1
        time.sleep(3)
except KeyboardInterrupt:
    print("\nSimulator stopped.")
```

**Fix option B — delete it.** `live_fetcher.py` with `DEMO_MODE=true` already serves the same purpose.

**Immediate cleanup:** Delete the 131 stale `rain_event_*.json` files:
```bash
rm ./stream/rain_event_*.json
```

---

### 1.3 Fix the `sys.stdout` Output Sink

**Problem:** `pw.io.csv.write(ai_decisions, "sys.stdout")` writes to a file named `sys.stdout`, not to the terminal. The file grows unbounded and nobody consumes it.

**Fix:**
```python
# main.py — replace the last 2 lines

# Option A: Print to terminal + save to dated file
import datetime

output_dir = "output"
os.makedirs(output_dir, exist_ok=True)
output_file = f"{output_dir}/alerts_{datetime.date.today().isoformat()}.csv"
pw.io.csv.write(ai_decisions, output_file)

# Also print to terminal for real-time monitoring
def on_alert(key, row, time, is_addition):
    if is_addition:
        data = json.loads(row["ai_debate"])
        print(f"\n{'='*60}")
        print(f"🚨 ALERT: {row['location']} | Rain: {row['precipitation_mm']}mm")
        print(f"   Sentinel:       {data['sentinel'][:80]}...")
        print(f"   Infrastructure: {data['infrastructure'][:80]}...")
        print(f"   Policy:         {data['policy'][:80]}...")
        print(f"   Commander:      {data['commander'][:80]}...")
        print(f"{'='*60}\n")

pw.io.subscribe(ai_decisions, on_change=on_alert)
pw.run()
```

---

### 1.4 Add Error Handling Around LLM Calls

**Problem:** If Groq's API returns a rate limit error, timeout, or 500, the exception propagates through the UDF, crashing the Pathway stream. There is zero retry logic.

**Files:** All 4 agent files

**Fix — add retry with exponential backoff:**
```python
# agents/llm_config.py
import time
from langchain_groq import ChatGroq
from config import LLM_MODEL, LLM_TEMPERATURE

def get_llm() -> ChatGroq:
    return ChatGroq(model=LLM_MODEL, temperature=LLM_TEMPERATURE)

def safe_llm_invoke(llm, prompt: str, agent_name: str, max_retries: int = 3) -> str:
    """Invoke LLM with retry logic. Returns fallback string on total failure."""
    for attempt in range(max_retries):
        try:
            response = llm.invoke(prompt)
            return response.content
        except Exception as e:
            wait_time = 2 ** attempt  # 1s, 2s, 4s
            print(f"⚠️ [{agent_name}] LLM call failed (attempt {attempt+1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                print(f"   Retrying in {wait_time}s...")
                time.sleep(wait_time)
    return f"[{agent_name}] FAILED: Unable to generate response after {max_retries} attempts. Manual intervention required."
```

Then in each agent:
```python
from .llm_config import get_llm, safe_llm_invoke

llm = get_llm()

def sentinel_agent(state: SwarmState):
    prompt = f"..."
    content = safe_llm_invoke(llm, prompt, "Sentinel")
    return {"sentinel_alert": content}
```

---

### 1.5 Increase RAG Retrieval to k=5 and Concatenate Results

**Problem:** `k=1` retrieves a single document from a 2-document corpus. Half the knowledge base is always ignored.

**File:** `infrastructure.py`

**Fix:**
```python
from config import RAG_ENDPOINT, RAG_K

try:
    response = requests.post(
        RAG_ENDPOINT,
        json={"query": f"Infrastructure drainage capacity and protocol for {state['location']}", "k": RAG_K},
        timeout=5  # also add a timeout!
    )
    docs = response.json()

    if docs and len(docs) > 0:
        # Concatenate ALL retrieved documents, not just the first
        rag_context = "\n---\n".join([
            doc.get("text", "").strip()
            for doc in docs
            if doc.get("text", "").strip()
        ])
        if not rag_context:
            rag_context = "No specific data found in any retrieved documents."
    else:
        rag_context = "No infrastructure data available for this sector."
except requests.exceptions.Timeout:
    rag_context = "⚠️ RAG server timed out. Using conservative defaults."
except Exception as e:
    rag_context = f"⚠️ RAG unavailable ({type(e).__name__}). Report is UNVERIFIED."
```

---

## Tier 2: High-Impact Improvements (2–6 hours each)

### 2.1 Add Structured Output Parsing to All Agents

**Problem:** All agent outputs are free-text strings with no validation. Prompt instructions ("exactly one sentence", "2-sentence directive") are violated 100% of the time.

**Implementation:**
```python
# agents/schemas.py
from pydantic import BaseModel, Field

class SentinelOutput(BaseModel):
    threat_level: str = Field(description="Exactly one of: LOW, MODERATE, SEVERE, CRITICAL")
    primary_driver: str = Field(description="The environmental factor driving the risk")
    summary: str = Field(description="One sentence, max 30 words")

class InfrastructureOutput(BaseModel):
    can_handle: bool = Field(description="Can existing infrastructure handle this event?")
    capacity_status: str = Field(description="e.g., '145% over capacity'")
    impact_summary: str = Field(description="Two sentences max")

class PolicyOutput(BaseModel):
    primary_action: str = Field(description="The main deployment action, one sentence")
    contingency: str = Field(description="Fallback plan if primary action fails, one sentence")
    bottleneck: str = Field(description="The anticipated failure point")

class CommanderOutput(BaseModel):
    alert_level: str = Field(description="GREEN, YELLOW, ORANGE, or RED")
    action_plan: str = Field(description="Two sentences max for ground workers")
    evacuation_needed: bool
    affected_zones: list[str] = Field(description="List of affected areas")
```

Then use in each agent:
```python
from langchain_core.output_parsers import PydanticOutputParser
from .schemas import SentinelOutput

parser = PydanticOutputParser(pydantic_object=SentinelOutput)

def sentinel_agent(state: SwarmState):
    prompt = f"""
    {existing_prompt}

    {parser.get_format_instructions()}
    """
    response = llm.invoke(prompt)
    try:
        parsed = parser.parse(response.content)
        return {
            "sentinel_alert": parsed.summary,
            "threat_level": parsed.threat_level,
        }
    except Exception:
        # Fallback: use raw content if parsing fails
        return {"sentinel_alert": response.content}
```

---

### 2.2 Add Conditional Routing in LangGraph

**Problem:** Every weather event triggers all 4 agents, even light rain (0.1mm). This wastes ~15 seconds of compute and API tokens on non-events.

**File:** `agents/graph.py`

**Implementation:**
```python
from langgraph.graph import StateGraph, END
from .state import SwarmState
from .sentinel import sentinel_agent
from .infrastructure import infrastructure_agent
from .policy import policy_agent
from .commander import commander_agent

workflow = StateGraph(SwarmState)
workflow.add_node("sentinel", sentinel_agent)
workflow.add_node("infrastructure", infrastructure_agent)
workflow.add_node("policy", policy_agent)
workflow.add_node("commander", commander_agent)
workflow.add_node("log_only", lambda state: {"final_plan": "LOW RISK — No action needed. Logged for records."})

workflow.set_entry_point("sentinel")

# Route based on sentinel's assessment
def severity_router(state: SwarmState) -> str:
    alert = state.get("sentinel_alert", "").upper()
    if any(word in alert for word in ["CRITICAL", "SEVERE", "EMERGENCY", "FLASH FLOOD"]):
        return "infrastructure"  # full cascade
    elif any(word in alert for word in ["MODERATE", "ELEVATED", "WARNING"]):
        return "policy"          # skip infrastructure
    else:
        return "log_only"        # skip everything

workflow.add_conditional_edges("sentinel", severity_router, {
    "infrastructure": "infrastructure",
    "policy": "policy",
    "log_only": "log_only",
})

workflow.add_edge("infrastructure", "policy")
workflow.add_edge("policy", "commander")
workflow.add_edge("commander", END)
workflow.add_edge("log_only", END)

hydro_brain = workflow.compile()
```

**Impact:** Reduces average latency from ~15s to ~4s for non-critical events. Saves ~75% of Groq API costs.

---

### 2.3 Unify Pathway Runtimes into a Single Process

**Problem:** `main.py` and `rag_memory.py` run as separate processes. The infrastructure agent makes an HTTP round-trip to `rag_memory.py`. If `rag_memory.py` isn't running, the fallback silently provides garbage context.

**Implementation — merge into one process:**
```python
# unified_main.py
import pathway as pw
from pathway.xpacks.llm.vector_store import VectorStoreServer
from pathway.xpacks.llm.embedders import SentenceTransformerEmbedder
from agents import hydro_brain
import json
import threading

# 1. Start the RAG server in a background thread
def start_rag_server():
    data_sources = pw.io.fs.read("./data", format="binary", with_metadata=True)
    server = VectorStoreServer(
        data_sources,
        embedder=SentenceTransformerEmbedder(model="all-MiniLM-L6-v2"),
    )
    server.run_server(host="0.0.0.0", port=8000)

rag_thread = threading.Thread(target=start_rag_server, daemon=True)
rag_thread.start()

# Wait for RAG server to be ready
import time, requests
for _ in range(30):
    try:
        requests.get("http://127.0.0.1:8000/")
        print("✅ RAG server ready")
        break
    except:
        time.sleep(1)

# 2. Then run the main pipeline (as before)
class WeatherSchema(pw.Schema):
    # ...existing schema...

weather_stream = pw.io.fs.read("./stream", format="json", schema=WeatherSchema, mode="streaming")
# ...rest of pipeline...
```

**Note:** This is a practical intermediate step. The ideal long-term solution is to use Pathway table joins instead of HTTP, but that requires deeper refactoring of how agents access RAG data.

---

### 2.4 Add a Startup Script and Process Orchestrator

**Problem:** The user must manually start 3 processes in the right order: `rag_memory.py` first, then `live_fetcher.py`, then `main.py`. If the order is wrong, things silently break.

**Implementation — create `start.sh`:**
```bash
#!/bin/bash
set -e

echo "🚀 Starting HydroSwarm..."

# Clean stale stream files
rm -f ./stream/rain_event_*.json
echo "🧹 Cleaned stale simulator data"

# Start RAG Memory server
echo "🧠 Starting RAG Memory Server..."
python rag_memory.py &
RAG_PID=$!

# Wait for RAG to be healthy
echo "⏳ Waiting for RAG server on port 8000..."
for i in {1..30}; do
    if curl -s http://127.0.0.1:8000/ > /dev/null 2>&1; then
        echo "✅ RAG server ready"
        break
    fi
    sleep 1
done

# Start the data fetcher
echo "🌍 Starting Live Fetcher..."
python live_fetcher.py &
FETCHER_PID=$!

# Start the main AI engine
echo "🤖 Starting AI Engine..."
python main.py &
MAIN_PID=$!

echo ""
echo "=========================================="
echo "  HydroSwarm is running!"
echo "  RAG Server PID:   $RAG_PID"
echo "  Live Fetcher PID: $FETCHER_PID"
echo "  AI Engine PID:    $MAIN_PID"
echo "=========================================="

# Wait for all processes
wait
```

---

## Tier 3: Strategic Improvements (1–3 days each)

### 3.1 Add Temporal Windowing for Trend Detection

**Problem:** Each weather event is processed in isolation. The system cannot detect "rainfall has been increasing for the last 30 minutes" or "this is the 5th consecutive critical alert."

**File:** `main.py`

**Implementation:**
```python
from datetime import timedelta

# Sliding window aggregation
windowed_weather = weather_stream.windowby(
    weather_stream.timestamp,
    window=pw.temporal.sliding(
        duration=timedelta(minutes=30),
        hop=timedelta(minutes=5),
    ),
    behavior=pw.temporal.common_behavior(cutoff=timedelta(minutes=60)),
).reduce(
    location=pw.reducers.latest(pw.this.location),
    avg_precip=pw.reducers.avg(pw.this.precipitation_mm),
    max_precip=pw.reducers.max(pw.this.precipitation_mm),
    latest_precip=pw.reducers.latest(pw.this.precipitation_mm),
    avg_soil=pw.reducers.avg(pw.this.soil_moisture_percent),
    event_count=pw.reducers.count(),
)

# Enrich the state passed to agents with trend data
@pw.udf
def trigger_swarm_with_context(
    location: str, precip: float, soil: float, runoff: float,
    avg_precip: float, max_precip: float, event_count: int
) -> str:
    initial_state = {
        "location": location,
        "precipitation": precip,
        "soil_moisture": soil,
        "runoff": runoff,
        "trend_context": f"30min avg: {avg_precip:.1f}mm, max: {max_precip:.1f}mm, events: {event_count}",
        # ...
    }
```

---

### 3.2 Add a Web Dashboard

**Problem:** Output goes to a CSV file that nobody reads. There's no UI for monitoring.

**Implementation — add a FastAPI + WebSocket server:**
```python
# dashboard.py
from fastapi import FastAPI, WebSocket
from fastapi.responses import HTMLResponse
import json

app = FastAPI()
connected_clients: list[WebSocket] = []

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.append(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep alive
    except:
        connected_clients.remove(websocket)

async def broadcast_alert(alert_data: dict):
    for client in connected_clients:
        try:
            await client.send_json(alert_data)
        except:
            connected_clients.remove(client)

@app.get("/")
async def dashboard():
    return HTMLResponse("""
    <html>
    <head><title>HydroSwarm Dashboard</title></head>
    <body>
        <h1>🌊 HydroSwarm Live Alerts</h1>
        <div id="alerts"></div>
        <script>
            const ws = new WebSocket('ws://localhost:8080/ws');
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                const div = document.createElement('div');
                div.innerHTML = `
                    <div style="border:2px solid red; padding:10px; margin:10px;">
                        <h3>🚨 ${data.location} — ${data.alert_level}</h3>
                        <p><b>Sentinel:</b> ${data.sentinel}</p>
                        <p><b>Plan:</b> ${data.commander}</p>
                        <small>${new Date().toLocaleTimeString()}</small>
                    </div>`;
                document.getElementById('alerts').prepend(div);
            };
        </script>
    </body>
    </html>
    """)
```

Then in `main.py`, replace the CSV sink with a WebSocket push:
```python
@pw.udf
def trigger_swarm_and_broadcast(location, precip, soil, runoff) -> str:
    result = hydro_brain.invoke(initial_state)
    # Push to WebSocket dashboard
    import asyncio, aiohttp
    alert = {"location": location, "precipitation": precip, **result}
    # ... broadcast via HTTP or queue
    return json.dumps(result)
```

---

### 3.3 Add Persistent Alert History with SQLite

**Problem:** Once the system restarts, all history is lost. No audit trail.

**Implementation:**
```python
# alert_store.py
import sqlite3
import json
from datetime import datetime

DB_PATH = "hydroswarm_alerts.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            location TEXT,
            precipitation REAL,
            soil_moisture REAL,
            runoff REAL,
            sentinel TEXT,
            infrastructure TEXT,
            policy TEXT,
            commander TEXT,
            threat_level TEXT
        )
    """)
    conn.commit()
    return conn

def save_alert(conn, location, precip, soil, runoff, result):
    conn.execute("""
        INSERT INTO alerts (timestamp, location, precipitation, soil_moisture, runoff,
                           sentinel, infrastructure, policy, commander)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        datetime.now().isoformat(), location, precip, soil, runoff,
        result["sentinel_alert"], result["infrastructure_report"],
        result["policy_directive"], result["final_plan"]
    ))
    conn.commit()

def get_recent_alerts(conn, location, hours=1):
    """Get alerts from the last N hours for trend analysis."""
    cursor = conn.execute("""
        SELECT * FROM alerts
        WHERE location = ? AND timestamp > datetime('now', ?)
        ORDER BY timestamp DESC
    """, (location, f"-{hours} hours"))
    return cursor.fetchall()
```

---

### 3.4 Add a `requirements.txt`

**Problem:** No dependency file exists. A new developer has no idea what to `pip install`.

**Implementation — create `requirements.txt`:**
```
pathway>=0.13.0
langchain-groq>=0.2.0
langgraph>=0.2.0
langchain-core>=0.3.0
python-dotenv>=1.0.0
requests>=2.31.0
duckduckgo-search>=6.0.0
sentence-transformers>=2.2.0
pydantic>=2.0.0
```

---

### 3.5 Add Logging Instead of Print Statements

**Problem:** All 10 files use `print()` for output. No log levels, no log files, no structured logging. You can't distinguish a normal status message from a critical error.

**Implementation:**
```python
# logger.py
import logging
import sys

def setup_logger(name: str, level: str = "INFO") -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, level.upper()))

    # Console handler with color
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(logging.Formatter(
        "%(asctime)s | %(name)-15s | %(levelname)-7s | %(message)s",
        datefmt="%H:%M:%S"
    ))
    logger.addHandler(console)

    # File handler for persistent logs
    file_handler = logging.FileHandler("hydroswarm.log")
    file_handler.setFormatter(logging.Formatter(
        "%(asctime)s | %(name)s | %(levelname)s | %(message)s"
    ))
    logger.addHandler(file_handler)

    return logger
```

Then in agents:
```python
# sentinel.py
from .logger import setup_logger
log = setup_logger("Sentinel")

def sentinel_agent(state: SwarmState):
    log.info(f"Analyzing stream for {state['location']}")
    # ...
    log.warning(f"Threat level: CRITICAL")  # or log.error() for failures
```

---

## Tier 4: Production Readiness (1 week+)

### 4.1 Replace File-Based IPC with a Message Broker

Replace `./stream/` folder with Redis Streams or Kafka for proper ordering, replay, and backpressure.

### 4.2 Add Multi-Location Support

Use `config/locations.json` to monitor multiple cities in parallel via `weather_stream.groupby(location)`.

### 4.3 Add Authentication and Rate Limiting to the RAG Server

The vector store is currently open on `0.0.0.0:8000` with no auth.

### 4.4 Add Docker Compose

Package all 3 processes into containers with health checks and dependency ordering.

### 4.5 Add Tests

Zero tests exist. Add unit tests for each agent function and integration tests for the full pipeline.

---

## Priority Matrix

| Improvement | Impact | Effort | Priority |
|-------------|--------|--------|----------|
| 1.1 Config system | High — fixes 17 hardcoded values | 1 hour | 🔴 Do now |
| 1.2 Fix/delete simulator | Medium — removes broken data | 15 min | 🔴 Do now |
| 1.3 Fix output sink | High — makes system observable | 30 min | 🔴 Do now |
| 1.4 LLM error handling | Critical — prevents stream crashes | 1 hour | 🔴 Do now |
| 1.5 RAG k=5 + concatenation | Medium — doubles available context | 15 min | 🔴 Do now |
| 2.1 Structured output parsing | High — enforces agent contracts | 3 hours | 🟡 This week |
| 2.2 Conditional LangGraph routing | High — saves 75% API cost | 2 hours | 🟡 This week |
| 2.3 Unify Pathway runtimes | Medium — eliminates HTTP fragility | 4 hours | 🟡 This week |
| 2.4 Startup script | Medium — fixes process ordering | 30 min | 🟡 This week |
| 3.1 Temporal windowing | Very High — enables trend detection | 1 day | 🟢 Next sprint |
| 3.2 Web dashboard | High — makes output usable | 1 day | 🟢 Next sprint |
| 3.3 Alert history DB | Medium — audit trail | 3 hours | 🟢 Next sprint |
| 3.4 requirements.txt | Low — but critical for onboarding | 10 min | 🔴 Do now |
| 3.5 Proper logging | Medium — debugging & monitoring | 2 hours | 🟡 This week |
