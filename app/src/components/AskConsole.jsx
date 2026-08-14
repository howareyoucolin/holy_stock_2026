'use client'

import { useEffect, useState } from 'react'
import AgentAnswer from './AgentAnswer'
import PublishForm from './PublishForm'

export default function AskConsole() {
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [health, setHealth] = useState(null)

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
        body: JSON.stringify({ question }),
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
      {health && !health.db?.ok && (
        <p className="banner fail">
          Database unreachable: {health.db?.error ?? 'unknown error'}. Open the tunnel with{' '}
          <code>npm run tunnel</code>.
        </p>
      )}

      {missingAgents.length > 0 && (
        <p className="banner fail">
          Missing CLI: {missingAgents.join(', ')}. Set CLAUDE_BIN / CODEX_BIN to the full path.
        </p>
      )}

      <form onSubmit={ask}>
        <label htmlFor="question">Your question</label>
        <textarea
          id="question"
          rows={6}
          value={question}
          maxLength={4000}
          placeholder="e.g. When should a PHP class use a trait instead of inheritance?"
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button type="submit" disabled={asking || question.trim() === ''}>
          {asking ? 'Asking both agents…' : 'Ask AI Agents'}
        </button>
        {asking && <p className="muted">This can take a couple of minutes.</p>}
      </form>

      {error && <p className="banner fail">{error}</p>}

      {result && (
        <>
          <section className="answers">
            <AgentAnswer label="Claude" state={result.claude} />
            <AgentAnswer label="Codex" state={result.codex} />
          </section>

          <PublishForm
            question={result.question}
            claudeAnswer={result.claude?.answer ?? ''}
            codexAnswer={result.codex?.answer ?? ''}
          />
        </>
      )}
    </>
  )
}
