#!/bin/bash
set -e

export PORT=${PORT:-3001}

npx prisma db push --skip-generate

npm run server:prod
