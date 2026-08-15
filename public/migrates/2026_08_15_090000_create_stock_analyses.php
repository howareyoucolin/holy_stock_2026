<?php

declare(strict_types=1);

// One row per valuation run, appended and never rewritten — which is why there is
// no updated_at. Re-running a ticker adds a row, so the history of a call stays
// readable in order.
//
// `result` is the round 3 synthesis only. The individual answers and the
// cross-review are deliberately not kept.

return [
    'name' => '2026_08_15_090000_create_stock_analyses',
    'up' => <<<'SQL'
CREATE TABLE stock_analyses (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ticker VARCHAR(15) NOT NULL,
    effort_level ENUM('low','medium','high','xhigh','max') NOT NULL,
    result MEDIUMTEXT NOT NULL,
    finalizer VARCHAR(32) NOT NULL,
    finalizer_model VARCHAR(64) NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_ticker_created (ticker, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
];
