'use client'

import { useState } from 'react'
import SettingsDialog from './SettingsDialog'

/*
 * Brand + controls, pinned to the top of the sidebar.
 *
 * In browse mode both are gone. The framed site carries its own wordmark in its
 * own header, so repeating this one beside it would just be the same name twice;
 * the strip keeps its height so the two headers still line up, and the one
 * action available is the text in its body that comes back.
 */
export default function SidebarHead({ mode = 'ask', onBrowse, onAsk, onReloadSite, onSettingsSaved }) {
  const [open, setOpen] = useState(false)
  const browsing = mode === 'browse'

  return (
    <div className="sidebar-head">
      {/* Hidden while browsing: the site in the frame is already showing this
          name in its own header. */}
      {!browsing && (
        <div className="brand">
          <span className="brand-text">
            <strong>HolyStocks</strong>
            <span>Agent Console</span>
          </span>
        </div>
      )}

      {browsing && (
        <div className="head-actions">
          {/* Points the way the sidebar is about to expand. */}
          <button
            type="button"
            className="gear"
            onClick={onAsk}
            aria-label="Back to ask mode"
            title="Back to ask mode"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 12h15M13 5.5 19.5 12 13 18.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {/* Arc with an arrowhead — reloads the framed site. */}
          <button
            type="button"
            className="gear"
            onClick={onReloadSite}
            aria-label="Reload the site"
            title="Reload the site"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M20 12a8 8 0 1 1-2.6-5.9"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M20.4 3.8v4.4H16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}

      {!browsing && (
        <div className="head-actions">
          {/* Browser window with a pane — the published site, viewed inside. */}
          <button
            type="button"
            className="gear"
            onClick={onBrowse}
            aria-label="View the published site"
            title="View the published site"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect
                x="3"
                y="4.5"
                width="18"
                height="15"
                rx="2.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
              />
              <path
                d="M3 9h18M8.5 9v10.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <button
            type="button"
            className="gear"
            onClick={() => setOpen(true)}
            aria-label="Settings"
            title="Settings"
          >
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
        </div>
      )}

      <SettingsDialog open={open} onClose={() => setOpen(false)} onSaved={onSettingsSaved} />
    </div>
  )
}
