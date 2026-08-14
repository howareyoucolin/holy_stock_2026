import Link from 'next/link'
import { notFound } from 'next/navigation'
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

  if (error) {
    return (
      <>
        <p>
          <Link href="/learnings">&larr; All learnings</Link>
        </p>
        <p className="banner fail">Could not reach the database: {error}</p>
      </>
    )
  }

  if (!learning) {
    notFound()
  }

  return (
    <>
      <p>
        <Link href="/learnings">&larr; All learnings</Link>
      </p>

      <h2>{learning.title}</h2>
      <p className="muted">
        {new Date(learning.created_at).toLocaleString()}
        {!learning.is_published && <span className="tag">draft</span>}
      </p>

      <h3>Question</h3>
      <blockquote>{learning.question}</blockquote>

      <h3>What we learned</h3>
      <p>{learning.takeaway}</p>

      {[
        ['Claude', learning.claude_answer],
        ['Codex', learning.codex_answer],
      ].map(([label, answer]) =>
        answer?.trim() ? (
          <section key={label}>
            <h3>{label} said</h3>
            <pre>{answer}</pre>
          </section>
        ) : null,
      )}
    </>
  )
}
