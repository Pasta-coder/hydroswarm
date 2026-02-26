// Proxy to central orchestrator — GET /api/services → list all services
import { NextResponse } from "next/server";

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || "http://localhost:5050";

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR}/api/services`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Orchestrator offline" }, { status: 503 });
  }
}

// POST /api/services?action=boot-all | shutdown-all | clean-stream
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (!action) {
    return NextResponse.json({ error: "Missing ?action= parameter" }, { status: 400 });
  }

  try {
    const res = await fetch(`${ORCHESTRATOR}/api/services/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Orchestrator offline" }, { status: 503 });
  }
}
