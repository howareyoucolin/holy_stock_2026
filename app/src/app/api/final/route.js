import { NextResponse } from 'next/server'
import { DEFAULT_EFFORT, EFFORT_LEVELS, finalizeAnswer } from '@/lib/agents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Round 3: one agent synthesises the definitive answer from the candidates and
// the peer reviews.
export async function POST(request) {
  let body

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const task = body?.task ?? { type: 'general', question: String(body?.question ?? '') }
  const answers = Array.isArray(body?.answers) ? body.answers : []
  const reviews = Array.isArray(body?.reviews) ? body.reviews : []

  if (!task || (String(task.question ?? '').trim() === '' && String(task.ticker ?? '').trim() === '')) {
    return NextResponse.json({ error: 'A task is required.' }, { status: 400 })
  }

  if (answers.length === 0) {
    return NextResponse.json({ error: 'Answers are required.' }, { status: 400 })
  }

  const effort = String(body?.effort ?? DEFAULT_EFFORT)

  if (!EFFORT_LEVELS.includes(effort)) {
    return NextResponse.json(
      { error: `Effort must be one of: ${EFFORT_LEVELS.join(', ')}.` },
      { status: 400 },
    )
  }

  try {
    return NextResponse.json(await finalizeAnswer(task, effort, answers, reviews))
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
