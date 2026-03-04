'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function NavBar() {
  const pathname = usePathname()
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('wi-theme')
    if (saved === 'light') setTheme('light')
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('wi-theme', next)
    if (next === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }

  // Don't show nav on login page
  if (pathname === '/login') return null

  const isReports = pathname === '/reports' || pathname.startsWith('/reports/')
  const isSettings = pathname === '/settings'

  return (
    <header className="no-print sticky top-0 z-50 border-b border-wi-border bg-wi-surface/80 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/reports" className="text-base font-semibold tracking-tight text-wi-text hover:text-wi-accent transition-colors">
          World Intelligence
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1">
          <Link
            href="/reports"
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              isReports
                ? 'bg-wi-accent/10 text-wi-accent font-medium'
                : 'text-wi-secondary hover:text-wi-text hover:bg-wi-border/30'
            }`}
          >
            Reports
          </Link>
          <Link
            href="/settings"
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              isSettings
                ? 'bg-wi-accent/10 text-wi-accent font-medium'
                : 'text-wi-secondary hover:text-wi-text hover:bg-wi-border/30'
            }`}
          >
            Settings
          </Link>
          <div className="w-px h-5 bg-wi-border mx-2" />
          <button
            onClick={toggleTheme}
            className="p-2 rounded-md text-wi-secondary hover:text-wi-text hover:bg-wi-border/30 transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
        </nav>

        {/* Mobile hamburger */}
        <div className="flex sm:hidden items-center gap-2">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-md text-wi-secondary hover:text-wi-text transition-colors"
          >
            {theme === 'dark' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-md text-wi-secondary hover:text-wi-text transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {mobileOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <line x1="3" y1="12" x2="21" y2="12"/>
                  <line x1="3" y1="18" x2="21" y2="18"/>
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-wi-border bg-wi-surface px-4 py-3 space-y-1">
          <Link
            href="/reports"
            onClick={() => setMobileOpen(false)}
            className={`block px-3 py-2 rounded-md text-sm ${
              isReports ? 'bg-wi-accent/10 text-wi-accent font-medium' : 'text-wi-secondary hover:text-wi-text'
            }`}
          >
            Reports
          </Link>
          <Link
            href="/settings"
            onClick={() => setMobileOpen(false)}
            className={`block px-3 py-2 rounded-md text-sm ${
              isSettings ? 'bg-wi-accent/10 text-wi-accent font-medium' : 'text-wi-secondary hover:text-wi-text'
            }`}
          >
            Settings
          </Link>
        </div>
      )}
    </header>
  )
}
