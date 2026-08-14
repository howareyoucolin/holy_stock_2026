import AskConsole from '@/components/AskConsole'

export const dynamic = 'force-dynamic'

export default function AskPage() {
  return (
    <>
      <p className="muted">
        Ask Claude and Codex the same question, then publish the takeaway straight to the
        remote database. The public PHP site reads the same rows.
      </p>
      <AskConsole />
    </>
  )
}
