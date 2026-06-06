#!/bin/sh
set -e
cd "$(dirname "$0")/../.."
pnpm install --frozen-lockfile
pnpm run typecheck:libs
pnpm --filter @workspace/frontend run build
BASE_PATH=/m15/ pnpm --filter @workspace/m15 run build
BASE_PATH=/portail/ pnpm --filter @workspace/portail run build
mkdir -p artifacts/frontend/dist/public/m15 artifacts/frontend/dist/public/portail
cp -r artifacts/m15/dist/public/. artifacts/frontend/dist/public/m15/
cp -r artifacts/portail/dist/public/. artifacts/frontend/dist/public/portail/
