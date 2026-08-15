---
name: deploy-live
description: Release the `holyStocks` PHP site to production — sync the site, then apply any pending database migrations on the server. Use when the user asks to deploy or release to live, push the site, or ship a schema change.
---

# Deploy to Live

A release is two steps in a fixed order: **sync the site, then migrate.** Both use
`deploy/remote.env`, which is gitignored.

```bash
./deploy/deploy.sh --dry-run          # 1. preview
./deploy/deploy.sh                    # 2. sync public/ and data/, write remote config.php
./deploy/migrate-remote.sh --check    # 3. prove SSH access, apply nothing
./deploy/migrate-remote.sh            # 4. apply pending migrations on the server
```

## Why the order is not negotiable

- **Migrations only exist on the server after a deploy.** `public/migrates/` is
  synced by step 2. Running the migration step against a server that has not
  received the new file reports "No pending migrations" and silently does
  nothing — which is easy to mistake for success.
- **A migration that removes something the live code still reads takes the site
  down** for the window between the two steps. Deploy the code that stopped using
  the column or table *first*, then drop it.

## Before deploying

1. Confirm with the user before running the real deploy or the real migration.
   Both change production. A dry run needs no confirmation.
2. Read `git status`. Deploying a dirty tree ships whatever is in the working
   directory, not what is committed — say so if it is dirty.
3. List what is pending in `public/migrates/` and say plainly whether any of it
   is destructive (`DROP`, `TRUNCATE`, a narrowing `ALTER`). Never apply a
   destructive migration without the user agreeing to that specific migration by
   name.

## After deploying

1. Fetch the site and confirm it renders rather than assuming rsync's exit code
   speaks for the page.
2. Report the migration runner's own output verbatim — it prints either
   `No pending migrations.` or the list it applied.
3. If either step fails, say which one and stop. Do not run the migration after a
   failed sync, and never describe a release as complete when a step errored.

## What deploy.sh actually does

- Syncs the **contents** of `public/` into the site root, so `index.php` is the
  front controller.
- Separately syncs `data/` to `<site root>/data/`, because `connect_pdo()` lives
  outside `public/`.
- Excludes `config.php` from the sync and writes it on the server from the
  `PROD_DB_*` values, so local and production credentials never mix.
- `--delete` mirrors local deletions, and applies only to the `public/` sync. Use
  it only when the user asks for remote cleanup.

## What migrate-remote.sh actually does

Runs `php migrate.php` on the server over the same SSH connection deploy.sh uses.
The runner applies every not-yet-applied file in `migrates/`, oldest filename
first, and records each in the `migrations` table so it cannot run twice.
Production reads the generated `config.php`, so this needs no SSH tunnel — the
tunnel is only for local development.

## Guardrails

- Never print credentials, hostnames or remote paths into repository files. The
  repository is public; real values belong only in `deploy/remote.env`.
- There is one database. A migration applied from a developer machine through the
  tunnel and one applied on the server hit the same server — never run both
  expecting two separate effects.
- No migration has a down step. Dropping is permanent; offer to dump affected
  rows first when the user is discarding data.
- Report failures with the failing step's output rather than a summary.
