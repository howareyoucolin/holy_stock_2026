'use client'

import { useEffect, useRef, useState } from 'react'
import AgentIcon from './AgentIcon'

/*
 * Settings live in `.agents` at the project root, not in the browser: this
 * dialog reads that file through /api/agents and writes the same two options
 * back to it. Editing the file by hand and using this dialog are the same act,
 * so the two can never disagree.
 *
 * Rendered as a native <dialog>, which brings Escape-to-close, the backdrop and
 * focus containment without reimplementing any of it.
 */
export default function SettingsDialog({ open, onClose, onSaved }) {
  const dialogRef = useRef(null)
  const [roster, setRoster] = useState(null)
  const [enabled, setEnabled] = useState({})
  const [finalizer, setFinalizer] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  // showModal() rather than the `open` attribute: only the modal form gets the
  // backdrop and the top layer.
  useEffect(() => {
    const dialog = dialogRef.current

    if (!dialog) return

    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  // Re-read on every open, so a hand-edit to .agents shows up immediately.
  useEffect(() => {
    if (!open) return

    setError(null)

    fetch('/api/agents')
      .then((response) => response.json())
      .then((data) => {
        setRoster(data.agents ?? [])
        setEnabled(Object.fromEntries((data.agents ?? []).map((a) => [a.id, a.enabled])))
        setFinalizer((data.agents ?? []).find((a) => a.isFinalizer)?.id ?? null)
      })
      .catch((loadError) => setError(loadError.message))
  }, [open])

  function toggle(id) {
    setEnabled((previous) => {
      const next = { ...previous, [id]: !previous[id] }

      // Switching off the summariser hands the job to whoever is first in the
      // file, which is worth making explicit rather than letting it happen.
      if (!next[id] && finalizer === id) setFinalizer(null)

      return next
    })
  }

  async function save() {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, finalizer }),
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error ?? 'Could not save.')

      onSaved?.(data)
      onClose()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  const chosen = roster?.filter((agent) => enabled[agent.id]) ?? []

  return (
    <dialog ref={dialogRef} className="settings" onClose={onClose} onCancel={onClose}>
      <div className="settings-head">
        <h2>Settings</h2>
        <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {error && <p className="banner">{error}</p>}

      {roster === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <section className="settings-section">
            <h3>Agents</h3>
            <p className="muted">Which agents answer, cross-review, and get counted.</p>

            <ul className="settings-list">
              {roster.map((agent) => (
                <li key={agent.id} className="settings-row">
                  <AgentIcon agent={agent.id} />
                  <span className="settings-name">
                    {agent.label}
                    {!agent.available && <span className="settings-note">CLI not found</span>}
                    {agent.model && <span className="model-tag">{agent.model}</span>}
                  </span>

                  {/* A checkbox styled as a switch — still a checkbox to the
                      keyboard and to assistive tech. */}
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={Boolean(enabled[agent.id])}
                      onChange={() => toggle(agent.id)}
                    />
                    <span className="switch-track" aria-hidden="true" />
                    <span className="visually-hidden">Enable {agent.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="settings-section">
            <h3>Final summariser</h3>
            <p className="muted">
              Writes the synthesis from every answer and review. Leave it on
              automatic to use the first enabled agent.
            </p>

            <select
              value={finalizer ?? ''}
              onChange={(event) => setFinalizer(event.target.value || null)}
            >
              <option value="">Automatic — first enabled agent</option>
              {chosen.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.label}
                </option>
              ))}
            </select>
          </section>

          <div className="settings-actions">
            <button type="button" onClick={save} disabled={saving}>
              {saving && <span className="spinner" aria-hidden="true" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}
