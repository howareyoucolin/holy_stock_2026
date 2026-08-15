/*
 * A cheap gate in front of the expensive part. A valuation spends three rounds
 * of agent time — minutes, and real tokens — so a symbol that does not exist is
 * worth catching in a few milliseconds first.
 *
 * The source is the Nasdaq Trader symbol directory: the official listing files
 * for US markets, keyless and public. Two files, because Nasdaq-listed and
 * everything-else-listed (NYSE, NYSE American, Cboe, and ETFs) are published
 * separately.
 */
const SYMBOL_FILES = [
  // symbol | security name | market category | test issue | ...
  { url: 'https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt', symbol: 0, name: 1, test: 3 },
  // ACT symbol | security name | exchange | CQS symbol | ETF | lot | test issue | ...
  { url: 'https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt', symbol: 0, name: 1, test: 6 },
]

// The files are regenerated once a day, so a long cache is accurate and keeps a
// burst of valuations down to one fetch. On globalThis for the same reason as
// the mysql pool: a dev-mode reload must not re-download them.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 8000

const globalForTickers = globalThis

function parse(text, columns) {
  const listings = new Map()

  for (const [index, rawLine] of text.split('\n').entries()) {
    const line = rawLine.trim()

    // Header row, blank tail, and the trailing "File Creation Time" footer.
    if (index === 0 || line === '' || line.startsWith('File Creation Time')) continue

    const fields = line.split('|')

    if (fields.length <= Math.max(columns.symbol, columns.name, columns.test)) continue
    // Test issues are placeholder symbols the exchanges use for system checks.
    if (fields[columns.test]?.trim() === 'Y') continue

    listings.set(fields[columns.symbol].trim().toUpperCase(), fields[columns.name].trim())
  }

  return listings
}

async function loadDirectory() {
  const cached = globalForTickers.__holyStocksTickers

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.listings
  }

  const listings = new Map()

  for (const file of SYMBOL_FILES) {
    const response = await fetch(file.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })

    if (!response.ok) {
      throw new Error(`${file.url} returned ${response.status}`)
    }

    for (const [symbol, name] of parse(await response.text(), file)) {
      listings.set(symbol, name)
    }
  }

  // An empty parse means the format changed under us. Better to report that as
  // unverifiable than to declare every symbol invalid.
  if (listings.size === 0) {
    throw new Error('The symbol directory came back empty.')
  }

  globalForTickers.__holyStocksTickers = { at: Date.now(), listings }

  return listings
}

/*
 * Returns one of:
 *   listed     — a real US-listed symbol, with the security name
 *   unlisted   — the directory loaded and does not contain it
 *   unverified — the directory could not be loaded
 *
 * Callers must let `unverified` through. Blocking every valuation because an
 * exchange file server is down would be a worse failure than the one this
 * guards against.
 */
export async function verifyTicker(input) {
  const symbol = String(input ?? '').trim().toUpperCase()

  if (symbol === '') {
    return { status: 'unlisted', symbol, name: null }
  }

  let listings

  try {
    listings = await loadDirectory()
  } catch (error) {
    return { status: 'unverified', symbol, name: null, error: error.message }
  }

  // Class shares are written BRK.B here and BRK-B by most quote sites, so a
  // symbol typed either way should resolve.
  const candidates = [symbol, symbol.replace(/-/g, '.'), symbol.replace(/\./g, '-')]

  for (const candidate of candidates) {
    if (listings.has(candidate)) {
      return { status: 'listed', symbol: candidate, name: listings.get(candidate) }
    }
  }

  return { status: 'unlisted', symbol, name: null }
}
