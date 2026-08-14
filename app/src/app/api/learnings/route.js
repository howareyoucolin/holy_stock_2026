import { NextResponse } from 'next/server'
import { createLearning, listLearnings } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_TITLE_LENGTH = 255

export async function GET() {
  try {
    return NextResponse.json({ learnings: await listLearnings() })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request) {
  let body

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const title = String(body?.title ?? '').trim()
  const question = String(body?.question ?? '').trim()
  const takeaway = String(body?.takeaway ?? '').trim()

  if (title === '' || question === '' || takeaway === '') {
    return NextResponse.json(
      { error: 'Title, question, and takeaway are all required.' },
      { status: 400 },
    )
  }

  if (title.length > MAX_TITLE_LENGTH) {
    return NextResponse.json(
      { error: `Title is too long (max ${MAX_TITLE_LENGTH} characters).` },
      { status: 400 },
    )
  }

  try {
    const id = await createLearning({
      title,
      question,
      takeaway,
      claudeAnswer: String(body?.claudeAnswer ?? ''),
      codexAnswer: String(body?.codexAnswer ?? ''),
      isPublished: body?.isPublished !== false,
    })

    return NextResponse.json({ id }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
