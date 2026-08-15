/*
 * Prompt construction for each question type, kept out of agents.js so the CLI
 * plumbing and the wording stay separate concerns.
 */

export const QUESTION_TYPES = ['general', 'valuation']
export const DEFAULT_TYPE = 'general'

// Tickers, optionally with an exchange prefix or class suffix (BRK.B, 7203.T).
export const TICKER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.\-:]{0,14}$/

export function normalizeType(type) {
  return QUESTION_TYPES.includes(type) ? type : DEFAULT_TYPE
}

// Agents are asked as of a date; without it they answer from training data and
// silently treat stale prices as current.
function today() {
  return new Date().toISOString().slice(0, 10)
}

export function describeTask(task) {
  return normalizeType(task?.type) === 'valuation'
    ? `Valuation: ${String(task?.ticker ?? '').toUpperCase()}`
    : String(task?.question ?? '')
}

function valuationPrompt(ticker) {
  return [
    `Today's date is ${today()}. Evaluate the publicly traded stock ${ticker} as of today,`,
    'for an individual investor deciding whether to buy, hold, or sell.',
    '',
    'Use web search for every number. Do not answer from memory: prices, multiples and',
    'quarterly results in your training data are stale. State the date of each figure you',
    'cite, and say plainly when something could not be verified rather than estimating it.',
    '',
    'Cover all of the following, briefly and with numbers:',
    '',
    '1. VERDICT — buy, hold, or sell today, and your confidence (low / medium / high).',
    '2. PRICE NOW — the current price and when you observed it, plus market cap and the',
    '   headline multiples (P/E, forward P/E, EV/EBITDA, P/S as relevant).',
    '3. FAIR VALUE — the price range you consider fair, the range where you would buy,',
    '   and the range where you would sell. Say which method you used (multiples,',
    '   comparables, DCF) and the key inputs.',
    '4. WHY — the two or three strongest reasons for your verdict, each tied to a number',
    '   (growth, margins, free cash flow, balance sheet, competitive position).',
    '5. THE OTHER SIDE — the strongest argument against your own verdict.',
    '6. TARGETS — projected price in 1, 3 and 5 years. For each horizon give a bear, base',
    '   and bull number with rough probabilities, and state the assumptions behind base.',
    '7. CATALYSTS — dated upcoming events that could move it (next earnings date, product',
    '   or regulatory milestones).',
    '8. RISKS — what could break the thesis, most severe first, including any',
    '   sector-wide or macro sensitivity.',
    '9. WHAT WOULD CHANGE MY MIND — the specific, observable things that would flip your',
    '   verdict.',
    '10. SOURCES — where the numbers came from, with dates.',
    '',
    'Be concrete. Round numbers are fine, vagueness is not.',
  ].join('\n')
}

// The text actually sent to each agent in round 1.
export function buildTaskPrompt(task) {
  const type = normalizeType(task?.type)

  if (type === 'valuation') {
    return valuationPrompt(String(task?.ticker ?? '').toUpperCase())
  }

  return String(task?.question ?? '')
}

function transcript(entries) {
  return (entries ?? [])
    .filter((entry) => entry?.status === 'done' && String(entry.answer ?? '').trim() !== '')
    .map((entry) => `--- ${entry.label} ---\n${String(entry.answer).trim()}`)
    .join('\n\n')
}

export function buildReviewPrompt(task, label, answers) {
  const type = normalizeType(task?.type)
  const subject = describeTask(task)

  const common = [
    `You are ${label}, one of several AI agents that independently answered the same task.`,
    '',
    'TASK',
    subject,
    '',
    'CANDIDATE ANSWERS',
    transcript(answers),
    '',
  ]

  if (type === 'valuation') {
    return [
      ...common,
      `Today's date is ${today()}.`,
      '',
      'Review every analysis above, including your own:',
      '- check the figures. Call out any price, multiple or growth rate that looks stale,',
      '  wrong, or unsourced, and give the correct number with its date if you can.',
      '- say where the valuation methods or assumptions differ, and which is better founded.',
      '- flag risks or catalysts the others missed.',
      '',
      'You may change your mind. If another agent made the better case, say so plainly and',
      'give your revised verdict and price range. Do not agree just to agree — where you',
      'still disagree, say so and say why. A genuine split is a more useful result than a',
      'false consensus.',
      '',
      'End with one line: REVISED VERDICT: <buy/hold/sell, price range> — or',
      'REVISED VERDICT: unchanged.',
    ].join('\n')
  }

  return [
    ...common,
    'Review every answer above, including your own. Be specific and brief:',
    '- point out factual errors or unsupported claims, naming the answer',
    '- point out anything important that is missing',
    '- say which answer is strongest overall, and why',
    '',
    'You may change your mind if another answer is better — say so. Do not agree just to',
    'agree; where you still disagree, say why.',
    '',
    'Do not write a replacement answer.',
  ].join('\n')
}

const CASUAL_RULES = [
  'Write it the way you would explain it to a friend, out loud:',
  '- plain everyday words, short sentences, contractions are fine',
  '- no jargon unless it is unavoidable, and then say what it means in a few words',
  '- no hedging, no corporate or academic phrasing, no throat-clearing',
  '- say "you" and give the recommendation straight',
]

export function buildFinalPrompt(task, answers, reviews) {
  const type = normalizeType(task?.type)
  const subject = describeTask(task)

  const head = [
    'Several AI agents worked on the task below independently, then reviewed each',
    "other's work. Write the single definitive result, for a reader who wants to scan it",
    'in a few seconds.',
    '',
    'TASK',
    subject,
    '',
    'CANDIDATE ANSWERS',
    transcript(answers),
    '',
    'PEER REVIEWS',
    transcript(reviews),
    '',
    'Take the reviews into account: correct what was shown to be wrong, keep what they',
    'agreed on, and resolve disagreements on the merits.',
    '',
    ...CASUAL_RULES,
    '',
  ]

  if (type === 'valuation') {
    return [
      ...head,
      `Today's date is ${today()}.`,
      '',
      'Use exactly this format, with no preamble:',
      '',
      'TL;DR: <buy, hold or sell, the current price, and the fair-value range, in two',
      'plain sentences>',
      '',
      'VERDICT',
      '- Call: <buy / hold / sell>, confidence <low / medium / high>',
      '- Price now: <price, and when it was observed>',
      '- Fair value: <range>  |  Buy below: <price>  |  Sell above: <price>',
      '',
      'WHY',
      '- <the strongest reasons, each with a number>',
      '',
      'TARGETS',
      '- 1 year: bear <x> / base <y> / bull <z>',
      '- 3 years: bear <x> / base <y> / bull <z>',
      '- 5 years: bear <x> / base <y> / bull <z>',
      '',
      'RISKS',
      '- <what could break it, worst first>',
      '',
      'WHERE THEY DISAGREED',
      '- <any point the agents did not settle, and who took which side. Omit this whole',
      '  section only if they genuinely agreed on everything.>',
      '',
      'WATCH FOR',
      '- <dated catalysts, and what would change the call>',
      '',
      'Do not add other sections. Numbers must carry a currency and, where they came from',
      'a source, the date.',
    ].join('\n')
  }

  return [
    ...head,
    'Use exactly this format, with no preamble and no mention of this process:',
    '',
    'TL;DR: <the answer in one or two plain sentences, under 40 words>',
    '',
    'KEY POINTS',
    '- <one line each, most important first, under 20 words>',
    '- <three to six of them>',
    '',
    'CAVEATS',
    '- <only real gotchas, or things the agents disagreed about>',
    '',
    'Omit the CAVEATS section entirely if there are none. Do not add other sections.',
  ].join('\n')
}
