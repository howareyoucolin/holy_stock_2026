'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Writes the takeaway to the remote MySQL, which is what the public PHP site
// reads. Both agent answers are stored alongside it for context.
export default function PublishForm({ question, claudeAnswer, codexAnswer }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [takeaway, setTakeaway] = useState('')
  const [includeAnswers, setIncludeAnswers] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState(null)
  const [error, setError] = useState(null)

  async function publish(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/learnings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          question,
          takeaway,
          claudeAnswer: includeAnswers ? claudeAnswer : '',
          codexAnswer: includeAnswers ? codexAnswer : '',
          isPublished: true,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'Could not save.')
        return
      }

      setSavedId(data.id)
      setTitle('')
      setTakeaway('')
      // The learnings list is force-dynamic, so drop any client cache for it.
      router.refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={publish} className="publish">
      <h2>What we learned</h2>
      <p className="muted">Saved to the remote database and shown on the public site.</p>

      <label htmlFor="title">Title</label>
      <input
        id="title"
        type="text"
        value={title}
        maxLength={255}
        placeholder="Short headline for the public site"
        onChange={(event) => setTitle(event.target.value)}
      />

      <label htmlFor="takeaway">Takeaway</label>
      <textarea
        id="takeaway"
        rows={5}
        value={takeaway}
        placeholder="The conclusion worth keeping, in your own words."
        onChange={(event) => setTakeaway(event.target.value)}
      />

      <label className="checkbox">
        <input
          type="checkbox"
          checked={includeAnswers}
          onChange={(event) => setIncludeAnswers(event.target.checked)}
        />
        Also publish both agent answers
      </label>

      <button type="submit" disabled={saving || title.trim() === '' || takeaway.trim() === ''}>
        {saving ? 'Saving…' : 'Publish to site'}
      </button>

      {error && <p className="fail">{error}</p>}

      {savedId && (
        <p className="ok">
          Published. <Link href={`/learnings/${savedId}`}>View it</Link>.
        </p>
      )}
    </form>
  )
}
