#!/bin/bash
# The `offline` job's body. It runs in a network namespace with loopback alone, so the build must pass
# with no network, and `--local-only` fails on any request to another host.
set -euo pipefail
export NEXT_TELEMETRY_DISABLED=1

pnpm --filter conformance exec next build
pnpm --filter conformance exec next start -p 3400 &
server=$!
trap 'kill "$server"' EXIT

for _ in $(seq 1 60); do
  if curl --silent --fail http://localhost:3400/_health > /dev/null; then break; fi
  sleep 1
done

pnpm --filter conformance exec live-ish walk --local-only --origin=http://localhost:3400
