/*
 * Prompt construction for each question type, kept out of agents.js so the CLI
 * plumbing and the wording stay separate concerns.
 */

export const QUESTION_TYPES = ['general', 'valuation', 'guideline']
export const DEFAULT_TYPE = 'general'

// Tickers, optionally with an exchange prefix or class suffix (BRK.B, 7203.T).
export const TICKER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.\-:]{0,14}$/

export function normalizeType(type) {
  return QUESTION_TYPES.includes(type) ? type : DEFAULT_TYPE
}

/*
 * How much risk the reader is willing to carry. `default` deliberately adds
 * nothing to any prompt — the agents behave exactly as they did before this
 * existed, so the setting can only ever change an answer by being turned up.
 */
export const RISK_LEVELS = ['default', 'high']
export const DEFAULT_RISK = 'default'

export function normalizeRisk(risk) {
  return RISK_LEVELS.includes(risk) ? risk : DEFAULT_RISK
}

/*
 * Fixed text, chosen by an enum rather than passed through, so nothing a client
 * sends can write instructions of its own into a prompt.
 *
 * Three things it is careful not to say. It does not ask for a less cautious
 * call: that reads as "be more bullish", and would buy optimism rather than
 * better reasoning. It does not lower the bar the thesis has to clear — a wide
 * range of outcomes and a weak business are different things, and only the
 * first is what this setting is about. And it separates the estimate from the
 * decision, or the same stock quietly acquires a higher fair value whenever
 * this is turned up, which is incoherent.
 *
 * It also buys the upside case a hearing, not silence about the downside. An
 * analysis that hides what can go wrong is less useful to someone carrying more
 * risk, not more.
 */
const RISK_CLAUSE = [
  'RISK ALLOWANCE: reasonably high. The reader accepts higher volatility and deeper',
  'drawdowns where the expected return justifies them. Do not mark an opportunity down',
  'merely for being volatile or unconventional; weigh upside, downside and their',
  'probabilities on the merits, and say plainly what would have to go right.',
  '',
  'This does not lower the bar the thesis has to clear. Do not recommend a weak business',
  'because its upside is large: a wide range of outcomes is only worth owning when there',
  'is a credible fundamental path to the good end of it. Say which of the two you are',
  'looking at — an asymmetric bet on a real business, or a lottery ticket — and treat',
  'deteriorating fundamentals, serial dilution and solvency risk as disqualifying, not as',
  'more volatility to tolerate.',
  '',
  'This changes the threshold at which a position is worth taking, and the size worth',
  'taking — not the estimates behind it. Fair value, probabilities and the risks',
  'themselves are unchanged by who is reading. State the downside in full regardless.',
]

function riskLines(task) {
  return normalizeRisk(task?.risk) === 'high' ? ['', ...RISK_CLAUSE, ''] : []
}

// Agents are asked as of a date; without it they answer from training data and
// silently treat stale prices as current.
function today() {
  return new Date().toISOString().slice(0, 10)
}

export function describeTask(task) {
  const type = normalizeType(task?.type)

  if (type === 'valuation') return `Valuation: ${String(task?.ticker ?? '').toUpperCase()}`
  if (type === 'guideline') return `Guideline rule: ${String(task?.ruleName ?? '').trim()}`

  return String(task?.question ?? '')
}

/*
 * Whether a task carries the subject its type needs — a ticker, a rule, or a
 * question. Rounds 2 and 3 take the task back from the client, so each one has
 * to re-check it, and each type keeps its subject in a different field.
 */
export function hasTaskSubject(task) {
  const type = normalizeType(task?.type)

  if (type === 'valuation') return String(task?.ticker ?? '').trim() !== ''
  if (type === 'guideline') {
    return (
      String(task?.ruleName ?? '').trim() !== '' &&
      String(task?.ruleDescription ?? '').trim() !== ''
    )
  }

  return String(task?.question ?? '').trim() !== ''
}

/* ---------- guideline rules ---------- */

export const VOTES = ['approve', 'approve-with-conditions', 'disapprove']

/*
 * Round 1 for a guideline rule: each agent votes on whether it should join the
 * standing rules the agents are given on every future question.
 *
 * The reply format is strict because it is parsed back into columns and JSON —
 * see parseVote(). Anything looser would mean reading a vote out of prose.
 */
function guidelinePrompt(task, history) {
  const name = String(task?.ruleName ?? '').trim()
  const description = String(task?.ruleDescription ?? '').trim()

  return [
    `Today's date is ${today()}.`,
    '',
    'A guideline rule is being proposed. Rules that pass are handed to every agent',
    'as standing guidance on future questions — alongside what they find on the web,',
    'not instead of it — so a rule earns its place by making future answers better,',
    'not by being agreeable.',
    '',
    'PROPOSED RULE',
    `Name: ${name}`,
    'Description:',
    description,
    ...history,
    '',
    'The bar is actionability. A rule has to be something an agent can apply the',
    'same way twice: it names what to do, what to check, or what disqualifies. If two',
    'agents could both follow it faithfully and reach opposite conclusions, it is too',
    'vague to admit, however true it sounds.',
    '',
    'Theory, philosophy and encouragement are not rules. "Be careful about hype" is',
    'not a rule; "treat a metric that appears in the press release but not in the',
    'filing as unverified" is. Disapprove anything that would leave an agent',
    'guessing at what to do differently.',
    '',
    'Judge it on all of: correctness, actionability, whether it applies often enough',
    'to be worth carrying, and whether something already in force implies it. A rule',
    'that would change no answer is not worth adding.',
    '',
    'Reply in exactly this format and nothing else:',
    '',
    'VOTE: approve | approve-with-conditions | disapprove',
    'CONFIDENCE: <a whole number from 0 to 10>',
    'REASONING:',
    '- <one sentence per line, three to six lines>',
    'CONDITIONS:',
    '- <only for approve-with-conditions: each unresolved question, one sentence>',
    '',
    'Omit the CONDITIONS section entirely unless your vote is approve-with-conditions.',
    'Vote approve only if you would apply the rule as written.',
  ].join('\n')
}

/*
 * Earlier rounds on the same rule name, oldest first. Given back to the agents so
 * a re-vote is a reconsideration rather than a fresh start: the point of refining
 * a rule is to answer what was raised last time.
 */
export function voteHistoryLines(rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) return []

  const lines = ['', 'EARLIER ROUNDS ON THIS RULE', '']

  for (const round of rounds) {
    lines.push(`--- ${round.created_at ?? 'earlier'} (average confidence ${round.avg_confidence_level ?? '?'}) ---`)
    lines.push(`Wording then: ${String(round.description ?? '').trim()}`)

    for (const vote of round.votes ?? []) {
      lines.push(`${vote.label ?? vote.id}: ${vote.vote ?? 'unknown'} (confidence ${vote.confidence ?? '?'})`)

      for (const reason of vote.reasoning ?? []) lines.push(`  - ${reason}`)
      for (const condition of vote.conditions ?? []) lines.push(`  ? ${condition}`)
    }

    lines.push('')
  }

  lines.push('Say plainly whether the new wording resolves what was raised, and change')
  lines.push('your vote if it does. Repeating an objection that has been answered is worse')
  lines.push('than changing your mind.')

  return lines
}

/*
 * Pulls a vote back out of an agent's reply. Returns null when there is no
 * recognisable vote, so the caller can report that agent as unparsed rather than
 * silently counting it.
 *
 * A line walker rather than one regex per section: headings have to be matched at
 * the start of a line, or "approve-with-conditions" on the VOTE line is itself
 * read as the start of the CONDITIONS section.
 *
 * `REVISED VOTE` / `REVISED CONFIDENCE` from round 2 parse the same way, so a
 * review that changed someone's mind can be counted.
 */
export function parseVote(text) {
  const sections = { reasoning: [], conditions: [] }
  let vote = null
  let confidence = null
  let current = null

  for (const rawLine of String(text ?? '').split('\n')) {
    const line = rawLine.trim().replace(/^\*+|\*+$/g, '').trim()

    if (line === '') continue

    const voteLine = line.match(
      /^(?:REVISED\s+)?VOTE\s*:\s*\**\s*(approve-with-conditions|approve|disapprove|unchanged)/i,
    )

    if (voteLine) {
      const value = voteLine[1].toLowerCase()

      // "unchanged" is an answer about a previous vote, not a vote in itself.
      if (vote === null && value !== 'unchanged') vote = value
      current = null
      continue
    }

    const confidenceLine = line.match(/^(?:REVISED\s+)?CONFIDENCE\s*:\s*\**\s*(\d{1,2})/i)

    if (confidenceLine) {
      if (confidence === null) confidence = Math.min(10, Math.max(0, Number(confidenceLine[1])))
      current = null
      continue
    }

    if (/^REASONING\s*:?$/i.test(line)) {
      current = 'reasoning'
      continue
    }

    if (/^CONDITIONS\s*:?$/i.test(line)) {
      current = 'conditions'
      continue
    }

    // Any other heading closes the section that was open.
    if (/^[A-Z][A-Z ]{2,}\s*:?$/.test(line)) {
      current = null
      continue
    }

    if (current) {
      sections[current].push(line.replace(/^[-*•]\s*/, '').trim())
    }
  }

  if (vote === null) return null

  return { vote, confidence, reasoning: sections.reasoning, conditions: sections.conditions }
}

function valuationPrompt(ticker, risk) {
  return [
    `Today's date is ${today()}. Evaluate the publicly traded stock ${ticker} as of today,`,
    'for an individual investor deciding whether to buy, hold, or sell.',
    '',
    'Use web search for every number. Do not answer from memory: prices, multiples and',
    'quarterly results in your training data are stale. State the date of each figure you',
    'cite, and say plainly when something could not be verified rather than estimating it.',
    ...risk,
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
  const risk = riskLines(task)

  if (type === 'guideline') {
    // Risk allowance is about holding stocks, not about admitting a rule.
    return guidelinePrompt(task, voteHistoryLines(task?.history))
  }

  if (type === 'valuation') {
    return valuationPrompt(String(task?.ticker ?? '').toUpperCase(), risk)
  }

  return [String(task?.question ?? ''), ...risk].join('\n')
}

/*
 * The TASK block for rounds 2 and 3. A one-line subject is enough for a question
 * or a ticker, but a rule has to be quoted in full — reviewers cannot judge an
 * objection to wording they were never shown.
 */
function taskBrief(task) {
  const lines = [describeTask(task)]

  if (normalizeType(task?.type) === 'guideline') {
    lines.push('', 'THE RULE AS PROPOSED', String(task?.ruleDescription ?? '').trim())
  }

  return lines
}

function transcript(entries) {
  return (entries ?? [])
    .filter((entry) => entry?.status === 'done' && String(entry.answer ?? '').trim() !== '')
    .map((entry) => `--- ${entry.label} ---\n${String(entry.answer).trim()}`)
    .join('\n\n')
}

export function buildReviewPrompt(task, label, answers) {
  const type = normalizeType(task?.type)

  const common = [
    `You are ${label}, one of several AI agents that independently answered the same task.`,
    '',
    'TASK',
    ...taskBrief(task),
    ...riskLines(task),
    '',
    'CANDIDATE ANSWERS',
    transcript(answers),
    '',
  ]

  if (type === 'guideline') {
    return [
      ...common,
      'Every agent has voted on the proposed rule. Read the others:',
      '- name any objection that is answered by the rule as written, and say so.',
      '- name any problem nobody raised.',
      '- say whether a condition someone attached is genuinely blocking, or merely a',
      '  preference dressed as one.',
      '',
      'You may change your vote. Do not change it to agree; change it because an',
      'argument moved you, and say which one.',
      '',
      'End with exactly these two lines:',
      'REVISED VOTE: approve | approve-with-conditions | disapprove | unchanged',
      'REVISED CONFIDENCE: <a whole number from 0 to 10>',
    ].join('\n')
  }

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

  const head = [
    'Several AI agents worked on the task below independently, then reviewed each',
    "other's work. Write the single definitive result, for a reader who wants to scan it",
    'in a few seconds.',
    '',
    'TASK',
    ...taskBrief(task),
    ...riskLines(task),
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

  if (type === 'guideline') {
    return [
      ...head,
      'Use exactly this format, with no preamble:',
      '',
      'TL;DR: <does the rule carry, and what has to happen before it does, in two',
      'plain sentences>',
      '',
      'WHERE THEY AGREED',
      '- <the points every agent accepted>',
      '',
      'UNRESOLVED',
      '- <each condition or objection still standing, and who raised it. Omit this',
      '  section only if there are none.>',
      '',
      'HOW TO FIX IT',
      '- <the specific edit to the wording that would answer each objection above.',
      '  Omit if there is nothing to fix.>',
      '',
      'Do not add other sections, and do not declare a tally — the vote is counted',
      'from the ballots, not from your summary.',
    ].join('\n')
  }

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
