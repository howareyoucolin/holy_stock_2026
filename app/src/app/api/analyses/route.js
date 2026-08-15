import { NextResponse } from 'next/server'
import { DEFAULT_EFFORT, EFFORT_LEVELS } from '@/lib/agents'
import { createStockAnalysis, describeDbError } from '@/lib/db'
import { TICKER_PATTERN } from '@/lib/prompts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Column widths in the stock_analyses migration. Checked here so an over-long
// value is a 400 rather than a truncated row.
const MAX_TICKER_LENGTH = 15
const MAX_FINALIZER_LENGTH = 32
const MAX_MODEL_LENGTH = 64

/*
 * Saves one valuation synthesis. Nothing else in the ask flow writes to MySQL:
 * a run is kept only when the Publish button is pressed, so an analysis that
 * turned out badly leaves no trace.
 */
export async function POST(request) {
  let body

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const ticker = String(body?.ticker ?? '').trim().toUpperCase()
  const result = String(body?.result ?? '').trim()
  const finalizer = String(body?.finalizer ?? '').trim()
  const finalizerModel = String(body?.finalizerModel ?? '').trim()
  const effortLevel = String(body?.effort ?? DEFAULT_EFFORT)

  if (!TICKER_PATTERN.test(ticker) || ticker.length > MAX_TICKER_LENGTH) {
    return NextResponse.json(
      { error: `"${ticker}" does not look like a ticker symbol.` },
      { status: 400 },
    )
  }

  if (result === '') {
    return NextResponse.json({ error: 'There is no analysis to publish.' }, { status: 400 })
  }

  if (finalizer === '' || finalizer.length > MAX_FINALIZER_LENGTH) {
    return NextResponse.json(
      { error: 'The agent that wrote the analysis is required.' },
      { status: 400 },
    )
  }

  if (!EFFORT_LEVELS.includes(effortLevel)) {
    return NextResponse.json(
      { error: `Effort must be one of: ${EFFORT_LEVELS.join(', ')}.` },
      { status: 400 },
    )
  }

  try {
    const id = await createStockAnalysis({
      ticker,
      effortLevel,
      result,
      finalizer,
      // Optional in the schema: a CLI with no configured model reports none.
      finalizerModel: finalizerModel.slice(0, MAX_MODEL_LENGTH),
    })

    return NextResponse.json({ id, ticker }, { status: 201 })
  } catch (error) {
    // A raw ECONNREFUSED on loopback is the least useful thing to show here:
    // the analysis is still on screen and one command makes Publish work again.
    return NextResponse.json({ error: describeDbError(error) }, { status: 500 })
  }
}
