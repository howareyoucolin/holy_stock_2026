<?php

declare(strict_types=1);

$pageTitle ??= 'HolyStocks';
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title><?= htmlspecialchars($pageTitle, ENT_QUOTES) ?></title>
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<header class="site-head">
    <div class="wrap">
        <a class="brand" href="/">
            <strong>HolyStocks</strong>
            <span>Stock analyses</span>
        </a>
        <nav class="site-nav">
            <?php
            $here = basename((string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH));
            $onBlog = in_array($here, ['blog.php', 'post.php'], true);
            ?>
            <a href="/"<?= $onBlog ? '' : ' aria-current="page"' ?>>Analyses</a>
            <a href="/blog.php"<?= $onBlog ? ' aria-current="page"' : '' ?>>Blog</a>
        </nav>
    </div>
</header>

<main class="wrap">
