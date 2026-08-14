#!/usr/bin/env bash
#
# Stops the local agent console started by bin/dev.sh.
#
# Only touches the console's own port — the php site (8301) and the database
# tunnel (13307) are left alone, since those are managed separately.
#
set -uo pipefail

# This must match the port in app/package.json.
stopped=false

for port in 8300; do
  pids="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null)"

  if [[ -n "${pids}" ]]; then
    echo "Stopping port ${port} (pid $(echo "${pids}" | tr '\n' ' '))"
    echo "${pids}" | xargs kill 2>/dev/null
    stopped=true
  fi
done

# `next dev` spawns a child server process that would otherwise stay behind.
if pkill -f "next dev" 2>/dev/null; then
  stopped=true
fi

sleep 1

for port in 8300; do
  if lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port ${port} is still in use." >&2
    exit 1
  fi
done

if [[ "${stopped}" == true ]]; then
  echo "Console stopped."
else
  echo "Console was not running."
fi
