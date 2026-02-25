"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, Cpu, Activity, MapPin, Droplets, Wind, ServerCrash } from "lucide-react";

export default function HydroSwarmDashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState(false);

  // Poll the Pathway REST API every 3 seconds
  useEffect(() => {
    const fetchData = async () => {
      try {
        // TWEAK: Fetch the file from the public directory, NOT the 8080 API
        const response = await fetch("/latest_alert.json?t=" + new Date().getTime());
        if (!response.ok) throw new Error("No alert data yet");

        const latestRow = await response.json();

        if (latestRow && latestRow.ai_debate) {
          latestRow.ai_debate_parsed = JSON.parse(latestRow.ai_debate);
          setData(latestRow);
          setError(false);
        }
      } catch (err) {
        console.error("Waiting for Pathway Stream...");
        setError(true);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-cyan-500 font-mono">
        <Activity className="animate-spin mr-3" /> Waiting for HydroSwarm AI Engine...
      </div>
    );
  }

  const debate = data.ai_debate_parsed;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8 font-mono">
      {/* HEADER */}
      <header className="mb-8 border-b border-gray-800 pb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-cyan-500 flex items-center tracking-wider">
            <Cpu className="mr-3" /> HYDROSWARM COMMAND
          </h1>
          <p className="text-gray-400 mt-2 text-sm uppercase tracking-widest">Autonomous Multi-Agent Mitigation System</p>
        </div>
        <div className="flex items-center space-x-6 text-sm">
          <div className="flex items-center text-red-400 bg-red-950/30 px-4 py-2 rounded border border-red-900/50">
            <MapPin className="w-4 h-4 mr-2" /> {data.location}
          </div>
          <div className="flex items-center text-blue-400 bg-blue-950/30 px-4 py-2 rounded border border-blue-900/50">
            <Droplets className="w-4 h-4 mr-2" /> {data.precipitation_mm} mm/hr
          </div>
          <div className="flex items-center text-emerald-400 bg-emerald-950/30 px-4 py-2 rounded border border-emerald-900/50">
            <Activity className="w-4 h-4 mr-2" /> Live RAG Sync
          </div>
        </div>
      </header>

      {/* THE AI COMMITTEE DEBATE */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Agent 1: Sentinel */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
          <h2 className="text-blue-400 font-bold mb-3 flex items-center text-sm uppercase tracking-wider">
            <Wind className="w-4 h-4 mr-2" /> 1. Sentinel Agent (Meteorology)
          </h2>
          <p className="text-gray-300 text-sm leading-relaxed bg-gray-950 p-4 rounded border border-gray-800">
            {debate.sentinel}
          </p>
        </div>

        {/* Agent 2: Infrastructure */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
          <h2 className="text-purple-400 font-bold mb-3 flex items-center text-sm uppercase tracking-wider">
            <ServerCrash className="w-4 h-4 mr-2" /> 2. Infrastructure Agent (Pathway RAG)
          </h2>
          <p className="text-gray-300 text-sm leading-relaxed bg-gray-950 p-4 rounded border border-gray-800">
            {debate.infrastructure}
          </p>
        </div>

        {/* Agent 3: Policy */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
          <h2 className="text-emerald-400 font-bold mb-3 flex items-center text-sm uppercase tracking-wider">
            <Cpu className="w-4 h-4 mr-2" /> 3. Policy Agent (Logistics)
          </h2>
          <p className="text-gray-300 text-sm leading-relaxed bg-gray-950 p-4 rounded border border-gray-800">
            {debate.policy}
          </p>
        </div>

        {/* Agent 4: Commander */}
        <div className="bg-gray-900 border border-red-900/50 rounded-lg p-6 shadow-xl relative overflow-hidden bg-red-950/10">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
          <h2 className="text-red-400 font-bold mb-3 flex items-center text-sm uppercase tracking-wider">
            <ShieldAlert className="w-4 h-4 mr-2 animate-pulse" /> 4. Commander (Final Execution)
          </h2>
          <p className="text-gray-100 text-sm leading-relaxed bg-gray-950 p-4 rounded border border-red-900/30">
            {debate.commander}
          </p>
        </div>

      </div>
    </div>
  );
}