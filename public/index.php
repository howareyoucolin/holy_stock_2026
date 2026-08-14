<?php

declare(strict_types=1);

// Public, read-only listing of published learnings. This site never writes to
// the database — the local React app in app/ is what creates rows.

require_once __DIR__ . '/bootstrap.php';

$pageTitle = 'holyStocks';
$perPage = 10;

$page = filter_input(INPUT_GET, 'page', FILTER_VALIDATE_INT);
$page = is_int($page) && $page > 0 ? $page : 1;

$learnings = [];
$totalPages = 1;
$dbError = null;

try {
    $pdo = connect_pdo();

    $total = (int) $pdo->query('SELECT COUNT(*) FROM learnings WHERE is_published = 1')->fetchColumn();
    $totalPages = max(1, (int) ceil($total / $perPage));
    $page = min($page, $totalPages);
    $offset = ($page - 1) * $perPage;

    $stmt = $pdo->prepare(
        <<<'SQL'
SELECT id, title, question, takeaway, created_at
FROM learnings
WHERE is_published = 1
ORDER BY created_at DESC, id DESC
LIMIT :limit OFFSET :offset
SQL
    );
    $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    $learnings = $stmt->fetchAll();
} catch (Throwable $e) {
    $dbError = $e->getMessage();
}

// Trim a body of text to a short preview on a word boundary.
function excerpt(string $text, int $limit = 220): string
{
    $text = trim(preg_replace('/\s+/', ' ', $text) ?? '');

    if (mb_strlen($text) <= $limit) {
        return $text;
    }

    $cut = mb_substr($text, 0, $limit);
    $lastSpace = mb_strrpos($cut, ' ');

    return ($lastSpace !== false ? mb_substr($cut, 0, $lastSpace) : $cut) . '…';
}

require __DIR__ . '/parts/header.php';
?>

<p>
    Notes from putting questions to AI coding agents &mdash; the question asked,
    what came back, and the takeaway worth keeping.
</p>

<?php if ($dbError !== null): ?>
    <p class="fail">Could not load learnings.</p>
    <pre class="answer"><?= htmlspecialchars($dbError, ENT_QUOTES) ?></pre>
<?php elseif ($learnings === []): ?>
    <p class="muted">Nothing published yet.</p>
<?php else: ?>
    <?php foreach ($learnings as $learning): ?>
        <article>
            <h3>
                <a href="learning.php?id=<?= (int) $learning['id'] ?>">
                    <?= htmlspecialchars((string) $learning['title'], ENT_QUOTES) ?>
                </a>
            </h3>
            <p class="muted"><?= htmlspecialchars((string) $learning['created_at'], ENT_QUOTES) ?></p>
            <p><?= htmlspecialchars(excerpt((string) $learning['takeaway']), ENT_QUOTES) ?></p>
        </article>
    <?php endforeach; ?>

    <?php if ($totalPages > 1): ?>
        <nav class="pager">
            <?php if ($page > 1): ?>
                <a href="index.php?page=<?= $page - 1 ?>">&larr; Newer</a>
            <?php endif; ?>
            <span class="muted">Page <?= $page ?> of <?= $totalPages ?></span>
            <?php if ($page < $totalPages): ?>
                <a href="index.php?page=<?= $page + 1 ?>">Older &rarr;</a>
            <?php endif; ?>
        </nav>
    <?php endif; ?>
<?php endif; ?>

<?php require __DIR__ . '/parts/footer.php'; ?>
