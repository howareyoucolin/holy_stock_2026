'use client'

import { useEffect, useRef } from 'react'

// mm:ss, counting from the moment the question was submitted. Elapsed rather
// than wall-clock time: what matters here is how long this has been going.
function clock(ms) {
  const total = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(total / 60)

  return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/*
 * Takes the sidebar's place while a question is running. The rounds are slow
 * enough — up to 10 minutes with a retry — that a spinner alone gives no way to
 * tell a working run from a stuck one, so each agent is reported as it lands,
 * against a clock that keeps moving in between.
 */
const PILL = {
  running: 'pill pill-run',
  done: 'pill pill-ok',
  stopped: 'pill pill-fail',
}

export default function RunLog({ entries, elapsed, phaseLabel, status, onStop, onReset }) {
  const listRef = useRef(null)
  const running = status === 'running'

  // Newest line stays in view; the panel is short and a long run overflows it.
  useEffect(() => {
    const list = listRef.current

    if (list) {
      list.scrollTop = list.scrollHeight
    }
  }, [entries.length])

  return (
    <section className="run-log" aria-label="Run log">
      <div className="run-log-head">
        <span className={PILL[status]}>{status}</span>
        <span className="run-clock">{clock(elapsed)}</span>
      </div>

      {phaseLabel && <p className="run-phase">{phaseLabel}</p>}

      {/* aria-live: the whole point is progress you can follow without looking. */}
      <ol className="run-lines" ref={listRef} aria-live="polite">
        {entries.map((entry) => (
          <li key={entry.id} className={entry.tone ? `run-line run-${entry.tone}` : 'run-line'}>
            <span className="run-at">{clock(entry.at)}</span>
            <span className="run-text">{entry.text}</span>
          </li>
        ))}
      </ol>

      {/* The log stays put once the run ends — it is the record of what just
          happened — so asking again is a deliberate step that clears it. */}
      {running ? (
        <button type="button" className="run-stop" onClick={onStop}>
          Stop
        </button>
      ) : (
        // Asking again belongs to the ask screen, so browse mode omits it and
        // shows the log alone.
        onReset && (
          <button type="button" className="run-again" onClick={onReset}>
            Ask another question
          </button>
        )
      )}
    </section>
  )
}
