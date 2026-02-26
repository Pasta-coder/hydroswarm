// Proxy — POST activate/deactivate zone
import { NextResponse } from "next/server";

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || "http://localhost:5050";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // If body has a "deactivate" flag, call the deactivate endpoint
    if (body.deactivate) {
      const res = await fetch(`${ORCHESTRATOR}/api/zones/deactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      return NextResponse.json(data);
    }

    const res = await fetch(`${ORCHESTRATOR}/api/zones/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Orchestrator offline" }, { status: 503 });
  }
}
