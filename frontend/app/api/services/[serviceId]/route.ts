// Proxy to central orchestrator — POST /api/services/:serviceId?action=start|stop
import { NextResponse } from "next/server";

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || "http://localhost:5050";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  const { serviceId } = await params;
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "start";

  try {
    const res = await fetch(`${ORCHESTRATOR}/api/services/${serviceId}/${action}`, {
      method: "POST",
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Orchestrator offline" }, { status: 503 });
  }
}
