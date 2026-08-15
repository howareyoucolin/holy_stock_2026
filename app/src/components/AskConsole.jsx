'use client'

import { useEffect, useState } from 'react'
import AgentAnswer from './AgentAnswer'
import FinalAnswer from './FinalAnswer'
import PendingAnswer from './PendingAnswer'
import SidebarHead from './SidebarHead'

const TYPE_STORAGE_KEY = 'holystocks:type'
const EFFORT_STORAGE_KEY = 'holystocks:effort'

const TYPES = [
  { value: 'general', label: 'General' },
  { value: 'valuation', label: 'Stock valuation' },
]
const DEFAULT_EFFORT = 'medium'

// Mirrors EFFORT_LEVELS in src/lib/agents.js, which the API also validates
// against. Kept as a literal here so the client bundle does not pull in the
// server-only agents module.
const EFFORT_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
  { value: 'max', label: 'Max' },
]

// Returns the stored level only if it is still one we offer, so an old or
// hand-edited value cannot get sent to the API. Guarded because localStorage
// throws in some privacy modes rather than returning null.
function readStoredEffort() {
  try {
    const saved = window.localStorage.getItem(EFFORT_STORAGE_KEY)

    return EFFORT_OPTIONS.some((option) => option.value === saved) ? saved : null
  } catch {
    return null
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error ?? 'The request failed.')
  }

  return data
}

export default function AskConsole() {
  const [type, setType] = useState('general')
  const [question, setQuestion] = useState('')
  const [ticker, setTicker] = useState('')
  const [effort, setEffort] = useState(DEFAULT_EFFORT)
  // idle → asking → reviewing → finalizing → done
  const [phase, setPhase] = useState('idle')
  const [answers, setAnswers] = useState(null)
  const [reviews, setReviews] = useState(null)
  const [skippedReview, setSkippedReview] = useState(null)
  const [final, setFinal] = useState(null)
  const [error, setError] = useState(null)
  const [health, setHealth] = useState(null)

  // Restored after mount rather than in the initial state: reading localStorage
  // during render would disagree with the server-rendered HTML and trip a
  // hydration mismatch.
  useEffect(() => {
    const saved = readStoredEffort()

    if (saved) {
      setEffort(saved)
    }

    try {
      const savedType = window.localStorage.getItem(TYPE_STORAGE_KEY)
      if (TYPES.some((option) => option.value === savedType)) {
        setType(savedType)
      }
    } catch {
      // Storage unavailable; the default type still applies.
    }
  }, [])

  function changeType(value) {
    // Clicking the tab that is already open is a no-op, not a re-select.
    if (value === type) return

    setType(value)

    try {
      window.localStorage.setItem(TYPE_STORAGE_KEY, value)
    } catch {
      // Storage unavailable — the choice still applies for this session.
    }
  }

  function changeEffort(value) {
    setEffort(value)

    try {
      window.localStorage.setItem(EFFORT_STORAGE_KEY, value)
    } catch {
      // Storage unavailable — the selection still applies for this session.
    }
  }

  useEffect(() => {
    fetch('/api/health')
      .then((response) => response.json())
      .then(setHealth)
      .catch(() => setHealth({ db: { ok: false, error: 'Health check failed.' } }))
  }, [])

  /*
   * Three rounds, driven from here rather than server-side, so each one appears
   * as soon as it finishes instead of the whole chain landing at once:
   *   1. every agent answers independently
   *   2. every agent reviews the whole set
   *   3. one agent synthesises the final answer
   */
  async function ask(event) {
    event.preventDefault()

    if (!ready) return

    const task =
      type === 'valuation'
        ? { type, ticker: ticker.trim().toUpperCase() }
        : { type, question: question.trim() }

    setPhase('asking')
    setError(null)
    setAnswers(null)
    setReviews(null)
    setSkippedReview(null)
    setFinal(null)

    try {
      const round1 = await postJson('/api/ask', { ...task, effort })
      setAnswers(round1.results)

      const answered = round1.results.filter(
        (agent) => agent.status === 'done' && agent.answer?.trim() !== '',
      )

      // Cross-review needs at least two answers to compare.
      if (answered.length < 2) {
        setSkippedReview(
          answered.length === 0
            ? 'No agent produced an answer, so there was nothing to review.'
            : 'Only one agent answered, so there was nothing to cross-review.',
        )
        setPhase('done')
        return
      }

      setPhase('reviewing')
      const round2 = await postJson('/api/review', {
        task,
        effort,
        answers: round1.results,
      })
      setReviews(round2.reviews)

      setPhase('finalizing')
      const round3 = await postJson('/api/final', {
        task,
        effort,
        answers: round1.results,
        reviews: round2.reviews,
      })
      setFinal(round3.final)
      setPhase('done')
    } catch (requestError) {
      setError(requestError.message)
      setPhase('done')
    }
  }

  // Roster comes from the .agents file via /api/health, so the pending cards
  // match whatever is actually going to be asked.
  const roster = health?.agents ?? []
  const missing = roster.filter((agent) => !agent.available)
  const unknownAgents = health?.unknown ?? []
  const problems = health?.problems ?? []
  const ignoresEffort = roster.filter((agent) => !agent.supportsEffort)
  const busy = phase === 'asking' || phase === 'reviewing' || phase === 'finalizing'
  const isValuation = type === 'valuation'
  const ready = isValuation ? ticker.trim() !== '' : question.trim() !== ''

  const phaseLabel = {
    asking: `Round 1 of 3 — ${roster.length} agent${roster.length === 1 ? '' : 's'} answering`,
    reviewing: 'Round 2 of 3 — agents cross-reviewing each other',
    finalizing: 'Round 3 of 3 — writing the final answer',
  }[phase]

  return (
    <>
      {/* Left column: navigation plus everything you type. Scrolls on its own. */}
      <aside className="sidebar">
        <SidebarHead />

        <div className="sidebar-body">
          {health && !health.db?.ok && (
            <p className="banner">
              <strong>Database unreachable.</strong> {health.db?.error ?? 'Unknown error.'} Open
              the tunnel with <code>npm run tunnel</code>.
            </p>
          )}

          {missing.length > 0 && (
            <p className="banner">
              <strong>Missing CLI: {missing.map((agent) => agent.id).join(', ')}.</strong> Set{' '}
              {missing.map((agent) => agent.binEnv).join(' / ')} to the full path.
            </p>
          )}

          {problems.length > 0 && (
            <p className="banner">
              <strong>Problem in .agents:</strong> {problems.join('; ')}.
            </p>
          )}

          {health && roster.length === 0 && (
            <p className="banner">
              <strong>No agents enabled.</strong> Add an agent id to the <code>.agents</code>{' '}
              file.
            </p>
          )}

          {unknownAgents.length > 0 && (
            <p className="banner">
              <strong>Unknown agent in .agents: {unknownAgents.join(', ')}.</strong> Supported
              ids are claude, codex and cursor.
            </p>
          )}

          {error && <p className="banner">{error}</p>}

          <form onSubmit={ask} className="card-flat">
            <div className="type-tabs" role="tablist" aria-label="Question type">
              {TYPES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  className="type-tab"
                  aria-selected={type === option.value}
                  disabled={busy}
                  onClick={() => changeType(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="card-head">
              <div className="field-inline">
                <label htmlFor="effort">Effort</label>
                <select
                  id="effort"
                  value={effort}
                  disabled={busy}
                  onChange={(event) => changeEffort(event.target.value)}
                >
                  {EFFORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isValuation ? (
              <>
                <label htmlFor="ticker">Ticker</label>
                <input
                  id="ticker"
                  type="text"
                  value={ticker}
                  maxLength={15}
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="e.g. AAPL"
                  onChange={(event) => setTicker(event.target.value.toUpperCase())}
                />
                <p className="muted">
                  Each agent looks up today&rsquo;s price and fundamentals, then argues a
                  buy/hold/sell with targets and risks.
                </p>
              </>
            ) : (
              <>
                <label htmlFor="question">Your question</label>
                <textarea
                  id="question"
                  rows={8}
                  value={question}
                  maxLength={4000}
                  placeholder="e.g. When should a PHP class use a trait instead of inheritance?"
                  onChange={(event) => setQuestion(event.target.value)}
                />
              </>
            )}

            <button type="submit" disabled={busy || !ready || roster.length === 0}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {busy ? 'Working…' : isValuation ? 'Analyze Stock' : 'Ask AI Agents'}
            </button>

            {ignoresEffort.length > 0 && (
              <p className="muted">
                {ignoresEffort.map((agent) => agent.label).join(', ')} ignore
                {ignoresEffort.length === 1 ? 's' : ''} this — set a model in{' '}
                <code>.agents</code> instead.
              </p>
            )}

            {phaseLabel && <p className="muted">{phaseLabel}</p>}
          </form>
        </div>
      </aside>

      {/* Right column: full-height results panel with its own scrollbar. */}
      <main className="content" aria-live="polite">
        {phase === 'idle' ? (
          <div className="placeholder">
            <p>
              Each agent answers on its own, then they cross-review and one writes the final
              answer.
            </p>
          </div>
        ) : (
          <>
            {/* Final answer first: it is the point of the exercise. */}
            {(final || phase === 'finalizing') && (
              <section>
                <h2 className="section-title">Final answer</h2>
                {final ? (
                  <FinalAnswer
                    agentId={final.id}
                    label={`${final.label} · synthesis`}
                    state={final}
                  />
                ) : (
                  <PendingAnswer id="final" label="Synthesising" />
                )}
              </section>
            )}

            <section>
              <h2 className="section-title">Answers{answers ? ` (${answers.length})` : ''}</h2>
              <div className="answer-stack">
                {answers
                  ? answers.map((agent) => (
                      <AgentAnswer key={agent.id} id={agent.id} label={agent.label} state={agent} />
                    ))
                  : roster.map((agent) => (
                      <PendingAnswer key={agent.id} id={agent.id} label={agent.label} />
                    ))}
              </div>
            </section>

            {isValuation && (
              <p className="muted disclaimer">
                Agent analysis, not financial advice. Prices and figures are whatever the
                agents found on the web just now — check them before acting.
              </p>
            )}

            {skippedReview && <p className="muted">{skippedReview}</p>}

            {(reviews || phase === 'reviewing') && (
              <section>
                <h2 className="section-title">Cross-review</h2>
                <div className="answer-stack">
                  {reviews
                    ? reviews.map((agent) => (
                        <AgentAnswer
                          key={agent.id}
                          id={agent.id}
                          label={`${agent.label} reviews`}
                          state={agent}
                        />
                      ))
                    : roster.map((agent) => (
                        <PendingAnswer
                          key={agent.id}
                          id={agent.id}
                          label={`${agent.label} reviews`}
                        />
                      ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </>
  )
}
