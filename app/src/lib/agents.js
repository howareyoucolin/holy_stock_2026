import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

const AGENT_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS ?? 300_000)

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

export function resolveBin(name) {
  const override = process.env[`${name.toUpperCase()}_BIN`]
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

      // Codex writes its final message to a file rather than stdout, so the
      // event stream does not end up in the answer.
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

function missing(name) {
  return {
    status: 'error',
    answer: '',
    error: `Could not find the \`${name}\` CLI. Set ${name.toUpperCase()}_BIN to its full path.`,
  }
}

export async function askClaude(question, effort = DEFAULT_EFFORT) {
  const bin = resolveBin('claude')
  if (!bin) return missing('claude')

  return runCli({ bin, args: ['-p', '--effort', normalizeEffort(effort)], question })
}

export async function askCodex(question, effort = DEFAULT_EFFORT) {
  const bin = resolveBin('codex')
  if (!bin) return missing('codex')

  const codexEffort = CODEX_EFFORT[normalizeEffort(effort)]

  const outFile = path.join(tmpdir(), `holystocks-codex-${randomBytes(6).toString('hex')}.txt`)

  return runCli({
    bin,
    // read-only sandbox: a question submitted through the UI cannot change files.
    args: [
      'exec',
      '-c',
      `model_reasoning_effort=${codexEffort}`,
      '--sandbox',
      'read-only',
      '--skip-git-repo-check',
      '--color',
      'never',
      '-o',
      outFile,
      '-',
    ],
    question,
    readOutputFile: outFile,
  })
}

// Ask both agents at once; the request takes as long as the slower one.
export async function askAgents(question, effort = DEFAULT_EFFORT) {
  const level = normalizeEffort(effort)
  const [claude, codex] = await Promise.all([
    askClaude(question, level),
    askCodex(question, level),
  ])

  return { effort: level, claude, codex }
}
