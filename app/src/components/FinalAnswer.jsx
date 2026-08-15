'use client'

import { useEffect, useRef, useState } from 'react'
import AgentIcon from './AgentIcon'

// Bold and inline code are the only inline markup the agents tend to emit.
function inline(text) {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={index}>{part.slice(1, -1)}</code>
      }
      return part
    })
}

/*
 * Parses the shape finalPrompt() asks for: a TL;DR line, then KEY POINTS and an
 * optional CAVEATS list. Returns null when the text does not match, so the
 * caller can fall back to showing it verbatim rather than mangling it.
 */
export function parseFinal(text) {
  const lines = String(text ?? '').split('\n')
  let tldr = ''
  const sections = []
  let current = null
  let inTldr = false

  const push = (item) => {
    if (!current) {
      current = { title: '', items: [] }
      sections.push(current)
    }
    current.items.push(item)
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '') continue

    const tldrMatch = line.match(/^\**\s*TL;?DR\s*:?\**\s*(.*)$/i)
    if (tldrMatch) {
      tldr = tldrMatch[1].replace(/^\*+|\*+$/g, '').trim()
      inTldr = true
      continue
    }

    const bullet = line.match(/^[-*•]\s+(.*)$/)

    // A heading is a markdown heading, or a short all-caps line. Bullets are
    // checked first so an all-caps bullet is never mistaken for one.
    const heading = !bullet && line.match(/^(?:#{1,4}\s*)?\**([^*]{2,44})\**:?$/)
    const headingText = heading?.[1]?.trim()
    const isHeading =
      headingText &&
      (line.startsWith('#') || (headingText === headingText.toUpperCase() && /[A-Z]/.test(headingText)))

    if (isHeading) {
      current = { title: headingText.replace(/:$/, ''), items: [] }
      sections.push(current)
      inTldr = false
      continue
    }

    if (bullet) {
      push(bullet[1].trim())
      inTldr = false
      continue
    }

    // A TL;DR that wrapped onto the next line.
    if (inTldr && tldr !== '') {
      tldr = `${tldr} ${line}`
      continue
    }

    push(line)
  }

  const withItems = sections.filter((section) => section.items.length > 0)

  if (tldr === '' && withItems.length === 0) return null

  return { tldr, sections: withItems }
}

// Headings the agents write, mapped to friendlier labels. KEY POINTS renders
// untitled because it sits directly under the TL;DR.
const SECTION_LABELS = {
  'KEY POINTS': '',
  CAVEATS: 'Worth knowing',
  'WORTH KNOWING': 'Worth knowing',
  GOTCHAS: 'Worth knowing',
  'WHERE THEY DISAGREED': 'Where they disagreed',
  'WATCH FOR': 'Watch for',
}

function sectionLabel(title) {
  const key = title.toUpperCase()

  if (key in SECTION_LABELS) return SECTION_LABELS[key]

  return title.charAt(0) + title.slice(1).toLowerCase()
}

// Sections whose bullets read as warnings rather than findings.
const WARN_SECTIONS = ['CAVEATS', 'WORTH KNOWING', 'GOTCHAS', 'RISKS', 'WHERE THEY DISAGREED']

const COPY_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="9" y="9" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
    <path
      d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-7A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
    />
  </svg>
)

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M5 12.5l4.5 4.5L19 7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export default function FinalAnswer({ agentId, label, state }) {
  const failed = state?.status === 'error'
  const parsed = failed ? null : parseFinal(state?.answer)
  // idle | copied | failed
  const [copyState, setCopyState] = useState('idle')
  const timer = useRef(null)

  // A pending reset must not fire after the card unmounts (a new question
  // replaces this one).
  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    clearTimeout(timer.current)

    try {
      // Copies the text the model wrote, structure and all, so it pastes
      // somewhere else looking the same.
      await navigator.clipboard.writeText(String(state?.answer ?? ''))
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }

    timer.current = setTimeout(() => setCopyState('idle'), 1800)
  }

  return (
    <article className="answer-card final-card">
      <div className="answer-head">
        <AgentIcon agent={agentId} />
        <h3>
          {label}
          {state?.modelUsed && <span className="model-tag">{state.modelUsed}</span>}
        </h3>
        <span className={failed ? 'pill pill-fail' : 'pill pill-ok'}>
          {failed ? 'failed' : 'done'}
        </span>

        {state?.answer && (
          <button
            type="button"
            className="icon-button"
            onClick={copy}
            title={copyState === 'failed' ? 'Could not copy' : 'Copy summary'}
            aria-label={copyState === 'failed' ? 'Could not copy' : 'Copy summary'}
          >
            {copyState === 'copied' ? CHECK_ICON : COPY_ICON}
            <span className="icon-button-text">
              {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Failed' : 'Copy'}
            </span>
          </button>
        )}
      </div>

      {failed && state?.error && <p className="fail small">{state.error}</p>}

      {parsed ? (
        <div className="final-body">
          {parsed.tldr && <p className="tldr">{inline(parsed.tldr)}</p>}

          {parsed.sections.map((section, index) => {
            const label = sectionLabel(section.title)
            const warn = WARN_SECTIONS.includes(section.title.toUpperCase())

            return (
              <div key={index} className="final-section">
                {label && <p className="caveat-title">{label}</p>}
                <ul className={warn ? 'points caveats' : 'points'}>
                  {section.items.map((item, itemIndex) => (
                    <li key={itemIndex}>{inline(item)}</li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      ) : (
        // Model ignored the format — show what it actually said.
        state?.answer && <pre>{state.answer}</pre>
      )}
    </article>
  )
}
