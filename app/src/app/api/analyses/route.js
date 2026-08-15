import { NextResponse } from 'next/server'
import { readPublishSecret } from '@/lib/secrets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/*
 * A forwarder, not a writer. The PHP site owns publishing: it holds the only
 * insert into stock_analyses, and it decides whether a key is allowed to make
 * one. This route exists to attach the key — read from `.secrets` on this
 * machine, never exposed to the browser — and to pass the answer straight back.
 *
 * PUBLISH_ENDPOINT points at the deployed site by default. Point it at
 * http://localhost:8301/publish.php to publish through the local php container
 * instead; both reach the same database.
 */
const PUBLISH_ENDPOINT = () =>
  process.env.PUBLISH_ENDPOINT ?? 'https://stock.369usa.com/publish.php'

const PUBLISH_TIMEOUT_MS = 20_000

export async function POST(request) {
  let body

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const secret = readPublishSecret()

  if (!secret) {
    return NextResponse.json(
      {
        error:
          'No publishing key found. Copy .secrets.sample to .secrets at the project root and set `publish_secret`.',
      },
      { status: 400 },
    )
  }

  const endpoint = PUBLISH_ENDPOINT()

  let response
  let payload

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Only the fields publish.php reads. `published_by` is deliberately not
      // sent: the site derives it from the key, so it cannot be spoofed here.
      body: JSON.stringify({
        secret,
        ticker: body?.ticker,
        effort: body?.effort,
        result: body?.result,
        finalizer: body?.finalizer,
        finalizerModel: body?.finalizerModel,
      }),
      signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
    })

    payload = await response.json()
  } catch (error) {
    return NextResponse.json(
      { error: `Could not reach the publishing endpoint at ${endpoint} — ${error.message}` },
      { status: 502 },
    )
  }

  // Pass the site's own verdict through, status and all, so a rejected key
  // reads as a rejected key rather than as a generic failure.
  return NextResponse.json(payload, { status: response.status })
}
