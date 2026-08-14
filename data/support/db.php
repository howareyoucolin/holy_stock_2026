<?php

declare(strict_types=1);

// Shared PDO factory. Environment variables win (that is how the Docker container
// is configured); public/config.php is the fallback for plain shared hosting where
// there is no way to set env vars. Guarded so several scripts can require it in the
// same process without redeclaring.
if (!function_exists('connect_pdo')) {
    function connect_pdo(): PDO
    {
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];

        $dsn = getenv('DB_DSN');
        if ($dsn !== false && $dsn !== '') {
            $username = getenv('DB_USERNAME') ?: null;
            $password = getenv('DB_PASSWORD') ?: null;

            return new PDO($dsn, $username, $password, $options);
        }

        $host = getenv('DB_HOST') ?: '';
        $port = getenv('DB_PORT') ?: '3306';
        $database = getenv('DB_DATABASE') ?: '';
        $username = getenv('DB_USERNAME') ?: '';
        $password = getenv('DB_PASSWORD') ?: '';
        $charset = getenv('DB_CHARSET') ?: 'utf8mb4';

        if ($host === '' || $database === '' || $username === '') {
            [$host, $port, $database, $username, $password, $charset] = db_config_from_file();
        }

        if ($host === '' || $database === '' || $username === '') {
            throw new RuntimeException(
                'Database config is incomplete. Copy .env.example to .env (Docker) '
                . 'or public/config.php.sample to public/config.php (shared hosting).'
            );
        }

        $mysqlDsn = "mysql:host={$host};port={$port};dbname={$database};charset={$charset}";

        return new PDO($mysqlDsn, $username, $password, $options);
    }

    // Read the same six settings out of public/config.php. Returns empty strings when
    // the file is absent so the caller can raise one clear error.
    function db_config_from_file(): array
    {
        $configFile = dirname(__DIR__, 2) . '/public/config.php';

        if (!is_file($configFile)) {
            return ['', '3306', '', '', '', 'utf8mb4'];
        }

        $config = require $configFile;
        if (!is_array($config)) {
            throw new RuntimeException('config.php must return an array.');
        }

        $db = is_array($config['db'] ?? null) ? $config['db'] : [];

        return [
            (string) ($db['host'] ?? ''),
            (string) ($db['port'] ?? '3306'),
            (string) ($db['database'] ?? ''),
            (string) ($db['username'] ?? ''),
            (string) ($db['password'] ?? ''),
            (string) ($db['charset'] ?? 'utf8mb4'),
        ];
    }
}
