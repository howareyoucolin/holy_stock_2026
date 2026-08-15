#!/usr/bin/env bash
#
# Registers this machine's publishing key against a name, so publish.php will
# accept it and stamp analyses with that name.
#
# Reads the key from .secrets, hashes it, and stores only the hash. The key
# itself is never printed, never passed as a command argument (where `ps` would
# expose it), and never leaves this machine.
#
# Usage:
#   ./bin/add-secret.sh "Colin Zhao"      # add or update
#   ./bin/add-secret.sh --list            # who can publish
#
# Needs the tunnel open (npm run tunnel) and the php container running.
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SECRETS_FILE="${PROJECT_ROOT}/.secrets"
CONTAINER="${PHP_CONTAINER:-holy_stocks_php}"

run_php() {
  docker exec -i "${CONTAINER}" php -r "$1"
}

if [[ "${1:-}" == "--list" ]]; then
  run_php '
    require "/var/www/html/public/bootstrap.php";
    foreach (connect_pdo()->query("SELECT id, name, created_at FROM secrets ORDER BY id") as $r) {
        printf("  #%d  %-24s added %s\n", $r["id"], $r["name"], $r["created_at"]);
    }'
  exit $?
fi

NAME="${1:-}"

if [[ -z "${NAME}" ]]; then
  echo "Usage: ./bin/add-secret.sh \"Your Name\"" >&2
  echo "       ./bin/add-secret.sh --list" >&2
  exit 1
fi

if [[ ! -f "${SECRETS_FILE}" ]]; then
  echo "Missing ${SECRETS_FILE}" >&2
  echo "Copy .secrets.sample to .secrets and set publish_secret first." >&2
  exit 1
fi

# Accept `publish_secret=value` or a bare single line, matching the reader in
# app/src/lib/secrets.js.
SECRET="$(sed -e 's/#.*$//' "${SECRETS_FILE}" \
  | grep -iE '^[[:space:]]*publish_secret[[:space:]]*=' \
  | head -1 | cut -d= -f2- | tr -d '[:space:]')"

if [[ -z "${SECRET}" ]]; then
  SECRET="$(sed -e 's/#.*$//' "${SECRETS_FILE}" | grep -vE '^[[:space:]]*$' | head -1 | tr -d '[:space:]')"
fi

if [[ -z "${SECRET}" ]]; then
  echo "No publish_secret found in ${SECRETS_FILE}." >&2
  exit 1
fi

if [[ "${#SECRET}" -lt 24 ]]; then
  echo "Warning: that key is ${#SECRET} characters. publish.php is reachable from" >&2
  echo "         the public internet and the stored hash is md5, so a short key is" >&2
  echo "         guessable. 'openssl rand -hex 32' generates a strong one." >&2
fi

# The key goes in on stdin, not in argv or the environment of a logged command.
printf '%s' "${SECRET}" | docker exec -i "${CONTAINER}" php -r '
    require "/var/www/html/public/bootstrap.php";
    $secret = stream_get_contents(STDIN);
    $name = $argv[1] ?? "";
    if ($secret === "" || $name === "") { fwrite(STDERR, "missing key or name\n"); exit(1); }

    $pdo = connect_pdo();
    $hash = md5($secret);

    // One row per person: re-running with a new key rotates it in place.
    $stmt = $pdo->prepare("SELECT id FROM secrets WHERE name = :name LIMIT 1");
    $stmt->execute(["name" => $name]);
    $existing = $stmt->fetch();

    if ($existing) {
        $pdo->prepare("UPDATE secrets SET md5_hashed_secret_key = :hash WHERE id = :id")
            ->execute(["hash" => $hash, "id" => $existing["id"]]);
        printf("Rotated the key for %s (#%d).\n", $name, $existing["id"]);
    } else {
        $pdo->prepare("INSERT INTO secrets (name, md5_hashed_secret_key, created_at) VALUES (:name, :hash, NOW())")
            ->execute(["name" => $name, "hash" => $hash]);
        printf("%s can now publish (#%d).\n", $name, (int) $pdo->lastInsertId());
    }
' -- "${NAME}"
