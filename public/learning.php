<?php

declare(strict_types=1);

// The learning detail pages are gone with the `learnings` table. This file stays
// rather than being deleted so that old links — and the copy already sitting on
// the server, which a deploy overwrites but does not remove — land on the
// placeholder instead of erroring against a table that no longer exists.

require_once __DIR__ . '/bootstrap.php';

http_response_code(404);

$pageTitle = 'holyStocks';

require __DIR__ . '/parts/header.php';
?>

<h2>TO BE BUILT&hellip;</h2>

<p class="muted">
    This page has been retired. The public side of holyStocks is being rebuilt.
</p>

<p><a href="index.php">&larr; Home</a></p>

<?php require __DIR__ . '/parts/footer.php'; ?>
