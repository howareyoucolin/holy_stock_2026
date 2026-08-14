# holyStocks

A PHP 8 site in Docker, talking to a **remote** MySQL. Only the web tier is
containerized — there is no local `mysql` service.

## Stack

- **PHP 8.2 + Apache** (`php:8.2-apache`, document root `public/`)
- **Remote MySQL** over `pdo_mysql`, credentials from the environment
- **Docker Compose** (single `php` service, host port `8300`)

## Quick start

```bash
cp .env.example .env       # then fill in the remote MySQL host/user/password
docker compose up -d --build
open http://localhost:8300
```

The home page is a placeholder hello world. To check the remote MySQL
connection, open `/health.php` in the browser or run it from the CLI:

```bash
docker exec holy_stocks_php php /var/www/html/public/health.php
```

Create the schema (once `public/migrates/` has files):

```bash
docker exec holy_stocks_php php /var/www/html/public/migrate.php
```

## Configuration

Credentials resolve in this order:

1. `DB_DSN` — a full DSN, if your provider hands you one
2. `DB_HOST` / `DB_PORT` / `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` / `DB_CHARSET`
3. `public/config.php` — fallback for deploys with no env vars (shared hosting);
   copy from `public/config.php.sample`

Both `.env` and `public/config.php` are gitignored.

If MySQL runs on the Mac itself rather than a real remote host, set
`DB_HOST=host.docker.internal` — `docker-compose.yml` already maps it.

The remote server must allow connections from your egress IP and grant the user
a host pattern that matches (`'user'@'%'` or similar).

## Layout

```
Dockerfile             php:8.2-apache, pdo_mysql, doc root -> public/
docker-compose.yml     php service only, :8300
php.ini                upload / memory limits
.env.example           remote MySQL settings to copy into .env
data/support/db.php    connect_pdo() — shared PDO factory
public/index.php       home page (hello world placeholder)
public/health.php      plain-text connectivity check
public/migrate.php     migration runner
public/migrates/       one file per schema change
public/parts/          header / footer includes
```

The project directory is bind-mounted at `/var/www/html`, so edits are live —
no rebuild needed unless the `Dockerfile` or `php.ini` changes.

## Migrations

Each file in `public/migrates/` returns a name and its SQL. Name files
`YYYY_MM_DD_HHMMSS_description.php` so they sort chronologically.

```php
<?php

declare(strict_types=1);

return [
    'name' => '2026_08_14_120000_create_stocks',
    'up' => <<<'SQL'
CREATE TABLE stocks (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    symbol VARCHAR(16) NOT NULL,
    company VARCHAR(255) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_symbol (symbol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
];
```

Applied names are tracked in a `migrations` table, so re-running is safe.
