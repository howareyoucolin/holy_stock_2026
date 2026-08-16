import { NextResponse } from 'next/server'
import { loadAgents } from '@/lib/agents'
import { dbInfo } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/*
 * Where the published site lives, for the console's browse mode. Derived from
 * PUBLISH_ENDPOINT rather than configured twice — the site you publish to is by
 * definition the site you would want to look at.
 */
function siteUrl() {
  const endpoint = process.env.PUBLISH_ENDPOINT ?? 'https://stock.369usa.com/publish.php'

  try {
    return new URL(endpoint).origin
  } catch {
    return null
  }
}

export async function GET() {
  // Roster comes from the .agents file, so the UI shows exactly the agents that
  // will be asked — including any ids in that file we do not recognise.
  const { agents, unknown, problems, source } = loadAgents()

  try {
    const info = await dbInfo()

    return NextResponse.json({
      db: { ok: true, ...info },
      agents,
      unknown,
      problems,
      source,
      siteUrl: siteUrl(),
    })
  } catch (error) {
    return NextResponse.json({
      db: { ok: false, error: error.message },
      agents,
      unknown,
      problems,
      source,
      siteUrl: siteUrl(),
    })
  }
}
