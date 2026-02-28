"""
HydroSwarm Central Orchestrator
================================
Single entry point that manages all 3 backend services as subprocesses.
Exposes a REST API for the frontend to:
  - Start/stop individual services (lazy loading)
  - Check service health
  - Trigger analysis for a specific location
  - Retrieve the latest alert data

Services managed:
  1. RAG Memory   (rag_memory.py)  → Pathway vector store on port 8000
  2. Live Fetcher (live_fetcher.py) → Writes weather JSON to ./stream/
  3. AI Engine    (main.py)         → Pathway streaming pipeline

Run:  python server.py
Port: 5050
"""

import subprocess
import sys
import os
import json
import time
import signal
import threading
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# ─── Configuration ─────────────────────────────────────────
BASE_DIR = Path(__file__).parent.resolve()
STREAM_DIR = BASE_DIR / "stream"
FRONTEND_PUBLIC = BASE_DIR / "frontend" / "public"
ALERT_FILE = FRONTEND_PUBLIC / "latest_alert.json"
ALERT_HISTORY_FILE = FRONTEND_PUBLIC / "alert_history.json"

# ─── Service Registry ─────────────────────────────────────
class ServiceInfo:
    def __init__(self, name: str, script: str, port: int | None = None, description: str = ""):
        self.name = name
        self.script = script
        self.port = port
        self.description = description
        self.process: subprocess.Popen | None = None
        self.started_at: float | None = None
        self.log_lines: list[str] = []
        self._log_thread: threading.Thread | None = None

    @property
    def is_running(self) -> bool:
        return self.process is not None and self.process.poll() is None

    @property
    def status(self) -> dict:
        return {
            "name": self.name,
            "script": self.script,
            "port": self.port,
            "description": self.description,
            "is_running": self.is_running,
            "pid": self.process.pid if self.is_running else None,
            "started_at": self.started_at,
            "uptime_seconds": round(time.time() - self.started_at, 1) if self.started_at and self.is_running else None,
            "recent_logs": self.log_lines[-20:],  # last 20 lines
        }

    def start(self):
        if self.is_running:
            return {"message": f"{self.name} is already running", "pid": self.process.pid}

        self.log_lines = []
        self.process = subprocess.Popen(
            [sys.executable, self.script],
            cwd=str(BASE_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        self.started_at = time.time()

        # Background thread to capture logs
        self._log_thread = threading.Thread(target=self._capture_logs, daemon=True)
        self._log_thread.start()

        return {"message": f"{self.name} started", "pid": self.process.pid}

    def stop(self):
        if not self.is_running:
            return {"message": f"{self.name} is not running"}

        pid = self.process.pid
        self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=3)

        self.process = None
        self.started_at = None
        return {"message": f"{self.name} stopped", "pid": pid}

    def _capture_logs(self):
        try:
            for line in self.process.stdout:
                stripped = line.rstrip()
                if stripped:
                    self.log_lines.append(stripped)
                    # Keep only last 200 lines in memory
                    if len(self.log_lines) > 200:
                        self.log_lines = self.log_lines[-100:]
        except (ValueError, OSError):
            pass  # pipe closed


# ─── Initialize Services ──────────────────────────────────
SERVICES: dict[str, ServiceInfo] = {
    "rag_memory": ServiceInfo(
        name="RAG Memory",
        script="rag_memory.py",
        port=8000,
        description="Pathway Vector Store + DuckDuckGo web searcher. Must start FIRST.",
    ),
    "live_fetcher": ServiceInfo(
        name="Live Fetcher",
        script="live_fetcher.py",
        port=None,
        description="Open-Meteo weather data ingestion. Writes JSON events to ./stream/",
    ),
    "ai_engine": ServiceInfo(
        name="AI Engine",
        script="main.py",
        port=None,
        description="Pathway streaming pipeline + LangGraph multi-agent brain.",
    ),
}

# Boot order for the full pipeline
BOOT_ORDER = ["rag_memory", "live_fetcher", "ai_engine"]
BOOT_DELAYS = {"rag_memory": 6, "live_fetcher": 2, "ai_engine": 0}  # seconds to wait after starting

# ─── Alert History ─────────────────────────────────────────
alert_history: list[dict] = []
MAX_HISTORY = 50


def load_existing_alert():
    """Load existing alert from disk if present."""
    global alert_history
    if ALERT_FILE.exists():
        try:
            with open(ALERT_FILE) as f:
                data = json.load(f)
            if data:
                alert_history.append(data)
        except (json.JSONDecodeError, IOError):
            pass


def watch_alert_file():
    """Background thread that watches latest_alert.json for changes (written by main.py)."""
    global alert_history
    last_mtime = 0
    while True:
        try:
            if ALERT_FILE.exists():
                mtime = ALERT_FILE.stat().st_mtime
                if mtime > last_mtime:
                    last_mtime = mtime
                    with open(ALERT_FILE) as f:
                        data = json.load(f)
                    if data:
                        data["_received_at"] = time.time()
                        alert_history.append(data)
                        if len(alert_history) > MAX_HISTORY:
                            alert_history = alert_history[-MAX_HISTORY:]
                        # Persist history
                        try:
                            with open(ALERT_HISTORY_FILE, "w") as f:
                                json.dump(alert_history[-10:], f)
                        except IOError:
                            pass
        except (json.JSONDecodeError, IOError):
            pass
        time.sleep(2)


# ─── Lifespan ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    os.makedirs(STREAM_DIR, exist_ok=True)
    os.makedirs(FRONTEND_PUBLIC, exist_ok=True)
    load_existing_alert()
    watcher = threading.Thread(target=watch_alert_file, daemon=True)
    watcher.start()
    print("🎛️  HydroSwarm Central Orchestrator online at http://localhost:5050")
    print("📡 Waiting for frontend to trigger services (lazy loading)...")
    yield
    # Shutdown — kill all managed services
    print("\n🛑 Shutting down all services...")
    for svc in SERVICES.values():
        if svc.is_running:
            svc.stop()
    print("✅ All services stopped.")


# ─── FastAPI App ───────────────────────────────────────────
app = FastAPI(
    title="HydroSwarm Orchestrator",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Models ────────────────────────────────────────────────
class LocationRequest(BaseModel):
    location: str
    latitude: float
    longitude: float


# ─── Routes: Service Management ───────────────────────────
@app.get("/api/services")
def get_all_services():
    """Get status of all managed services."""
    return {key: svc.status for key, svc in SERVICES.items()}


@app.post("/api/services/{service_id}/start")
def start_service(service_id: str):
    """Lazy-start a specific service."""
    if service_id not in SERVICES:
        raise HTTPException(404, f"Unknown service: {service_id}")
    return SERVICES[service_id].start()


@app.post("/api/services/{service_id}/stop")
def stop_service(service_id: str):
    """Stop a specific service."""
    if service_id not in SERVICES:
        raise HTTPException(404, f"Unknown service: {service_id}")
    return SERVICES[service_id].stop()


@app.post("/api/services/boot-all")
def boot_all_services():
    """Start all services in correct order with delays (lazy loading trigger)."""
    results = {}
    for svc_id in BOOT_ORDER:
        svc = SERVICES[svc_id]
        if svc.is_running:
            results[svc_id] = {"message": f"{svc.name} already running", "pid": svc.process.pid}
        else:
            results[svc_id] = svc.start()
            delay = BOOT_DELAYS.get(svc_id, 0)
            if delay > 0:
                time.sleep(delay)
    return results


@app.post("/api/services/shutdown-all")
def shutdown_all_services():
    """Stop all services."""
    results = {}
    for svc_id in reversed(BOOT_ORDER):
        results[svc_id] = SERVICES[svc_id].stop()
    return results


@app.post("/api/services/clean-stream")
def clean_stream():
    """Remove old JSON files from ./stream/ directory."""
    count = 0
    for f in STREAM_DIR.glob("*.json"):
        f.unlink()
        count += 1
    return {"message": f"Cleaned {count} files from stream/"}


# ─── Routes: Alerts ───────────────────────────────────────
@app.get("/api/alerts/latest")
def get_latest_alert():
    """Get the most recent alert."""
    if not alert_history:
        if ALERT_FILE.exists():
            try:
                with open(ALERT_FILE) as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                pass
        raise HTTPException(404, "No alerts yet")
    return alert_history[-1]


@app.get("/api/alerts/history")
def get_alert_history():
    """Get last N alerts."""
    return alert_history[-10:]


@app.get("/api/report")
def get_curated_report():
    """
    Return a single curated report synthesised from all 4 agents.
    Always returns 200 with peaks_detected + ready flag so the frontend
    can show progress even when no alerts have arrived yet.
    """
    # Try to pick up any alert written to disk
    if not alert_history:
        if ALERT_FILE.exists():
            try:
                with open(ALERT_FILE) as f:
                    data = json.load(f)
                if data:
                    alert_history.append(data)
            except (json.JSONDecodeError, IOError):
                pass

    # Read active zone name for context
    active_location = "Unknown"
    config_path = BASE_DIR / "active_zone.json"
    if config_path.exists():
        try:
            with open(config_path) as f:
                active_location = json.load(f).get("location", "Unknown")
        except (json.JSONDecodeError, IOError):
            pass

    # No alerts yet — return a valid response with 0 peaks (NOT a 404)
    if not alert_history:
        return {
            "location": active_location,
            "precipitation_mm": 0,
            "timestamp": None,
            "commander_report": "",
            "summary": {},
            "peaks_detected": 0,
            "ready": False,
        }

    latest = alert_history[-1]

    # Parse the ai_debate JSON string into structured fields
    report: dict = {
        "location": latest.get("location", active_location),
        "precipitation_mm": latest.get("precipitation_mm", 0),
        "timestamp": latest.get("timestamp"),
    }

    try:
        debate = json.loads(latest.get("ai_debate", "{}"))
        report["commander_report"] = debate.get("commander", "")
        report["summary"] = {
            "sentinel": debate.get("sentinel", ""),
            "infrastructure": debate.get("infrastructure", ""),
            "policy": debate.get("policy", ""),
        }
    except (json.JSONDecodeError, TypeError):
        report["commander_report"] = latest.get("ai_debate", "Processing…")
        report["summary"] = {}

    # Count how many alerts we have for the current active zone
    active_loc = report["location"]
    zone_alert_count = sum(1 for a in alert_history if a.get("location") == active_loc)
    report["peaks_detected"] = zone_alert_count
    report["ready"] = zone_alert_count >= 1

    return report


# ─── Routes: Map / Location ───────────────────────────────
@app.post("/api/zones/activate")
def activate_zone(req: LocationRequest):
    """
    Activate monitoring for a specific zone.
    1. Writes active_zone.json so live_fetcher + rag_memory pick up the new location.
    2. Cleans old stream files (fresh start for peak detection).
    3. Auto-boots all 3 services if they aren't already running (lazy loading).
    """
    config = {
        "location": req.location,
        "latitude": req.latitude,
        "longitude": req.longitude,
        "activated_at": time.time(),
    }
    config_path = BASE_DIR / "active_zone.json"
    with open(config_path, "w") as f:
        json.dump(config, f)

    # Clear alert history + stream data so peak counter resets for the new zone
    global alert_history
    alert_history = []
    for f in STREAM_DIR.glob("*.json"):
        f.unlink()
    # Also clear the stale alert file so old reports don't bleed through
    if ALERT_FILE.exists():
        try:
            ALERT_FILE.unlink()
        except OSError:
            pass

    # Auto-boot all services in order if not already running
    boot_results = {}
    for svc_id in BOOT_ORDER:
        svc = SERVICES[svc_id]
        if svc.is_running:
            boot_results[svc_id] = "already running"
        else:
            svc.start()
            boot_results[svc_id] = "started"
            delay = BOOT_DELAYS.get(svc_id, 0)
            if delay > 0:
                time.sleep(delay)

    return {
        "message": f"Zone activated: {req.location}",
        "config": config,
        "services_booted": boot_results,
    }


@app.post("/api/zones/deactivate")
def deactivate_zone():
    """Stop all services and clear the active zone."""
    global alert_history
    alert_history = []
    config_path = BASE_DIR / "active_zone.json"
    if config_path.exists():
        config_path.unlink()
    if ALERT_FILE.exists():
        try:
            ALERT_FILE.unlink()
        except OSError:
            pass
    # Stop all services in reverse order
    results = {}
    for svc_id in reversed(BOOT_ORDER):
        results[svc_id] = SERVICES[svc_id].stop()
    # Clean stream
    for f in STREAM_DIR.glob("*.json"):
        f.unlink()
    return {"message": "Zone deactivated, all services stopped", "results": results}


# ─── Routes: Citizen SOS ───────────────────────────────────
class SosReport(BaseModel):
    lat: float
    lng: float
    report: str


@app.post("/api/sos")
def submit_sos(sos: SosReport):
    """
    Accept a citizen SOS ground-truth flood report.
    Writes it as a text file in ./data/ so Pathway's VectorStoreServer
    automatically indexes it into the RAG knowledge base.
    """
    if not sos.report.strip():
        raise HTTPException(400, "Report text cannot be empty")

    data_dir = BASE_DIR / "data"
    os.makedirs(data_dir, exist_ok=True)

    timestamp = int(time.time())
    filename = f"citizen_sos_{timestamp}.txt"
    filepath = data_dir / filename

    content = (
        f"URGENT CITIZEN SOS REPORT\n"
        f"========================\n"
        f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime(timestamp))}\n"
        f"Location: [{sos.lat:.6f}, {sos.lng:.6f}]\n"
        f"Details: {sos.report.strip()}\n"
    )

    with open(filepath, "w") as f:
        f.write(content)

    return {
        "message": "SOS report received and indexed",
        "filename": filename,
        "timestamp": timestamp,
    }


# ─── Routes: Health ───────────────────────────────────────
@app.get("/api/health")
def health():
    return {
        "status": "online",
        "orchestrator_port": 5050,
        "services": {k: v.is_running for k, v in SERVICES.items()},
        "alert_count": len(alert_history),
        "stream_files": len(list(STREAM_DIR.glob("*.json"))) if STREAM_DIR.exists() else 0,
    }


# ─── Entry Point ──────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5050, log_level="info")
