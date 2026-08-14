<?php

declare(strict_types=1);

// Plain-text connectivity check, handy from the CLI:
//   docker exec holy_stocks_php php /var/www/html/public/health.php

require_once __DIR__ . '/bootstrap.php';

header('Content-Type: text/plain; charset=utf-8');

try {
    $pdo = connect_pdo();
    $version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
    $database = (string) $pdo->query('SELECT DATABASE()')->fetchColumn();

    echo "OK\n";
    echo "server:   {$version}\n";
    echo "database: {$database}\n";
} catch (Throwable $e) {
    http_response_code(500);
    echo "FAIL\n";
    echo $e->getMessage() . "\n";
}
