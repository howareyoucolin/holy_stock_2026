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

## Question types

Chosen above the input, and remembered between sessions.

| Type | Input | What the agents are asked |
|---|---|---|
| **General** | free text | your question, verbatim |
| **Stock valuation** | a ticker | a fixed brief: verdict, fair value, targets, risks, catalysts |

The valuation brief stamps **today's date** into the prompt and requires every
number to come from a web lookup with its own as-of date — without that, agents
answer from training data and quietly present a stale price as current. That is
not hypothetical: in testing, one agent produced a $225 price for a stock trading
at $305, and the cross-review caught and discarded it.

Prompts live in `src/lib/prompts.js`, separate from the CLI plumbing in
`agents.js`.

## How a question is answered

Three rounds, so the answer you keep has been challenged before you see it:

1. **Answer** — every agent in the roster answers independently, concurrently.
2. **Cross-review** — every agent gets the question and *all* the answers
   (including its own) and critiques them: factual errors, omissions, which is
   strongest. Agents may change their mind, and are told not to agree just to
   agree — a real split is more useful than false consensus. Valuation reviews
   end with a `REVISED VERDICT:` line.
3. **Synthesis** — one agent writes the definitive answer from the candidates
   plus the reviews, correcting whatever the reviews caught.

The synthesis is written to be scanned, not read straight through: a TL;DR in one
or two sentences, then short key points, then caveats only where the agents
genuinely disagreed. `FinalAnswer.jsx` parses that shape and renders it as a lead
paragraph plus lists; if a model ignores the format, its raw text is shown
verbatim rather than mangled.

The rounds are separate endpoints (`/api/ask`, `/api/review`, `/api/final`) driven
from the client, so each round appears as soon as it finishes instead of the whole
chain landing at once. The server stays stateless between rounds: the client
passes the previous round back in.

`/api/ask` and `/api/review` answer in NDJSON — one JSON object per line, an
`agent` event as each CLI settles and a closing `result` line carrying what the
endpoint would otherwise have returned whole (see `src/lib/stream.js`). That is
what lets a single agent appear the moment it lands rather than at the end of its
round. Validation failures still answer in one plain body with a real status code,
and `/api/final` is a single agent, so it stayed plain JSON.

## While a question is running

A full run is minutes long, so the sidebar swaps the form for a run log
(`RunLog.jsx`): a clock counting from submission, the round in progress, and a
line per agent as it lands — with how long it took, and whether it needed its
retry. Answers fill into the results column one at a time to match.

**Stop** ends the run: the browser aborts the fetch, which fires `request.signal`
in the route handler, which kills the CLIs.

The log stays up after the run ends, stopped or finished — it is the account of
what just happened, and nothing should shove it aside on its own. **Ask another
question** dismisses it, which is the only thing that brings the form back, with
the previous question still in it and the cursor already there. The results column
is untouched until the next question replaces it.

Children are spawned `detached` so each leads its own process group, and are
killed by group — a CLI that shelled out would otherwise leave the actual work
running unparented. That also means they no longer die with a Ctrl-C aimed at the
server's own group, so `agents.js` kills whatever is still running on `SIGINT`,
`SIGTERM` and `exit`, and suppresses the retry while shutting down.

Round 2 and 3 are skipped when fewer than two agents produced an answer — there is
nothing to cross-review — and the UI says so.

Mark the synthesising agent with `final=true` in `.agents`; otherwise the first
available agent in the file does it.

## Which agents get asked

The roster lives in `.agents` at the **project root** (gitignored, alongside
`.env`). Each line is an agent id plus optional `key=value` options; file order
sets display order and `#` comments a line out:

```
claude final=true web=true
codex web=true
cursor model=gemini-3.7-flash-{effort} tiers=low,medium,high web=true
```

| | |
|---|---|
| Supported ids | `claude`, `codex`, `cursor` |
| Supported keys | `model`, `tiers`, `final`, `web` |

Unknown ids and bad options are reported in the UI rather than silently ignored,
and a `model` value is pattern-checked before it reaches argv. The file is read on
every request, so edits take effect without restarting. A missing file means "use
every supported agent".

Copy `.agents.example` to get started.

### Web access

Every CLI blocks the network in print/non-interactive mode, so an agent asked
about current prices or recent events will say it cannot look anything up. Web
access is therefore **on by default**, granted with the narrowest switch each CLI
offers:

| Agent | Switch | What it grants |
|---|---|---|
| `claude` | `--allowedTools WebSearch WebFetch` | only those two tools — not Bash or file writes |
| `codex` | `-c tools.web_search=true` | the native web_search tool; `--search` is interactive-only and is rejected by `exec` |
| `cursor` | `--force` | approves the search tool call; stays in read-only `--mode ask` |

`--auto-review` was tried first for cursor and does not work under `-p`: its
classifier prompts for web search rather than auto-running it, and with nobody
there to answer, the prompt is rejected — the agent then answers from memory and
says its searches were "rejected by the user". `--force` approves the call.
Pairing it with `--mode ask` is what keeps the blast radius the same: asked to
write a file or run a shell command under those flags, the CLI refuses and
nothing is created.

Deliberately *not* used: `--dangerously-skip-permissions` (claude), or `--force`
*without* `--mode ask` (cursor), which would grant shell and write access.

Set `web=false` on a line to keep that agent offline.

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
src/app/api/ask/route.js      round 1 — every agent answers, concurrently
src/app/api/review/route.js   round 2 — every agent reviews the whole set
src/app/api/final/route.js    round 3 — one agent writes the synthesis
src/app/api/learnings/route.js  list + insert
src/app/api/health/route.js   db reachability, agent roster, CLI availability
src/components/               AskConsole, AgentAnswer, PendingAnswer, RunLog, AgentIcon, SidebarHead
src/lib/agents.js             adapters, roster parsing, the three rounds
src/lib/stream.js             NDJSON responses for the rounds that report per agent
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
- Each agent is capped at 300s (`AGENT_TIMEOUT_MS`) per attempt, and each round
  gives an agent 2 attempts (`AGENT_ATTEMPTS`). A run is retried when it times
  out, exits non-zero, or returns nothing — but not when the CLI is missing, and
  never after a usable answer. So one stalled agent can cost 600s before the
  round completes.
- `resolveBin()` searches PATH, then `~/.local/bin`, then every nvm version's bin
  directory. This matters because `codex` lives under one Node version's bin
  while this app runs on another. Override with `CLAUDE_BIN`, `CODEX_BIN`, or
  `CURSOR_AGENT_BIN` (non-alphanumerics in a binary name become underscores).
- The mysql2 pool is cached on `globalThis` so dev-mode hot reloading reuses one
  pool instead of opening a new one per edit.
- `AGENTS.md` and `CLAUDE.md` here are generated by `next dev` (a Next 16
  feature), not hand-written.
