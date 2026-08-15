<?php

declare(strict_types=1);

// Records the risk allowance the analysis was produced under, beside the effort
// it was produced at — the same run at `high` argues a different case, so a row
// without it cannot be read back honestly.
//
// DEFAULT 'default' is what backfills the rows that predate the setting, and it
// is the truthful value for them: they were run before any risk clause existed,
// which is exactly what `default` means.

return [
    'name' => '2026_08_15_120000_add_risk_level_to_stock_analyses',
    'up' => <<<'SQL'
ALTER TABLE stock_analyses
    ADD COLUMN risk_level ENUM('default','high') NOT NULL DEFAULT 'default' AFTER effort_level
SQL,
];
