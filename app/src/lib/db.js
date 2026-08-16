import path from 'node:path'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

// One source of credentials: the project-root .env, which also configures the
// php container. Next only auto-loads .env files inside app/, so load it here.
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') })

// That .env is written from the container's point of view, where the host is
// reachable as host.docker.internal. This runs on the host itself, so the same
// tunnel is on loopback.
function resolveHost() {
  const host = process.env.DB_HOST ?? '127.0.0.1'

  return host === 'host.docker.internal' ? '127.0.0.1' : host
}

// Cached on globalThis so Next's dev-mode hot reloading reuses one pool instead
// of opening a new one on every edit.
function createPool() {
  return mysql.createPool({
    host: resolveHost(),
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 5,
  })
}

const globalForDb = globalThis
export const pool = globalForDb.__holyStocksPool ?? createPool()

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__holyStocksPool = pool
}

/*
 * Turns a driver-level failure into something actionable.
 *
 * There is no local database: the console reaches the remote MySQL through an
 * SSH tunnel whose near end is on loopback, so a dead tunnel surfaces as
 * `ECONNREFUSED 127.0.0.1:13307` — which reads like the app is pointed at the
 * wrong host rather than like the tunnel needs reopening.
 */
export function describeDbError(error) {
  const message = String(error?.message ?? error)
  const port = process.env.DB_PORT ?? '13307'

  if (error?.code === 'ECONNREFUSED' || message.includes('ECONNREFUSED')) {
    return `The database tunnel is not running, so the remote MySQL is unreachable on port ${port}. Open it with \`npm run tunnel\` and try again.`
  }

  if (error?.code === 'ETIMEDOUT' || error?.code === 'PROTOCOL_CONNECTION_LOST') {
    return `The database connection dropped — the tunnel may have died. Reopen it with \`npm run tunnel\` and try again.`
  }

  return message
}

export async function dbInfo() {
  const [rows] = await pool.query('SELECT VERSION() AS version, DATABASE() AS db')

  return rows[0]
}

export async function listLearnings(limit = 50) {
  const [rows] = await pool.query(
    `SELECT id, title, question, takeaway, is_published, created_at
     FROM learnings
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [limit],
  )

  return rows
}

export async function getLearning(id) {
  const [rows] = await pool.execute(
    `SELECT id, title, question, takeaway, claude_answer, codex_answer, is_published, created_at
     FROM learnings
     WHERE id = ?
     LIMIT 1`,
    [id],
  )

  return rows[0] ?? null
}

export async function createLearning({
  title,
  question,
  takeaway,
  claudeAnswer,
  codexAnswer,
  isPublished,
}) {
  const [result] = await pool.execute(
    `INSERT INTO learnings
       (title, question, takeaway, claude_answer, codex_answer, is_published, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [title, question, takeaway, claudeAnswer || null, codexAnswer || null, isPublished ? 1 : 0],
  )

  return result.insertId
}

/* ---------- guideline rules ---------- */

/*
 * Earlier rounds on the same rule name, oldest first, so a re-vote can be a
 * reconsideration rather than a fresh start. Capped: the point is what was
 * objected to last time, not the whole history of the idea.
 */
export async function pastVotingRounds(name, limit = 3) {
  const [rows] = await pool.query(
    `SELECT id, name, description, voting_result, avg_confidence_level, created_at
     FROM guideline_rule_voting_log
     WHERE name = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [name, limit],
  )

  // mysql2 hands back JSON columns already parsed, but a hand-written row could
  // still be a string.
  return rows
    .map((row) => ({
      ...row,
      votes: typeof row.voting_result === 'string'
        ? JSON.parse(row.voting_result)?.votes ?? []
        : row.voting_result?.votes ?? [],
    }))
    .reverse()
}

/** One completed round of voting. Appended, never updated. */
export async function saveVotingRound({ name, description, result, avgConfidence }) {
  const [inserted] = await pool.execute(
    `INSERT INTO guideline_rule_voting_log
       (name, description, voting_result, avg_confidence_level, created_at)
     VALUES (?, ?, CAST(? AS JSON), ?, NOW())`,
    [name, description, JSON.stringify(result), avgConfidence],
  )

  return inserted.insertId
}

/*
 * Promotes a rule to the set that is actually applied. Keyed by name, so
 * approving a refined rule replaces the wording in force rather than leaving two
 * near-identical rules to be injected into every future prompt.
 */
export async function approveRule({ name, description, result, avgConfidence }) {
  const [saved] = await pool.execute(
    `INSERT INTO guideline_rules
       (name, description, voting_result, avg_confidence_level, approved_at)
     VALUES (?, ?, CAST(? AS JSON), ?, NOW())
     ON DUPLICATE KEY UPDATE
       description = VALUES(description),
       voting_result = VALUES(voting_result),
       avg_confidence_level = VALUES(avg_confidence_level),
       approved_at = NOW()`,
    [name, description, JSON.stringify(result), avgConfidence],
  )

  return saved.insertId
}

/** One logged round, for promoting it later without re-sending the ballots. */
export async function votingRound(id) {
  const [rows] = await pool.execute(
    `SELECT id, name, description, voting_result, avg_confidence_level
     FROM guideline_rule_voting_log
     WHERE id = ?
     LIMIT 1`,
    [id],
  )

  const row = rows[0]

  if (!row) return null

  return {
    ...row,
    voting_result:
      typeof row.voting_result === 'string' ? JSON.parse(row.voting_result) : row.voting_result,
  }
}

/** The rules in force, for handing to the agents as standing guidance. */
export async function activeRules() {
  const [rows] = await pool.query(
    `SELECT id, name, description, avg_confidence_level, approved_at
     FROM guideline_rules
     ORDER BY approved_at DESC, id DESC`,
  )

  return rows
}
