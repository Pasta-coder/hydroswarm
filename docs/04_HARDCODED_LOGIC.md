# HydroSwarm — Hardcoded Logic & Autonomy Gaps

> **Purpose of this document:** Identify every place in HydroSwarm where logic is hardcoded, magic-numbered, or manually configured when it could be made dynamic, configurable, or autonomous. Each item includes the exact file and line, the hardcoded value, the risk, and a realistic implementation for making it autonomous. Feed this to an LLM for refactoring guidance.

---

## 1. Hardcoded Location: `"Noida Sector 62"`

**Files affected:** `live_fetcher.py` (line 44), `rag_memory.py` (line 20), `data/infrastructure_data.txt`, `data/live_search_data.txt`

**Current code (`live_fetcher.py`):**
```python
LATITUDE = 28.5355
LONGITUDE = 77.3910
# ...
payload = {
    "location": "Noida Sector 62",
    # ...
}
```

**Current code (`rag_memory.py`):**
```python
target_location = "Noida Sector 62"
search_query = f"{target_location} drainage capacity waterlogging infrastructure news"
```

**Risk:** The entire system — data acquisition, RAG search, infrastructure docs, and all agent prompts — is locked to a single geographic location. Adding a second city requires editing 4+ files.

**Autonomous alternative:**
```python
# config.py — single source of truth
import json

def load_locations():
    """Load monitored locations from a config file or database."""
    with open("config/locations.json") as f:
        return json.load(f)
    # Returns: [
    #   {"name": "Noida Sector 62", "lat": 28.5355, "lon": 77.3910},
    #   {"name": "Gurugram Sector 29", "lat": 28.4595, "lon": 77.0266},
    # ]

# live_fetcher.py — iterate over all locations
locations = load_locations()
for loc in locations:
    API_URL = f"https://api.open-meteo.com/v1/forecast?latitude={loc['lat']}&longitude={loc['lon']}&..."
    payload = {"location": loc["name"], ...}
```

```json
// config/locations.json
[
    {"name": "Noida Sector 62", "lat": 28.5355, "lon": 77.3910, "drainage_capacity_mm_hr": 45},
    {"name": "Gurugram Sector 29", "lat": 28.4595, "lon": 77.0266, "drainage_capacity_mm_hr": 35}
]
```

---

## 2. Hardcoded Coordinates: `LATITUDE = 28.5355`, `LONGITUDE = 77.3910`

**File:** `live_fetcher.py` (lines 9–10)

**Risk:** Cannot monitor any other location without editing source code. Coordinates are baked into the API URL string.

**Autonomous alternative:** See Location config above. Alternatively, use a geocoding API to resolve location names to coordinates automatically:

```python
import requests

def geocode(location_name: str) -> tuple[float, float]:
    """Resolve a location name to lat/lon using Nominatim (free, no API key)."""
    resp = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": location_name, "format": "json", "limit": 1},
        headers={"User-Agent": "HydroSwarm/1.0"}
    )
    data = resp.json()
    if data:
        return float(data[0]["lat"]), float(data[0]["lon"])
    raise ValueError(f"Could not geocode: {location_name}")
```

---

## 3. Demo Data Injector: Every 3rd Request Override

**File:** `live_fetcher.py` (lines 34–38)

**Current code:**
```python
if counter % 3 == 0:
    precip = 65.5  # Heavy rain
    soil = 0.95    # 95% saturated soil
    runoff_val = 12.0 # High runoff
    print("⚡ DEMO OVERRIDE: Injecting Severe Storm Payload!")
```

**Risk:** This runs unconditionally in production. There's no flag, no environment variable, no CLI argument to disable it. Every 3rd weather event is fake data, silently corrupting the system's output. A judge or stakeholder looking at the output would see fake alerts mixed with real ones.

**Autonomous alternative:**
```python
import os

DEMO_MODE = os.getenv("HYDROSWARM_DEMO_MODE", "false").lower() == "true"
DEMO_INTERVAL = int(os.getenv("HYDROSWARM_DEMO_INTERVAL", "3"))

if DEMO_MODE and counter % DEMO_INTERVAL == 0:
    precip = float(os.getenv("DEMO_PRECIP", "65.5"))
    soil = float(os.getenv("DEMO_SOIL", "0.95"))
    runoff_val = float(os.getenv("DEMO_RUNOFF", "12.0"))
    print("⚡ DEMO OVERRIDE: Injecting Severe Storm Payload!")
```

Then launch with: `HYDROSWARM_DEMO_MODE=true python live_fetcher.py`

---

## 4. Precipitation Threshold: `> 0.0`

**File:** `main.py` (line 27)

**Current code:**
```python
active_weather = weather_stream.filter(
    weather_stream.precipitation_mm > 0.0
)
```

**Risk:** A threshold of `0.0` means even 0.001mm of rain (a light mist) triggers the full 4-agent AI cascade, costing API tokens and 8–25 seconds of compute. This is a binary on/off with no nuance.

**What should happen:** A tiered threshold system:

```python
# Tier 1: Light rain (0–10mm) — log only, no AI
# Tier 2: Moderate rain (10–30mm) — trigger Sentinel only
# Tier 3: Heavy rain (30–60mm) — trigger full cascade
# Tier 4: Extreme rain (60mm+) — trigger cascade + external alerts

SEVERITY_THRESHOLDS = {
    "LOG_ONLY": 0.0,
    "SENTINEL_ONLY": 10.0,
    "FULL_CASCADE": 30.0,
    "EMERGENCY": 60.0,
}

# In main.py
moderate_weather = weather_stream.filter(weather_stream.precipitation_mm > SEVERITY_THRESHOLDS["SENTINEL_ONLY"])
severe_weather = weather_stream.filter(weather_stream.precipitation_mm > SEVERITY_THRESHOLDS["FULL_CASCADE"])
```

---

## 5. Hardcoded RAG Retrieval Count: `k=1`

**File:** `infrastructure.py` (line 16)

**Current code:**
```python
json={"query": f"Infrastructure drainage capacity and protocol for {state['location']}", "k": 1}
```

**Risk:** Retrieves only 1 document from the vector store. With only 2 documents in the corpus, this means one is always ignored. If the wrong document is the top match, the agent has zero fallback context.

**Autonomous alternative:**
```python
# Retrieve all available documents (small corpus) or a configurable number
K_RETRIEVAL = int(os.getenv("RAG_K", "5"))

response = requests.post(
    RAG_ENDPOINT,
    json={"query": query, "k": K_RETRIEVAL}
)
docs = response.json()
# Concatenate all retrieved docs, not just the first
rag_context = "\n---\n".join([doc.get("text", "") for doc in docs]) if docs else FALLBACK_CONTEXT
```

---

## 6. Hardcoded RAG Endpoint: `http://127.0.0.1:8000`

**File:** `infrastructure.py` (line 14)

**Current code:**
```python
response = requests.post(
    "http://127.0.0.1:8000/v1/retrieve",
    json={...}
)
```

**Risk:** The RAG server address is hardcoded. Cannot deploy to a different host, port, or use HTTPS without editing source code.

**Autonomous alternative:**
```python
RAG_ENDPOINT = os.getenv("RAG_ENDPOINT", "http://127.0.0.1:8000/v1/retrieve")
response = requests.post(RAG_ENDPOINT, json={...})
```

---

## 7. Hardcoded LLM Model: `llama-3.3-70b-versatile`

**Files affected:** `sentinel.py`, `infrastructure.py`, `policy.py`, `commander.py` — all 4 agents

**Current code (repeated in each file):**
```python
llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)
```

**Risk:** The model name is hardcoded in 4 separate files. Changing models (e.g., to `llama-3.1-8b-instant` for faster response, or `mixtral-8x7b` for cost savings) requires editing all 4 files. Also, `load_dotenv()` and `ChatGroq(...)` initialization is duplicated in every agent file.

**Autonomous alternative:**
```python
# agents/llm_config.py — single source of truth
import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq

load_dotenv()

def get_llm(agent_name: str = "default") -> ChatGroq:
    """Get the LLM for a specific agent. Allows per-agent model overrides."""
    model = os.getenv(f"LLM_MODEL_{agent_name.upper()}", os.getenv("LLM_MODEL", "llama-3.3-70b-versatile"))
    temperature = float(os.getenv(f"LLM_TEMP_{agent_name.upper()}", os.getenv("LLM_TEMPERATURE", "0")))
    return ChatGroq(model=model, temperature=temperature)
```

```python
# sentinel.py — uses shared config
from .llm_config import get_llm
llm = get_llm("sentinel")
```

Then configure via `.env`:
```env
LLM_MODEL=llama-3.3-70b-versatile
LLM_MODEL_SENTINEL=llama-3.1-8b-instant  # faster model for simple classification
LLM_TEMPERATURE=0
```

---

## 8. Hardcoded Polling Intervals

**Files:**
- `live_fetcher.py` (line 63): `time.sleep(10)` — polls API every 10 seconds
- `rag_memory.py` (line 51): `time.sleep(60)` — runs web search every 60 seconds

**Risk:** Polling intervals are baked into the code. Cannot adjust for different scenarios (rapid polling during active storms, slow polling during dry weather) without editing source.

**Autonomous alternative — adaptive polling:**
```python
# live_fetcher.py
BASE_INTERVAL = int(os.getenv("FETCH_INTERVAL_SECONDS", "10"))

# Adaptive: poll faster when it's actively raining
if precip > 30:
    sleep_time = max(BASE_INTERVAL // 3, 3)  # minimum 3 seconds
    print(f"🔴 Active storm detected. Increasing poll frequency to every {sleep_time}s.")
elif precip > 0:
    sleep_time = BASE_INTERVAL
else:
    sleep_time = BASE_INTERVAL * 3  # slow down when it's dry
    print(f"🟢 No rain. Slowing poll to every {sleep_time}s to conserve API quota.")

time.sleep(sleep_time)
```

---

## 9. Hardcoded Web Search Query

**File:** `rag_memory.py` (line 21)

**Current code:**
```python
search_query = f"{target_location} drainage capacity waterlogging infrastructure news"
```

**Risk:** The search query is fixed. It searches for "drainage capacity waterlogging infrastructure news" regardless of what's actually happening. During a cyclone, you'd want different search terms than during a slow flood.

**Autonomous alternative — context-aware search:**
```python
def build_search_query(location: str, latest_event: dict = None) -> str:
    """Build a contextual search query based on the latest weather data."""
    base = f"{location} drainage infrastructure"

    if latest_event:
        precip = latest_event.get("precipitation_mm", 0)
        if precip > 60:
            return f"{base} emergency flood response evacuation routes"
        elif precip > 30:
            return f"{base} waterlogging capacity overflow"
        elif precip > 10:
            return f"{base} drainage status monsoon"

    return f"{base} capacity waterlogging news"
```

---

## 10. Hardcoded DuckDuckGo Result Count: `max_results=3`

**File:** `rag_memory.py` (line 29)

**Current code:**
```python
results = list(ddgs.text(search_query, max_results=3))
```

**Risk:** Only 3 web results are fetched. This may be too few for comprehensive context or too many for vague queries. The number should be configurable.

**Autonomous alternative:**
```python
MAX_SEARCH_RESULTS = int(os.getenv("MAX_SEARCH_RESULTS", "5"))
results = list(ddgs.text(search_query, max_results=MAX_SEARCH_RESULTS))
```

---

## 11. Hardcoded Baseline Metric in RAG

**File:** `rag_memory.py` (lines 39–40)

**Current code:**
```python
live_text += "\nBASELINE SYSTEM METRICS:\n"
live_text += "Sector 62 baseline drainage limit is 45mm/hr. Excess routes to Okhla.\n"
```

**Risk:** A hardcoded infrastructure metric is appended to every web search result, regardless of what the search found. This same metric is also in `data/infrastructure_data.txt`, creating a duplication. If the drainage limit changes (e.g., after infrastructure upgrades), both files need manual updates.

**Autonomous alternative:**
```python
# Read baseline from the same config that drives everything else
import json

with open("config/locations.json") as f:
    locations = json.load(f)

# Find the relevant location's baseline
for loc in locations:
    if loc["name"] == target_location:
        drainage_limit = loc.get("drainage_capacity_mm_hr", "unknown")
        baseline = f"Baseline drainage limit is {drainage_limit}mm/hr."
        break
else:
    baseline = "No baseline data available for this location."

live_text += f"\nBASELINE SYSTEM METRICS:\n{baseline}\n"
```

---

## 12. Hardcoded Infrastructure Fallback String

**File:** `infrastructure.py` (line 25)

**Current code:**
```python
except Exception as e:
    rag_context = "Database offline. Fallback mode engaged."
```

**Risk:** When the RAG server is unavailable, the LLM receives this unhelpful string and proceeds to **hallucinate** infrastructure data. There's no flag in the output indicating the report is ungrounded.

**Autonomous alternative:**
```python
except Exception as e:
    print(f"⚠️ RAG retrieval failed: {e}")
    rag_context = (
        "⚠️ LIVE DATABASE UNAVAILABLE — USING EMERGENCY DEFAULTS.\n"
        "These figures are NOT live and may be outdated:\n"
        f"- Default drainage capacity: 30mm/hr (conservative estimate)\n"
        f"- Default groundwater status: Unknown\n"
        "FLAG: This report is UNVERIFIED. Do not use for life-safety decisions without manual confirmation."
    )
    # Also flag the state so the commander knows
    # (requires adding an 'unverified' field to SwarmState)
```

---

## 13. Summary: Hardcoded Values Inventory

| # | Value | File | Line | Current | Should Be |
|---|-------|------|------|---------|-----------|
| 1 | Location name | `live_fetcher.py` | 44 | `"Noida Sector 62"` | Config file / CLI arg |
| 2 | Coordinates | `live_fetcher.py` | 9–10 | `28.5355, 77.3910` | Config file / geocoding API |
| 3 | Demo mode trigger | `live_fetcher.py` | 34 | `counter % 3 == 0` | Environment variable flag |
| 4 | Demo storm values | `live_fetcher.py` | 35–37 | `65.5, 0.95, 12.0` | Environment variables |
| 5 | Rain threshold | `main.py` | 27 | `> 0.0` | Tiered thresholds in config |
| 6 | RAG k count | `infrastructure.py` | 16 | `k=1` | Environment variable |
| 7 | RAG endpoint | `infrastructure.py` | 14 | `http://127.0.0.1:8000` | Environment variable |
| 8 | LLM model name | 4 agent files | Various | `llama-3.3-70b-versatile` | Shared config module |
| 9 | LLM temperature | 4 agent files | Various | `0` | Shared config module |
| 10 | Fetch interval | `live_fetcher.py` | 63 | `10` seconds | Env var + adaptive logic |
| 11 | Search interval | `rag_memory.py` | 51 | `60` seconds | Env var + adaptive logic |
| 12 | Search query | `rag_memory.py` | 21 | Fixed string | Context-aware builder |
| 13 | Search result count | `rag_memory.py` | 29 | `3` | Environment variable |
| 14 | Baseline metric | `rag_memory.py` | 39–40 | `"45mm/hr"` | Config file |
| 15 | RAG fallback | `infrastructure.py` | 25 | `"Database offline."` | Structured fallback with flag |
| 16 | VectorStore port | `rag_memory.py` | 71 | `8000` | Environment variable |
| 17 | VectorStore host | `rag_memory.py` | 71 | `0.0.0.0` | Environment variable |

**Total hardcoded values: 17**

A well-structured project would have **zero** of these in source code. All should live in environment variables, a config file (`config.yaml` or `config/locations.json`), or be derived dynamically at runtime.
