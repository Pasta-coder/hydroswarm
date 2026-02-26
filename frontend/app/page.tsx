"use client"

import { useState } from "react"
import Link from "next/link"
import { 
  Github, 
  Radar, 
  Waves, 
  ShieldAlert, 
  Building2, 
  Scale, 
  Crown 
} from "lucide-react"

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<"point1" | "point2">("point1")

  return (
    <div className="bg-black text-white font-mono antialiased">

      {/* NAVBAR */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <Waves className="text-cyan-400 w-6 h-6" />
          <span className="text-xl font-semibold tracking-tight">HYDROSWARM</span>
        </div>

        <a 
          href="https://github.com/Pasta-coder/hydroswarm" 
          target="_blank"
          className="hover:text-cyan-400 transition"
        >
          <Github />
        </a>
      </nav>


      {/* HERO SECTION */}
      <section 
        className="relative flex flex-col items-center justify-center text-center h-[85vh] bg-cover bg-center"
        style={{
          backgroundImage: "url('/matthieu-buhler-WnfKYqxWH8Q-unsplash.jpg')"
        }}
      >
        <div className="absolute inset-0 bg-black/40"></div>

        <div className="relative z-10 flex flex-col items-center">

          <h1 className="text-6xl font-bold tracking-tight mb-4">
            HYDROSWARM
          </h1>

          <p className="text-gray-300 max-w-xl mb-8 text-lg leading-relaxed font-semibold">
            AI-powered multi-agent flood intelligence system for real-time
            urban monitoring and rapid emergency response.
          </p>

          <Link href="/map">
            <button className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-semibold transition transform hover:scale-105 shadow-lg shadow-cyan-500/20">
              Go To Map
            </button>
          </Link>
        </div>
      </section>


      {/* PATHWAY SECTION */}
      <section className="px-12 py-20 grid md:grid-cols-2 gap-12 items-center">

        <div>
          <h2 className="text-3xl font-semibold text-cyan-400 mb-4 tracking-tight">
            Real-Time Stream Processing with Pathway
          </h2>

          <p className="text-gray-400 mb-4 leading-relaxed">
            HYDROSWARM integrates Pathway to process live flood sensor data streams 
            and dynamically trigger intelligent agent responses.
          </p>

          <p className="text-gray-400 leading-relaxed">
            Using dual pipelines, we handle anomaly detection and emergency 
            escalation in real-time — ensuring instant action during critical events.
          </p>
        </div>

        {/* TABBED CODE BOX */}
        <div className="bg-gray-900 p-6 rounded-xl border border-cyan-500/20 shadow-lg">

          {/* Tabs */}
          <div className="flex gap-4 mb-4 text-sm">
            <button
              onClick={() => setActiveTab("point1")}
              className={`px-3 py-1 rounded-md transition ${
                activeTab === "point1"
                  ? "bg-cyan-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              Integration Point 1
            </button>

            <button
              onClick={() => setActiveTab("point2")}
              className={`px-3 py-1 rounded-md transition ${
                activeTab === "point2"
                  ? "bg-cyan-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              Integration Point 2
            </button>
          </div>

          <pre className="text-sm text-cyan-400 overflow-x-auto overflow-y-auto whitespace-pre-wrap h-64 font-mono leading-relaxed">
{activeTab === "point1" ? `# Pathway watches ./stream/ for new JSON files (written by live_fetcher.py)
weather_stream = pw.io.fs.read(
    "./stream",
    format="json",
    schema=WeatherSchema,
    mode="streaming"
)

active_weather = weather_stream.filter(
    weather_stream.precipitation_mm > 0.0
)

@pw.udf(executor=pw.udfs.async_executor(capacity=4))
async def trigger_swarm(location, precip, soil, runoff):
    result = await asyncio.to_thread(hydro_brain.invoke, initial_state)
    return json.dumps(debate_output)

ai_decisions = active_weather.select(
    ai_debate=trigger_swarm(...)
)

pw.io.subscribe(ai_decisions, on_change=push_to_dashboard)
pw.run()` 
: `# Pathway watches ./data/ for document changes
data_sources = pw.io.fs.read("./data", format="binary", with_metadata=True)

server = VectorStoreServer(
    data_sources,
    embedder=SentenceTransformerEmbedder(model="all-MiniLM-L6-v2"),
)

server.run_server(host="0.0.0.0", port=8000)`}
          </pre>
        </div>
      </section>


      {/* AI AGENTS SECTION */}
      <section className="px-12 pb-20">

        <h2 className="text-3xl font-semibold text-center text-cyan-400 mb-12 tracking-tight">
          Multi-Agent Command Architecture
        </h2>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">

          <AgentCard 
            icon={<ShieldAlert className="w-6 h-6" />}
            title="Sentinel Agent"
            desc="Llama 3.1 8B — Determines threat level (LOW → CRITICAL), identifies the primary risk driver, and produces a concise situational summary."
          />

          <AgentCard 
            icon={<Building2 className="w-6 h-6" />}
            title="Infrastructure Agent"
            desc="Llama 3.3 70B + RAG — Performs infrastructure impact analysis cross-referenced with the live streaming vector knowledge base."
          />

          <AgentCard 
            icon={<Scale className="w-6 h-6" />}
            title="Policy Agent"
            desc="Llama 3.3 70B — Generates optimized logistics routing plans with embedded contingency and escalation protocols."
          />

          <AgentCard 
            icon={<Crown className="w-6 h-6" />}
            title="Commander Agent"
            desc="Llama 3.1 8B — Issues the final alert color, evacuation decision, and a precise two-sentence executive dispatch order."
          />

        </div>
      </section>


      {/* FOOTER */}
      <footer className="border-t border-gray-800 py-6 text-center text-gray-500 text-sm">
        HYDROSWARM © 2026 — Built with Next.js + Pathway + Multi-Agent AI
      </footer>

    </div>
  )
}


function AgentCard({ icon, title, desc }: any) {
  return (
    <div className="bg-gray-900 p-6 rounded-xl border border-cyan-500/10 hover:border-cyan-400/40 transition shadow-lg hover:shadow-cyan-500/20">
      <div className="text-cyan-400 mb-4">{icon}</div>
      <h3 className="font-semibold mb-2 tracking-tight">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
    </div>
  )
}