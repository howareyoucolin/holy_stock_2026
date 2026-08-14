import { NextResponse } from 'next/server'
import { loadAgents } from '@/lib/agents'
import { dbInfo } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  // Roster comes from the .agents file, so the UI shows exactly the agents that
  // will be asked — including any ids in that file we do not recognise.
  const { agents, unknown, problems, source } = loadAgents()

  try {
    const info = await dbInfo()

    return NextResponse.json({ db: { ok: true, ...info }, agents, unknown, problems, source })
  } catch (error) {
    return NextResponse.json({
      db: { ok: false, error: error.message },
      agents,
      unknown,
      problems,
      source,
    })
  }
}
