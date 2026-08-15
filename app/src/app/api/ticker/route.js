import { NextResponse } from 'next/server'
import { TICKER_PATTERN } from '@/lib/prompts'
import { verifyTicker } from '@/lib/tickers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Checks a symbol against the US listing directory before anyone spends agent
// time on it. /api/ask makes the same check itself — this one exists so the UI
// can refuse early, without opening a run log for a question it will not ask.
export async function GET(request) {
  const symbol = String(request.nextUrl.searchParams.get('symbol') ?? '')
    .trim()
    .toUpperCase()

  if (!TICKER_PATTERN.test(symbol)) {
    return NextResponse.json(
      { status: 'unlisted', symbol, error: `"${symbol}" does not look like a ticker symbol.` },
      { status: 200 },
    )
  }

  try {
    return NextResponse.json(await verifyTicker(symbol))
  } catch (error) {
    // Never fatal: an unverifiable symbol is allowed through by the caller.
    return NextResponse.json({ status: 'unverified', symbol, error: error.message })
  }
}
