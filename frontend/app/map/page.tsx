"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import type { ClickedLocation } from "../components/ZoneMap";
import {
  ShieldAlert,
  Activity,
  MapPin,
  Droplets,
  Crosshair,
  Loader2,
  X,
  AlertTriangle,
  Zap,
  Waves,
  Search,
  Megaphone,
} from "lucide-react";

const ZoneMap = dynamic(() => import("../components/ZoneMap"), { ssr: false });
import CitizenSosModal from "../components/CitizenSosModal";

interface Report {
  location: string;
  precipitation_mm: number;
  timestamp: number;
  commander_report: string;
  peaks_detected: number;
  ready: boolean;
  summary?: {
    sentinel?: string;
    infrastructure?: string;
    policy?: string;
  };
}

export default function HydroSwarmDashboard() {
  const [activeLocation, setActiveLocation] = useState<ClickedLocation | null>(null);
  const [activating, setActivating] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [orchestratorOnline, setOrchestratorOnline] = useState(false);
  const reportPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Search state ────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // ── SOS state ───────────────────────────────────────────
  const [sosOpen, setSosOpen] = useState(false);

  // ── Health check ────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        setOrchestratorOnline(res.ok);
      } catch {
        setOrchestratorOnline(false);
      }
    };
    check();
    const iv = setInterval(check, 5000);
    return () => clearInterval(iv);
  }, []);

  // ── Poll for report when a location is active ──────────
  const startReportPolling = useCallback(() => {
    if (reportPollRef.current) clearInterval(reportPollRef.current);

    const poll = async () => {
      try {
        const res = await fetch("/api/report", { cache: "no-store" });
        if (res.ok) {
          const data: Report = await res.json();
          setReport(data);
          if (data.ready) {
            setPanelOpen(true);
          }
        }
      } catch {
        /* still waiting */
      }
    };

    poll();
    reportPollRef.current = setInterval(poll, 2000);
  }, []);

  const stopReportPolling = useCallback(() => {
    if (reportPollRef.current) {
      clearInterval(reportPollRef.current);
      reportPollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopReportPolling(), [stopReportPolling]);

  // ── Map click → activate + auto-boot services ─────────
  const handleMapClick = useCallback(
    async (loc: ClickedLocation) => {
      // If clicking very close to the already-active location, just open panel
      if (
        activeLocation &&
        Math.abs(activeLocation.lat - loc.lat) < 0.001 &&
        Math.abs(activeLocation.lng - loc.lng) < 0.001
      ) {
        if (report?.ready) setPanelOpen(true);
        return;
      }

      setActiveLocation(loc);
      setActivating(true);
      setReport(null);
      setPanelOpen(false);
      stopReportPolling();

      try {
        const res = await fetch("/api/zones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: loc.name,
            latitude: loc.lat,
            longitude: loc.lng,
          }),
        });
        if (res.ok) {
          startReportPolling();
        }
      } catch (err) {
        console.error("Failed to activate location:", err);
      } finally {
        setActivating(false);
      }
    },
    [activeLocation, report, stopReportPolling, startReportPolling]
  );

  // ── Deactivate ──────────────────────────────────────────
  const handleDeactivate = useCallback(async () => {
    stopReportPolling();
    setPanelOpen(false);
    setActiveLocation(null);
    setReport(null);
    try {
      await fetch("/api/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deactivate: true }),
      });
    } catch {
      /* best effort */
    }
  }, [stopReportPolling]);

  // ── Location search (fires on Enter key press) ──────────
  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const executeSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;

    // ── Check if input looks like coordinates: "lat, lng" or "lat lng" ──
    const coordMatch = q.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        setSearchQuery("");
        setSearchResults([]);
        setSearchOpen(false);
        handleMapClick({ lat, lng, name: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
        return;
      }
    }

    // ── Otherwise, forward geocode via Nominatim ──
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`,
        { headers: { "User-Agent": "HydroSwarm/1.0" } }
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
        setSearchOpen(data.length > 0);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, handleMapClick]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        executeSearch();
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
      }
    },
    [executeSearch]
  );

  const handleSearchSelect = useCallback(
    (result: { display_name: string; lat: string; lon: string }) => {
      const lat = parseFloat(result.lat);
      const lng = parseFloat(result.lon);
      // Extract a short name from display_name
      const shortName = result.display_name.split(",").slice(0, 2).join(",").trim();

      setSearchQuery("");
      setSearchResults([]);
      setSearchOpen(false);

      // Trigger the same flow as a map click
      handleMapClick({ lat, lng, name: shortName });
    },
    [handleMapClick]
  );

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const peaksNeeded = 1;
  const peaksDetected = report?.peaks_detected ?? 0;

  return (
    <div className="h-screen w-screen bg-gray-950 text-gray-100 font-mono overflow-hidden relative">
      {/* ── FULLSCREEN MAP ──────────────────────────────── */}
      <div className="absolute inset-0">
        <ZoneMap
          activeLocation={activeLocation}
          onMapClick={handleMapClick}
        />
      </div>

      {/* ── TOP BAR (floating) ──────────────────────────── */}
      <header className="absolute top-0 left-0 right-0 z-1000 pointer-events-none">
        <div className="flex items-center justify-between px-5 py-3">
          {/* Logo */}
          <div className="pointer-events-auto bg-gray-950/80 backdrop-blur-md px-4 py-2.5 rounded-lg border border-gray-800/60">
            <h1 className="text-lg font-bold text-cyan-400 tracking-wider flex items-center gap-2">
              <Waves className="w-5 h-5" />
              HYDROSWARM
            </h1>
            <p className="text-gray-500 text-[10px] uppercase tracking-[0.2em]">
              Click anywhere to begin monitoring
            </p>
          </div>

          {/* Search Box */}
          <div ref={searchBoxRef} className="pointer-events-auto relative">
            <div className="flex items-center bg-gray-950/80 backdrop-blur-md rounded-lg border border-gray-800/60 overflow-hidden">
              <Search className="w-4 h-4 text-gray-500 ml-3 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => { if (searchResults.length > 0) setSearchOpen(true); }}
                placeholder="Search place or lat, lng — Enter ↵"
                className="bg-transparent text-sm text-gray-200 placeholder-gray-600 px-3 py-2.5 w-72 outline-none font-mono"
              />
              {searching && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400 mr-3" />}
              {searchQuery && !searching && (
                <button
                  onClick={() => { setSearchQuery(""); setSearchResults([]); setSearchOpen(false); }}
                  className="mr-3 p-0.5 rounded hover:bg-gray-800 transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300" />
                </button>
              )}
            </div>

            {/* Search Results Dropdown */}
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-gray-950/95 backdrop-blur-xl border border-gray-800/60 rounded-lg overflow-hidden shadow-2xl max-h-64 overflow-y-auto">
                {searchResults.map((r, i) => (
                  <button
                    key={`${r.lat}-${r.lon}-${i}`}
                    onClick={() => handleSearchSelect(r)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-800/60 transition-colors border-b border-gray-800/30 last:border-0 flex items-start gap-2.5"
                  >
                    <MapPin className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-gray-200 font-medium truncate">
                        {r.display_name.split(",").slice(0, 2).join(",")}
                      </div>
                      <div className="text-[10px] text-gray-500 truncate">
                        {r.display_name}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status badges */}
          <div className="pointer-events-auto flex items-center gap-2">
            {activeLocation && (
              <div className="flex items-center gap-2 bg-gray-950/80 backdrop-blur-md px-3 py-2 rounded-lg border border-cyan-900/50">
                <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-cyan-300 text-xs font-bold">{activeLocation.name}</span>
                {activating && <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />}
                <button
                  onClick={handleDeactivate}
                  className="ml-1 p-0.5 rounded hover:bg-gray-800 transition-colors"
                  title="Stop monitoring"
                >
                  <X className="w-3 h-3 text-gray-500 hover:text-red-400" />
                </button>
              </div>
            )}
            <div
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs bg-gray-950/80 backdrop-blur-md ${
                orchestratorOnline
                  ? "text-emerald-400 border-emerald-900/50"
                  : "text-red-400 border-red-900/50"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${orchestratorOnline ? "bg-emerald-400 animate-pulse" : "bg-red-500"}`} />
              {orchestratorOnline ? "Online" : "Offline"}
            </div>
          </div>
        </div>
      </header>

      {/* ── PEAK PROGRESS (bottom-center, visible when location is active) ── */}
      {activeLocation && !panelOpen && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-1000 bg-gray-950/90 backdrop-blur-md px-5 py-3 rounded-lg border border-gray-800/60 text-center min-w-70">
          <div className="text-xs text-gray-400 mb-2">
            Monitoring <span className="text-cyan-400 font-bold">{activeLocation.name}</span>
          </div>
          {/* Peak progress bar */}
          <div className="flex items-center gap-2 mb-1.5">
            <Zap className="w-3.5 h-3.5 text-yellow-500" />
            <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-linear-to-r from-yellow-500 to-red-500 rounded-full transition-all duration-700"
                style={{ width: `${Math.min((peaksDetected / peaksNeeded) * 100, 100)}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 tabular-nums">
              {Math.min(peaksDetected, peaksNeeded)}/{peaksNeeded}
            </span>
          </div>
          <p className="text-[10px] text-gray-500">
            {peaksDetected < peaksNeeded
              ? `Waiting for ${peaksNeeded - peaksDetected} more data peak${peaksNeeded - peaksDetected > 1 ? "s" : ""} to generate report…`
              : "Report ready!"}
          </p>
          {report?.ready && (
            <button
              onClick={() => setPanelOpen(true)}
              className="mt-2 px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded transition-colors"
            >
              View Report
            </button>
          )}
        </div>
      )}

      {/* ── SLIDE-OUT REPORT PANEL ──────────────────────── */}

      {/* ── SOS BUTTON (bottom-left, visible when location active) ── */}
      {activeLocation && !panelOpen && (
        <button
          onClick={() => setSosOpen(true)}
          className="absolute bottom-4 left-4 z-1000 pointer-events-auto flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-4 py-2.5 rounded-lg font-bold text-xs shadow-lg shadow-red-500/20 transition-all hover:scale-105"
        >
          <Megaphone className="w-4 h-4" />
          Citizen SOS
        </button>
      )}

      {/* ── SOS MODAL ── */}
      {sosOpen && activeLocation && (
        <CitizenSosModal
          lat={activeLocation.lat}
          lng={activeLocation.lng}
          locationName={activeLocation.name}
          onClose={() => setSosOpen(false)}
        />
      )}

      <div
        className={`absolute top-0 right-0 h-full z-1001 transition-transform duration-500 ease-in-out ${
          panelOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: "min(480px, 90vw)" }}
      >
        <div className="h-full bg-gray-950/95 backdrop-blur-xl border-l border-gray-800 flex flex-col overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-400 animate-pulse" />
              <div>
                <h2 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
                  Flood Response Report
                </h2>
                <p className="text-[10px] text-gray-500">{report?.location ?? activeLocation?.name}</p>
              </div>
            </div>
            <button
              onClick={() => setPanelOpen(false)}
              className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Panel body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {report?.ready ? (
              <>
                {/* Key metrics */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-900 rounded-lg px-3 py-2.5 border border-gray-800">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Precipitation</div>
                    <div className="text-lg font-bold text-blue-400 flex items-center gap-1">
                      <Droplets className="w-4 h-4" />
                      {report.precipitation_mm} <span className="text-xs text-gray-500">mm/hr</span>
                    </div>
                  </div>
                  <div className="bg-gray-900 rounded-lg px-3 py-2.5 border border-gray-800">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Data Peaks</div>
                    <div className="text-lg font-bold text-yellow-400 flex items-center gap-1">
                      <Zap className="w-4 h-4" />
                      {report.peaks_detected}
                    </div>
                  </div>
                </div>

                {/* Commander Report — the curated output */}
                <div className="bg-gray-900 rounded-lg border border-red-900/40 overflow-hidden">
                  <div className="px-4 py-2.5 bg-red-950/20 border-b border-red-900/30 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                      Final Execution Plan
                    </span>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                      {report.commander_report}
                    </p>
                  </div>
                </div>

                {/* Timestamp */}
                {report.timestamp && (
                  <div className="text-[10px] text-gray-600 text-right">
                    Generated {new Date(report.timestamp * 1000).toLocaleString()}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <Activity className="w-8 h-8 text-cyan-500 animate-spin mb-4" />
                <h3 className="text-gray-300 font-bold mb-2">Processing…</h3>
                <p className="text-gray-500 text-xs max-w-xs">
                  The AI pipeline is collecting data for{" "}
                  <span className="text-cyan-400">{activeLocation?.name}</span>.
                  A curated report will appear after {peaksNeeded} data peaks are detected.
                </p>
                {/* Mini progress */}
                <div className="mt-4 w-48 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-linear-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min((peaksDetected / peaksNeeded) * 100, 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-600 mt-1">
                  {peaksDetected}/{peaksNeeded} peaks
                </span>
              </div>
            )}
          </div>

          {/* Panel footer */}
          <div className="shrink-0 px-5 py-3 border-t border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <MapPin className="w-3 h-3" />
              {activeLocation
                ? `${activeLocation.lat.toFixed(4)}, ${activeLocation.lng.toFixed(4)}`
                : "—"}
            </div>
            <button
              onClick={handleDeactivate}
              className="px-3 py-1.5 bg-red-950/50 hover:bg-red-900/50 border border-red-900/50 text-red-400 rounded text-xs font-bold transition-colors"
            >
              Stop Monitoring
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}