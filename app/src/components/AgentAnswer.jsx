import AgentIcon from './AgentIcon'

export default function AgentAnswer({ label, state }) {
  const failed = state?.status === 'error'

  return (
    <article className="answer-card">
      <div className="answer-head">
        <AgentIcon agent={label.toLowerCase()} />
        <h3>{label}</h3>
        <span className={failed ? 'pill pill-fail' : 'pill pill-ok'}>
          {failed ? 'failed' : 'done'}
        </span>
      </div>

      {failed && state?.error && <p className="fail small">{state.error}</p>}

      {state?.answer ? (
        <pre>{state.answer}</pre>
      ) : (
        !failed && <p className="muted">No output returned.</p>
      )}
    </article>
  )
}
