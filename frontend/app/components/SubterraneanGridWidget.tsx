"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";

interface SensorReading {
  sensor_id: string;
  avg_water_level: number;
  time: number;
}

const MAX_CAPACITY = 60; // cm
const WARN_THRESHOLD = 45;
const CRIT_THRESHOLD = 52;
const HISTORY_LEN = 20; // sparkline points

interface SensorStatus {
  label: string;
  color: string;
  barColor: string;
}

function getStatus(level: number): SensorStatus {
  if (level >= CRIT_THRESHOLD) {
    return { label: "CRITICAL", color: "text-red-400", barColor: "from-red-500 to-red-400" };
  }
  if (level >= WARN_THRESHOLD) {
    return { label: "WARNING", color: "text-amber-400", barColor: "from-amber-500 to-amber-400" };
  }
  return { label: "NOMINAL", color: "text-emerald-400", barColor: "from-cyan-500 to-blue-500" };
}

/**
 * Convert a raw sensor_id like "mumbai_drain_2" into a display label.
 * Uses the locationName prop to produce pretty names:
 *   "mumbai_drain_1" + locationName="Mumbai" → "Mumbai Drain 1"
 * Falls back to title-casing the sensor_id if no locationName.
 */
function sensorLabel(sensorId: string, locationName?: string): string {
  // Extract the trailing number (e.g. "1", "2", "3")
  const numMatch = sensorId.match(/(\d+)$/);
  const num = numMatch ? numMatch[1] : "";

  // Determine a display prefix from the location name
  if (locationName) {
    // Take first word of location (e.g. "Mumbai, Maharashtra" → "Mumbai")
    const short = locationName.split(",")[0].split(/\s+/).slice(0, 2).join(" ").trim();
    if (short) {
      return `${short} Drain ${num}`.trim();
    }
  }

  // Fallback: title-case the sensor_id (replace _ with space)
  return sensorId
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Tiny SVG sparkline from an array of numbers. */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data) - 1;
  const max = Math.max(...data) + 1;
  const range = max - min || 1;
  const w = 80;
  const h = 20;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface SubterraneanGridWidgetProps {
  /** Only poll and display when a location is actively being monitored */
  isActive: boolean;
  /** The human-readable name of the monitored location (e.g. "Mumbai") */
  locationName?: string;
}

export default function SubterraneanGridWidget({ isActive, locationName }: SubterraneanGridWidgetProps) {
  const [sensors, setSensors] = useState<Record<string, SensorReading>>({});
  const [collapsed, setCollapsed] = useState(false);
  const [connected, setConnected] = useState(false);
  const historyRef = useRef<Record<string, number[]>>({});

  // Reset state when monitoring stops
  useEffect(() => {
    if (!isActive) {
      setSensors({});
      setConnected(false);
      historyRef.current = {};
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;

    let active = true;

    const fetchData = async () => {
      try {
        const res = await fetch("/grid_status.jsonl?t=" + Date.now(), {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("fetch failed");
        const text = await res.text();
        const lines = text.trim().split("\n").filter(Boolean);

        // Parse all lines, grab the LAST entry per sensor (most recent)
        const latest: Record<string, SensorReading> = {};
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line) as SensorReading & { diff?: number };
            if (parsed.diff !== undefined && parsed.diff !== 1) continue;
            if (parsed.sensor_id && typeof parsed.avg_water_level === "number") {
              latest[parsed.sensor_id] = parsed;
            }
          } catch {
            /* skip malformed line */
          }
        }

        if (active && Object.keys(latest).length > 0) {
          setSensors(latest);
          setConnected(true);

          // Update sparkline history
          for (const [id, reading] of Object.entries(latest)) {
            if (!historyRef.current[id]) historyRef.current[id] = [];
            const arr = historyRef.current[id];
            arr.push(reading.avg_water_level);
            if (arr.length > HISTORY_LEN) arr.splice(0, arr.length - HISTORY_LEN);
          }
        }
      } catch {
        if (active) setConnected(false);
      }
    };

    fetchData();
    const iv = setInterval(fetchData, 2000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [isActive]);

  // Dynamically discover sensor IDs from the data (sorted for stable order)
  const sensorIds = useMemo(() => Object.keys(sensors).sort(), [sensors]);
  const hasData = sensorIds.length > 0;

  // Determine overall grid status
  const overallMax = Math.max(
    ...sensorIds.map((id) => sensors[id]?.avg_water_level ?? 0),
    0
  );
  const overallStatus = getStatus(overallMax);

  return (
    <div className="absolute bottom-4 right-4 z-1000 pointer-events-auto w-72">
      <div className="bg-gray-950/90 backdrop-blur-xl rounded-lg border border-gray-800/60 overflow-hidden shadow-2xl shadow-black/40">
        {/* ── Header ── */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-gray-900/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${
                  connected ? "bg-emerald-400" : "bg-red-400"
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  connected ? "bg-emerald-400" : "bg-red-500"
                }`}
              />
            </span>
            <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">
              Drainage Grid
            </span>
            {hasData && !collapsed && (
              <span
                className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${overallStatus.color} bg-gray-800/80`}
              >
                {overallStatus.label}
              </span>
            )}
          </div>
          {collapsed ? (
            <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
          )}
        </button>

        {/* ── Body ── */}
        {!collapsed && (
          <div className="px-3.5 pb-3 space-y-2.5 border-t border-gray-800/40 pt-2.5">
            {!hasData ? (
              <div className="flex items-center justify-center gap-2 py-4 text-gray-600">
                <Activity className="w-4 h-4 animate-spin" />
                <span className="text-[10px] uppercase tracking-wider">
                  Waiting for IoT stream…
                </span>
              </div>
            ) : (
              sensorIds.map((id) => {
                const reading = sensors[id];
                if (!reading) return null;
                const level = reading.avg_water_level;
                const pct = Math.min((level / MAX_CAPACITY) * 100, 100);
                const status = getStatus(level);
                const history = historyRef.current[id] || [];
                const sparkColor =
                  level >= CRIT_THRESHOLD
                    ? "#f87171"
                    : level >= WARN_THRESHOLD
                    ? "#fbbf24"
                    : "#22d3ee";

                return (
                  <div key={id}>
                    {/* Sensor label row */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-gray-400 font-medium truncate">
                        {sensorLabel(id, locationName)}
                      </span>
                      <div className="flex items-center gap-2">
                        <Sparkline data={history} color={sparkColor} />
                        <span
                          className={`text-[10px] font-bold tabular-nums ${status.color}`}
                        >
                          {level.toFixed(1)}
                          <span className="text-gray-600 font-normal">cm</span>
                        </span>
                      </div>
                    </div>
                    {/* Gauge bar */}
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-linear-to-r ${status.barColor} transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}

            {/* Capacity legend */}
            {hasData && (
              <div className="flex items-center justify-between pt-1 border-t border-gray-800/40">
                <span className="text-[9px] text-gray-600">
                  0cm
                </span>
                <div className="flex items-center gap-2 text-[9px] text-gray-600">
                  <span className="flex items-center gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                    &lt;{WARN_THRESHOLD}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    {WARN_THRESHOLD}–{CRIT_THRESHOLD}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    &gt;{CRIT_THRESHOLD}
                  </span>
                </div>
                <span className="text-[9px] text-gray-600">
                  {MAX_CAPACITY}cm
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
