import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { buildFinalPrompt, buildReviewPrompt, buildTaskPrompt } from './prompts.js'

const AGENT_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS ?? 300_000)

// A CLI that times out, dies mid-answer or returns nothing has usually hit
// something transient — a cold start, a dropped connection — so it gets one more
// go before the round moves on without it. Worth the wait: an agent missing from
// round 1 is also missing from the cross-review and the synthesis.
const AGENT_ATTEMPTS = Math.max(1, Number(process.env.AGENT_ATTEMPTS ?? 2))

// The levels `claude --effort` accepts.
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']
export const DEFAULT_EFFORT = 'medium'

// Codex takes the same idea through a config override rather than a flag, and has
// no equivalent of claude's top `max` tier — so that folds onto `xhigh`.
const CODEX_EFFORT = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'xhigh',
}

function normalizeEffort(effort) {
  return EFFORT_LEVELS.includes(effort) ? effort : DEFAULT_EFFORT
}

/*
 * Every agent this console knows how to drive. Which of them actually get asked
 * is decided by the .agents file at the project root — see loadAgents() below.
 * Adding a new CLI means adding one entry here plus a glyph in AgentIcon.jsx.
 */
const ADAPTERS = {
  claude: {
    id: 'claude',
    label: 'Claude',
    bin: 'claude',
    supportsEffort: true,
    // An allowlist of exactly two tools — narrower than any of the
    // skip-permission flags, which would also grant Bash and file writes.
    args: ({ effort, model, web }) => [
      '-p',
      '--effort',
      effort,
      ...(model ? ['--model', model] : []),
      ...(web ? ['--allowedTools', 'WebSearch', 'WebFetch'] : []),
    ],
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    bin: 'codex',
    supportsEffort: true,
    // Codex prints an event stream on stdout, so the final message is captured
    // from a file instead. read-only sandboxing keeps a question from editing
    // anything.
    // `--search` is interactive-only; under `exec` the same switch is a config
    // override.
    args: ({ effort, model, web, outFile }) => [
      'exec',
      '-c',
      `model_reasoning_effort=${CODEX_EFFORT[effort]}`,
      ...(web ? ['-c', 'tools.web_search=true'] : []),
      ...(model ? ['--model', model] : []),
      '--sandbox',
      'read-only',
      '--skip-git-repo-check',
      '--color',
      'never',
      '-o',
      outFile,
      '-',
    ],
    usesOutputFile: true,
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    bin: 'cursor-agent',
    // Cursor has no effort flag: its reasoning tier is baked into the model name
    // (`gpt-5.3-codex-high`, `-xhigh`, …), so the shared effort selector cannot
    // drive it. Set `model=` in .agents to pick a tier.
    supportsEffort: false,
    // `--mode ask` is the read-only Q&A mode; plain `--print` would otherwise
    // have write and shell tools available. Ask mode alone also blocks the
    // network, so `--auto-review` is added to auto-approve safe tool calls
    // (web search) — still without leaving read-only mode.
    args: ({ model, web }) => [
      '-p',
      '--mode',
      'ask',
      '--output-format',
      'text',
      ...(model ? ['--model', model] : []),
      ...(web ? ['--auto-review'] : []),
    ],
  },
}

// Options a .agents line may set, per agent. Anything else is rejected rather
// than passed through, so the file cannot inject arbitrary flags into argv.
const ALLOWED_OPTIONS = {
  claude: ['model', 'tiers', 'final', 'web'],
  codex: ['model', 'tiers', 'final', 'web'],
  cursor: ['model', 'tiers', 'final', 'web'],
}

const TRUTHY = ['true', '1', 'yes', 'on']
const FALSY = ['false', '0', 'no', 'off']

// Web access is on unless a line says otherwise: this console is for research
// questions, and every CLI refuses network access by default in print mode.
function wantsWeb(options) {
  const value = String(options?.web ?? '').toLowerCase()

  return !FALSY.includes(value)
}

// Model names include dots, dashes, Cursor's bracket overrides
// (`claude-opus-4-8[effort=high]`) and our own {effort} placeholder, but nothing
// that needs quoting.
const MODEL_PATTERN = /^[A-Za-z0-9._\-[\]{}=,:+/]+$/

/*
 * Some CLIs have no effort flag and instead ship one model per reasoning tier —
 * Cursor's `gemini-3.7-flash-low|-medium|-high`, for instance. Writing
 * `model=gemini-3.7-flash-{effort}` lets the shared effort selector drive those
 * too: the placeholder is replaced with the chosen level.
 *
 * Families rarely offer all five levels, so `tiers=` declares the ones that
 * exist and anything higher clamps down to the top of that list. Without it we
 * would happily build `gemini-3.7-flash-xhigh`, which does not exist.
 */
const EFFORT_PLACEHOLDER = '{effort}'

function clampEffort(effort, tiers) {
  if (!tiers || tiers.length === 0) return effort

  const wanted = EFFORT_LEVELS.indexOf(effort)
  const ordered = tiers
    .map((tier) => EFFORT_LEVELS.indexOf(tier))
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)

  if (ordered.length === 0) return effort

  // Highest declared tier at or below the request; otherwise the lowest there is.
  const atOrBelow = ordered.filter((index) => index <= wanted)
  const chosen = atOrBelow.length > 0 ? atOrBelow[atOrBelow.length - 1] : ordered[0]

  return EFFORT_LEVELS[chosen]
}

// Resolves a model template against the chosen effort. Returns null when no
// model was configured, so the CLI keeps its own default.
export function resolveModel(options, effort) {
  const template = options?.model

  if (!template) return null
  if (!template.includes(EFFORT_PLACEHOLDER)) return template

  const tiers = options.tiers ? options.tiers.split(',').map((t) => t.trim()) : null

  return template.split(EFFORT_PLACEHOLDER).join(clampEffort(effort, tiers))
}

// An agent is effort-aware if its CLI takes an effort flag, or if its configured
// model interpolates the level.
export function agentUsesEffort(adapter, options) {
  return adapter.supportsEffort === true || Boolean(options?.model?.includes(EFFORT_PLACEHOLDER))
}

export const KNOWN_AGENT_IDS = Object.keys(ADAPTERS)

// The roster lives beside .env at the project root, one directory above the Next
// app. Read on every call rather than cached, so editing it takes effect without
// restarting the dev server.
const AGENTS_FILE = () => path.resolve(process.cwd(), '..', '.agents')

/*
 * Parses .agents. Each non-empty line is an agent id followed by optional
 * `key=value` options:
 *
 *     claude
 *     codex
 *     cursor model=gpt-5.3-codex-high
 *
 * `#` starts a comment, blank lines are ignored, and file order sets display
 * order. A missing file means "use everything known", so the app still works
 * before the file is created.
 */
export function loadAgents() {
  let contents

  try {
    contents = readFileSync(AGENTS_FILE(), 'utf8')
  } catch {
    return {
      agents: KNOWN_AGENT_IDS.map((id) => descriptor(ADAPTERS[id])),
      unknown: [],
      problems: [],
      source: 'default',
    }
  }

  const entries = []
  const seen = new Set()
  const unknown = []
  const problems = []

  for (const rawLine of contents.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim()

    if (line === '') continue

    const [rawId, ...rest] = line.split(/\s+/)
    const id = rawId.toLowerCase()

    if (!ADAPTERS[id]) {
      unknown.push(id)
      continue
    }

    // Tolerate a duplicated line rather than asking the same agent twice.
    if (seen.has(id)) continue
    seen.add(id)

    const options = {}

    for (const token of rest) {
      const index = token.indexOf('=')
      const key = (index === -1 ? token : token.slice(0, index)).toLowerCase()
      const value = index === -1 ? '' : token.slice(index + 1)

      if (!ALLOWED_OPTIONS[id]?.includes(key)) {
        problems.push(`${id}: unsupported option "${key}"`)
        continue
      }

      if (key === 'model' && !MODEL_PATTERN.test(value)) {
        problems.push(`${id}: invalid model "${value}"`)
        continue
      }

      if (key === 'final' && value !== '' && !TRUTHY.includes(value.toLowerCase())) {
        problems.push(`${id}: final must be true (got "${value}")`)
        continue
      }

      if (
        key === 'web' &&
        value !== '' &&
        ![...TRUTHY, ...FALSY].includes(value.toLowerCase())
      ) {
        problems.push(`${id}: web must be true or false (got "${value}")`)
        continue
      }

      if (key === 'tiers') {
        const bad = value
          .split(',')
          .map((tier) => tier.trim())
          .filter((tier) => tier !== '' && !EFFORT_LEVELS.includes(tier))

        if (bad.length > 0) {
          problems.push(`${id}: unknown tier "${bad.join(', ')}"`)
          continue
        }
      }

      options[key] = value
    }

    entries.push({ id, options })
  }

  return {
    agents: entries.map((entry) => descriptor(ADAPTERS[entry.id], entry.options)),
    unknown,
    problems,
    source: 'file',
  }
}

// Only the fields safe to hand to the browser — never the argv builders.
function descriptor(adapter, options = {}) {
  return {
    id: adapter.id,
    label: adapter.label,
    available: resolveBin(adapter.bin) !== null,
    binEnv: binEnvName(adapter.bin),
    supportsEffort: agentUsesEffort(adapter, options),
    model: options.model ?? null,
    // `final=true` in .agents nominates the agent that writes the synthesis.
    isFinalizer: TRUTHY.includes(String(options.final ?? '').toLowerCase()),
    web: wantsWeb(options),
    options,
  }
}

// Resolving a CLI by name is not enough here. `codex` is installed under one
// nvm-managed Node version's bin directory, and this app runs on a different
// (newer) Node version, so that directory is not on PATH. Search PATH first,
// then the usual install locations, then every nvm version's bin.
function candidateDirs() {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)

  dirs.push(
    path.join(homedir(), '.local', 'bin'),
    path.join(homedir(), 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  )

  const nvmVersions = path.join(homedir(), '.nvm', 'versions', 'node')
  try {
    for (const version of readdirSync(nvmVersions)) {
      dirs.push(path.join(nvmVersions, version, 'bin'))
    }
  } catch {
    // No nvm on this machine; the dirs above are enough.
  }

  return dirs
}

// `cursor-agent` cannot appear in an env var name, so non-alphanumerics collapse
// to underscores: CURSOR_AGENT_BIN, CLAUDE_BIN, CODEX_BIN.
export function binEnvName(bin) {
  return `${bin.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_BIN`
}

export function resolveBin(name) {
  const override = process.env[binEnvName(name)]
  if (override) {
    return existsSync(override) ? override : null
  }

  for (const dir of candidateDirs()) {
    const candidate = path.join(dir, name)
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

// Run one CLI with the question on stdin, never as a shell argument, so no part
// of the user's text is interpreted as a command.
function runCli({ bin, args, question, readOutputFile }) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      // No shell: argv goes to execve directly.
      shell: false,
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, AGENT_TIMEOUT_MS)

    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ status: 'error', answer: '', error: error.message })
    })

    child.on('close', (code) => {
      clearTimeout(timer)

      if (timedOut) {
        resolve({
          status: 'error',
          answer: '',
          error: `Timed out after ${AGENT_TIMEOUT_MS / 1000}s.`,
        })
        return
      }

      let answer = stdout.trim()
      if (readOutputFile) {
        try {
          answer = readFileSync(readOutputFile, 'utf8').trim()
        } catch {
          answer = ''
        }
        try {
          unlinkSync(readOutputFile)
        } catch {
          // Already gone; nothing to clean up.
        }
      }

      if (code !== 0) {
        resolve({
          status: 'error',
          answer,
          error: stderr.trim() || `Exited with code ${code}.`,
        })
        return
      }

      resolve({ status: 'done', answer, error: null })
    })

    child.stdin.end(question)
  })
}

// A run is worth repeating when it produced no usable text — whether it failed
// outright or exited cleanly with an empty answer, which is just as useless to
// the rounds that follow.
function worthRetrying(result) {
  return result.status !== 'done' || String(result.answer ?? '').trim() === ''
}

async function askOne(adapter, question, effort, options = {}) {
  const bin = resolveBin(adapter.bin)

  // Not retried: a missing binary fails the same way every time.
  if (!bin) {
    return {
      status: 'error',
      answer: '',
      error: `Could not find the \`${adapter.bin}\` CLI. Set ${binEnvName(adapter.bin)} to its full path.`,
    }
  }

  const model = resolveModel(options, effort)

  let result
  let attempts = 0

  while (attempts < AGENT_ATTEMPTS) {
    attempts += 1

    // A fresh temp file per attempt: a killed run can leave a partial one behind.
    const outFile = adapter.usesOutputFile
      ? path.join(tmpdir(), `holystocks-${adapter.id}-${randomBytes(6).toString('hex')}.txt`)
      : undefined

    result = await runCli({
      bin,
      args: adapter.args({ effort, model: model || undefined, web: wantsWeb(options), outFile }),
      question,
      readOutputFile: outFile,
    })

    if (!worthRetrying(result)) break
  }

  // Say so when a failure survived a retry, rather than reading as one bad run.
  const error =
    result.error && attempts > 1 ? `${result.error} (${attempts} attempts)` : result.error

  // The resolved name matters: with a {effort} template it differs per request.
  return { ...result, error, attempts, modelUsed: model }
}

// Ask every agent listed in .agents at once; the request takes as long as the
// slowest one.
export async function askAgents(task, effort = DEFAULT_EFFORT) {
  const level = normalizeEffort(effort)
  const { agents } = loadAgents()
  const prompt = buildTaskPrompt(task)

  const results = await Promise.all(
    agents.map(async (agent) => ({
      id: agent.id,
      label: agent.label,
      // Reported so the UI can say when an agent ignored the chosen effort.
      effortApplied: agent.supportsEffort,
      ...(await askOne(ADAPTERS[agent.id], prompt, level, agent.options)),
    })),
  )

  return { effort: level, results }
}


/* ---------- cross-review ---------- */

// Only answers that actually returned text are worth reviewing or synthesising.
function usable(entries) {
  return (entries ?? []).filter(
    (entry) => entry?.status === 'done' && String(entry.answer ?? '').trim() !== '',
  )
}

// Round 2: every agent critiques the whole set, concurrently.
export async function reviewAnswers(task, effort, answers) {
  const level = normalizeEffort(effort)
  const { agents } = loadAgents()
  const pool = usable(answers)

  // Nothing to cross-review with fewer than two answers.
  if (pool.length < 2) {
    return { effort: level, reviews: [], skipped: 'fewer than two answers to compare' }
  }

  const reviews = await Promise.all(
    agents.map(async (agent) => ({
      id: agent.id,
      label: agent.label,
      effortApplied: agent.supportsEffort,
      ...(await askOne(
        ADAPTERS[agent.id],
        buildReviewPrompt(task, agent.label, pool),
        level,
        agent.options,
      )),
    })),
  )

  return { effort: level, reviews }
}

// Whoever is marked `final=true`, else the first available agent in file order.
export function pickFinalizer(agents) {
  return (
    agents.find((agent) => agent.isFinalizer && agent.available) ??
    agents.find((agent) => agent.available) ??
    null
  )
}

// Round 3: one agent writes the synthesis from the answers plus the reviews.
export async function finalizeAnswer(task, effort, answers, reviews) {
  const level = normalizeEffort(effort)
  const { agents } = loadAgents()
  const finalizer = pickFinalizer(agents)

  if (!finalizer) {
    return { effort: level, final: null, error: 'No available agent to write the final answer.' }
  }

  const result = await askOne(
    ADAPTERS[finalizer.id],
    buildFinalPrompt(task, answers, reviews),
    level,
    finalizer.options,
  )

  return {
    effort: level,
    final: { id: finalizer.id, label: finalizer.label, ...result },
  }
}
