---
name: dreamhost-deploy
description: Deploy the `holyStocks` PHP app to DreamHost. Use when the user asks to deploy, publish, sync, or preview a production release of the PHP site with the project's `deploy/deploy.sh` workflow.
---

# DreamHost Deploy

Use this skill when the task is to deploy the PHP site from `holyStocks/` to the
DreamHost server configured for this project.

## What this skill is for

- Running the project's DreamHost deploy script
- Previewing a release with `--dry-run`
- Syncing code changes to the remote server
- Updating the remote `config.php` from the deploy env file

## Files involved

- `deploy/deploy.sh`
- `deploy/dreamhost.env`
- `deploy/dreamhost.env.example`
- `deploy/README.md`

## Required setup

1. Make sure `deploy/dreamhost.env` exists.
2. Keep all deploy secrets in that one file.
3. Confirm it includes both DreamHost SSH settings and production database
   settings before running a real deploy.

The env file should provide:

- `DREAMHOST_HOST`
- `DREAMHOST_USERNAME`
- `DREAMHOST_PASSWORD` if password auth is being used
- `DREAMHOST_REMOTE_PATH`
- `DREAMHOST_PORT` optionally
- `PROD_DB_HOST`
- `PROD_DB_NAME`
- `PROD_DB_USER`
- `PROD_DB_PASSWORD`
- `PROD_DB_PORT` optionally
- `PROD_DB_CHARSET` optionally

## Safe workflow

1. From `holyStocks/`, review the target config in `deploy/dreamhost.env` —
   especially `DREAMHOST_REMOTE_PATH`, since the DreamHost account also hosts
   other sites and a wrong path would overwrite one of them.
2. Run a preview first:

```bash
./deploy/deploy.sh --dry-run
```

3. If the preview looks correct, run the real deploy:

```bash
./deploy/deploy.sh
```

4. If the user explicitly wants remote cleanup for removed files, use:

```bash
./deploy/deploy.sh --delete
```

You can combine both flags during preview:

```bash
./deploy/deploy.sh --dry-run --delete
```

## Important behavior

- The script syncs the *contents* of `public/` into the remote site root, so
  `index.php` is the front controller.
- It separately syncs `data/` to `<site root>/data/` because `connect_pdo()`
  lives outside `public/`. `--delete` is not forwarded to that second sync.
- The script excludes `config.php` and `config.php.sample` from rsync and
  generates `config.php` remotely from `deploy/dreamhost.env`.
- Local Docker reads DB settings from `.env`; production reads the generated
  `config.php`. The two never overwrite each other.
- If `DREAMHOST_PASSWORD` is set, `sshpass` must be available locally.

## Guardrails

- Prefer `--dry-run` before any real production deploy.
- Never commit `deploy/dreamhost.env`.
- Never print secrets into repo files or logs unless the user explicitly asks.
- Do not use `--delete` unless the user wants removed local files mirrored on
  the server.
- If deployment fails, report the failing step clearly instead of claiming the
  release succeeded.
