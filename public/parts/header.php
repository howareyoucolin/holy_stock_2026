<?php

declare(strict_types=1);

$pageTitle ??= 'HolyStocks';
$headCount ??= null;
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
        <?php if ($headCount !== null): ?>
            <span class="head-count">
                <?= (int) $headCount ?> <?= (int) $headCount === 1 ? 'analysis' : 'analyses' ?>
            </span>
        <?php endif; ?>
    </div>
</header>

<main class="wrap">
