export default function AgentAnswer({ label, state }) {
  const failed = state?.status === 'error'

  return (
    <article className="answer-card">
      <h3>
        {label} {failed ? <span className="fail">failed</span> : <span className="ok">&#10003;</span>}
      </h3>

      {failed && state?.error && <p className="fail small">{state.error}</p>}

      {state?.answer ? <pre>{state.answer}</pre> : !failed && <p className="muted">No output returned.</p>}
    </article>
  )
}
