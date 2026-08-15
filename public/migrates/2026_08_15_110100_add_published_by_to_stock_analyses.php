<?php

declare(strict_types=1);

// Stamps each published analysis with the person whose key authorised it — the
// `name` of the matching row in `secrets`, resolved server-side from the key
// rather than sent by the client, so it cannot be claimed.
//
// NOT NULL is safe here: publishing has always gone through the endpoint that
// sets it, and the table is empty of anything that predates this.

return [
    'name' => '2026_08_15_110100_add_published_by_to_stock_analyses',
    'up' => <<<'SQL'
ALTER TABLE stock_analyses
    ADD COLUMN published_by VARCHAR(100) NOT NULL AFTER finalizer_model
SQL,
];
