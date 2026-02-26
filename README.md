<div align="center">


# 🌊 HydroSwarm

### *Real-time multi-agent AI for urban flood response — powered by Pathway streaming.*

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org)
[![Pathway](https://img.shields.io/badge/Pathway-Streaming_Engine-4F46E5?logo=data:image/svg+xml;base64,&logoColor=white)](https://pathway.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![LangGraph](https://img.shields.io/badge/LangGraph-Multi_Agent-1C3C3C?logo=langchain&logoColor=white)](https://langchain-ai.github.io/langgraph/)
[![Groq](https://img.shields.io/badge/Groq-LLM_Inference-F55036)](https://groq.com)

</div>

---

## 📌 The Problem — Why This Matters

Urban flooding kills over **5,000 people annually** and causes **$40B+ in damages** worldwide. In rapidly urbanizing regions like the Delhi-NCR corridor in India, aging drainage infrastructure rated for 25–45 mm/hr routinely faces 80–150 mm/hr cloudbursts. The gap between rainfall intensity and drainage capacity is growing every year.

**Current solutions fall short because they are reactive, not proactive:**

- **Municipal flood monitoring** relies on manual gauge readings and static threshold alerts — no contextual intelligence, no cross-referencing with infrastructure limits.
- **Weather APIs** deliver raw precipitation numbers, but no city has a system that automatically translates a rain forecast into *"evacuate Zone B, reroute traffic via Highway 3, and deploy pumps to the Okhla overflow point."*
- **Existing AI tools** process data in batch mode. A flood doesn't wait for a cron job. By the time a batch pipeline finishes, the water is already 2 feet deep.

The core problem isn't a lack of data — it's the absence of a **real-time, intelligent pipeline** that ingests live environmental telemetry, enriches it with local infrastructure knowledge, and produces actionable multi-domain response plans *as events unfold*.

---

## 🎯 The Solution — HydroSwarm

HydroSwarm is an **AI-powered flood command system** that transforms raw weather telemetry into structured, multi-domain emergency response plans in real time. A user clicks any location on the globe, and HydroSwarm:

1. **Ingests live weather data** from the Open-Meteo API (precipitation, soil moisture, surface runoff).
2. **Streams it through Pathway** — a real-time data processing engine that detects events the instant they hit the filesystem.
3. **Triggers a 4-agent AI swarm** (via LangGraph) where each agent specializes in a different response domain.
4. **Enriches decisions with live RAG context** — a Pathway-powered vector store that continuously re-indexes web search results about local drainage infrastructure.
5. **Delivers a single curated commander report** to a fullscreen interactive map dashboard.

**The key differentiator:** Pathway is not bolted on — it is the architectural spine. Both the data ingestion pipeline (`main.py`) and the knowledge base (`rag_memory.py`) run on Pathway's streaming engine, ensuring zero-polling, event-driven reactivity from sensor to screen.

---

## 🏗️ Architecture & Tech Stack

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER CLICKS MAP LOCATION                         │
│                      (any lat/lng, reverse-geocoded)                       │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │  POST /api/zones/activate
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CENTRAL ORCHESTRATOR (server.py :5050)                  │
│         FastAPI  ·  Subprocess management  ·  Lazy service boot           │
│         Writes active_zone.json  ·  Monitors latest_alert.json            │
└───────┬────────────────────┬───────────────────────┬────────────────────────┘
        │ boots              │ boots                  │ boots
        ▼                    ▼                        ▼
┌──────────────┐   ┌──────────────────┐   ┌──────────────────────────────────┐
│ rag_memory.py│   │ live_fetcher.py  │   │         main.py                 │
│              │   │                  │   │   Pathway Streaming Engine      │
│ Pathway      │   │ Open-Meteo API   │   │                                │
│ VectorStore  │   │ polls every 20s  │   │  pw.io.fs.read("./stream")     │
│ Server :8000 │   │                  │   │        │                       │
│              │   │ Writes JSON to   │   │  .filter(precip > 0)           │
│ BG Thread:   │   │ ./stream/        │   │        │                       │
│ DuckDuckGo   │   │                  │   │  @pw.udf (async)               │
│ web search   │   │ 30% chance       │   │  trigger_swarm()               │
│ every 60s    │   │ anomaly inject   │   │    ┌─────────────────────┐     │
│              │   │ (storm sim)      │   │    │ LangGraph StateGraph│     │
│ Pathway      │   │                  │   │    │                     │     │
│ fs.read      │   │                  │   │    │ Sentinel ──────────►│     │
│ ("./data")   │   │                  │   │    │ Infrastructure ────►│     │
│              │◄──────── HTTP POST ──────────│ Policy ────────────►│     │
│ Embeds with  │   │  /v1/retrieve    │   │    │ Commander ─────► END│     │
│ MiniLM-L6-v2 │   │                  │   │    └─────────────────────┘     │
└──────────────┘   └──────────────────┘   │        │                       │
                                          │  pw.io.subscribe → JSON file   │
                                          │  → frontend/public/            │
                                          └──────────────────────────────────┘
                                                   │
                                                   ▼
                                    ┌──────────────────────────┐
                                    │   Next.js 16 Frontend    │
                                    │   Leaflet dark map       │
                                    │   Click-anywhere UI      │
                                    │   Slide-out report panel │
                                    │   Peak progress bar      │
                                    └──────────────────────────┘
```

### Tech Stack Breakdown

| Layer | Technology | Role |
|-------|-----------|------|
| **Streaming Engine** | [Pathway](https://pathway.com) | Real-time filesystem watching, schema enforcement, UDF execution, streaming vector store |
| **Multi-Agent AI** | [LangGraph](https://langchain-ai.github.io/langgraph/) | StateGraph orchestration of 4 specialized agents in sequence |
| **LLM Inference** | [Groq](https://groq.com) (Llama 3.1 8B + Llama 3.3 70B) | Sub-second structured output via Groq's LPU hardware |
| **RAG Embeddings** | Sentence Transformers (`all-MiniLM-L6-v2`) | Local embedding model for Pathway's vector store |
| **Web Search** | DuckDuckGo Search API | Live infrastructure intelligence enrichment |
| **Weather Data** | [Open-Meteo API](https://open-meteo.com) | Free, real-time precipitation / soil moisture / runoff |
| **Orchestrator** | FastAPI + Uvicorn | Central process manager, REST API, service lifecycle |
| **Frontend** | Next.js 16, React 19, Tailwind CSS v4 | Fullscreen interactive map dashboard |
| **Map Rendering** | Leaflet + CartoDB Dark Tiles | Click-anywhere map with reverse geocoding via Nominatim |

---

## ⚡ Current Implementation — What Works Right Now

Everything described below is **fully functional** and was built within the hackathon timeframe:

### ✅ One-Click Boot
A single `./boot.sh` starts only the orchestrator + frontend. All 3 backend services (RAG memory, live fetcher, AI engine) **auto-start lazily** when the user clicks a location on the map — no manual terminal management.

### ✅ Click-Anywhere Map
The frontend presents a **clean, unmarked world map**. Click any point on the globe → the coordinates are reverse-geocoded via Nominatim → monitoring activates for that exact location. No hardcoded zones, no pre-marked locations.

### ✅ Pathway Streaming Pipeline
`main.py` uses `pw.io.fs.read("./stream", mode="streaming")` to reactively ingest weather JSON the instant `live_fetcher.py` writes it. Events flow through a Pathway filter → async UDF → 4-agent LangGraph chain → structured JSON output.

### ✅ Pathway RAG Vector Store
`rag_memory.py` runs a `VectorStoreServer` on port 8000. A background thread performs DuckDuckGo searches for the active location's drainage/infrastructure data every 60 seconds, writes results to `./data/`, and Pathway **automatically re-embeds and re-indexes** the documents — the Infrastructure Agent always queries the freshest context.

### ✅ 4-Agent AI Swarm
Each agent has a distinct specialization with structured Pydantic output schemas:

| Agent | Model | Output |
|-------|-------|--------|
| **🚨 Sentinel** | Llama 3.1 8B | Threat level (LOW → CRITICAL), primary driver, summary |
| **🏗️ Infrastructure** | Llama 3.3 70B + RAG | Infrastructure impact assessment cross-referenced with live vector store |
| **⚖️ Policy** | Llama 3.3 70B | Logistics routing plan with contingency protocols |
| **🎖️ Commander** | Llama 3.1 8B | Final alert color, evacuation decision, 2-sentence dispatch order |

### ✅ Curated Report Delivery
After **3 data peaks** are detected for the active location, a slide-out panel presents the Commander's synthesized report — precipitation metrics, peak count, and the final execution plan. No individual agent outputs clutter the UI.

### ✅ Anomaly Injection Engine
`live_fetcher.py` has a 30% chance per cycle to inject a randomized severe storm event (40–150 mm precipitation), ensuring the AI agents are stress-tested against extreme scenarios in every demo.

---

## 🔧 How We Built It — Pathway Integration Details

Pathway is integrated at **two critical points** in the architecture, both leveraging its core streaming capability:

### Integration Point 1: Real-Time Data Ingestion (`main.py`)

```python
# Pathway watches ./stream/ for new JSON files (written by live_fetcher.py)
weather_stream = pw.io.fs.read(
    "./stream",
    format="json",
    schema=WeatherSchema,
    mode="streaming"     # ← reactive, not batch
)

# Filter only actionable events
active_weather = weather_stream.filter(
    weather_stream.precipitation_mm > 0.0
)

# Async UDF wraps the entire LangGraph multi-agent chain
@pw.udf(executor=pw.udfs.async_executor(capacity=4))
async def trigger_swarm(location, precip, soil, runoff):
    result = await asyncio.to_thread(hydro_brain.invoke, initial_state)
    return json.dumps(debate_output)

# Pathway calls the UDF for every new event, non-blocking
ai_decisions = active_weather.select(
    ai_debate=trigger_swarm(...)
)

# Subscribe to output → write to frontend
pw.io.subscribe(ai_decisions, on_change=push_to_dashboard)
pw.run()
```

**Why Pathway here?** Without Pathway, we'd need a polling loop + manual file diffing + a task queue. Pathway replaces all of that with a single declarative pipeline: file appears → schema validated → filtered → UDF fires → output delivered. The `async_executor(capacity=4)` ensures multiple events can be processed concurrently.

### Integration Point 2: Streaming RAG Knowledge Base (`rag_memory.py`)

```python
# Pathway watches ./data/ for document changes
data_sources = pw.io.fs.read("./data", format="binary", with_metadata=True)

# Built-in vector store server with automatic re-indexing
server = VectorStoreServer(
    data_sources,
    embedder=SentenceTransformerEmbedder(model="all-MiniLM-L6-v2"),
)
server.run_server(host="0.0.0.0", port=8000)
```

**Why Pathway here?** A traditional RAG setup would require a manual "re-index" trigger every time the knowledge base changes. Pathway's `VectorStoreServer` detects file modifications at the OS level and re-embeds documents automatically. When the DuckDuckGo thread writes fresh web search results to `./data/live_search_data.txt`, the Infrastructure Agent's next `/v1/retrieve` call returns vectors from the **updated** corpus — no restart, no cache invalidation, no manual intervention.

### The Filesystem as an Integration Bus

The three services communicate exclusively via the filesystem:

- `live_fetcher.py` → writes to `./stream/` → Pathway in `main.py` detects it
- DuckDuckGo thread → writes to `./data/` → Pathway in `rag_memory.py` detects it
- `main.py` → writes to `frontend/public/latest_alert.json` → orchestrator's watcher thread detects it

This design is intentional: Pathway's `pw.io.fs.read()` turns simple file I/O into a reactive event stream, eliminating the need for message brokers, WebSockets, or databases during the hackathon timeframe while remaining production-upgradable.

---

## 🧗 Challenges Faced

### 1. Synchronous LLM Calls Inside a Streaming UDF
Our first implementation had the Pathway UDF calling the LangGraph chain synchronously, which blocked the entire streaming pipeline for 8–25 seconds per event. We solved this by wrapping the UDF with `pw.udfs.async_executor(capacity=4)` and running the LangGraph `invoke()` inside `asyncio.to_thread()`, allowing Pathway to process multiple weather events concurrently.

### 2. Dynamic Location Switching Without Restarting Services
When a user clicks a new location on the map, all three services need to start fetching data for the new coordinates — but restarting Python processes with Pathway's `pw.run()` event loop is destructive. We solved this by introducing `active_zone.json` as a shared configuration file: the orchestrator writes it on zone activation, and both `live_fetcher.py` and `rag_memory.py` re-read it at the start of every polling cycle. The services never restart; they just change target.

### 3. Leaflet SSR Crash in Next.js 16
Leaflet relies on the `window` object, which doesn't exist during Next.js server-side rendering. A standard `dynamic(() => import(...), { ssr: false })` wrapper wasn't sufficient because Leaflet's CSS also needed to be loaded client-side. We resolved this by dynamically injecting the Leaflet CSS via a programmatic `<link>` tag inside `useEffect` and importing the Leaflet module asynchronously within the same effect.

---

## 🔮 Future Scope — What's Next

| Phase | Feature | Description |
|-------|---------|-------------|
| **v1.1** | Temporal Windowing | Use Pathway's `pw.temporal.windowby()` to detect rainfall trends over 30-minute sliding windows instead of reacting to isolated events |
| **v1.2** | Multi-Location Monitoring | Support simultaneous monitoring of multiple clicked locations with independent agent pipelines |
| **v1.3** | Historical Replay | Ingest past flood event data through Pathway to back-test agent response quality |
| **v2.0** | IoT Sensor Integration | Replace Open-Meteo polling with direct `pw.io.mqtt` or `pw.io.kafka` connectors for real municipal IoT sensor grids |
| **v2.1** | Citizen Alert System | Push Commander dispatch orders to SMS/WhatsApp via Twilio when evacuation is required |
| **v2.2** | Municipal Dashboard | Role-based views for city engineers (infrastructure focus) vs. emergency responders (evacuation focus) |
| **v3.0** | Federated Deployment | Multiple HydroSwarm instances across cities sharing anonymized threat intelligence via Pathway's distributed processing |

---

## 🚀 Installation & Run Instructions

### Prerequisites

- **Python 3.11+** (Pathway requires 3.10+)
- **Node.js 18+** and npm
- **Groq API Key** — get one free at [console.groq.com](https://console.groq.com)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/hydroswarm.git
cd hydroswarm
```

### 2. Set Up Python Environment

```bash
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key_here
```

### 4. Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

### 5. Launch HydroSwarm

```bash
chmod +x boot.sh
./boot.sh
```

This starts:
- **Central Orchestrator** on `http://localhost:5050` (API docs at `/docs`)
- **Next.js Dashboard** on `http://localhost:3000`

All 3 backend services (RAG Memory, Live Fetcher, AI Engine) **auto-start** when you click any location on the map.

### 6. Use It

1. Open `http://localhost:3000`
2. Click anywhere on the map
3. Watch the peak progress bar fill as weather data streams in
4. After 3 peaks, the Commander's curated flood response report slides out

---

<div align="center">

**Built for Hack4Good — Sustainable Environmental Solutions by Integrating Pathway Software**

*HydroSwarm turns raw weather data into life-saving decisions, in real time.*

</div>
