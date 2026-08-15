import { NextResponse } from 'next/server'
import { askAgents, DEFAULT_EFFORT, EFFORT_LEVELS, loadAgents } from '@/lib/agents'
import { describeTask, normalizeType, TICKER_PATTERN } from '@/lib/prompts'
import { ndjsonRun } from '@/lib/stream'
import { verifyTicker } from '@/lib/tickers'

// child_process needs the Node runtime, not the edge one.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_QUESTION_LENGTH = 4000

export async function POST(request) {
  let body

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const type = normalizeType(body?.type)
  const question = String(body?.question ?? '').trim()
  const ticker = String(body?.ticker ?? '').trim().toUpperCase()

  if (type === 'valuation') {
    if (ticker === '') {
      return NextResponse.json({ error: 'A ticker is required.' }, { status: 400 })
    }

    if (!TICKER_PATTERN.test(ticker)) {
      return NextResponse.json(
        { error: `"${ticker}" does not look like a ticker symbol.` },
        { status: 400 },
      )
    }

    /*
     * The shape test above only proves it could be a ticker; SPCXSS passes it.
     * Three rounds of agents on a symbol that does not exist costs minutes and
     * real tokens to be told so, which is why this is checked here rather than
     * left to the client — bypassing the UI must not bypass the gate.
     *
     * A directory that cannot be reached returns `unverified`, and that is let
     * through: an exchange file server being down is not a reason to refuse
     * every valuation.
     */
    const listing = await verifyTicker(ticker)

    if (listing.status === 'unlisted') {
      return NextResponse.json(
        {
          error: `"${ticker}" is not a US-listed symbol, so no agents were asked. Check the spelling, or use the symbol as it trades.`,
        },
        { status: 400 },
      )
    }
  } else {
    if (question === '') {
      return NextResponse.json({ error: 'A question is required.' }, { status: 400 })
    }

    if (question.length > MAX_QUESTION_LENGTH) {
      return NextResponse.json(
        { error: `Question is too long (max ${MAX_QUESTION_LENGTH} characters).` },
        { status: 400 },
      )
    }
  }

  const task = { type, question, ticker }

  const requested = String(body?.effort ?? DEFAULT_EFFORT)

  if (!EFFORT_LEVELS.includes(requested)) {
    return NextResponse.json(
      { error: `Effort must be one of: ${EFFORT_LEVELS.join(', ')}.` },
      { status: 400 },
    )
  }

  // An empty roster means every line in .agents was blank, commented out, or an
  // unrecognised id — worth saying plainly instead of returning zero answers.
  const { agents, unknown } = loadAgents()

  if (agents.length === 0) {
    const detail = unknown.length > 0 ? ` Unrecognised: ${unknown.join(', ')}.` : ''

    return NextResponse.json(
      { error: `No agents are enabled. Add one to the .agents file.${detail}` },
      { status: 400 },
    )
  }

  // Everything above answers in one plain JSON body, so a bad request still gets
  // a real status code. Only the long part streams.
  return ndjsonRun(async (write) => {
    const answers = await askAgents(task, requested, {
      signal: request.signal,
      onAgent: (agent) => write({ type: 'agent', agent }),
    })

    return { task, subject: describeTask(task), ...answers }
  })
}
