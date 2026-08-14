import { NextResponse } from 'next/server'
import { resolveBin } from '@/lib/agents'
import { dbInfo } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const agents = {
    claude: resolveBin('claude') !== null,
    codex: resolveBin('codex') !== null,
  }

  try {
    const info = await dbInfo()

    return NextResponse.json({ db: { ok: true, ...info }, agents })
  } catch (error) {
    return NextResponse.json({ db: { ok: false, error: error.message }, agents })
  }
}
