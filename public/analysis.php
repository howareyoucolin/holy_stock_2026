<?php

declare(strict_types=1);

// One published analysis, rendered from the shape the synthesis was written in.

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/parts/format.php';

$id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT);
$analysis = null;
$dbError = null;

if (is_int($id) && $id > 0) {
    try {
        $pdo = connect_pdo();

        $stmt = $pdo->prepare(
            <<<'SQL'
SELECT id, ticker, effort_level, risk_level, result, finalizer, finalizer_model,
       published_by, version, created_at
FROM stock_analyses
WHERE id = :id
LIMIT 1
SQL
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        $analysis = $row === false ? null : $row;
    } catch (Throwable $e) {
        error_log('analysis.php failed: ' . $e->getMessage());
        $dbError = 'That analysis could not be loaded just now.';
    }
}

if ($dbError === null && $analysis === null) {
    http_response_code(404);
}

$pageTitle = $analysis === null
    ? 'HolyStocks'
    : $analysis['ticker'] . ' — HolyStocks';

require __DIR__ . '/parts/header.php';
?>

<a class="back" href="/">&larr; All analyses</a>

<?php if ($dbError !== null): ?>
    <p class="banner"><?= htmlspecialchars($dbError, ENT_QUOTES) ?></p>
<?php elseif ($analysis === null): ?>
    <p class="empty">That analysis does not exist.</p>
<?php else: ?>
    <?php
    $result = (string) $analysis['result'];
    $call = analysis_call($result);
    ?>

    <div class="detail-head">
        <span class="ticker"><?= htmlspecialchars((string) $analysis['ticker'], ENT_QUOTES) ?></span>

        <?php if ($call !== null): ?>
            <span class="badge badge-<?= $call ?>"><?= $call ?></span>
        <?php endif; ?>

        <?php if ($analysis['risk_level'] === 'high'): ?>
            <span class="badge badge-risk">high risk</span>
        <?php endif; ?>

        <span class="badge"><?= htmlspecialchars((string) $analysis['effort_level'], ENT_QUOTES) ?> effort</span>
    </div>

    <p class="meta">
        <?= htmlspecialchars(date('j F Y, H:i', strtotime((string) $analysis['created_at'])), ENT_QUOTES) ?>
        &middot; written by <?= htmlspecialchars((string) $analysis['finalizer'], ENT_QUOTES) ?><?php
            if (($analysis['finalizer_model'] ?? '') !== '') {
                echo ' (' . htmlspecialchars((string) $analysis['finalizer_model'], ENT_QUOTES) . ')';
            }
        ?><?php
            if (($analysis['published_by'] ?? '') !== '') {
                echo ' &middot; published by ' . htmlspecialchars((string) $analysis['published_by'], ENT_QUOTES);
            }
        ?>
    </p>

    <?= render_analysis($result) ?>
<?php endif; ?>

<?php require __DIR__ . '/parts/footer.php'; ?>
