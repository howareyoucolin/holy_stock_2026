<?php

declare(strict_types=1);

// Applies every not-yet-applied file in public/migrates/, oldest filename first.
//   docker exec holy_stocks_php php /var/www/html/public/migrate.php

require_once dirname(__DIR__) . '/data/support/db.php';

header('Content-Type: text/plain; charset=utf-8');

try {
    $pdo = connect_pdo();
    ensure_migrations_table($pdo);

    $files = glob(__DIR__ . '/migrates/*.php') ?: [];
    sort($files);

    $applied = applied_migrations($pdo);
    $ran = [];

    foreach ($files as $file) {
        $migration = require $file;

        if (!is_array($migration) || !isset($migration['name'], $migration['up'])) {
            throw new RuntimeException("Invalid migration file: {$file}");
        }

        $name = (string) $migration['name'];
        if (isset($applied[$name])) {
            continue;
        }

        $pdo->exec((string) $migration['up']);

        $stmt = $pdo->prepare(
            'INSERT INTO migrations (migration_name, applied_at) VALUES (:migration_name, NOW())'
        );
        $stmt->execute(['migration_name' => $name]);

        $ran[] = $name;
    }

    if ($ran === []) {
        echo "No pending migrations.\n";
        exit;
    }

    echo "Applied migrations:\n";
    foreach ($ran as $name) {
        echo "- {$name}\n";
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo 'Migration failed: ' . $e->getMessage() . "\n";
}

function ensure_migrations_table(PDO $pdo): void
{
    $pdo->exec(
        <<<'SQL'
CREATE TABLE IF NOT EXISTS migrations (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    migration_name VARCHAR(255) NOT NULL,
    applied_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_migration_name (migration_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL
    );
}

function applied_migrations(PDO $pdo): array
{
    $names = $pdo->query('SELECT migration_name FROM migrations')->fetchAll(PDO::FETCH_COLUMN);

    return array_fill_keys($names, true);
}
