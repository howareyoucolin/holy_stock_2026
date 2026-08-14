<?php

declare(strict_types=1);

// Public, read-only detail page for one published learning.

require_once __DIR__ . '/bootstrap.php';

$pageTitle = 'holyStocks';

$id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT);
$learning = null;
$dbError = null;

if (is_int($id) && $id > 0) {
    try {
        $pdo = connect_pdo();

        $stmt = $pdo->prepare(
            <<<'SQL'
SELECT id, title, question, takeaway, claude_answer, codex_answer, created_at
FROM learnings
WHERE id = :id AND is_published = 1
LIMIT 1
SQL
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        $learning = $row === false ? null : $row;
    } catch (Throwable $e) {
        $dbError = $e->getMessage();
    }
}

if ($dbError === null && $learning === null) {
    http_response_code(404);
}

require __DIR__ . '/parts/header.php';
?>

<p><a href="index.php">&larr; All learnings</a></p>

<?php if ($dbError !== null): ?>
    <p class="fail">Could not load this learning.</p>
    <pre class="answer"><?= htmlspecialchars($dbError, ENT_QUOTES) ?></pre>
<?php elseif ($learning === null): ?>
    <h2>Not found</h2>
    <p class="muted">That learning does not exist, or is not published.</p>
<?php else: ?>
    <h2><?= htmlspecialchars((string) $learning['title'], ENT_QUOTES) ?></h2>
    <p class="muted"><?= htmlspecialchars((string) $learning['created_at'], ENT_QUOTES) ?></p>

    <h3>Question</h3>
    <blockquote><?= nl2br(htmlspecialchars((string) $learning['question'], ENT_QUOTES)) ?></blockquote>

    <h3>What we learned</h3>
    <div><?= nl2br(htmlspecialchars((string) $learning['takeaway'], ENT_QUOTES)) ?></div>

    <?php foreach (['claude_answer' => 'Claude', 'codex_answer' => 'Codex'] as $column => $label): ?>
        <?php $answer = (string) ($learning[$column] ?? ''); ?>
        <?php if (trim($answer) !== ''): ?>
            <h3><?= htmlspecialchars($label, ENT_QUOTES) ?> said</h3>
            <pre class="answer"><?= htmlspecialchars($answer, ENT_QUOTES) ?></pre>
        <?php endif; ?>
    <?php endforeach; ?>
<?php endif; ?>

<?php require __DIR__ . '/parts/footer.php'; ?>
