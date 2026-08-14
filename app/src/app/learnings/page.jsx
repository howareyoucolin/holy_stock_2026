import Link from 'next/link'
import { listLearnings } from '@/lib/db'

export const runtime = 'nodejs'
// Always read live rows: this is a local tool looking at production data, so a
// cached list would be actively misleading.
export const dynamic = 'force-dynamic'

function excerpt(text, limit = 220) {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  if (clean.length <= limit) return clean

  const cut = clean.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')

  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`
}

export default async function LearningsPage() {
  let learnings = []
  let error = null

  // Read the database directly from the server component — no API round trip.
  try {
    learnings = await listLearnings()
  } catch (dbError) {
    error = dbError.message
  }

  if (error) {
    return (
      <>
        <h2>Learnings</h2>
        <p className="banner fail">
          Could not reach the database: {error}
        </p>
        <p className="muted">
          Open the tunnel with <code>npm run tunnel</code>, then reload.
        </p>
      </>
    )
  }

  return (
    <>
      <h2>Learnings</h2>

      {learnings.length === 0 ? (
        <p className="muted">Nothing saved yet.</p>
      ) : (
        learnings.map((learning) => (
          <article key={learning.id}>
            <h3>
              <Link href={`/learnings/${learning.id}`}>{learning.title}</Link>
              {!learning.is_published && <span className="tag">draft</span>}
            </h3>
            <p className="muted">{new Date(learning.created_at).toLocaleString()}</p>
            <p>{excerpt(learning.takeaway)}</p>
          </article>
        ))
      )}
    </>
  )
}
