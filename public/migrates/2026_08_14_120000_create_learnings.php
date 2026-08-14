<?php

declare(strict_types=1);

return [
    'name' => '2026_08_14_120000_create_learnings',
    'up' => <<<'SQL'
CREATE TABLE learnings (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    question TEXT NOT NULL,
    takeaway MEDIUMTEXT NOT NULL,
    claude_answer MEDIUMTEXT NULL,
    codex_answer MEDIUMTEXT NULL,
    is_published TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_published_created (is_published, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
];
