'use client'

import { useEffect, useState } from 'react'
import AgentAnswer from './AgentAnswer'
import PendingAnswer from './PendingAnswer'
import SidebarHead from './SidebarHead'

const AGENTS = ['Claude', 'Codex']

const EFFORT_STORAGE_KEY = 'holystocks:effort'
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

export default function AskConsole() {
  const [question, setQuestion] = useState('')
  const [effort, setEffort] = useState(DEFAULT_EFFORT)
  const [asking, setAsking] = useState(false)
  const [result, setResult] = useState(null)
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
  }, [])

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

  async function ask(event) {
    event.preventDefault()

    if (question.trim() === '') return

    setAsking(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, effort }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'The request failed.')
        return
      }

      setResult(data)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setAsking(false)
    }
  }

  const missingAgents = health?.agents
    ? [!health.agents.claude && 'claude', !health.agents.codex && 'codex'].filter(Boolean)
    : []

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

          {missingAgents.length > 0 && (
            <p className="banner">
              <strong>Missing CLI: {missingAgents.join(', ')}.</strong> Set CLAUDE_BIN /
              CODEX_BIN to the full path.
            </p>
          )}

          {error && <p className="banner">{error}</p>}

          <form onSubmit={ask} className="card-flat">
            <div className="card-head">
              <div className="field-inline">
                <label htmlFor="effort">Effort</label>
                <select
                  id="effort"
                  value={effort}
                  disabled={asking}
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

            <label htmlFor="question">Your question</label>
            <textarea
              id="question"
              rows={8}
              value={question}
              maxLength={4000}
              placeholder="e.g. When should a PHP class use a trait instead of inheritance?"
              onChange={(event) => setQuestion(event.target.value)}
            />

            <button type="submit" disabled={asking || question.trim() === ''}>
              {asking && <span className="spinner" aria-hidden="true" />}
              {asking ? 'Asking both agents…' : 'Ask AI Agents'}
            </button>

            {asking && <p className="muted">Both agents run at once, at {effort} effort.</p>}
          </form>
        </div>
      </aside>

      {/* Right column: full-height results panel with its own scrollbar. Answers
          stack, since the column is too narrow for two side by side. */}
      <main className="content" aria-live="polite">
        {asking ? (
          <div className="answer-stack">
            {AGENTS.map((label) => (
              <PendingAnswer key={label} label={label} />
            ))}
          </div>
        ) : result ? (
          <div className="answer-stack">
            <AgentAnswer label="Claude" state={result.claude} />
            <AgentAnswer label="Codex" state={result.codex} />
          </div>
        ) : (
          <div className="placeholder">
            <p>
              Answers from <strong>Claude</strong> and <strong>Codex</strong> appear here, beside
              your question.
            </p>
          </div>
        )}
      </main>
    </>
  )
}
