<?php

declare(strict_types=1);

/*
 * The only way an analysis reaches the database. The Next console does not
 * write to MySQL at all any more — it forwards the request here with the key
 * from its local .secrets file, and this endpoint decides whether to accept it.
 *
 * The key itself is never stored. `secrets` holds only md5(key), and the name on
 * the matching row is what gets recorded as `published_by`, so a caller cannot
 * claim to be someone else by putting a name in the request.
 *
 * This is reachable from the public internet, so it answers as little as
 * possible on failure: no hints about which field was wrong on a bad key, and no
 * database detail.
 */

require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');

const MAX_TICKER_LENGTH = 15;
const MAX_FINALIZER_LENGTH = 32;
const MAX_MODEL_LENGTH = 64;
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
// Mirrors TICKER_PATTERN in app/src/lib/prompts.js.
const TICKER_PATTERN = '/^[A-Za-z0-9][A-Za-z0-9.\-:]{0,14}$/';

function fail(int $status, string $message): never
{
    http_response_code($status);
    echo json_encode(['error' => $message]), "\n";
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Allow: POST');
    fail(405, 'Use POST.');
}

$body = json_decode((string) file_get_contents('php://input'), true);

if (!is_array($body)) {
    fail(400, 'Expected a JSON body.');
}

$secret = trim((string) ($body['secret'] ?? ''));
$ticker = strtoupper(trim((string) ($body['ticker'] ?? '')));
$result = trim((string) ($body['result'] ?? ''));
$finalizer = trim((string) ($body['finalizer'] ?? ''));
$finalizerModel = trim((string) ($body['finalizerModel'] ?? ''));
$effortLevel = (string) ($body['effort'] ?? 'medium');

if ($secret === '') {
    fail(401, 'A publishing key is required.');
}

if ($ticker === '' || !preg_match(TICKER_PATTERN, $ticker) || strlen($ticker) > MAX_TICKER_LENGTH) {
    fail(400, 'That does not look like a ticker symbol.');
}

if ($result === '') {
    fail(400, 'There is no analysis to publish.');
}

if ($finalizer === '' || strlen($finalizer) > MAX_FINALIZER_LENGTH) {
    fail(400, 'The agent that wrote the analysis is required.');
}

if (!in_array($effortLevel, EFFORT_LEVELS, true)) {
    fail(400, 'Unknown effort level.');
}

try {
    $pdo = connect_pdo();

    // Look the key up by its hash. The plaintext never touches the database, and
    // the unique index makes this a single-row index lookup.
    $stmt = $pdo->prepare('SELECT id, name FROM secrets WHERE md5_hashed_secret_key = :hash LIMIT 1');
    $stmt->execute(['hash' => md5($secret)]);
    $publisher = $stmt->fetch();

    if ($publisher === false) {
        // Deliberately identical to a missing key: a caller probing this endpoint
        // learns nothing about which keys exist.
        fail(401, 'That publishing key was not recognised.');
    }

    $insert = $pdo->prepare(
        <<<'SQL'
INSERT INTO stock_analyses
    (ticker, effort_level, result, finalizer, finalizer_model, published_by, created_at)
VALUES
    (:ticker, :effort_level, :result, :finalizer, :finalizer_model, :published_by, NOW())
SQL
    );

    $insert->execute([
        'ticker' => $ticker,
        'effort_level' => $effortLevel,
        'result' => $result,
        'finalizer' => $finalizer,
        'finalizer_model' => $finalizerModel === '' ? null : substr($finalizerModel, 0, MAX_MODEL_LENGTH),
        'published_by' => $publisher['name'],
    ]);

    http_response_code(201);
    echo json_encode([
        'id' => (int) $pdo->lastInsertId(),
        'ticker' => $ticker,
        'published_by' => $publisher['name'],
    ]), "\n";
} catch (Throwable $e) {
    // The message can carry connection details, so it goes to the log, not the
    // response.
    error_log('publish.php failed: ' . $e->getMessage());
    fail(500, 'Could not save the analysis.');
}
