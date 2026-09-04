#!/bin/bash
set -e

export PORT=${PORT:-3001}

if [ ! -f /data/lab.db ]; then
  cp /app/prisma/dev.db /data/lab.db 2>/dev/null || true
fi

npm run server
