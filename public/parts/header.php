<?php

declare(strict_types=1);

$pageTitle = $pageTitle ?? 'holyStocks';
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= htmlspecialchars($pageTitle, ENT_QUOTES) ?></title>
<style>
    :root { color-scheme: light dark; }
    body { font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           margin: 0; padding: 2rem; max-width: 900px; }
    header { border-bottom: 1px solid rgba(128,128,128,.35); margin-bottom: 1.5rem; }
    h1 { font-size: 1.4rem; margin: 0 0 1rem; }
    a { color: inherit; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid rgba(128,128,128,.25); }
    .ok { color: #158a4a; }
    .fail { color: #c02626; }
</style>
</head>
<body>
<header>
    <h1><a href="/" style="text-decoration:none"><?= htmlspecialchars($pageTitle, ENT_QUOTES) ?></a></h1>
</header>
