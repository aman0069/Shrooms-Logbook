#!/usr/bin/with-contenv bashio
set -e

export PORT="$(bashio::config 'port')"
export HA_URL="${HA_URL:-http://supervisor/core}"
export HA_TOKEN="${HA_TOKEN:-${SUPERVISOR_TOKEN:-}}"

npx prisma db push --skip-generate

npm run server:prod
