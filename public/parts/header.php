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
    .muted { opacity: .7; font-size: .9rem; }
    textarea { width: 100%; box-sizing: border-box; padding: .7rem; font: inherit;
               border: 1px solid rgba(128,128,128,.5); border-radius: 6px;
               background: transparent; color: inherit; resize: vertical; }
    button { margin-top: .75rem; padding: .55rem 1.1rem; font: inherit; font-weight: 600;
             border: 0; border-radius: 6px; background: #2563eb; color: #fff; cursor: pointer; }
    button:hover:not(:disabled) { background: #1d4ed8; }
    button:disabled, textarea:disabled { opacity: .5; cursor: not-allowed; }
    blockquote { margin: 0 0 1rem; padding: .6rem .9rem; border-left: 3px solid rgba(128,128,128,.5);
                 background: rgba(128,128,128,.08); }
    pre.answer { white-space: pre-wrap; word-wrap: break-word; padding: .9rem;
                 border: 1px solid rgba(128,128,128,.3); border-radius: 6px;
                 background: rgba(128,128,128,.08); font: inherit; }
    hr { border: 0; border-top: 1px solid rgba(128,128,128,.35); margin: 2rem 0; }
    article { padding: 1rem 0; border-bottom: 1px solid rgba(128,128,128,.25); }
    article h3 { margin: 0 0 .2rem; }
    article p { margin: .2rem 0; }
    .pager { display: flex; gap: 1rem; align-items: center; margin-top: 1.5rem; }
</style>
</head>
<body>
<header>
    <h1><a href="/" style="text-decoration:none"><?= htmlspecialchars($pageTitle, ENT_QUOTES) ?></a></h1>
</header>
