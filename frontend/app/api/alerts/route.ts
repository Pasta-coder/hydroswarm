// Proxy — GET latest alert, GET alert history
import { NextResponse } from "next/server";

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || "http://localhost:5050";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "latest";

  const endpoint = type === "history" ? "history" : "latest";

  try {
    const res = await fetch(`${ORCHESTRATOR}/api/alerts/${endpoint}`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    // Fallback: read directly from public file
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const filePath = path.join(process.cwd(), "public", "latest_alert.json");
      const content = await fs.readFile(filePath, "utf-8");
      return NextResponse.json(JSON.parse(content));
    } catch {
      return NextResponse.json({ error: "No alerts available" }, { status: 404 });
    }
  }
}
