import pathway as pw
from pathway.xpacks.llm.vector_store import VectorStoreServer
from pathway.xpacks.llm.embedders import SentenceTransformerEmbedder

print("🧠 Booting up Pathway Live RAG Memory on port 8000...")

# 1. Watch the data folder for any file changes
data_sources = pw.io.fs.read(
    "./data",
    format="binary",
    with_metadata=True
)

# 2. Initialize the Vector Store Server
# This automatically embeds the text and hosts it as a search engine
server = VectorStoreServer(
    data_sources,
    embedder=SentenceTransformerEmbedder(model="all-MiniLM-L6-v2"),
)

# 3. Host the memory on localhost:8000
server.run_server(host="0.0.0.0", port=8000)