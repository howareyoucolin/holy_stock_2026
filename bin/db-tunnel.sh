#!/usr/bin/env bash
#
# Opens an SSH tunnel to the remote MySQL through the DreamHost server.
#
# Why this is needed: the `369usabc` MySQL user is granted only from DreamHost's
# own subnet (173.236.128.0/255.255.128.0), so a direct connection from this Mac
# is rejected with "Access denied" no matter what credentials are used. Forwarding
# through DreamHost makes the connection arrive from inside that subnet, which is
# what the grant expects. Production is unaffected — it talks to
# mysql.369usa.com directly and never uses this tunnel.
#
# Usage:
#   ./bin/db-tunnel.sh              # bind 127.0.0.1 only (enough for app/)
#   ./bin/db-tunnel.sh --docker     # bind 0.0.0.0 so the php container can use it
#   ./bin/db-tunnel.sh --stop       # close any tunnel this script opened
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_FILE="${DEPLOY_CONFIG:-${PROJECT_ROOT}/deploy/dreamhost.env}"

LOCAL_PORT="${DB_TUNNEL_PORT:-13307}"
BIND_ADDR="127.0.0.1"
STOP=false

for arg in "$@"; do
  case "${arg}" in
    # The php container reaches the host as host.docker.internal, which does not
    # resolve to 127.0.0.1 from inside the container, so the listener has to
    # accept connections on all interfaces for Docker to use it.
    --docker) BIND_ADDR="0.0.0.0" ;;
    --stop) STOP=true ;;
    *)
      echo "Unknown option: ${arg}" >&2
      echo "Usage: ./bin/db-tunnel.sh [--docker] [--stop]" >&2
      exit 1
      ;;
  esac
done

if [[ "${STOP}" == true ]]; then
  if pkill -f "${LOCAL_PORT}:mysql" 2>/dev/null; then
    echo "Tunnel on port ${LOCAL_PORT} closed."
  else
    echo "No tunnel found on port ${LOCAL_PORT}."
  fi
  exit 0
fi

if [[ ! -f "${CONFIG_FILE}" ]]; then
  echo "Missing deploy config: ${CONFIG_FILE}" >&2
  echo "Copy deploy/dreamhost.env.example to deploy/dreamhost.env first." >&2
  exit 1
fi

# Reuse the deploy credentials rather than keeping a second copy of them.
# shellcheck disable=SC1090
source "${CONFIG_FILE}"

: "${DREAMHOST_HOST:?DREAMHOST_HOST is required}"
: "${DREAMHOST_USERNAME:?DREAMHOST_USERNAME is required}"
: "${PROD_DB_HOST:?PROD_DB_HOST is required}"

REMOTE_DB_PORT="${PROD_DB_PORT:-3306}"
SSH_PORT="${DREAMHOST_PORT:-22}"

if pgrep -f "${LOCAL_PORT}:mysql" >/dev/null 2>&1; then
  echo "Tunnel already running on port ${LOCAL_PORT}."
  exit 0
fi

if [[ -n "${DREAMHOST_PASSWORD:-}" ]] && ! command -v sshpass >/dev/null 2>&1; then
  echo "sshpass is required when DREAMHOST_PASSWORD is set." >&2
  exit 1
fi

SSH_OPTS="-p ${SSH_PORT} -o StrictHostKeyChecking=accept-new -o ExitOnForwardFailure=yes -o ServerAliveInterval=30"
SSH_BIN="ssh"
if [[ -n "${DREAMHOST_PASSWORD:-}" ]]; then
  SSH_OPTS="${SSH_OPTS} -o PreferredAuthentications=password -o PubkeyAuthentication=no"
  export SSHPASS="${DREAMHOST_PASSWORD}"
  SSH_BIN="sshpass -e ssh"
fi

echo "Opening tunnel ${BIND_ADDR}:${LOCAL_PORT} -> ${PROD_DB_HOST}:${REMOTE_DB_PORT} via ${DREAMHOST_HOST}"

# -f backgrounds after auth, -N means no remote command (forwarding only).
${SSH_BIN} ${SSH_OPTS} -f -N \
  -L "${BIND_ADDR}:${LOCAL_PORT}:${PROD_DB_HOST}:${REMOTE_DB_PORT}" \
  "${DREAMHOST_USERNAME}@${DREAMHOST_HOST}"

sleep 2

if pgrep -f "${LOCAL_PORT}:mysql" >/dev/null 2>&1; then
  echo "Tunnel is up. Local dev can now reach the remote MySQL on port ${LOCAL_PORT}."
  if [[ "${BIND_ADDR}" == "0.0.0.0" ]]; then
    echo "Note: bound to all interfaces, so other machines on your LAN can reach"
    echo "      port ${LOCAL_PORT} while it is open. Close it with --stop when done."
  fi
else
  echo "Tunnel failed to start." >&2
  exit 1
fi
