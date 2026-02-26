#!/bin/bash

echo "🧹 Cleaning old stream queues..."
rm -f stream/*.json

echo ""
echo "════════════════════════════════════════════════════════"
echo "  HydroSwarm — Central Orchestrator Mode"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  This starts TWO processes:"
echo "    1. python server.py      → Central orchestrator (:5050)"
echo "    2. npm run dev            → Next.js frontend    (:3000)"
echo ""
echo "  All 3 backend services (rag_memory, live_fetcher, ai_engine)"
echo "  auto-start when you click a zone on the map."
echo ""
echo "════════════════════════════════════════════════════════"
echo ""

# Start the central orchestrator
echo "🎛️  [1/2] Starting Central Orchestrator on :5050..."
python3 server.py &
SERVER_PID=$!
sleep 2

# Start the Next.js frontend
echo "🌐 [2/2] Starting Next.js frontend on :3000..."
cd frontend && npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ HydroSwarm ready!"
echo "   Dashboard:    http://localhost:3000"
echo "   Orchestrator: http://localhost:5050/docs"
echo ""
echo "   Press Ctrl+C to shut down everything."
echo ""

# Trap Ctrl+C to kill both processes
trap "echo ''; echo '🛑 Shutting down...'; kill $SERVER_PID $FRONTEND_PID 2>/dev/null; wait; echo '✅ Done.'; exit 0" SIGINT SIGTERM

wait