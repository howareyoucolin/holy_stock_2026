#!/usr/bin/env bash
#
# Runs the migration runner on the production host, over the same SSH connection
# deploy.sh uses.
#
# Deploy first. migrate.php is executed from the deployed copy of the site, and a
# migration that removes something the live code still reads would take the site
# down in the window between the two steps.
#
# Usage:
#   ./deploy/migrate-remote.sh            # apply every pending migration
#   ./deploy/migrate-remote.sh --check    # prove access and show the runner, apply nothing
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${DEPLOY_CONFIG:-${SCRIPT_DIR}/remote.env}"

if [[ ! -f "${CONFIG_FILE}" ]]; then
  echo "Missing deploy config: ${CONFIG_FILE}" >&2
  echo "Copy ${SCRIPT_DIR}/remote.env.example to ${SCRIPT_DIR}/remote.env first." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "${CONFIG_FILE}"

: "${REMOTE_HOST:?REMOTE_HOST is required}"
: "${REMOTE_USERNAME:?REMOTE_USERNAME is required}"
: "${REMOTE_PATH:?REMOTE_PATH is required}"

REMOTE_PORT="${REMOTE_PORT:-22}"
CHECK_ONLY=false

for arg in "$@"; do
  case "${arg}" in
    --check) CHECK_ONLY=true ;;
    *)
      echo "Unknown option: ${arg}" >&2
      echo "Usage: ./deploy/migrate-remote.sh [--check]" >&2
      exit 1
      ;;
  esac
done

if [[ -n "${REMOTE_PASSWORD:-}" ]] && ! command -v sshpass >/dev/null 2>&1; then
  echo "sshpass is required when REMOTE_PASSWORD is set." >&2
  exit 1
fi

# Same handling as deploy.sh: force password auth when one is configured, so a
# local key cannot trigger an interactive passphrase prompt and hang this. The
# password travels in SSHPASS rather than argv, where `ps` would expose it.
SSH_OPTS="-p ${REMOTE_PORT} -o StrictHostKeyChecking=accept-new"
SSH_BIN="ssh"
if [[ -n "${REMOTE_PASSWORD:-}" ]]; then
  SSH_OPTS="${SSH_OPTS} -o PreferredAuthentications=password -o PubkeyAuthentication=no"
  export SSHPASS="${REMOTE_PASSWORD}"
  SSH_BIN="sshpass -e ssh"
fi

remote_exec() {
  ${SSH_BIN} ${SSH_OPTS} "${REMOTE_USERNAME}@${REMOTE_HOST}" "$1"
}

if [[ "${CHECK_ONLY}" == true ]]; then
  echo "Checking access to ${REMOTE_USERNAME}@${REMOTE_HOST}:${REMOTE_PATH}"
  remote_exec "cd '${REMOTE_PATH}' && php -v | head -1 && ls -1 migrate.php migrates/ 2>&1"
  echo "Access OK. Nothing was applied."
  exit 0
fi

echo "Running migrations on ${REMOTE_HOST}:${REMOTE_PATH}"

# migrate.php reads the config.php that deploy.sh generates, so it reaches the
# same database from inside the granted subnet — no tunnel involved.
remote_exec "cd '${REMOTE_PATH}' && php migrate.php"
