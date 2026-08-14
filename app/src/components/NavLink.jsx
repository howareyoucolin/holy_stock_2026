'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Marks the active tab with aria-current, which the segmented control styles as
// the one raised pill in the recessed track.
export default function NavLink({ href, children }) {
  const pathname = usePathname()
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <Link href={href} className="tab" aria-current={active ? 'page' : undefined}>
      {children}
    </Link>
  )
}
