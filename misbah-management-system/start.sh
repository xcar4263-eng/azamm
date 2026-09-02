#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

PORT=${1:-8080}

echo "=================================================="
echo "  🚀 تشغيل نظام إدارة المسابيح الداخلي"
echo "  📍 الرابط: http://localhost:$PORT"
echo "=================================================="

python3 server.py $PORT
