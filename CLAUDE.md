# holyStocks

## The database is always the remote MySQL server

There is no local database, and there must never be one. The only database lives
on the remote MySQL server, named by `PROD_DB_HOST` and `PROD_DB_NAME` in
`deploy/remote.env` (gitignored) and by `DB_DATABASE` in `.env`. Production and
local development share that same server.

Local development reaches it through an SSH tunnel, so `.env` points at port
`13307` on the loopback address (`DB_HOST=host.docker.internal`, which
`app/src/lib/db.js` rewrites to `127.0.0.1` for the host-side Next app). **That
address is not a local server** — it is the near end of

    -L 127.0.0.1:13307:<remote-mysql-host>:3306   via the shared host over SSH

opened by `bin/db-tunnel.sh`. Queries entering there come out at the remote
MySQL server.

### When the connection fails

`connect ECONNREFUSED 127.0.0.1:13307` means the tunnel is not running. Open it:

    npm run tunnel          # for the Next app on the host
    npm run tunnel:docker   # also binds 0.0.0.0 so the php container can use it

Do **not** resolve it by installing MySQL locally, pointing the app at
`localhost:3306`, starting a database container, or seeding a local schema. The
MySQL user is granted only from the hosting provider's own subnet, so connecting
to the remote server directly from a dev machine is rejected with "Access
denied" whatever the credentials. Routing through the shared host is what makes
the connection arrive from a permitted address, which is why the tunnel is the
only path in.

Also note that a down tunnel does not block work on the agent console: asking a
question never touches MySQL. Only the `/learnings` pages and the health check
do, which is why an unreachable database shows as a banner rather than an error.

## Before committing

This repository is public. Keep real hostnames, usernames, remote paths and
credentials out of tracked files — they belong in `.env` and
`deploy/remote.env`, both gitignored. Refer to them generically in code
comments and docs, or by the config variable that holds them.
