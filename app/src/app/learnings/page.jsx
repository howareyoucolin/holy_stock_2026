import Link from 'next/link'
import SidebarHead from '@/components/SidebarHead'
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

  return (
    <>
      <aside className="sidebar">
        <SidebarHead />

        <div className="sidebar-body">
          <p className="lede">
            {error
              ? 'Everything published to the remote database.'
              : `Everything published to the remote database — ${learnings.length} ${
                  learnings.length === 1 ? 'entry' : 'entries'
                }.`}
          </p>

          {error && (
            <p className="banner">
              <strong>Could not reach the database.</strong> {error} Open the tunnel with{' '}
              <code>npm run tunnel</code>, then reload.
            </p>
          )}
        </div>
      </aside>

      <main className="content">
        {error ? null : learnings.length === 0 ? (
          <div className="placeholder">
            <p>Nothing saved yet.</p>
          </div>
        ) : (
          <div className="stack">
            {learnings.map((learning) => (
              <Link key={learning.id} href={`/learnings/${learning.id}`} className="card row">
                <h3 className="row-title">
                  {learning.title}
                  {!learning.is_published && <span className="tag">draft</span>}
                </h3>
                <p className="row-meta">{new Date(learning.created_at).toLocaleString()}</p>
                <p className="row-body">{excerpt(learning.takeaway)}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
