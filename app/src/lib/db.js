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
