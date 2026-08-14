import './globals.css'

export const metadata = {
  title: 'holyStocks — Agent Console',
  description: 'Local console for asking AI agents and publishing takeaways.',
}

// The shell is a fixed two-column frame; each page supplies its own
// <aside className="sidebar"> and <main className="content"> so that the ask
// screen can keep its form and its results in one client component.
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">{children}</div>
      </body>
    </html>
  )
}
