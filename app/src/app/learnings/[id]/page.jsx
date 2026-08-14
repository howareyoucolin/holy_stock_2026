import Link from 'next/link'
import { notFound } from 'next/navigation'
import AgentIcon from '@/components/AgentIcon'
import SidebarHead from '@/components/SidebarHead'
import { getLearning } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function LearningPage({ params }) {
  const { id } = await params
  const numericId = Number(id)

  if (!Number.isInteger(numericId) || numericId < 1) {
    notFound()
  }

  let learning = null
  let error = null

  try {
    learning = await getLearning(numericId)
  } catch (dbError) {
    error = dbError.message
  }

  if (!error && !learning) {
    notFound()
  }

  return (
    <>
      <aside className="sidebar">
        <SidebarHead />

        <div className="sidebar-body">
          <p className="muted">
            <Link href="/learnings">&larr; All learnings</Link>
          </p>

          {error ? (
            <p className="banner">
              <strong>Could not reach the database.</strong> {error}
            </p>
          ) : (
            <article className="card card-flat card-pad">
              <h2 style={{ marginTop: 0 }}>{learning.title}</h2>
              <p className="row-meta">
                {new Date(learning.created_at).toLocaleString()}
                {!learning.is_published && <span className="tag">draft</span>}
              </p>

              <h3>Question</h3>
              <blockquote>{learning.question}</blockquote>

              <h3>What we learned</h3>
              <p style={{ margin: 0 }}>{learning.takeaway}</p>
            </article>
          )}
        </div>
      </aside>

      <main className="content">
        {error ? null : (
          <div className="answer-stack">
            {[
              ['Claude', learning.claude_answer],
              ['Codex', learning.codex_answer],
            ].map(([label, answer]) =>
              answer?.trim() ? (
                <article key={label} className="answer-card">
                  <div className="answer-head">
                    <AgentIcon agent={label.toLowerCase()} />
                    <h3>{label} said</h3>
                  </div>
                  <pre>{answer}</pre>
                </article>
              ) : null,
            )}
          </div>
        )}
      </main>
    </>
  )
}
