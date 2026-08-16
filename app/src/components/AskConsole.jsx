'use client'

import { useEffect, useRef, useState } from 'react'
import AgentAnswer from './AgentAnswer'
import FinalAnswer from './FinalAnswer'
import PendingAnswer from './PendingAnswer'
import RunLog from './RunLog'
import SidebarHead from './SidebarHead'

const TYPE_STORAGE_KEY = 'holystocks:type'
const EFFORT_STORAGE_KEY = 'holystocks:effort'
const RISK_STORAGE_KEY = 'holystocks:risk'

/*
 * The tabs offered in the console. Guideline-rule voting is hidden for now —
 * only the tab is commented out; the type is still built, sent, prompted for and
 * recorded end to end, so restoring this line brings the whole flow back.
 *
 * Nothing else needs changing to hide it: the tab list, the form fields and the
 * effort floor all key off this array, and the saved-type restore above ignores
 * a stored value that is not in it, so anyone left on the guideline tab lands
 * back on General.
 */
const TYPES = [
  { value: 'general', label: 'General' },
  { value: 'valuation', label: 'Stock valuation' },
  // { value: 'guideline', label: 'Guideline rule' },
]

/*
 * A rule that passes becomes standing guidance on every future question, so it
 * is only worth voting on with the agents actually thinking. The API enforces
 * this too — this half just stops the form being submittable.
 */
const MIN_GUIDELINE_EFFORT = 'high'
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

/*
 * How much risk the reader is carrying. `default` adds nothing to any prompt, so
 * the agents behave exactly as they did before this existed — see RISK_LEVELS in
 * src/lib/prompts.js, which the API validates against.
 */
const RISK_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'high', label: 'Reasonably high' },
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

/*
 * Posts a round and returns its result. The multi-agent rounds answer in NDJSON
 * so each agent can be reported as it settles — `onEvent` gets those, and the
 * closing `result` line is what comes back. Endpoints that still answer in one
 * plain body (validation errors, round 3) fall through unchanged.
 */
async function postRound(url, body, { signal, onEvent } = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const failure = await response.json().catch(() => ({}))

    throw new Error(failure.error ?? 'The request failed.')
  }

  if (!response.headers.get('content-type')?.includes('ndjson')) {
    return response.json()
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result = null

  for (;;) {
    const { value, done } = await reader.read()

    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // A chunk can split a line, so the trailing fragment waits for the next one.
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.trim() === '') continue

      const event = JSON.parse(line)

      if (event.type === 'error') throw new Error(event.error)
      if (event.type === 'result') result = event
      else onEvent?.(event)
    }
  }

  // The stream ended without its closing line: the server died mid-round.
  if (!result) {
    throw new Error('The run ended before a result arrived.')
  }

  return result
}

// Durations in the log read as 2m19s / 47s, not milliseconds.
function formatDuration(ms) {
  const total = Math.round((ms ?? 0) / 1000)

  if (total < 60) return `${total}s`

  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, '0')}s`
}

// One log line for an agent that just settled.
function describeAgent(agent, verb) {
  const took = ` · ${formatDuration(agent.ms)}`
  const retried = agent.attempts > 1 ? ' (retried)' : ''

  if (agent.status === 'aborted') {
    return { text: `${agent.label} stopped`, tone: 'fail' }
  }

  if (agent.status === 'done' && String(agent.answer ?? '').trim() !== '') {
    return { text: `${agent.label} ${verb}${retried}${took}`, tone: 'ok' }
  }

  return {
    text: `${agent.label} failed — ${agent.error ?? 'returned nothing'}${took}`,
    tone: 'fail',
  }
}

export default function AskConsole() {
  const [type, setType] = useState('general')
  const [question, setQuestion] = useState('')
  const [ticker, setTicker] = useState('')
  const [ruleName, setRuleName] = useState('')
  const [ruleDescription, setRuleDescription] = useState('')
  const [effort, setEffort] = useState(DEFAULT_EFFORT)
  const [risk, setRisk] = useState('default')
  // idle → asking → reviewing → finalizing → done, or → stopped from any of them
  const [phase, setPhase] = useState('idle')
  const [answers, setAnswers] = useState(null)
  const [reviews, setReviews] = useState(null)
  const [skippedReview, setSkippedReview] = useState(null)
  const [final, setFinal] = useState(null)
  const [error, setError] = useState(null)
  const [health, setHealth] = useState(null)
  const [log, setLog] = useState([])
  const [elapsed, setElapsed] = useState(0)
  // The task as it was actually run, so switching the tab afterwards cannot
  // change what Publish would save.
  const [ranTask, setRanTask] = useState(null)
  const [published, setPublished] = useState(null)
  // The logged voting round, and the rule once it has been adopted.
  const [round, setRound] = useState(null)
  const [adopted, setAdopted] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const [adopting, setAdopting] = useState(false)
  const [checking, setChecking] = useState(false)
  // Counts resets rather than flagging one, so the effect below fires on every
  // press instead of only the first.
  const [resets, setResets] = useState(0)
  // ask → the agent console. browse → the published site in an iframe, with the
  // sidebar collapsed to a strip.
  const [mode, setMode] = useState('ask')
  /*
   * Bumped by the reload button. The site sends `cache-control: max-age=600`, so
   * pointing the frame at the same URL can quietly serve the copy from ten
   * minutes ago — a changed query string is what guarantees a fresh fetch, and
   * changing `src` is what makes the frame go and get it.
   *
   * 0 means untouched, so the first view uses the bare URL.
   */
  const [frameNonce, setFrameNonce] = useState(0)

  // Refs, not state: the log appenders read these from inside a promise chain
  // that would otherwise close over a stale render.
  const abortRef = useRef(null)
  const startedRef = useRef(0)
  const seqRef = useRef(0)
  const promptRef = useRef(null)
  // Set once the discard warning has been accepted, so moving on does not ask
  // twice — at the button and again at the next question.
  const discardOkRef = useRef(false)

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

      const savedRisk = window.localStorage.getItem(RISK_STORAGE_KEY)
      if (RISK_OPTIONS.some((option) => option.value === savedRisk)) {
        setRisk(savedRisk)
      }
    } catch {
      // Storage unavailable; the defaults still apply.
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

  function changeRisk(value) {
    setRisk(value)

    try {
      window.localStorage.setItem(RISK_STORAGE_KEY, value)
    } catch {
      // Storage unavailable — the selection still applies for this session.
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

  // Also re-run after the settings dialog saves, so enabling or disabling an
  // agent is reflected in the pending cards without a reload.
  function refreshHealth() {
    fetch('/api/health')
      .then((response) => response.json())
      .then(setHealth)
      .catch(() => setHealth({ db: { ok: false, error: 'Health check failed.' } }))
  }

  useEffect(refreshHealth, [])

  // Leaving the page kills the CLIs too — the request's abort signal is what the
  // route handler passes down to spawn().
  useEffect(() => () => abortRef.current?.abort(), [])

  /*
   * The two-column grid is defined on .shell, which is rendered by layout.jsx
   * above this component. Publishing the mode as an attribute lets the CSS
   * collapse the first column without lifting this state into a server
   * component or prop-drilling through the layout.
   */
  useEffect(() => {
    const shell = document.querySelector('.shell')

    shell?.setAttribute('data-mode', mode)

    return () => shell?.removeAttribute('data-mode')
  }, [mode])

  function addLog(text, tone) {
    seqRef.current += 1

    const entry = { id: seqRef.current, at: Date.now() - startedRef.current, text, tone }

    setLog((previous) => [...previous, entry])
  }

  function stop() {
    abortRef.current?.abort()
  }

  // Clearing the log is what brings the form back — see showLog below. The
  // results column is left alone; the next question is what replaces it.
  function reset() {
    if (!confirmDiscard()) return

    setLog([])
    setElapsed(0)
    setError(null)
    setResets((previous) => previous + 1)
  }

  /*
   * Nothing reaches the database unless Publish is pressed, so moving on is the
   * moment an unsaved analysis is lost for good. Returns false if the user backs
   * out. Tab closes are covered separately, by the beforeunload effect.
   */
  function confirmDiscard() {
    if (!unpublished || discardOkRef.current) return true

    const leave = window.confirm(
      `The ${ranTask?.ticker} analysis has not been published. Leave without saving it to the database?`,
    )

    if (leave) {
      discardOkRef.current = true
    }

    return leave
  }

  async function adopt() {
    if (!round || adopting || adopted) return

    setAdopting(true)
    setError(null)

    try {
      const response = await fetch('/api/votes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: round.id }),
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error ?? 'Could not adopt the rule.')

      setAdopted(data)
    } catch (adoptError) {
      setError(`Could not adopt the rule — ${adoptError.message}`)
    } finally {
      setAdopting(false)
    }
  }

  async function publish() {
    if (!canPublish || publishing || published) return

    setPublishing(true)
    setError(null)

    try {
      const saved = await postRound('/api/analyses', {
        ticker: ranTask.ticker,
        effort: ranTask.effort,
        risk: ranTask.risk,
        result: final.answer,
        finalizer: final.id,
        finalizerModel: final.modelUsed,
      })

      setPublished(saved)
    } catch (publishError) {
      setError(`Publish failed — ${publishError.message}`)
    } finally {
      setPublishing(false)
    }
  }

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

    // Asking again is what finally discards the last analysis from the screen.
    if (!confirmDiscard()) return

    const task =
      type === 'valuation'
        ? { type, ticker: ticker.trim().toUpperCase(), risk }
        : type === 'guideline'
          ? {
              type,
              ruleName: ruleName.trim(),
              ruleDescription: ruleDescription.trim(),
              risk,
            }
          : { type, question: question.trim(), risk }

    /*
     * Check the symbol before anything else. /api/ask enforces this too, but
     * doing it here keeps a typo from opening a run log and clearing the last
     * result for a question that is never going to be asked.
     */
    let listing = null

    if (task.type === 'valuation') {
      setChecking(true)
      setError(null)

      try {
        const response = await fetch(`/api/ticker?symbol=${encodeURIComponent(task.ticker)}`)

        listing = await response.json()
      } catch {
        // Unreachable check: fall through and let the run proceed.
        listing = { status: 'unverified' }
      } finally {
        setChecking(false)
      }

      if (listing.status === 'unlisted') {
        setError(
          listing.error ??
            `"${task.ticker}" is not a US-listed symbol. No agents were asked — check the spelling.`,
        )

        return
      }
    }

    const controller = new AbortController()
    abortRef.current = controller

    startedRef.current = Date.now()
    seqRef.current = 0
    discardOkRef.current = false

    setPhase('asking')
    setError(null)
    setAnswers(null)
    setReviews(null)
    setSkippedReview(null)
    setFinal(null)
    setLog([])
    setElapsed(0)
    setRanTask({ ...task, effort })
    setPublished(null)
    setRound(null)
    setAdopted(null)

    const options = { signal: controller.signal }

    try {
      // Name the security first: it confirms the symbol resolved to what the
      // user meant, which a bare ticker in the results does not.
      if (listing?.status === 'listed') {
        addLog(`${listing.symbol} — ${listing.name}`)
      } else if (listing?.status === 'unverified') {
        addLog(`Could not reach the listing directory — asking about ${task.ticker} anyway`)
      }

      addLog(`Round 1 — asking ${roster.length} agent${roster.length === 1 ? '' : 's'}`)

      const round1 = await postRound(
        '/api/ask',
        { ...task, effort },
        {
          ...options,
          // Each agent lands in the log and in the results column the moment it
          // returns, instead of the whole round appearing at once.
          onEvent: (streamed) => {
            const { text, tone } = describeAgent(streamed.agent, 'answered')

            addLog(text, tone)
            setAnswers((previous) => [...(previous ?? []), streamed.agent])
          },
        },
      )

      setAnswers(round1.results)

      const answered = round1.results.filter(
        (agent) => agent.status === 'done' && agent.answer?.trim() !== '',
      )

      // Cross-review needs at least two answers to compare.
      if (answered.length < 2) {
        const why =
          answered.length === 0
            ? 'No agent produced an answer, so there was nothing to review.'
            : 'Only one agent answered, so there was nothing to cross-review.'

        addLog(why, 'fail')
        setSkippedReview(why)
        setPhase('done')
        return
      }

      setPhase('reviewing')
      addLog(`Round 2 — ${answered.length} answers to cross-review`)

      const round2 = await postRound(
        '/api/review',
        { task, effort, answers: round1.results },
        {
          ...options,
          onEvent: (streamed) => {
            const { text, tone } = describeAgent(streamed.agent, 'reviewed')

            addLog(text, tone)
            setReviews((previous) => [...(previous ?? []), streamed.agent])
          },
        },
      )

      setReviews(round2.reviews)

      setPhase('finalizing')
      addLog('Round 3 — writing the final answer')

      const round3 = await postRound(
        '/api/final',
        { task, effort, answers: round1.results, reviews: round2.reviews },
        options,
      )

      setFinal(round3.final)

      // A vote is worth keeping whatever it decided, so the round is logged as
      // soon as it finishes. Adopting the rule is a separate press.
      if (task.type === 'guideline') {
        try {
          const logged = await postRound('/api/votes', {
            ruleName: task.ruleName,
            ruleDescription: task.ruleDescription,
            answers: round1.results,
            reviews: round2.reviews,
          })

          setRound(logged)
          addLog(
            `Vote recorded — ${logged.tally.approve} approve, ${logged.tally['approve-with-conditions']} conditional, ${logged.tally.disapprove} against, average confidence ${logged.avgConfidence}`,
            logged.tally.disapprove > 0 ? 'fail' : 'ok',
          )
        } catch (logError) {
          addLog(`Could not record the vote — ${logError.message}`, 'fail')
        }
      }

      addLog(
        round3.final
          ? describeAgent(round3.final, 'wrote the final answer').text
          : (round3.error ?? 'No final answer.'),
        round3.final?.status === 'done' ? 'ok' : 'fail',
      )
      setPhase('done')
    } catch (requestError) {
      // An abort is the Stop button doing its job, not a failure to report.
      if (controller.signal.aborted) {
        addLog('Stopped.', 'fail')
        setPhase('stopped')
      } else {
        addLog(`Failed — ${requestError.message}`, 'fail')
        setError(requestError.message)
        setPhase('done')
      }
    } finally {
      // The ticker stops with the run, so the clock would otherwise freeze a
      // beat short of the last line it sits above.
      setElapsed(Date.now() - startedRef.current)

      if (abortRef.current === controller) {
        abortRef.current = null
      }
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
  const browsing = mode === 'browse'
  const siteUrl = health?.siteUrl ?? null
  const isValuation = type === 'valuation'
  const isGuideline = type === 'guideline'
  // Effort levels are ordered, so "at least high" is an index comparison.
  const effortAllowsGuideline =
    EFFORT_OPTIONS.findIndex((option) => option.value === effort) >=
    EFFORT_OPTIONS.findIndex((option) => option.value === MIN_GUIDELINE_EFFORT)
  const ready = isValuation
    ? ticker.trim() !== ''
    : isGuideline
      ? ruleName.trim() !== '' && ruleDescription.trim() !== '' && effortAllowsGuideline
      : question.trim() !== ''

  const phaseLabel = {
    asking: `Round 1 of 3 — ${roster.length} agent${roster.length === 1 ? '' : 's'} answering`,
    reviewing: 'Round 2 of 3 — agents cross-reviewing each other',
    finalizing: 'Round 3 of 3 — writing the final answer',
  }[phase]

  /*
   * Only a finished valuation can be published: stock_analyses is keyed by
   * ticker, and a general question has none. `ranTask` rather than `type`, so
   * switching the tab after a run cannot change what would be saved.
   */
  const hasAnalysis =
    ranTask?.type === 'valuation' &&
    final?.status === 'done' &&
    String(final.answer ?? '').trim() !== ''
  const canPublish = hasAnalysis && !busy
  const unpublished = canPublish && !published

  // Closing the tab or reloading is the one exit the app cannot intercept in
  // code, so it goes through the browser's own warning.
  useEffect(() => {
    if (!unpublished) return undefined

    const warn = (event) => {
      event.preventDefault()
      // Legacy browsers still need returnValue set; the text is theirs, not ours.
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', warn)

    return () => window.removeEventListener('beforeunload', warn)
  }, [unpublished])

  // A clock that keeps moving between agents, so a slow round still looks alive.
  // Started here rather than in ask() so it stops with the run either way.
  useEffect(() => {
    if (!busy) return undefined

    const timer = setInterval(() => setElapsed(Date.now() - startedRef.current), 1000)

    return () => clearInterval(timer)
  }, [busy])

  /*
   * The log takes the form's place from submission until it is dismissed: while
   * the run is in flight nothing on the form can be changed anyway, and once it
   * finishes the log is the account of what just happened. Asking again clears
   * it, which is the only thing that brings the form back.
   */
  const showLog = busy || log.length > 0

  // Focus follows the form back, so the next question can be typed straight
  // away. Skipped on first mount, where nothing was dismissed.
  useEffect(() => {
    if (resets > 0) {
      promptRef.current?.focus()
    }
  }, [resets])

  // Answers and reviews arrive one agent at a time, so the column pairs each
  // roster slot with its result and leaves a skeleton where one is still out.
  function renderRound(entries, running, label) {
    const byId = new Map((entries ?? []).map((entry) => [entry.id, entry]))

    return roster.map((agent) => {
      const state = byId.get(agent.id)

      if (state) {
        return (
          <AgentAnswer key={agent.id} id={agent.id} label={label(agent.label)} state={state} />
        )
      }

      // Not back yet — but only still coming if that round is the live one.
      return running ? (
        <PendingAnswer key={agent.id} id={agent.id} label={label(agent.label)} />
      ) : null
    })
  }

  return (
    <>
      {/* Left column: navigation plus everything you type. Scrolls on its own. */}
      <aside className="sidebar">
        <SidebarHead
          mode={mode}
          onBrowse={() => setMode('browse')}
          onAsk={() => setMode('ask')}
          onReloadSite={() => setFrameNonce(Date.now())}
          onSettingsSaved={refreshHealth}
        />

        <div className="sidebar-body">
          {browsing ? (
            // The run keeps going while you read the site, so the log comes
            // along. Stop is still on it; asking again is not, since that needs
            // the form back.
            log.length > 0 ? (
              <RunLog
                entries={log}
                elapsed={elapsed}
                phaseLabel={phaseLabel}
                status={busy ? 'running' : phase === 'stopped' ? 'stopped' : 'done'}
                onStop={stop}
              />
            ) : (
              <p className="no-log">No log yet. Ask a question and its progress shows up here.</p>
            )
          ) : (
          <>
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

          {showLog && (
            <RunLog
              entries={log}
              elapsed={elapsed}
              phaseLabel={phaseLabel}
              status={busy ? 'running' : phase === 'stopped' ? 'stopped' : 'done'}
              onStop={stop}
              onReset={reset}
            />
          )}

          {/* Hidden for as long as the log is up. What was typed survives the
              round trip: the inputs are controlled, so the state outlives the
              unmount. */}
          {!showLog && (
          <form onSubmit={ask} className="card-flat">
            <div className="type-tabs" role="tablist" aria-label="Question type">
              {TYPES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  className="type-tab"
                  aria-selected={type === option.value}
                  onClick={() => changeType(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="card-head">
              <div className="field-pair">
                <div className="field-inline">
                  <label htmlFor="risk">Risk</label>
                  <select
                    id="risk"
                    value={risk}
                    onChange={(event) => changeRisk(event.target.value)}
                  >
                    {RISK_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field-inline">
                  <label htmlFor="effort">Effort</label>
                  <select
                    id="effort"
                    value={effort}
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
            </div>

            {isGuideline ? (
              <>
                {!effortAllowsGuideline && (
                  <p className="alert-warning" role="alert">
                    <strong>Voting needs {MIN_GUIDELINE_EFFORT} effort or above.</strong> A rule
                    that passes becomes standing guidance on every future question, so it is
                    worth the agents thinking properly about it. Raise the effort to vote.
                  </p>
                )}

                <label htmlFor="rule-name">Rule name</label>
                <input
                  id="rule-name"
                  ref={promptRef}
                  type="text"
                  value={ruleName}
                  maxLength={120}
                  disabled={!effortAllowsGuideline}
                  spellCheck={false}
                  placeholder="e.g. Unverified metrics"
                  onChange={(event) => setRuleName(event.target.value)}
                />

                <label htmlFor="rule-description">Rule</label>
                <textarea
                  id="rule-description"
                  rows={8}
                  value={ruleDescription}
                  maxLength={8000}
                  disabled={!effortAllowsGuideline}
                  placeholder="Treat a metric that appears in the press release but not in the filing as unverified, and say so."
                  onChange={(event) => setRuleDescription(event.target.value)}
                />

                <p className="muted">
                  Each agent votes approve, approve with conditions, or disapprove, with its
                  reasoning and a confidence score. Voting the same rule name again shows the
                  agents what they said last time.
                </p>
              </>
            ) : isValuation ? (
              <>
                <label htmlFor="ticker">Ticker</label>
                <input
                  id="ticker"
                  ref={promptRef}
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
                  ref={promptRef}
                  rows={8}
                  value={question}
                  maxLength={4000}
                  placeholder="e.g. When should a PHP class use a trait instead of inheritance?"
                  onChange={(event) => setQuestion(event.target.value)}
                />
              </>
            )}

            <button type="submit" disabled={!ready || roster.length === 0 || checking}>
              {checking && <span className="spinner" aria-hidden="true" />}
              {checking
                ? 'Checking symbol…'
                : isGuideline
                  ? 'Put it to a vote'
                  : isValuation
                    ? 'Analyze Stock'
                    : 'Ask AI Agents'}
            </button>

            {ignoresEffort.length > 0 && (
              <p className="muted">
                {ignoresEffort.map((agent) => agent.label).join(', ')} ignore
                {ignoresEffort.length === 1 ? 's' : ''} this — set a model in{' '}
                <code>.agents</code> instead.
              </p>
            )}
          </form>
          )}
          </>
          )}
        </div>
      </aside>

      {/* Right column: the published site while browsing, otherwise the results
          panel with its own scrollbar. */}
      {browsing ? (
        <main className="content content-browse">
          {siteUrl ? (
            <iframe
              className="site-frame"
              // Keyed as well as re-sourced: React would otherwise reuse the
              // element and some browsers treat that as a history entry rather
              // than a load.
              key={frameNonce}
              src={frameNonce ? `${siteUrl}?t=${frameNonce}` : siteUrl}
              title="The published HolyStocks site"
              // Same-origin is deliberately withheld: the frame is another site
              // and has no business reaching into this one.
              sandbox="allow-scripts allow-popups allow-forms"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="placeholder">
              <p>No published site is configured. Set PUBLISH_ENDPOINT in .env.</p>
            </div>
          )}
        </main>
      ) : (
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
            {/* Nothing is written to the database until this is pressed. */}
            {round && (
              <div className="content-head">
                <button
                  type="button"
                  className={adopted ? 'publish-button is-published' : 'publish-button'}
                  onClick={adopt}
                  disabled={adopting || Boolean(adopted)}
                  title="Add this rule to the standing guidance every agent is given"
                >
                  {adopted
                    ? `Adopted · rule #${adopted.ruleId}`
                    : adopting
                      ? 'Adopting…'
                      : 'Adopt this rule'}
                </button>
              </div>
            )}

            {hasAnalysis && (
              <div className="content-head">
                <button
                  type="button"
                  className={published ? 'publish-button is-published' : 'publish-button'}
                  onClick={publish}
                  disabled={!canPublish || publishing || Boolean(published)}
                >
                  {published
                    ? `Published · #${published.id}`
                    : publishing
                      ? 'Publishing…'
                      : 'Publish'}
                </button>
              </div>
            )}

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
              <h2 className="section-title">
                Answers{answers ? ` (${answers.length}/${roster.length})` : ''}
              </h2>
              <div className="answer-stack">
                {renderRound(answers, phase === 'asking', (label) => label)}
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
                  {renderRound(reviews, phase === 'reviewing', (label) => `${label} reviews`)}
                </div>
              </section>
            )}
          </>
        )}
      </main>
      )}
    </>
  )
}
