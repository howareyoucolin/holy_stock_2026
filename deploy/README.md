# DreamHost Deploy

1. Copy `dreamhost.env.example` to `dreamhost.env`.
2. Fill in your DreamHost SSH hostname, username, password, remote path, and production database values.
3. Run:

```bash
./deploy/deploy.sh
```

Optional:

```bash
./deploy/deploy.sh --delete
```

`--delete` removes remote files that no longer exist locally for the files included in the sync.

Preview a deploy without changing the server:

```bash
./deploy/deploy.sh --dry-run
```

You can combine flags:

```bash
./deploy/deploy.sh --dry-run --delete
```

## What gets deployed

| Local | Remote |
|---|---|
| `public/` **contents** | site root, so `index.php` is the front controller |
| `data/` | `<site root>/data/`, for `connect_pdo()` |

`public/config.php` is excluded from the sync and written on the server from the
values in `dreamhost.env`, so local and production credentials stay separate.

`data/` has to live inside the site root because `public/` contents become the
web root. `data/.htaccess` denies direct HTTP access to it, and
`public/bootstrap.php` finds `db.php` in either that layout or the local Docker
one.

`--delete` applies only to the `public/` sync, not the `data/` one — mirroring
deletions from the narrower second sync would remove unrelated remote files.

## After a deploy

Create or update the production schema by running the migration runner on the
server (it reads the generated `config.php`):

```bash
ssh <user>@<host> 'cd <remote_path> && php migrate.php'
```
