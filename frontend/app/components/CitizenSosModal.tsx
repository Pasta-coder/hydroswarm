"use client";

import { useState } from "react";
import { X, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";

interface CitizenSosModalProps {
  lat: number;
  lng: number;
  locationName: string;
  onClose: () => void;
}

export default function CitizenSosModal({
  lat,
  lng,
  locationName,
  onClose,
}: CitizenSosModalProps) {
  const [reportText, setReportText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!reportText.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, report: reportText.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server responded with ${res.status}`);
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Failed to submit report. Is the orchestrator online?");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-1100 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-950 border border-gray-800 rounded-xl w-[min(440px,90vw)] shadow-2xl shadow-black/50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 bg-red-950/20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-4.5 h-4.5 text-red-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-100 uppercase tracking-wider">
                Citizen SOS Report
              </h2>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Ground-truth flood intelligence
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Location info */}
          <div className="bg-gray-900 rounded-lg px-3.5 py-2.5 border border-gray-800">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
              Reporting Location
            </div>
            <div className="text-sm text-cyan-400 font-semibold mt-0.5 truncate">
              {locationName}
            </div>
            <div className="text-[10px] text-gray-600 font-mono mt-0.5">
              {lat.toFixed(4)}, {lng.toFixed(4)}
            </div>
          </div>

          {submitted ? (
            /* ── Success State ── */
            <div className="flex flex-col items-center py-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-3" />
              <h3 className="text-sm font-bold text-gray-200 mb-1">
                Report Received
              </h3>
              <p className="text-xs text-gray-500 max-w-xs">
                Your SOS report has been indexed into the AI knowledge base.
                The Infrastructure Agent will use it in future analyses.
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            /* ── Form ── */
            <>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider font-medium block mb-1.5">
                  Situation Report
                </label>
                <textarea
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  placeholder="e.g., Waist-high water at Okhla bypass, drains overflowing, traffic blocked on both sides..."
                  rows={4}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3.5 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-cyan-800 resize-none transition-colors font-mono leading-relaxed"
                  disabled={submitting}
                />
              </div>

              {error && (
                <div className="bg-red-950/40 border border-red-900/50 rounded-lg px-3.5 py-2.5 text-xs text-red-400">
                  {error}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting || !reportText.trim()}
                className="w-full py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/10"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    Submit SOS Report
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
