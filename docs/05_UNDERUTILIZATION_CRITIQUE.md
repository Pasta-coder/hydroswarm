# HydroSwarm — Underutilization Critique

> **Purpose of this document:** A candid, evidence-based critique of every component in HydroSwarm that is underutilized, redundant, or present only superficially. Each finding cites the exact file, the wasted potential, and a concrete implementation that would actually exploit the capability. Feed this to an LLM for architecture refactoring or hackathon pitch review.

---

## 1. LangGraph Is Used as a Plain Function Call Chain

**Files:** `agents/graph.py`

**What LangGraph offers:**
- Conditional routing (`add_conditional_edges`) — branch to different agents based on runtime state
- Cycles / loops — re-run agents if output quality is poor
- Parallel fan-out — run independent agents concurrently
- Human-in-the-loop checkpoints — pause and wait for human approval
- Subgraphs — nest entire graphs within nodes
- State reducers — custom merge logic when parallel branches re-converge
- Persistence — save graph state to a database for resumable runs

**What HydroSwarm uses:**
```python
workflow.set_entry_point("sentinel")
workflow.add_edge("sentinel", "infrastructure")
workflow.add_edge("infrastructure", "policy")
workflow.add_edge("policy", "commander")
workflow.add_edge("commander", END)
```

This is a linear chain: A → B → C → D → END. No branching, no conditions, no loops, no parallelism. You could replace the entire LangGraph setup with 4 sequential function calls:

```python
# Equivalent without LangGraph:
state = sentinel_agent(initial_state)
state.update(infrastructure_agent(state))
state.update(policy_agent(state))
state.update(commander_agent(state))
```

**Why this matters:** LangGraph adds a dependency and abstraction layer that provides zero value over plain function calls in the current topology.

**Realistic implementation that would justify LangGraph:**
```python
from langgraph.graph import StateGraph, END

workflow = StateGraph(SwarmState)
workflow.add_node("sentinel", sentinel_agent)
workflow.add_node("infrastructure", infrastructure_agent)
workflow.add_node("policy", policy_agent)
workflow.add_node("commander", commander_agent)
workflow.add_node("quality_check", quality_check_agent)

workflow.set_entry_point("sentinel")

# Conditional: if sentinel says LOW risk, skip the full cascade
def route_by_severity(state: SwarmState):
    alert = state["sentinel_alert"].upper()
    if "CRITICAL" in alert or "SEVERE" in alert:
        return "infrastructure"     # full cascade
    elif "MODERATE" in alert:
        return "policy"             # skip infrastructure
    else:
        return "commander"          # skip straight to summary

workflow.add_conditional_edges("sentinel", route_by_severity, {
    "infrastructure": "infrastructure",
    "policy": "policy",
    "commander": "commander",
})
workflow.add_edge("infrastructure", "policy")
workflow.add_edge("policy", "commander")

# Loop: if commander output is too long, re-run with stricter instructions
def check_output_quality(state: SwarmState):
    if len(state["final_plan"].split(".")) > 3:
        return "commander"  # retry
    return END

workflow.add_conditional_edges("commander", check_output_quality, {
    "commander": "commander",
    END: END,
})
```

---

## 2. The RAG Vector Store Indexes ~200 Tokens

**File:** `rag_memory.py`, `data/infrastructure_data.txt`, `data/live_search_data.txt`

**What's happening:** Pathway's `VectorStoreServer` with `SentenceTransformerEmbedder` (22M parameters, 384-dim embeddings) is running as a full HTTP REST server to index and retrieve from a corpus of approximately **200 tokens** (80 tokens in `infrastructure_data.txt` + 50–120 tokens in `live_search_data.txt`).

This is the equivalent of hiring a librarian to manage a single Post-it note.

**Evidence of waste:**
- The embedding model loads into memory (~88MB)
- A full HTTP server runs on port 8000
- A separate Python process is required
- The infrastructure agent makes an HTTP round-trip (100–500ms) to retrieve a document that could be stored in a Python string

**Why it doesn't help:** With only 2 documents and `k=1`, the retrieval is effectively just "return the closest of 2 strings." There's no semantic disambiguation, no relevance ranking across a large corpus — the exact scenarios that justify a vector store.

**Realistic fix — grow the corpus to justify the architecture:**
```python
# Option A: Scrape real municipal data (justifies the vector store)
SEARCH_TOPICS = [
    f"{location} flood evacuation plan PDF",
    f"{location} drainage maintenance report 2025",
    f"{location} stormwater capacity study",
    f"{location} emergency response protocol municipal",
    f"{location} waterlogging incidents historical data",
]
# Run each topic, save results as separate files in ./data/
for i, topic in enumerate(SEARCH_TOPICS):
    with DDGS() as ddgs:
        results = list(ddgs.text(topic, max_results=5))
    with open(f"data/topic_{i}.txt", "w") as f:
        for r in results:
            f.write(f"# {r['title']}\n{r['body']}\n\n")

# Option B: If corpus stays tiny, drop the vector store entirely
# infrastructure.py — just read the file directly
with open("data/infrastructure_data.txt") as f:
    rag_context = f.read()
```

---

## 3. Four Identical LLM Instances Doing the Same Thing

**Files:** `sentinel.py`, `infrastructure.py`, `policy.py`, `commander.py`

**What's happening:** All 4 agents instantiate `ChatGroq(model="llama-3.3-70b-versatile", temperature=0)` independently. Every agent uses the exact same model at the exact same temperature. The differentiation is entirely in the prompt text.

**What's underutilized:**
- **Model specialization:** Sentinel's task (classify risk from numbers) is simple enough for `llama-3.1-8b-instant` (faster, cheaper). Commander's task (synthesize 3 paragraphs) could use a smaller model too. Only Infrastructure + Policy arguably need the 70B model for complex reasoning.
- **Temperature tuning:** Policy should arguably have temperature=0.3 to generate diverse contingency ideas. Commander at temperature=0 will always produce near-identical plans.
- **Function calling / structured output:** Groq supports JSON mode and tool calling. None of the agents use it. All output is unvalidated free-text.

**Observed evidence from `sys.stdout`:** Across 9 runs with identical input, the Commander produces nearly identical output each time — proving temperature=0 causes repetitive, non-adaptive behavior. The system gives the same plan whether it's the first flood alert or the ninth consecutive one.

**Realistic implementation — differentiated models:**
```python
# agents/llm_config.py
import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq

load_dotenv()

AGENT_CONFIGS = {
    "sentinel": {
        "model": os.getenv("LLM_SENTINEL", "llama-3.1-8b-instant"),  # fast classifier
        "temperature": 0,
    },
    "infrastructure": {
        "model": os.getenv("LLM_INFRASTRUCTURE", "llama-3.3-70b-versatile"),  # complex reasoning
        "temperature": 0,
    },
    "policy": {
        "model": os.getenv("LLM_POLICY", "llama-3.3-70b-versatile"),
        "temperature": 0.3,  # creative contingency planning
    },
    "commander": {
        "model": os.getenv("LLM_COMMANDER", "llama-3.1-8b-instant"),  # simple synthesis
        "temperature": 0,
    },
}

def get_llm(agent_name: str) -> ChatGroq:
    config = AGENT_CONFIGS.get(agent_name, AGENT_CONFIGS["sentinel"])
    return ChatGroq(model=config["model"], temperature=config["temperature"])
```

---

## 4. The Sentinel Agent's Output Format Constraint Is Never Enforced

**File:** `sentinel.py`

**The prompt says:**
> "Output exactly one concise sentence declaring the qualitative threat level and the primary environmental driver."

**What actually happens (from `sys.stdout`):**
```
Given the high rainfall rate of 65.5 mm/hr and soil saturation of 95.0%, the surface
runoff of 12.0 mm indicates that the ground is nearly impermeable, leading to a rapid
accumulation of water; this scenario suggests a high risk of flash flooding due to the
limited capacity of the soil to absorb more water.

Final status alert: **CRITICAL FLASH FLOOD RISK DECLARED**.
```

That's 2–3 sentences with bold markdown formatting. The "exactly one sentence" constraint is violated **100% of the time** across all 9 observed outputs.

**What's underutilized:** LangChain's `PydanticOutputParser`, `JsonOutputParser`, or Groq's native JSON mode — all of which would enforce structure.

**Realistic implementation:**
```python
from pydantic import BaseModel, Field
from langchain_core.output_parsers import PydanticOutputParser

class SentinelOutput(BaseModel):
    threat_level: str = Field(description="Exactly one of: LOW, MODERATE, SEVERE, CRITICAL")
    primary_driver: str = Field(description="The single most important environmental factor, e.g. 'soil saturation'")
    one_sentence_summary: str = Field(description="One sentence, max 30 words")

parser = PydanticOutputParser(pydantic_object=SentinelOutput)

def sentinel_agent(state: SwarmState):
    prompt = f"""
    ...existing prompt...

    {parser.get_format_instructions()}
    """
    response = llm.invoke(prompt)
    parsed = parser.parse(response.content)
    return {"sentinel_alert": parsed.one_sentence_summary, "threat_level": parsed.threat_level}
```

---

## 5. The Policy Agent Generates Routing Plans Without Any Route Data

**File:** `policy.py`

**The prompt says:**
> "Autonomously formulate a logistics routing plan."

**What the agent has access to:** Two strings (`sentinel_alert` and `infrastructure_report`). Zero geographic data, zero road network data, zero traffic data, zero map APIs.

**What it produces:**
> "Reroute traffic to alternative roads..."
> "Deploy water harvesting systems in nearby areas..."

These are completely generic statements. The agent cannot name a single specific road, intersection, or route because it has no data to do so. It's hallucinating logistics.

**What's underutilized:** LangChain supports tool-use agents. The Policy agent could be given tools:

**Realistic implementation — give the agent tools:**
```python
from langchain_core.tools import tool
import requests

@tool
def get_road_elevations(location: str) -> str:
    """Get road elevation data for a location to identify flood-prone low points."""
    # Use Open-Elevation API (free, no key needed)
    # In production, use a local GIS database
    resp = requests.get(
        "https://api.open-elevation.com/api/v1/lookup",
        params={"locations": f"28.6139,77.2090"}  # resolve from location
    )
    return f"Elevation data for {location}: {resp.json()}"

@tool
def get_nearest_hospitals(location: str) -> str:
    """Get nearest hospitals that must remain accessible during emergencies."""
    # Overpass API query for hospitals near the coordinates
    return "Nearest hospitals: Fortis (Sector 51, 2.3km), Max (Sector 19, 4.1km)"

@tool
def get_alternate_routes(blocked_area: str) -> str:
    """Get alternate routes avoiding a blocked/flooded area."""
    return "Alt routes: Greater Noida Expressway (elevated, flood-safe), NH-24 via Sector 15 bypass"

# Then bind tools to the LLM
from langchain_groq import ChatGroq
llm_with_tools = ChatGroq(model="llama-3.3-70b-versatile", temperature=0).bind_tools(
    [get_road_elevations, get_nearest_hospitals, get_alternate_routes]
)
```

---

## 6. The Commander Agent Adds Near-Zero Marginal Value

**File:** `commander.py`

**Evidence:** Compare the Commander's output to a simple concatenation of the other 3 agents:

| Source | Content |
|--------|---------|
| Sentinel | "CRITICAL FLASH FLOOD RISK" |
| Infrastructure | "drainage system overwhelmed, excess routes to Okhla" |
| Policy | "deploy emergency fleets, close low-lying roads, reroute traffic" |
| **Commander** | "I hereby declare CRITICAL FLASH FLOOD RISK and order deployment of emergency fleets, close roads, reroute traffic" |

The Commander **repeats the other agents' outputs with dramatic preamble** ("I hereby declare", "I hereby issue"). It doesn't add new information, new prioritization, or new analysis.

**Realistic alternatives:**

```python
# Option A: Replace with a structured template (no LLM needed)
def commander_agent(state: SwarmState):
    plan = {
        "alert_level": extract_severity(state["sentinel_alert"]),  # regex or keyword match
        "infrastructure_status": state["infrastructure_report"][:100],
        "primary_action": state["policy_directive"].split(".")[0],
        "contingency": state["policy_directive"].split(".")[1] if "." in state["policy_directive"] else "N/A",
        "timestamp": time.time(),
    }
    return {"final_plan": json.dumps(plan)}

# Option B: Give the Commander a genuinely different task — resource allocation
def commander_agent(state: SwarmState):
    prompt = f"""
    You are the HydroSwarm Commander. You have:
    - 10 emergency vehicles
    - 3 water pumps
    - 50 personnel
    - Budget: ₹5,00,000

    Given:
    1. Sentinel: {state['sentinel_alert']}
    2. Infrastructure: {state['infrastructure_report']}
    3. Policy: {state['policy_directive']}

    Output a resource allocation table in JSON:
    [
        {{"resource": "...", "quantity": N, "deploy_to": "...", "priority": 1-5}},
        ...
    ]
    """
```

---

## 7. `simulator.py` Is Dead Code That Produces Incompatible Data

**File:** `simulator.py`

**What it produces:**
```json
{"event_id": 1, "location": "Sector 62, Noida", "rainfall_mm_per_hr": 134.68, "timestamp": 1771983016.86}
```

**What `main.py` expects (via `WeatherSchema`):**
```python
event_id: int
location: str
precipitation_mm: float       # ← "rainfall_mm_per_hr" will NOT match
soil_moisture_percent: float   # ← MISSING from simulator
surface_runoff_mm: float       # ← MISSING from simulator
timestamp: float
```

**Problems:**
1. Field name mismatch: `rainfall_mm_per_hr` vs `precipitation_mm`
2. Missing fields: `soil_moisture_percent` and `surface_runoff_mm` are absent
3. Location string mismatch: `"Sector 62, Noida"` vs `"Noida Sector 62"`
4. There are **131 `rain_event_*.json` files** sitting in `./stream/` right now — 584KB of incompatible data that Pathway will try to ingest and reject

**The simulator was clearly written for an earlier version of the schema and never updated.**

**Realistic fix — align simulator with current schema:**
```python
# simulator.py — fixed
payload = {
    "event_id": counter,
    "location": "Noida Sector 62",
    "precipitation_mm": round(random.uniform(0, 150), 2),
    "soil_moisture_percent": round(random.uniform(0, 100), 2),
    "surface_runoff_mm": round(random.uniform(0, 20), 2),
    "timestamp": time.time()
}
```

Or delete `simulator.py` entirely, since `live_fetcher.py` with its demo injector already fulfills the same role.

---

## 8. Pathway's Streaming Mode Is Treated as Batch Mode

**File:** `main.py`

**What streaming means:** Pathway processes events as they arrive in real-time, maintaining running state, temporal windows, and incremental computation. The event loop is designed for continuous operation.

**What HydroSwarm does:** Each weather event enters the pipeline, triggers a blocking UDF that takes 8–25 seconds (4 sequential LLM calls), and writes a CSV row. There is:
- No running state between events
- No temporal windows
- No aggregation
- No trend detection
- No incremental computation

Each event is processed in **complete isolation** as if the system had just started. This is batch processing with extra steps.

**What the 9 observed outputs prove:** All 9 rows in `sys.stdout` have identical inputs (precip=65.5, soil=95.0, runoff=12.0) because they're all the demo-injected values. The system has no way to notice "this is the 9th consecutive critical flood alert — escalate further" because it has zero memory.

**Realistic streaming implementation:**
```python
# Add event history as a Pathway table operation
event_history = weather_stream.windowby(
    weather_stream.timestamp,
    window=pw.temporal.sliding(
        duration=timedelta(minutes=30),
        hop=timedelta(minutes=5)
    ),
).reduce(
    avg_precip=pw.reducers.avg(pw.this.precipitation_mm),
    max_precip=pw.reducers.max(pw.this.precipitation_mm),
    event_count=pw.reducers.count(),
    is_escalating=pw.reducers.latest(pw.this.precipitation_mm) > pw.reducers.earliest(pw.this.precipitation_mm),
)

# Only trigger the expensive AI cascade if the trend is alarming
@pw.udf
def should_trigger(avg_precip: float, event_count: int, is_escalating: bool) -> bool:
    if avg_precip > 40 and is_escalating:
        return True
    if event_count > 5 and avg_precip > 20:
        return True
    return False
```

---

## 9. The DuckDuckGo Search Often Returns Empty Results

**File:** `rag_memory.py`

**Evidence from `data/live_search_data.txt`:**
```
LIVE INTERNET CONTEXT FOR NOIDA SECTOR 62:


BASELINE SYSTEM METRICS:
Sector 62 baseline drainage limit is 45mm/hr. Excess routes to Okhla.
```

The web search section is **completely empty** — no titles, no snippets. Only the hardcoded baseline remains. This means the "Live Internet Context" feature contributed zero value in the last run. The `try/except` in `dynamic_web_search()` silently swallows failures.

**What's underutilized:** The search could use multiple search engines, validate results before writing, and track search success rates.

**Realistic implementation:**
```python
def dynamic_web_search():
    target_location = "Noida Sector 62"
    queries = [
        f"{target_location} drainage capacity waterlogging",
        f"{target_location} flood news today",
        f"Noida waterlogging infrastructure report",
    ]

    for query in queries:
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=3))
            if results:
                # We found something — use it
                live_text = format_results(target_location, results)
                with open("data/live_search_data.txt", "w") as f:
                    f.write(live_text)
                print(f"✅ Found {len(results)} results for: '{query}'")
                return  # success, stop trying other queries
        except Exception as e:
            print(f"⚠️ Query '{query}' failed: {e}")
            continue

    # All queries failed — write a clear "no data" marker
    with open("data/live_search_data.txt", "w") as f:
        f.write(f"NO LIVE DATA AVAILABLE for {target_location}.\n")
        f.write("All web searches returned empty. Using static infrastructure data only.\n")
    print("❌ All search queries failed. Static data only.")
```

---

## 10. The Output File `sys.stdout` Is Not Actually stdout

**File:** `main.py` (line 67)

```python
pw.io.csv.write(ai_decisions, "sys.stdout")
```

This writes to a literal file on disk named `sys.stdout`. It is:
- Not the Python `sys.stdout` stream
- Not visible in the terminal where `main.py` runs
- Listed in `.gitignore` but still present in the project
- Growing unbounded (currently 16KB / 9 rows — but each row is ~2KB of JSON)
- Not consumed by any downstream system — nobody reads this file

**The entire output of the system goes to a file that nothing reads.**

**Realistic alternatives:**
```python
# Option A: Print to actual terminal via subscribe
pw.io.subscribe(ai_decisions, on_change=lambda key, row, time, is_addition:
    print(f"\n🚨 ALERT: {row['location']} | {row['precipitation_mm']}mm\n{row['ai_debate']}")
    if is_addition else None
)

# Option B: Write to a properly named, rotated file
import datetime
output_file = f"output/alerts_{datetime.date.today().isoformat()}.csv"
pw.io.csv.write(ai_decisions, output_file)

# Option C: Push to a webhook / Slack / email
@pw.udf
def send_alert(debate_json: str) -> str:
    data = json.loads(debate_json)
    requests.post("https://hooks.slack.com/services/YOUR/WEBHOOK", json={
        "text": f"🚨 {data['commander']}"
    })
    return debate_json
```

---

## 11. Summary: Utilization Efficiency Scorecard

| Component | Available Capability | Utilized | Utilization % | Verdict |
|-----------|---------------------|----------|---------------|---------|
| LangGraph | Conditional routing, loops, parallel, checkpoints, subgraphs | Linear chain only | ~5% | Overkill — use plain functions or add branching |
| Pathway Streaming | Windowing, joins, groupby, reduce, async UDF, multi-sink, connectors | fs.read + filter + UDF + csv.write | ~10% | Used as a file watcher |
| VectorStoreServer | Semantic search across large, dynamic corpora | 2 documents, k=1 | ~3% | Use a dict or grow the corpus 50x |
| ChatGroq / LLM | JSON mode, function calling, tool use, streaming responses | Raw text generation | ~15% | Add structured output + tools |
| Prompt Engineering | Format enforcement, few-shot examples, chain-of-thought | Single-shot free-text prompts | ~20% | Add output parsers + examples |
| DuckDuckGo Search | Multi-query, region targeting, news/images/videos | Single fixed query, text only | ~10% | Retry with multiple queries |
| `simulator.py` | Testing data generation | Produces incompatible schema | 0% | Dead code — fix or delete |
| Output system | Dashboards, alerts, webhooks, databases | File named `sys.stdout` | ~5% | Nobody reads the output |

**Overall system utilization: ~8%**

The project has excellent *ambition* — the architecture diagram is sophisticated — but the implementations use the simplest possible subset of each tool, leaving the vast majority of capability on the table.
