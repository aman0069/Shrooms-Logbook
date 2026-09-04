#!/usr/bin/with-contenv bashio
set -e

export PORT="$(bashio::config 'port')"

npx prisma db push --skip-generate

npm run server:prod
