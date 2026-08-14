// Distinct mark per agent. The previous badge used the first letter of the name,
// which made both agents a literal "C".
const ICONS = {
  // Radiating burst, echoing Claude's mark.
  claude: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.2v17.6M4.4 7.6l15.2 8.8M19.6 7.6L4.4 16.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
    </svg>
  ),
  // Shell prompt, since codex is driven as a CLI.
  codex: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5.5 8l4 4-4 4M12.5 16.2h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
}

export default function AgentIcon({ agent }) {
  return (
    <span className="avatar" data-agent={agent} aria-hidden="true">
      {ICONS[agent] ?? null}
    </span>
  )
}
