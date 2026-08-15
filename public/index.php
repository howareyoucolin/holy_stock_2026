<?php

declare(strict_types=1);

// Public, read-only listing of published stock analyses, newest first. This site
// never writes to the database — publish.php is the only thing that inserts, and
// only for a caller holding a publishing key.

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/parts/format.php';

const PER_PAGE = 20;

$page = filter_input(INPUT_GET, 'page', FILTER_VALIDATE_INT);
$page = is_int($page) && $page > 0 ? $page : 1;

$analyses = [];
$total = 0;
$totalPages = 1;
$dbError = null;

try {
    $pdo = connect_pdo();

    $total = (int) $pdo->query('SELECT COUNT(*) FROM stock_analyses')->fetchColumn();
    $totalPages = max(1, (int) ceil($total / PER_PAGE));
    // Clamp rather than 404: ?page=99 on a two-page site should show page two.
    $page = min($page, $totalPages);
    $offset = ($page - 1) * PER_PAGE;

    $stmt = $pdo->prepare(
        <<<'SQL'
SELECT id, ticker, effort_level, risk_level, result, finalizer, published_by, created_at
FROM stock_analyses
ORDER BY created_at DESC, id DESC
LIMIT :limit OFFSET :offset
SQL
    );
    $stmt->bindValue(':limit', PER_PAGE, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    $analyses = $stmt->fetchAll();
} catch (Throwable $e) {
    error_log('index.php failed: ' . $e->getMessage());
    $dbError = 'The analyses could not be loaded just now.';
}

$pageTitle = 'HolyStocks';
$headCount = $dbError === null ? $total : null;

require __DIR__ . '/parts/header.php';
?>

<p class="lede">
    Several AI agents research a stock independently, review each other's work, and one
    writes the verdict below. Newest first.
</p>

<?php if ($dbError !== null): ?>
    <p class="banner"><?= htmlspecialchars($dbError, ENT_QUOTES) ?></p>
<?php elseif ($analyses === []): ?>
    <p class="empty">Nothing published yet.</p>
<?php else: ?>
    <div class="stack">
        <?php foreach ($analyses as $row): ?>
            <?php
            $result = (string) $row['result'];
            $call = analysis_call($result);
            ?>
            <a class="card" href="/analysis.php?id=<?= (int) $row['id'] ?>">
                <div class="card-head">
                    <span class="ticker"><?= htmlspecialchars((string) $row['ticker'], ENT_QUOTES) ?></span>

                    <?php if ($call !== null): ?>
                        <span class="badge badge-<?= $call ?>"><?= $call ?></span>
                    <?php endif; ?>

                    <?php if ($row['risk_level'] === 'high'): ?>
                        <span class="badge badge-risk">high risk</span>
                    <?php endif; ?>

                    <span class="badge"><?= htmlspecialchars((string) $row['effort_level'], ENT_QUOTES) ?> effort</span>

                    <span class="card-date">
                        <?= htmlspecialchars(date('j M Y', strtotime((string) $row['created_at'])), ENT_QUOTES) ?>
                    </span>
                </div>

                <p class="excerpt"><?= htmlspecialchars(analysis_excerpt($result), ENT_QUOTES) ?></p>
            </a>
        <?php endforeach; ?>
    </div>

    <?php if ($totalPages > 1): ?>
        <nav class="pager">
            <?php if ($page > 1): ?>
                <a href="/?page=<?= $page - 1 ?>" rel="prev">&larr; Newer</a>
            <?php endif; ?>
            <?php if ($page < $totalPages): ?>
                <a href="/?page=<?= $page + 1 ?>" rel="next">Older &rarr;</a>
            <?php endif; ?>
            <span class="page-of">Page <?= $page ?> of <?= $totalPages ?></span>
        </nav>
    <?php endif; ?>
<?php endif; ?>

<?php require __DIR__ . '/parts/footer.php'; ?>
