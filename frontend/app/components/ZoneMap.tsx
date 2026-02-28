"use client";

import { useEffect, useRef } from "react";

export interface ClickedLocation {
  lat: number;
  lng: number;
  name: string;
}

interface ZoneMapProps {
  /** Currently active location (shown as a marker + pulse ring) */
  activeLocation: ClickedLocation | null;
  /** Called when the user clicks anywhere on the map */
  onMapClick: (loc: ClickedLocation) => void;
}

export default function ZoneMap({ activeLocation, onMapClick }: ZoneMapProps) {
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  // ── Init map (once) ───────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    // Inject Leaflet CSS
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    import("leaflet").then((mod) => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      const Leaf = mod.default || mod;
      leafletRef.current = Leaf;

      const map = Leaf.map(containerRef.current!, {
        center: [20, 0],
        zoom: 3,
        zoomControl: false,
        attributionControl: false,
      });

      Leaf.control.zoom({ position: "bottomright" }).addTo(map);

      // Dark tile layer
      Leaf.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { maxZoom: 18 }
      ).addTo(map);

      // Click anywhere → notify parent IMMEDIATELY with coords,
      // then reverse-geocode in background and update name
      map.on("click", (e: any) => {
        const { lat, lng } = e.latlng;
        // Fire instantly with coordinate-based name so UI responds immediately
        const tempName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        onMapClickRef.current({ lat, lng, name: tempName });
        // Then resolve the real name in background
        reverseGeocode(lat, lng).then((realName) => {
          if (realName !== tempName) {
            onMapClickRef.current({ lat, lng, name: realName });
          }
        });
      });

      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // ── Show / update active marker ───────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const Leaf = leafletRef.current;
    if (!map || !Leaf) return;

    // Clear old marker + circle
    if (markerRef.current) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    if (circleRef.current) {
      map.removeLayer(circleRef.current);
      circleRef.current = null;
    }

    if (!activeLocation) return;

    const { lat, lng, name } = activeLocation;

    // Pulsing circle
    circleRef.current = Leaf.circle([lat, lng], {
      radius: 1200,
      color: "#06b6d4",
      fillColor: "#06b6d4",
      fillOpacity: 0.15,
      weight: 2,
      dashArray: "6, 6",
    }).addTo(map);

    // Center marker
    markerRef.current = Leaf.circleMarker([lat, lng], {
      radius: 9,
      color: "#111827",
      fillColor: "#06b6d4",
      fillOpacity: 0.95,
      weight: 2,
    }).addTo(map);

    markerRef.current.bindTooltip(
      `<div style="font-family:ui-monospace,monospace;font-size:11px;line-height:1.5;min-width:140px;">
        <strong style="font-size:12px;">${name}</strong><br/>
        <span style="opacity:0.55;font-size:10px;">${lat.toFixed(4)}, ${lng.toFixed(4)}</span><br/>
        <span style="color:#06b6d4;font-weight:600;">● Monitoring active</span>
      </div>`,
      { direction: "top", offset: [0, -10], className: "zone-tooltip", permanent: false }
    );

    // Fly to location
    map.flyTo([lat, lng], 13, { duration: 0.8 });
  }, [activeLocation]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

/**
 * Reverse-geocode lat/lng to a human-readable place name using the
 * free Nominatim API. Falls back to coordinate string on failure.
 */
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14`,
      { headers: { "User-Agent": "HydroSwarm/1.0" }, signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) throw new Error("nominatim error");
    const data = await res.json();
    // Pick the most useful name from the address breakdown
    const addr = data.address || {};
    const name =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.suburb ||
      addr.county ||
      addr.state ||
      data.display_name?.split(",").slice(0, 2).join(",") ||
      `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    return name;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}
