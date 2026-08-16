import { NextResponse } from 'next/server'
import { DEFAULT_EFFORT, EFFORT_LEVELS, reviewAnswers } from '@/lib/agents'
import { hasTaskSubject } from '@/lib/prompts'
import { ndjsonRun } from '@/lib/stream'

// child_process needs the Node runtime, not the edge one.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Round 2 of the ask flow: every agent critiques the whole set of answers.
// The client passes round 1 back in, which keeps the server stateless between
// rounds and lets the UI show each round as it lands.
export async function POST(request) {
  let body

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const task = body?.task ?? { type: 'general', question: String(body?.question ?? '') }
  const answers = Array.isArray(body?.answers) ? body.answers : []

  if (!hasTaskSubject(task)) {
    return NextResponse.json({ error: 'A task is required.' }, { status: 400 })
  }

  if (answers.length === 0) {
    return NextResponse.json({ error: 'Answers to review are required.' }, { status: 400 })
  }

  const effort = String(body?.effort ?? DEFAULT_EFFORT)

  if (!EFFORT_LEVELS.includes(effort)) {
    return NextResponse.json(
      { error: `Effort must be one of: ${EFFORT_LEVELS.join(', ')}.` },
      { status: 400 },
    )
  }

  return ndjsonRun((write) =>
    reviewAnswers(task, effort, answers, {
      signal: request.signal,
      onAgent: (agent) => write({ type: 'agent', agent }),
    }),
  )
}
