// Proxy — GET health status from orchestrator
import { NextResponse } from "next/server";

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || "http://localhost:5050";

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR}/api/health`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { status: "offline", error: "Central orchestrator is not running. Start it with: python server.py" },
      { status: 503 }
    );
  }
}
