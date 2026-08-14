import Link from 'next/link'
import './globals.css'

export const metadata = {
  title: 'holyStocks — Agent Console',
  description: 'Local console for asking AI agents and publishing takeaways.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main>
          <header>
            <h1>Agent Console</h1>
            <nav>
              <Link href="/">Ask</Link>
              <Link href="/learnings">Learnings</Link>
            </nav>
          </header>
          {children}
        </main>
      </body>
    </html>
  )
}
