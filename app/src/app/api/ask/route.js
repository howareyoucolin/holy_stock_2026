import { NextResponse } from 'next/server'
import { askAgents } from '@/lib/agents'

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

  try {
    const answers = await askAgents(question)

    return NextResponse.json({ question, ...answers })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
