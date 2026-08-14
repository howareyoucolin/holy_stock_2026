import { NextResponse } from 'next/server'
import { askAgents, DEFAULT_EFFORT, EFFORT_LEVELS, loadAgents } from '@/lib/agents'

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

  const question = String(body?.question ?? '').trim()

  if (question === '') {
    return NextResponse.json({ error: 'A question is required.' }, { status: 400 })
  }

  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { error: `Question is too long (max ${MAX_QUESTION_LENGTH} characters).` },
      { status: 400 },
    )
  }

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

  try {
    const answers = await askAgents(question, requested)

    return NextResponse.json({ question, ...answers })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
