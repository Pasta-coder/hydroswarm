// Proxy — POST citizen SOS report to the orchestrator
import { NextResponse } from "next/server";

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || "http://localhost:5050";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch(`${ORCHESTRATOR}/api/sos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Orchestrator offline" },
      { status: 503 }
    );
  }
}
