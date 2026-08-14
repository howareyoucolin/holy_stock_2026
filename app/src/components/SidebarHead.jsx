import NavLink from './NavLink'

// Brand + navigation, pinned to the top of the sidebar on every page.
export default function SidebarHead() {
  return (
    <div className="sidebar-head">
      <div className="brand">
        <span className="brand-text">
          <strong>Holy Stocks</strong>
          <span>Agent Console</span>
        </span>
      </div>

      <nav className="tabs">
        <NavLink href="/">Ask</NavLink>
        <NavLink href="/learnings">Learnings</NavLink>
      </nav>
    </div>
  )
}
