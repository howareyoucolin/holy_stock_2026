import AgentIcon from './AgentIcon'

// Occupies an agent's slot while it is still running, so the results column is
// not blank for the minute or two a question takes.
export default function PendingAnswer({ label }) {
  return (
    <article className="answer-card">
      <div className="answer-head">
        <AgentIcon agent={label.toLowerCase()} />
        <h3>{label}</h3>
        <span className="pill pill-run">running</span>
      </div>

      <div className="skeleton-block" aria-label={`Waiting for ${label}`}>
        <span className="skeleton" style={{ width: '92%' }} />
        <span className="skeleton" style={{ width: '78%' }} />
        <span className="skeleton" style={{ width: '85%' }} />
        <span className="skeleton" style={{ width: '54%' }} />
      </div>
    </article>
  )
}
