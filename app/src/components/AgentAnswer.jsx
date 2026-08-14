import AgentIcon from './AgentIcon'

export default function AgentAnswer({ id, label, state }) {
  const failed = state?.status === 'error'

  return (
    <article className="answer-card">
      <div className="answer-head">
        <AgentIcon agent={id} />
        <h3>
          {label}
          {state?.modelUsed && <span className="model-tag">{state.modelUsed}</span>}
        </h3>
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
