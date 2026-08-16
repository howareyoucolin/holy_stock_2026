<?php

declare(strict_types=1);

// Categories are their own rows rather than a comma-separated column on posts,
// so a category page can be a single indexed lookup and a rename touches one
// row. The slug is what appears in URLs and is unique; the name is what readers
// see, so it can be re-cased without breaking links.

return [
    'name' => '2026_08_16_090100_create_categories',
    'up' => <<<'SQL'
CREATE TABLE categories (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    slug VARCHAR(80) NOT NULL,
    name VARCHAR(80) NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_category_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
];
