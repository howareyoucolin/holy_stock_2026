<?php

declare(strict_types=1);

$pageTitle = 'holyStocks';

require __DIR__ . '/parts/header.php';
?>

<h2>Hello, world!</h2>

<p>
    The PHP container is serving <code>public/</code>. Database wiring lives in
    <code>data/support/db.php</code> &mdash; check the remote MySQL connection with
    <a href="/health.php"><code>/health.php</code></a>.
</p>

<ul>
    <li><a href="/ask.php">Ask AI Agents</a> &mdash; put a question to Claude and Codex, side by side</li>
</ul>

<?php require __DIR__ . '/parts/footer.php'; ?>
