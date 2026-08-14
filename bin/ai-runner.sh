#!/usr/bin/env bash
#
# Host-side worker for public/ask.php.
#
# Runs on the macOS host, NOT in the php container: both CLIs are authenticated
# here (Claude Code keeps its credentials in the macOS Keychain, and codex is a
# darwin binary), so neither can be used from inside the Linux container. The
# project directory is bind-mounted into the container, so storage/ai-jobs/ is
# the handoff point.
#
# Usage:
#   ./bin/ai-runner.sh              # poll forever
#   ./bin/ai-runner.sh --once       # drain the queue, then exit
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
JOBS_DIR="${PROJECT_ROOT}/storage/ai-jobs"

# Per-agent wall-clock cap, so one stuck agent cannot wedge the queue.
AGENT_TIMEOUT="${AGENT_TIMEOUT:-300}"
POLL_SECONDS="${POLL_SECONDS:-1}"

ONCE=false
for arg in "$@"; do
  case "${arg}" in
    --once) ONCE=true ;;
    *)
      echo "Unknown option: ${arg}" >&2
      echo "Usage: ./bin/ai-runner.sh [--once]" >&2
      exit 1
      ;;
  esac
done

for required in claude codex; do
  if ! command -v "${required}" >/dev/null 2>&1; then
    echo "Required CLI not found on PATH: ${required}" >&2
    exit 1
  fi
done

# macOS ships no `timeout`; use gtimeout when present, otherwise run uncapped.
TIMEOUT_BIN=""
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_BIN="timeout"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_BIN="gtimeout"
else
  echo "Note: no timeout/gtimeout found, agents will run without a time cap." >&2
fi

mkdir -p "${JOBS_DIR}"

# Ask Claude. The question is piped in rather than passed as an argument, so no
# part of the user's text is ever interpreted by the shell.
run_claude() {
  job_dir="$1"
  printf 'running' > "${job_dir}/claude.status"

  if [[ -n "${TIMEOUT_BIN}" ]]; then
    ${TIMEOUT_BIN} "${AGENT_TIMEOUT}" claude -p \
      < "${job_dir}/question.txt" \
      > "${job_dir}/claude.out" \
      2> "${job_dir}/claude.err"
  else
    claude -p \
      < "${job_dir}/question.txt" \
      > "${job_dir}/claude.out" \
      2> "${job_dir}/claude.err"
  fi

  finish_agent "${job_dir}" claude "$?"
}

# Ask Codex. `-o` captures just the final message instead of the event stream,
# and read-only sandboxing keeps a web-submitted question from changing files.
run_codex() {
  job_dir="$1"
  printf 'running' > "${job_dir}/codex.status"

  if [[ -n "${TIMEOUT_BIN}" ]]; then
    ${TIMEOUT_BIN} "${AGENT_TIMEOUT}" codex exec \
      --sandbox read-only \
      --skip-git-repo-check \
      --color never \
      -o "${job_dir}/codex.out" \
      - \
      < "${job_dir}/question.txt" \
      > "${job_dir}/codex.log" \
      2> "${job_dir}/codex.err"
  else
    codex exec \
      --sandbox read-only \
      --skip-git-repo-check \
      --color never \
      -o "${job_dir}/codex.out" \
      - \
      < "${job_dir}/question.txt" \
      > "${job_dir}/codex.log" \
      2> "${job_dir}/codex.err"
  fi

  finish_agent "${job_dir}" codex "$?"
}

# Record an agent's outcome. On failure, surface stderr in the .out file so the
# web page shows why instead of an empty box.
finish_agent() {
  job_dir="$1"
  agent="$2"
  exit_code="$3"

  if [[ "${exit_code}" -ne 0 ]]; then
    {
      echo "${agent} exited with code ${exit_code}."
      if [[ -s "${job_dir}/${agent}.err" ]]; then
        echo
        tail -n 20 "${job_dir}/${agent}.err"
      fi
    } >> "${job_dir}/${agent}.out"
    printf 'error' > "${job_dir}/${agent}.status"
    echo "  ${agent}: failed (exit ${exit_code})"
    return
  fi

  printf 'done' > "${job_dir}/${agent}.status"
  echo "  ${agent}: done"
}

process_job() {
  job_dir="$1"
  echo "Job $(basename "${job_dir}"): asking claude and codex"

  # Both agents run concurrently; the job is finished when the slower one is.
  run_claude "${job_dir}" &
  claude_pid=$!
  run_codex "${job_dir}" &
  codex_pid=$!

  wait "${claude_pid}"
  wait "${codex_pid}"

  echo "Job $(basename "${job_dir}"): complete"
}

drain_queue() {
  for job_dir in "${JOBS_DIR}"/*/; do
    [[ -d "${job_dir}" ]] || continue
    job_dir="${job_dir%/}"

    [[ -f "${job_dir}/.ready" ]] || continue

    # mkdir is atomic, so it doubles as the claim: a second runner (or the next
    # poll of this one) cannot pick up a job that is already in flight.
    mkdir "${job_dir}/.claimed" 2>/dev/null || continue

    process_job "${job_dir}"
  done
}

if [[ "${ONCE}" == true ]]; then
  drain_queue
  exit 0
fi

echo "Watching ${JOBS_DIR} (Ctrl-C to stop)"
while true; do
  drain_queue
  sleep "${POLL_SECONDS}"
done
