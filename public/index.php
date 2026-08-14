<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/data/support/db.php';

$pageTitle = 'holyStocks';

$dbStatus = null;
$dbError = null;

try {
    $pdo = connect_pdo();
    $dbStatus = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
} catch (Throwable $e) {
    $dbError = $e->getMessage();
}

require __DIR__ . '/parts/header.php';
?>

<?php if ($dbError === null): ?>
    <p class="ok">Connected to remote MySQL &mdash; server version <code><?= htmlspecialchars($dbStatus, ENT_QUOTES) ?></code>.</p>
<?php else: ?>
    <p class="fail">Database connection failed.</p>
    <pre><code><?= htmlspecialchars($dbError, ENT_QUOTES) ?></code></pre>
    <p>Check <code>.env</code>, then <code>docker compose up -d --force-recreate</code>.</p>
<?php endif; ?>

<p>Scaffold is up. Add pages under <code>public/</code> and schema changes under <code>public/migrates/</code>.</p>

<?php require __DIR__ . '/parts/footer.php'; ?>
