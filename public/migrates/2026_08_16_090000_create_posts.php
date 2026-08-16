<?php

declare(strict_types=1);

// Blog posts. There is no admin UI: posts arrive through publish-post.php from
// an agent holding a publishing key, the same key mechanism the analyses use.
//
// `body` is markdown, rendered on the way out by public/parts/markdown.php —
// storing the source rather than HTML keeps what the agent wrote auditable, and
// keeps the rendering rules in one place where they can be tightened later.
//
// The slug is unique so a re-post of the same piece updates it in place instead
// of quietly creating a second copy.

return [
    'name' => '2026_08_16_090000_create_posts',
    'up' => <<<'SQL'
CREATE TABLE posts (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    slug VARCHAR(160) NOT NULL,
    title VARCHAR(200) NOT NULL,
    summary VARCHAR(400) NOT NULL DEFAULT '',
    body MEDIUMTEXT NOT NULL,
    published_by VARCHAR(100) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_slug (slug),
    KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
];
