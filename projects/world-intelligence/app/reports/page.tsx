'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Report {
  id: string
  created_at: number
  summary: string
  categories: string
  cost_usd: number
  triage_model: string
  synthesis_model: string
  item_count: number
  source_count: number
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function parseCategories(raw: string): string[] {
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export default function ReportsPage() {
  const router = useRouter()
  const [reports, setReports] = useState<Report[]>([])
  const [total, setTotal] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const LIMIT = 20

  const fetchReports = useCallback(async (q: string, off: number) => {
    setLoading(true)
    try {
      const url = q
        ? `/api/reports?q=${encodeURIComponent(q)}`
        : `/api/reports?limit=${LIMIT}&offset=${off}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setReports(data.reports || [])
        setTotal(data.total ?? data.reports?.length ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReports(searchQuery, offset)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, offset, fetchReports])

  async function handleRunNow() {
    setRunning(true)
    setRunError(null)
    try {
      const res = await fetch('/api/pipeline/run', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setRunError(data.error || 'Pipeline failed')
      } else {
        setOffset(0)
        await fetchReports('', 0)
      }
    } catch (e) {
      setRunError('Network error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">World Intelligence</h1>
        <nav className="flex gap-4 text-sm">
          <span className="font-medium">Reports</span>
          <Link href="/settings" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">Settings</Link>
        </nav>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <input
            type="search"
            placeholder="Search reports..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setOffset(0) }}
            className="flex-1 px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
          <button
            onClick={handleRunNow}
            disabled={running}
            className="px-4 py-2 text-sm font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50 transition-colors"
          >
            {running ? 'Running...' : 'Run Now'}
          </button>
        </div>

        {runError && (
          <div className="mb-4 p-3 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md">
            {runError}
          </div>
        )}

        {loading ? (
          <p className="text-zinc-500 text-sm">Loading...</p>
        ) : reports.length === 0 ? (
          <p className="text-zinc-500 text-sm">No reports yet. Click &quot;Run Now&quot; to generate the first one.</p>
        ) : (
          <>
            <div className="space-y-3">
              {reports.map(r => {
                const cats = parseCategories(r.categories)
                return (
                  <div
                    key={r.id}
                    onClick={() => router.push(`/reports/${r.id}`)}
                    className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        {formatDate(r.created_at)}
                      </span>
                      <span className="text-xs text-zinc-400 shrink-0">
                        ${r.cost_usd.toFixed(4)} · {r.item_count} items
                      </span>
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-2">{r.summary}</p>
                    <div className="flex flex-wrap gap-1">
                      {cats.slice(0, 6).map(cat => (
                        <span key={cat} className="text-xs px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded">
                          {cat}
                        </span>
                      ))}
                      {cats.length > 6 && (
                        <span className="text-xs px-1.5 py-0.5 text-zinc-400">+{cats.length - 6} more</span>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-zinc-400">
                      Triage: {r.triage_model} · Synthesis: {r.synthesis_model}
                    </div>
                  </div>
                )
              })}
            </div>

            {!searchQuery && total > LIMIT && (
              <div className="flex items-center justify-center gap-4 mt-6 text-sm">
                <button
                  onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
                  disabled={offset === 0}
                  className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Previous
                </button>
                <span className="text-zinc-500">{Math.floor(offset / LIMIT) + 1} / {Math.ceil(total / LIMIT)}</span>
                <button
                  onClick={() => setOffset(o => o + LIMIT)}
                  disabled={offset + LIMIT >= total}
                  className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
