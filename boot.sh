#!/bin/bash

echo "🧹 Cleaning old stream queues..."
rm -f stream/*.json

# Activate the Python virtual environment
if [ -d "venv" ]; then
  echo "🐍 Activating Python venv..."
  source venv/bin/activate
elif [ -d ".venv" ]; then
  source .venv/bin/activate
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo "  HydroSwarm — Full Stack Boot"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  This starts FIVE processes:"
echo "    1. docker compose up     → Redpanda/Kafka   (:9092)"
echo "    2. python3 iot_stream.py → Pathway Kafka consumer"
echo "    3. python3 iot_firehose.py → IoT sensor producer"
echo "    4. python3 server.py     → Central orchestrator (:5050)"
echo "    5. npm run dev           → Next.js frontend    (:3000)"
echo ""
echo "  All 3 backend services (rag_memory, live_fetcher, ai_engine)"
echo "  auto-start when you click a zone on the map."
echo ""
echo "════════════════════════════════════════════════════════"
echo ""

# 1. Start Redpanda (Kafka)
echo "🐼 [1/5] Starting Redpanda (Kafka) on :9092..."
docker compose up -d 2>/dev/null || docker-compose up -d 2>/dev/null
sleep 3

# 2. Start the Pathway Kafka consumer (writes grid_status.jsonl)
echo "⚡ [2/5] Starting IoT Stream Processor..."
python3 iot_stream.py &
IOT_STREAM_PID=$!
sleep 2

# 3. Start the IoT firehose (produces sensor data to Kafka)
echo "🌊 [3/5] Starting IoT Firehose..."
python3 iot_firehose.py &
IOT_FIREHOSE_PID=$!
sleep 1

# 4. Start the central orchestrator
echo "🎛️  [4/5] Starting Central Orchestrator on :5050..."
python3 server.py &
SERVER_PID=$!
sleep 2

# 5. Start the Next.js frontend
echo "🌐 [5/5] Starting Next.js frontend on :3000..."
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

# Trap Ctrl+C to kill all processes
trap "echo ''; echo '🛑 Shutting down...'; kill $IOT_STREAM_PID $IOT_FIREHOSE_PID $SERVER_PID $FRONTEND_PID 2>/dev/null; docker compose down 2>/dev/null; wait; echo '✅ Done.'; exit 0" SIGINT SIGTERM

wait