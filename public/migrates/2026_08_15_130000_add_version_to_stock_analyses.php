<?php

declare(strict_types=1);

// A version stamp for the analysis itself. Defaults to 0, which is what every
// existing row gets and what every row will keep until something starts setting
// it — publish.php does not send this column yet.
//
// Placed before created_at so the timestamp stays last, as in the other tables.

return [
    'name' => '2026_08_15_130000_add_version_to_stock_analyses',
    'up' => <<<'SQL'
ALTER TABLE stock_analyses
    ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 0 AFTER published_by
SQL,
];
