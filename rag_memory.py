import pathway as pw
from pathway.xpacks.llm.vector_store import VectorStoreServer
from pathway.xpacks.llm.embedders import SentenceTransformerEmbedder
import threading
import time
import os
import json
from pathlib import Path
from duckduckgo_search import DDGS

print("🧠 Booting up Pathway Live RAG Memory & Broad Web Searcher...")

# Ensure data directory exists
os.makedirs("data", exist_ok=True)

ZONE_CONFIG_PATH = Path(__file__).parent / "active_zone.json"

def get_target_location():
    """Read the active zone from config (set by central server)."""
    try:
        if ZONE_CONFIG_PATH.exists():
            with open(ZONE_CONFIG_PATH) as f:
                config = json.load(f)
            return config.get("location", "Noida Sector 62")
    except (json.JSONDecodeError, IOError):
        pass
    return "Noida Sector 62"

# ==========================================
# 1. THE BROAD WEB SEARCHER (Background Thread)
# ==========================================
def dynamic_web_search():
    while True:
        try:
            # Re-read target location each cycle so the map can change it
            target_location = get_target_location()
            search_query = f"{target_location} drainage capacity waterlogging infrastructure news"

            print(f"\n🔍 [Broad Web Search] Scanning the internet for: '{search_query}'")

            # Perform a broad internet search (Like a Google Search)
            with DDGS() as ddgs:
                results = list(ddgs.text(search_query, max_results=3))

            # Format the unstructured web results into a clean context block
            live_text = f"LIVE INTERNET CONTEXT FOR {target_location.upper()}:\n\n"
            for res in results:
                live_text += f"Source Title: {res.get('title')}\n"
                live_text += f"Snippet: {res.get('body')}\n\n"

            # Add a baseline fallback just in case the internet search returns vague results
            live_text += "\nBASELINE SYSTEM METRICS:\n"
            live_text += "Sector 62 baseline drainage limit is 45mm/hr. Excess routes to Okhla.\n"

            # Drop the payload. Pathway detects this OS-level file change instantly!
            with open("data/live_search_data.txt", "w") as f:
                f.write(live_text)

            print("✅ [Pathway Ingestion] Broad web search results saved. Pathway vectorizing instantly.")

        except Exception as e:
            print(f"⚠️ [Search Error] {e}")

        # Run the broad search every 60 seconds
        time.sleep(60)

# Start the internet researcher in the background
search_thread = threading.Thread(target=dynamic_web_search, daemon=True)
search_thread.start()

# ==========================================
# 2. THE PATHWAY STREAMING VECTOR STORE
# ==========================================
data_sources = pw.io.fs.read(
    "./data",
    format="binary",
    with_metadata=True
)

server = VectorStoreServer(
    data_sources,
    embedder=SentenceTransformerEmbedder(model="all-MiniLM-L6-v2"),
)

# Host the memory on localhost:8000
server.run_server(host="0.0.0.0", port=8000)