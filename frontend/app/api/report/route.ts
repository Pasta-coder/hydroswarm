// Proxy — GET curated report from orchestrator
import { NextResponse } from "next/server";

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || "http://localhost:5050";

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR}/api/report`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: "No report yet", ready: false }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Orchestrator offline", ready: false }, { status: 503 });
  }
}
