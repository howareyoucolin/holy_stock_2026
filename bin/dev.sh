#!/usr/bin/env bash
#
# Starts the local agent console (app/) from the project root.
#
# The wrapper exists because the shell's default Node is older than Next needs.
# Rather than making `npm run dev` fail until someone remembers `nvm use`, this
# picks a suitable Node from the versions already installed, honouring app/.nvmrc
# when that version is present.
#
# Usage:
#   ./bin/dev.sh                  # start the Next dev server
#   ./bin/dev.sh --install-only   # just install app/ dependencies, then exit
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="${PROJECT_ROOT}/app"
NVM_NODE_DIR="${NVM_DIR:-${HOME}/.nvm}/versions/node"

# Next 15 needs Node 20+.
MIN_MAJOR=20
INSTALL_ONLY=false

for arg in "$@"; do
  case "${arg}" in
    --install-only) INSTALL_ONLY=true ;;
    *)
      echo "Unknown option: ${arg}" >&2
      echo "Usage: ./bin/dev.sh [--install-only]" >&2
      exit 1
      ;;
  esac
done

major_of() {
  version="${1#v}"
  echo "${version%%.*}"
}

# Prefer the version named in app/.nvmrc; otherwise take the newest installed
# release that is new enough.
pick_node_dir() {
  wanted=""
  if [[ -f "${APP_DIR}/.nvmrc" ]]; then
    wanted="$(tr -d '[:space:]' < "${APP_DIR}/.nvmrc")"
  fi

  [[ -d "${NVM_NODE_DIR}" ]] || return 1

  # sort -V puts these ascending, so the last match is the newest.
  installed="$(ls "${NVM_NODE_DIR}" 2>/dev/null | sed 's/^v//' | sort -V)"
  best=""

  if [[ -n "${wanted}" ]]; then
    wanted_major="$(major_of "${wanted}")"
    for version in ${installed}; do
      if [[ "$(major_of "${version}")" == "${wanted_major}" ]]; then
        best="${version}"
      fi
    done
  fi

  if [[ -z "${best}" ]]; then
    for version in ${installed}; do
      if [[ "$(major_of "${version}")" -ge "${MIN_MAJOR}" ]]; then
        best="${version}"
      fi
    done
  fi

  [[ -n "${best}" ]] || return 1
  echo "${NVM_NODE_DIR}/v${best}/bin"
}

# Use the current Node when it is already new enough, so a shell that has
# already run `nvm use` is left alone.
current_major=0
if command -v node >/dev/null 2>&1; then
  current_major="$(major_of "$(node --version)")"
fi

if [[ "${current_major}" -lt "${MIN_MAJOR}" ]]; then
  if node_bin_dir="$(pick_node_dir)"; then
    PATH="${node_bin_dir}:${PATH}"
    export PATH
  else
    echo "Node ${MIN_MAJOR}+ is required (found $(node --version 2>/dev/null || echo none))." >&2
    echo "Install it with: nvm install $(tr -d '[:space:]' < "${APP_DIR}/.nvmrc" 2>/dev/null || echo 22)" >&2
    exit 1
  fi
fi

echo "Using node $(node --version) ($(command -v node))"

# Fail early and readably when a previous instance is still holding a port.
# Without this, Next prints a raw stack trace and the actual problem
# (something is already running) is easy to miss.
# This must match the port in app/package.json.
check_ports() {
  busy=""
  for port in 8300; do
    if lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
      busy="${busy} ${port}"
    fi
  done

  [[ -z "${busy}" ]] && return 0

  echo "Already in use:${busy}" >&2
  echo >&2
  for port in ${busy}; do
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null | tail -n +2 | while read -r cmd pid _; do
      echo "  port ${port}: ${cmd} (pid ${pid})" >&2
    done
  done
  echo >&2
  echo "The console is probably already running. Stop it with:" >&2
  echo "  npm run dev:stop" >&2

  return 1
}

if ! check_ports; then
  exit 1
fi

if [[ ! -d "${APP_DIR}/node_modules" ]]; then
  echo "Installing app/ dependencies (first run)…"
  (cd "${APP_DIR}" && npm install) || exit 1
fi

if [[ "${INSTALL_ONLY}" == true ]]; then
  echo "Dependencies ready."
  exit 0
fi

# The console reads and writes the remote MySQL, which is only reachable through
# the tunnel. Warn rather than fail: the UI also surfaces this, and the agents
# still work without a database.
if ! pgrep -f "13307:mysql" >/dev/null 2>&1; then
  echo
  echo "Warning: no database tunnel detected on port 13307."
  echo "         Publishing will fail until you run: npm run tunnel"
  echo
fi

cd "${APP_DIR}" || exit 1
exec npm run dev
