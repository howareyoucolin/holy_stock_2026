<?php

declare(strict_types=1);

// Retires the `learnings` table. The console's publish form was removed long
// before this, so nothing had written to it in a while, and stock_analyses is
// now what the app saves.
//
// DESTRUCTIVE, and there is no down migration: applying this deletes the rows
// permanently. Deploy first — the public site only stopped reading this table in
// the same change that turned its front page into a placeholder, so a server
// still running the old index.php would start erroring the moment this runs.

return [
    'name' => '2026_08_15_100000_drop_learnings',
    'up' => <<<'SQL'
DROP TABLE IF EXISTS learnings
SQL,
];
