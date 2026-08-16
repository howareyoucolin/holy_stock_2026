<?php

declare(strict_types=1);

// Which categories a post is in. Many-to-many, because a piece about a valuation
// method is reasonably both "Method" and "Valuations".
//
// The composite primary key makes a duplicate link impossible, so re-posting the
// same piece can simply re-insert its links without checking first. Cascading
// deletes mean removing a post or a category never leaves orphaned rows.

return [
    'name' => '2026_08_16_090200_create_post_categories',
    'up' => <<<'SQL'
CREATE TABLE post_categories (
    post_id INT UNSIGNED NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (post_id, category_id),
    KEY idx_category (category_id),
    CONSTRAINT fk_pc_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
    CONSTRAINT fk_pc_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
];
