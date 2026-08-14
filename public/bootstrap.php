<?php

declare(strict_types=1);

// Locates data/support/db.php across the two layouts this app runs in:
//
//   local Docker  /var/www/html/{public,data}       -> data/ is a sibling of public/
//   DreamHost     ~/site.com/{index.php,data}       -> public/ contents ARE the web
//                                                      root, so data/ sits beside them
//
// Every page requires this file instead of reaching for db.php directly, so the
// path difference is handled in exactly one place.

$dbCandidates = [
    dirname(__DIR__) . '/data/support/db.php',
    __DIR__ . '/data/support/db.php',
];

foreach ($dbCandidates as $dbCandidate) {
    if (is_file($dbCandidate)) {
        require_once $dbCandidate;

        return;
    }
}

throw new RuntimeException(
    'Could not locate data/support/db.php. Looked in: ' . implode(', ', $dbCandidates)
);
