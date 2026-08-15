'use client'

import { useState } from 'react'
import SettingsDialog from './SettingsDialog'

// Brand + settings, pinned to the top of the sidebar. The Ask/Learnings tabs are
// gone: Ask is the only screen left now that the learnings table has been
// retired, so a nav with one destination was just taking up the corner.
export default function SidebarHead({ onSettingsSaved }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="sidebar-head">
      <div className="brand">
        <span className="brand-text">
          <strong>Holy Stocks</strong>
          <span>Agent Console</span>
        </span>
      </div>

      <button
        type="button"
        className="gear"
        onClick={() => setOpen(true)}
        aria-label="Settings"
        title="Settings"
      >
        {/* Hub, rim, and eight teeth that start where the rim ends — with a gap
            between them it reads as a sun rather than a cog. */}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 6.6V3.6M12 17.4v3M6.6 12h-3M17.4 12h3M8.2 8.2 6.1 6.1M15.8 15.8l2.1 2.1M15.8 8.2l2.1-2.1M8.2 15.8l-2.1 2.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <SettingsDialog open={open} onClose={() => setOpen(false)} onSaved={onSettingsSaved} />
    </div>
  )
}
