"use client";

import { useState } from "react";
import { Power, PowerOff, Trash2, Loader2, Server, ChevronDown, ChevronUp } from "lucide-react";

interface ServiceStatus {
  name: string;
  script: string;
  port: number | null;
  description: string;
  is_running: boolean;
  pid: number | null;
  uptime_seconds: number | null;
  recent_logs: string[];
}

interface ServiceControlPanelProps {
  services: Record<string, ServiceStatus> | null;
  orchestratorOnline: boolean;
  onRefresh: () => void;
}

export default function ServiceControlPanel({
  services,
  orchestratorOnline,
  onRefresh,
}: ServiceControlPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);

  const callApi = async (url: string, actionId: string) => {
    setLoading(actionId);
    try {
      await fetch(url, { method: "POST" });
      // Give subprocess time to start/stop
      await new Promise((r) => setTimeout(r, 1500));
      onRefresh();
    } catch (err) {
      console.error("Action failed:", err);
    } finally {
      setLoading(null);
    }
  };

  const startService = (id: string) => callApi(`/api/services/${id}?action=start`, `start-${id}`);
  const stopService = (id: string) => callApi(`/api/services/${id}?action=stop`, `stop-${id}`);
  const bootAll = () => callApi("/api/services?action=boot-all", "boot-all");
  const shutdownAll = () => callApi("/api/services?action=shutdown-all", "shutdown-all");
  const cleanStream = () => callApi("/api/services?action=clean-stream", "clean-stream");

  const formatUptime = (seconds: number | null) => {
    if (!seconds) return "—";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const runningCount = services
    ? Object.values(services).filter((s) => s.is_running).length
    : 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <Server className="w-4 h-4 text-cyan-500" />
          Service Orchestrator
          <span
            className={`ml-2 px-2 py-0.5 rounded text-xs ${
              orchestratorOnline
                ? "bg-emerald-950/50 text-emerald-400 border border-emerald-900/50"
                : "bg-red-950/50 text-red-400 border border-red-900/50"
            }`}
          >
            {orchestratorOnline ? "ONLINE" : "OFFLINE"}
          </span>
        </h2>
        <span className="text-xs text-gray-500">
          {runningCount}/3 services active
        </span>
      </div>

      {!orchestratorOnline && (
        <div className="mb-4 px-3 py-2 bg-red-950/30 border border-red-900/50 rounded text-xs text-red-300">
          Central orchestrator is offline. Run <code className="bg-gray-800 px-1.5 py-0.5 rounded">python server.py</code> from the project root.
        </div>
      )}

      {/* Global Controls */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={bootAll}
          disabled={!orchestratorOnline || loading === "boot-all"}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-900/50 text-emerald-400 rounded text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading === "boot-all" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
          Boot All
        </button>
        <button
          onClick={shutdownAll}
          disabled={!orchestratorOnline || loading === "shutdown-all"}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-950/40 hover:bg-red-900/40 border border-red-900/50 text-red-400 rounded text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading === "shutdown-all" ? <Loader2 className="w-3 h-3 animate-spin" /> : <PowerOff className="w-3 h-3" />}
          Shutdown All
        </button>
        <button
          onClick={cleanStream}
          disabled={!orchestratorOnline || loading === "clean-stream"}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 rounded text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Remove stale stream/*.json files"
        >
          {loading === "clean-stream" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          Clean
        </button>
      </div>

      {/* Individual Services */}
      {services &&
        Object.entries(services).map(([id, svc]) => (
          <div
            key={id}
            className={`mb-2 border rounded-lg overflow-hidden transition-colors ${
              svc.is_running
                ? "border-emerald-900/50 bg-emerald-950/10"
                : "border-gray-800 bg-gray-950/50"
            }`}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-3">
                {/* Status dot */}
                <span
                  className={`w-2 h-2 rounded-full ${
                    svc.is_running ? "bg-emerald-400 animate-pulse" : "bg-gray-600"
                  }`}
                />
                <div>
                  <div className="text-xs font-bold text-gray-200">{svc.name}</div>
                  <div className="text-xs text-gray-500">
                    {svc.script}
                    {svc.port ? ` · :${svc.port}` : ""}
                    {svc.is_running ? ` · PID ${svc.pid} · ${formatUptime(svc.uptime_seconds)}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Log toggle */}
                {svc.recent_logs.length > 0 && (
                  <button
                    onClick={() => setExpandedLogs(expandedLogs === id ? null : id)}
                    className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors"
                    title="View logs"
                  >
                    {expandedLogs === id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
                {/* Start/Stop */}
                {svc.is_running ? (
                  <button
                    onClick={() => stopService(id)}
                    disabled={!!loading}
                    className="px-2.5 py-1 bg-red-950/50 hover:bg-red-900/50 border border-red-900/50 text-red-400 rounded text-xs transition-colors disabled:opacity-40"
                  >
                    {loading === `stop-${id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : "Stop"}
                  </button>
                ) : (
                  <button
                    onClick={() => startService(id)}
                    disabled={!orchestratorOnline || !!loading}
                    className="px-2.5 py-1 bg-emerald-950/50 hover:bg-emerald-900/50 border border-emerald-900/50 text-emerald-400 rounded text-xs transition-colors disabled:opacity-40"
                  >
                    {loading === `start-${id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : "Start"}
                  </button>
                )}
              </div>
            </div>
            {/* Expandable Logs */}
            {expandedLogs === id && svc.recent_logs.length > 0 && (
              <div className="border-t border-gray-800 px-3 py-2 bg-gray-950 max-h-32 overflow-y-auto">
                {svc.recent_logs.map((line, i) => (
                  <div key={i} className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap">
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
