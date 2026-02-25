# HydroSwarm — Model Architecture & Agent Working

> **Purpose of this document:** Provide a deep technical breakdown of every AI model and LLM agent in HydroSwarm — their prompts, execution order, observed outputs, strengths, and weaknesses. Feed this to an LLM to evaluate prompt quality, suggest model changes, or debug agent behavior.

---

## 1. Models Inventory

| Component | Model | Provider | Runs Where | Temperature | Dimensions | Purpose |
|-----------|-------|----------|------------|-------------|------------|---------|
| Sentinel Agent | `llama-3.3-70b-versatile` | Groq (cloud) | API call | 0 | N/A | Qualitative threat classification |
| Infrastructure Agent | `llama-3.3-70b-versatile` | Groq (cloud) | API call | 0 | N/A | Infrastructure impact assessment |
| Policy Agent | `llama-3.3-70b-versatile` | Groq (cloud) | API call | 0 | N/A | Logistics routing + contingency |
| Commander Agent | `llama-3.3-70b-versatile` | Groq (cloud) | API call | 0 | N/A | Final action plan synthesis |
| RAG Embedder | `all-MiniLM-L6-v2` | SentenceTransformers | Local CPU | N/A | 384 | Document embedding for vector retrieval |

**Important:** All 4 LLM agents use the **exact same model** at **temperature 0**. There is zero model-level specialization. All differentiation comes from prompt engineering alone.

---

## 2. Orchestration: LangGraph StateGraph

### Graph Topology

```
Entry
  │
  ▼
┌──────────┐     ┌────────────────┐     ┌──────────┐     ┌───────────┐
│ Sentinel │────▶│ Infrastructure │────▶│  Policy  │────▶│ Commander │────▶ END
└──────────┘     └────────────────┘     └──────────┘     └───────────┘
```

**Topology type:** Strictly linear chain. **No** conditional edges, **no** branching, **no** loops, **no** fan-out/fan-in, **no** human-in-the-loop checkpoints.

### State Object (`SwarmState`)

```python
class SwarmState(TypedDict):
    location: str              # Input — geographic identifier
    precipitation: float       # Input — mm/hr
    soil_moisture: float       # Input — percentage (0–100)
    runoff: float              # Input — mm
    sentinel_alert: str        # Output — written by Sentinel
    infrastructure_report: str # Output — written by Infrastructure
    policy_directive: str      # Output — written by Policy
    final_plan: str            # Output — written by Commander
```

Each agent reads fields populated by earlier agents and writes to its own output field. The state is passed through the graph immutably — agents return dicts that are merged into state.

### How It's Invoked

```python
# In main.py's @pw.udf
initial_state = {
    "location": location,
    "precipitation": precip,
    "soil_moisture": soil,
    "runoff": runoff,
    "sentinel_alert": "",
    "infrastructure_report": "",
    "policy_directive": "",
    "final_plan": ""
}
result = hydro_brain.invoke(initial_state)
```

**Key detail:** `hydro_brain` is compiled once at module import time (`workflow.compile()` in `graph.py`) and invoked synchronously per weather event inside a Pathway UDF.

---

## 3. Agent-by-Agent Deep Dive

### 3.1 Sentinel Agent (`sentinel.py`)

**Role:** Environmental risk interpreter — the "eyes" of the swarm. First agent to run.

**Inputs from state:** `location`, `precipitation`, `soil_moisture`, `runoff`

**External calls:** Groq API only (no RAG, no tools)

**Full prompt template:**
```
You are the HydroSwarm Sentinel, an expert in urban environmental risk assessment.

Current Live Telemetry for {location}:
- Precipitation: {precipitation} mm/hr
- Soil Saturation: {soil_moisture}%
- Surface Runoff: {runoff} mm

Task: Do not calculate math. Your job is to interpret the qualitative human and
urban impact of these metrics.
Analyze the synergy between high saturation and runoff. Does this profile indicate
a manageable event, severe property damage, or an immediate threat to life?

Output exactly one concise sentence declaring the qualitative threat level and
the primary environmental driver.
```

**Prompt analysis:**
- ✅ Clear role assignment ("expert in urban environmental risk assessment")
- ✅ Explicit constraint ("Do not calculate math")
- ✅ Three-tier classification framework (manageable / property damage / threat to life)
- ⚠️ "Exactly one concise sentence" is **consistently violated** in production output

**Actual output observed (from `sys.stdout`):**
```
Given the high rainfall rate of 65.5 mm/hr and soil saturation of 95.0%, the surface
runoff of 12.0 mm indicates that the ground is nearly impermeable, leading to a rapid
accumulation of water; this scenario suggests a high risk of flash flooding due to
the limited capacity of the soil to absorb more water.

Final status alert: **CRITICAL FLASH FLOOD RISK DECLARED**.
```

**Problems identified:**
1. Output is 2–3 sentences, not 1 as instructed.
2. The model adds a "Final status alert" section unprompted — this is an emergent behavior, not controlled.
3. Output varies slightly between runs despite temperature=0 (Groq's inference engine may introduce non-determinism).
4. No structured output parsing — the raw `.content` string is passed directly to the next agent.

**What's missing:**
- No severity enum/score — downstream agents receive free-text, making programmatic branching impossible.
- No confidence level — the system can't distinguish between "I'm fairly sure this is bad" and "this is catastrophically bad."

**Realistic fix:**
```python
# Add output parsing with a Pydantic model
from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field

class SentinelOutput(BaseModel):
    threat_level: str = Field(description="One of: LOW, MODERATE, SEVERE, CRITICAL")
    primary_driver: str = Field(description="The single most important environmental factor")
    summary: str = Field(description="One sentence summary of the threat")

parser = PydanticOutputParser(pydantic_object=SentinelOutput)
# Append parser.get_format_instructions() to the prompt
# Use parser.parse(response.content) to validate output
```

---

### 3.2 Infrastructure Agent (`infrastructure.py`)

**Role:** Cross-references weather alerts with live infrastructure data via RAG.

**Inputs from state:** `sentinel_alert`, `location`

**External calls:**
1. HTTP POST to `http://127.0.0.1:8000/v1/retrieve` (Pathway RAG server)
2. Groq API

**RAG retrieval details:**
```python
response = requests.post(
    "http://127.0.0.1:8000/v1/retrieve",
    json={"query": f"Infrastructure drainage capacity and protocol for {location}", "k": 1}
)
```

- Retrieves only **k=1** (single document).
- The RAG corpus has only ~2 documents total (`infrastructure_data.txt` + `live_search_data.txt`), so k=1 means it picks the *single best match* and ignores the other entirely.
- Fallback on any exception: `"Database offline. Fallback mode engaged."` — gives the LLM zero useful context.

**Full prompt template:**
```
You are the Infrastructure AI specialist.
Weather Alert received: {sentinel_alert}
Live Database Context for {location}: {rag_context}

Task: Cross-reference the weather alert against the live database context.
Evaluate if the current infrastructure can handle this event.
Write a concise, 2-sentence infrastructure impact report based ONLY on the
Live Database Context provided.
```

**Prompt analysis:**
- ✅ Clear grounding instruction ("based ONLY on the Live Database Context")
- ✅ Cross-referencing two data sources (sentinel output + RAG context)
- ⚠️ "2-sentence" constraint is mostly followed but sometimes exceeded
- ⚠️ The RAG context is often the same `infrastructure_data.txt` content every time, so the agent produces near-identical reports across runs

**Actual output observed:**
```
The current rainfall rate of 65.5 mm/hr exceeds the baseline drainage limit of 45mm/hr
for Noida Sector 62, indicating that the sector's drainage system is overwhelmed and
excess water will route to Okhla. The infrastructure's capacity to handle the flash
flood event is compromised, as the excess water routing to Okhla may not be sufficient
to mitigate the critical flash flood risk declared for the area.
```

**Problems identified:**
1. Output is repetitive across runs because the RAG corpus is tiny and static (same infrastructure doc retrieved every time).
2. The agent doesn't produce a structured capacity assessment (e.g., "85% over capacity") — just prose.
3. `k=1` is too restrictive. With only 2 documents, it should retrieve both (`k=2` or higher).
4. The fallback string `"Database offline."` causes the LLM to freely hallucinate infrastructure data with no guardrails.

**Realistic fix:**
```python
# Increase k to retrieve all available context
json={"query": ..., "k": 5}

# Combine multiple docs
rag_context = "\n---\n".join([doc.get("text", "") for doc in docs])

# Add a structured fallback with actual defaults
FALLBACK_CONTEXT = """
WARNING: Live database is unavailable. Using emergency defaults:
- Assume standard drainage capacity of 30mm/hr for unknown sectors.
- Assume moderate infrastructure resilience.
- Flag this report as UNVERIFIED.
"""
```

---

### 3.3 Policy Agent (`policy.py`)

**Role:** Autonomous logistics planner — generates deployment actions and contingency routes.

**Inputs from state:** `sentinel_alert`, `infrastructure_report`

**External calls:** Groq API only (no RAG, no tools, no map APIs, no traffic data)

**Full prompt template:**
```
You are the Policy & Logistics AI planner.

Context:
1. Threat Level: {sentinel_alert}
2. Infrastructure Status: {infrastructure_report}

Task: Autonomously formulate a logistics routing plan. You must anticipate one
potential bottleneck or failure point based on the infrastructure status (e.g., if
drains are at capacity, standard routes might be blocked).

Write a 2-sentence directive: Sentence 1 stating the primary deployment action, and
Sentence 2 stating an alternative contingency route or fallback protocol.
```

**Prompt analysis:**
- ✅ Good structure: explicit 2-sentence format with defined purpose for each sentence
- ✅ Forces anticipation of failure points (proactive, not reactive)
- ❌ **No access to real data** — no road network, no traffic API, no GIS data
- ❌ "Routes" and "logistics" are purely hallucinated by the LLM based on general knowledge

**Actual output observed:**
```
Activate emergency fleets to assist with evacuation and relief efforts in Noida Sector 62
and Okhla, and close roads in low-lying areas to prevent further congestion and hazards.
Additionally, deploy water harvesting systems in nearby areas to mitigate the excess water
flow and alleviate the strain on the overwhelmed drainage system.
```

**Problems identified:**
1. The "routing plan" mentions no specific roads, intersections, or routes — because it has no geographic data.
2. "Deploy water harvesting systems" is a recurring hallucination — the LLM has no way to verify if such systems exist.
3. The policy is generic enough to apply to any flood event anywhere — it's not location-specific.
4. No prioritization framework (which action first? what's the resource constraint?).

**Realistic fix:**
```python
# Provide real geographic context via a tool or additional RAG retrieval
# Option 1: Add a Google Maps / OpenStreetMap API tool
# Option 2: Add a local JSON file with road network data for the target area
# Option 3: At minimum, hardcode known routes for the demo location

SECTOR_62_ROUTES = """
Known road network for Noida Sector 62:
- Primary: NH-24 (Delhi-Meerut Expressway) — elevation 204m
- Secondary: Sector 62 internal roads — prone to waterlogging near Electronic City
- Emergency: Route 3 via Greater Noida Expressway — higher elevation, less flood-prone
- Hospital access: Fortis Hospital via Sector 51 — must remain open
- Bottleneck: Sector 62/63 underpass — floods at >30mm/hr rainfall
"""
```

---

### 3.4 Commander Agent (`commander.py`)

**Role:** Final synthesizer — the "brain" that produces the actionable directive for ground workers.

**Inputs from state:** `sentinel_alert`, `infrastructure_report`, `policy_directive`

**External calls:** Groq API only

**Full prompt template:**
```
You are the HydroSwarm Commander. Review the committee's findings:
1. Sentinel: {sentinel_alert}
2. Infrastructure: {infrastructure_report}
3. Policy: {policy_directive}

Task: Synthesize this debate into a strict, highly actionable 2-sentence emergency
action plan for ground workers and municipal authorities.
```

**Prompt analysis:**
- ✅ Clear hierarchical framing ("committee's findings" → single authority synthesizes)
- ✅ Defined audience ("ground workers and municipal authorities")
- ⚠️ "2-sentence" constraint is violated in every single observed output (always 3+ sentences)
- ❌ "Highly actionable" is aspirational — the outputs are generic directives, not specific actions with names, locations, and timelines

**Actual output observed:**
```
As HydroSwarm Commander, I hereby declare a **CRITICAL FLASH FLOOD RISK** and order all
ground workers and municipal authorities to immediately assist with evacuation and relief
efforts in Noida Sector 62 and Okhla, while closing roads in low-lying areas to prevent
further congestion and hazards. Additionally, emergency fleets must be activated to deploy
water harvesting systems in nearby areas to mitigate excess water flow, and all personnel
must prioritize the safety of civilians and infrastructure in the affected regions.
```

**Problems identified:**
1. The commander adds dramatic flair ("I hereby declare", "I hereby issue") — wastes tokens and adds no actionable value.
2. The output is essentially a rephrased combination of Policy + Sentinel outputs — minimal synthesis or new insight.
3. No structured output: no priority levels, no timelines, no resource assignments, no contact information.
4. Across 9 observed runs with identical input, the output varies only in phrasing, not substance — proving the commander adds low marginal value.

**Realistic fix:**
```python
# Force structured output
prompt = f"""
You are the HydroSwarm Commander. Based on the committee's findings:
1. Sentinel: {state['sentinel_alert']}
2. Infrastructure: {state['infrastructure_report']}
3. Policy: {state['policy_directive']}

Output a JSON object with exactly these fields:
{{
    "alert_level": "GREEN | YELLOW | ORANGE | RED",
    "action_1": "Primary action in ≤15 words",
    "action_2": "Secondary action in ≤15 words",
    "evacuation_required": true/false,
    "estimated_response_time_minutes": integer,
    "affected_zones": ["list", "of", "specific", "areas"]
}}
"""
```

---

## 4. RAG Embedding Model (`rag_memory.py`)

### Model: `all-MiniLM-L6-v2`

| Property | Value |
|----------|-------|
| Architecture | BERT-based Sentence Transformer |
| Parameters | ~22 million |
| Embedding Dimensions | 384 |
| Max Sequence Length | 256 tokens |
| Speed | ~14,000 sentences/sec on GPU, ~500/sec on CPU |
| Runs on | Local CPU (no GPU required) |

### Corpus Size

| File | Content | Approximate Tokens |
|------|---------|-------------------|
| `infrastructure_data.txt` | 4 lines of handwritten specs | ~80 tokens |
| `live_search_data.txt` | DuckDuckGo snippets + baseline | ~50–200 tokens |
| **Total** | — | **~130–280 tokens** |

**This corpus is absurdly small for a vector store.** A simple `if location == "Noida Sector 62": return HARDCODED_STRING` would produce identical results with zero latency and no embedding overhead. The vector store adds architectural complexity (a separate process, an HTTP server, an embedding model) for a corpus that fits in a single Python string.

### When Vector Store Would Be Justified

The current architecture *would* make sense if:
- The corpus grew to 100+ documents (multiple locations, historical reports, municipal PDFs)
- Documents were frequently updated (currently only `live_search_data.txt` updates, and its web search content is often empty)
- Semantic search was needed across diverse document types (currently, only 1 query pattern exists)

---

## 5. Cross-Run Output Consistency Analysis

From the 9 runs captured in `sys.stdout` (all with identical demo input: precip=65.5, soil=95.0, runoff=12.0):

| Aspect | Consistent? | Notes |
|--------|-------------|-------|
| Sentinel threat level | ✅ Yes | Always "CRITICAL FLASH FLOOD RISK" |
| Sentinel phrasing | ⚠️ Minor variation | Same meaning, slight word changes |
| Infrastructure 45mm/hr reference | ✅ Yes | Always references the RAG data correctly |
| Policy actions | ⚠️ Moderate variation | Same themes (fleets, road closures, water harvesting) in different order |
| Commander output | ⚠️ Moderate variation | Same substance, different dramatic framing |
| Output length compliance | ❌ No | "1-sentence" and "2-sentence" constraints are never followed |

**Conclusion:** Temperature=0 produces *mostly* consistent outputs but Groq's inference engine introduces slight non-determinism. The semantic content is stable; only phrasing varies.

---

## 6. Summary of Model-Layer Inefficiencies

| Issue | Impact | Fix Difficulty |
|-------|--------|----------------|
| Same model for all 4 agents | No specialization; all agents produce similar prose style | Easy — use a smaller/faster model for Sentinel and Commander |
| No output validation | Sentence-count constraints are violated 100% of the time | Easy — add `PydanticOutputParser` or JSON mode |
| No structured output | Downstream systems can't parse agent outputs programmatically | Medium — switch to function calling or JSON mode on Groq |
| Policy agent has no real data | "Routing plans" are hallucinated, not data-driven | Medium — integrate a maps/traffic API |
| Commander adds low marginal value | Essentially rephrases earlier agents | Easy — could be replaced by a simple template that concatenates the other 3 outputs |
| No inter-event memory | System can't detect trends ("rainfall increasing over last hour") | Hard — requires adding state persistence to the LangGraph |
| RAG corpus too small | Vector store is overkill for ~200 tokens | Easy — inline the data or expand the corpus significantly |
| 4 sequential LLM calls per event | 8–25 second total latency per event | Medium — parallelize Sentinel + Infrastructure (they don't truly depend on each other's outputs for the RAG query) |
