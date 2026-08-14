# Agent Console (local only)

A Next.js app for asking Claude and Codex a question side by side, and for
browsing the learnings already in the remote MySQL. **Never deployed** —
`deploy/deploy.sh` only syncs `public/` and `data/`, so nothing here reaches the
public server.

## Why this is a Node app and not part of the PHP site

Both CLIs are installed and authenticated on the macOS host: Claude Code keeps
its credentials in the macOS Keychain, and `codex` is a darwin binary. Neither
can run inside the Linux php container. This app runs natively on the host, so it
spawns both directly.

## Start

From the **project root** (not this directory):

```bash
npm run tunnel   # remote MySQL is only reachable through the SSH tunnel
npm run dev      # http://localhost:8300
```

That wrapper installs dependencies on first run and selects a Node 20+ release
itself, so no `nvm use` is needed. To work in this directory directly, run
`nvm use` first — `.nvmrc` pins Node 22, and the shell default (Node 16) is too
old for Next.

The PHP site does **not** need to be running: `/learnings` reads the same rows
the public site serves.

## Which agents get asked

The roster lives in `.agents` at the **project root** (gitignored, alongside
`.env`). Each line is an agent id plus optional `key=value` options; file order
sets display order and `#` comments a line out:

```
claude
codex
cursor model=gemini-3.7-flash-{effort} tiers=low,medium,high
```

| | |
|---|---|
| Supported ids | `claude`, `codex`, `cursor` |
| Supported keys | `model`, `tiers` |

Unknown ids and bad options are reported in the UI rather than silently ignored,
and a `model` value is pattern-checked before it reaches argv. The file is read on
every request, so edits take effect without restarting. A missing file means "use
every supported agent".

Copy `.agents.example` to get started.

### Effort, per agent

The three CLIs express reasoning effort differently, which is why the adapter —
not the roster file — owns the command shape:

| Agent | Command | Effort |
|---|---|---|
| `claude` | `claude -p --effort <level>` | direct flag |
| `codex` | `codex exec -c model_reasoning_effort=<level>` | config override; no `max`, so it folds onto `xhigh` |
| `cursor` | `cursor-agent -p --mode ask --model …` | **no flag** — the tier is part of the model name |

Cursor is still driven by the same selector, through a model template: write
`{effort}` in the model and the chosen level is substituted, so `Low` runs
`gemini-3.7-flash-low` and `High` runs `gemini-3.7-flash-high`.

`tiers=` lists the levels that family actually offers. Gemini Flash has no
`xhigh`, so `tiers=low,medium,high` clamps `Extra high` and `Max` down to `high`
rather than building a model name that does not exist. Without `tiers=` the level
is substituted verbatim. `cursor-agent models` lists what is available.

Each answer reports the model it actually used, shown next to the agent name — with
a template that changes per request. Any agent whose CLI has no effort flag *and*
no `{effort}` template is called out in the UI as ignoring the selector.

Cursor runs in `--mode ask`, its read-only Q&A mode; plain `--print` would have
write and shell tools available.

Adding another CLI means one entry in `ADAPTERS` in `src/lib/agents.js`, a glyph
in `AgentIcon.jsx`, and its allowed option keys.

## Layout

```
src/app/page.jsx              ask screen
src/app/learnings/            list and detail, reading the database directly
src/app/api/ask/route.js      runs both CLIs concurrently
src/app/api/learnings/route.js  list + insert
src/app/api/health/route.js   database reachability + whether each CLI was found
src/components/               AskConsole, AgentAnswer, PendingAnswer, AgentIcon, SidebarHead
src/lib/agents.js             spawns the claude / codex CLIs
src/lib/db.js                 mysql2 pool, credentials from the project-root .env
```

There is no publish UI: `POST /api/learnings` still works, but nothing in the
interface calls it, so rows are only created by hitting that endpoint directly.

The `/learnings` pages are server components that call `src/lib/db.js` directly —
no API round trip. The route handlers exist for the browser-driven action the
client component needs: asking.

## Notes

- Pages and handlers are `force-dynamic`: this is a local tool looking at
  production data, so a cached view would be misleading.
- The question is passed to each CLI on **stdin**, never as a shell argument, and
  `spawn` runs without a shell — so nothing typed in the UI is interpreted as a
  command.
- Codex runs with `--sandbox read-only`, so a question cannot modify files.
- Each agent is capped at 300s (`AGENT_TIMEOUT_MS`).
- `resolveBin()` searches PATH, then `~/.local/bin`, then every nvm version's bin
  directory. This matters because `codex` lives under one Node version's bin
  while this app runs on another. Override with `CLAUDE_BIN`, `CODEX_BIN`, or
  `CURSOR_AGENT_BIN` (non-alphanumerics in a binary name become underscores).
- The mysql2 pool is cached on `globalThis` so dev-mode hot reloading reuses one
  pool instead of opening a new one per edit.
- `AGENTS.md` and `CLAUDE.md` here are generated by `next dev` (a Next 16
  feature), not hand-written.
