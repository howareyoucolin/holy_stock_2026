<?php

declare(strict_types=1);

// Publishing moved to the PHP site, which is a public endpoint — so it needs to
// know who is asking. A publisher holds a secret key in their local .secrets
// file; only the md5 of that key is stored here, and the matching row's `name`
// is what gets stamped onto the analysis as `published_by`.
//
// The hash column is UNIQUE: two publishers sharing a key would make
// `published_by` a coin flip, and it also gives the lookup an index.

return [
    'name' => '2026_08_15_110000_create_secrets',
    'up' => <<<'SQL'
CREATE TABLE secrets (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    md5_hashed_secret_key CHAR(32) NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_secret_key (md5_hashed_secret_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
];
