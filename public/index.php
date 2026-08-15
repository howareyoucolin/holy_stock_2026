<?php

declare(strict_types=1);

// Placeholder front page while the public site is rebuilt around stock
// analyses. It touches no database at all, which is what lets the old
// `learnings` table be dropped without taking the live site down.

require_once __DIR__ . '/bootstrap.php';

$pageTitle = 'holyStocks';

require __DIR__ . '/parts/header.php';
?>

<h2>TO BE BUILT&hellip;</h2>

<p class="muted">
    Nothing to see here yet. The public side of holyStocks is being rebuilt.
</p>

<?php require __DIR__ . '/parts/footer.php'; ?>
