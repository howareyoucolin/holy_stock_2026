import { NextResponse } from 'next/server'
import { KNOWN_AGENT_IDS, loadRoster, saveAgentSettings } from '@/lib/agents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The settings dialog reads and writes the roster through here. Both halves work
// on `.agents` itself rather than a parallel store, so what the dialog shows and
// what the file says can never drift apart.
export async function GET() {
  try {
    return NextResponse.json(loadRoster())
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request) {
  let body

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const enabled = {}

  for (const id of KNOWN_AGENT_IDS) {
    if (typeof body?.enabled?.[id] === 'boolean') {
      enabled[id] = body.enabled[id]
    }
  }

  const finalizer = body?.finalizer == null ? null : String(body.finalizer)

  if (finalizer !== null && !KNOWN_AGENT_IDS.includes(finalizer)) {
    return NextResponse.json({ error: `Unknown agent "${finalizer}".` }, { status: 400 })
  }

  // Nominating an agent that is switched off would leave the synthesis to
  // whichever agent happened to be first — a silent surprise, so it is refused.
  if (finalizer !== null && enabled[finalizer] === false) {
    return NextResponse.json(
      { error: 'The final summariser has to be one of the enabled agents.' },
      { status: 400 },
    )
  }

  if (Object.values(enabled).every((value) => value === false)) {
    return NextResponse.json(
      { error: 'At least one agent has to stay enabled.' },
      { status: 400 },
    )
  }

  try {
    return NextResponse.json(saveAgentSettings({ enabled, finalizer }))
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
