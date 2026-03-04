'use client'

import { useState, useEffect, useCallback } from 'react'
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

  async function handleDelete(e: React.MouseEvent, reportId: string) {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this report? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/reports/${reportId}`, { method: 'DELETE' })
      if (res.ok || res.status === 204) {
        setReports(prev => prev.filter(r => r.id !== reportId))
        setTotal(prev => prev - 1)
      }
    } catch {
      // silently fail
    }
  }

  async function handleRunNow() {
    setRunning(true)
    setRunError(null)
    try {
      const res = await fetch('/api/pipeline/run', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setRunError(data.error || 'Report run failed')
      } else {
        setOffset(0)
        await fetchReports('', 0)
      }
    } catch {
      setRunError('Network error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        <div className="relative flex-1 w-full">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-wi-secondary" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="search"
            placeholder="Search reports..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setOffset(0) }}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-wi-border bg-wi-surface text-wi-text text-sm placeholder:text-wi-secondary focus:outline-none focus:ring-2 focus:ring-wi-accent/40 focus:border-wi-accent transition-colors"
          />
        </div>
        <button
          onClick={handleRunNow}
          disabled={running}
          className="px-4 py-2 text-sm font-medium bg-wi-accent text-white rounded-lg hover:bg-wi-accent/90 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {running ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Running...
            </span>
          ) : 'Run Report'}
        </button>
      </div>

      {runError && (
        <div className="mb-4 p-3 text-sm text-wi-danger bg-wi-danger/10 border border-wi-danger/20 rounded-lg">
          {runError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-wi-secondary text-sm">
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            Loading reports...
          </div>
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-wi-surface border border-wi-border flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-wi-secondary">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <p className="text-wi-secondary text-sm mb-1">No reports yet</p>
          <p className="text-wi-secondary/60 text-xs">Click &quot;Run Report&quot; to generate the first one.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reports.map(r => {
              const cats = parseCategories(r.categories)
              return (
                <div
                  key={r.id}
                  onClick={() => router.push(`/reports/${r.id}`)}
                  className="group bg-wi-surface border border-wi-border rounded-xl p-4 cursor-pointer hover:border-wi-accent/40 hover:shadow-lg hover:shadow-wi-accent/5 transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-xs text-wi-secondary">
                      {formatDate(r.created_at)}
                    </span>
                    <button
                      onClick={(e) => handleDelete(e, r.id)}
                      className="opacity-0 group-hover:opacity-100 text-wi-secondary hover:text-wi-danger transition-all p-1 rounded"
                      title="Delete report"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>

                  <p className="text-sm text-wi-text line-clamp-2 mb-3 leading-relaxed">{r.summary}</p>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {cats.slice(0, 3).map(cat => (
                      <span key={cat} className="text-[11px] px-2 py-0.5 bg-wi-accent/10 text-wi-accent rounded-full">
                        {cat}
                      </span>
                    ))}
                    {cats.length > 3 && (
                      <span className="text-[11px] px-2 py-0.5 text-wi-secondary">+{cats.length - 3}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-wi-secondary border-t border-wi-border pt-2">
                    <span className="inline-flex items-center gap-1">
                      <span className="text-wi-success font-medium">${r.cost_usd.toFixed(4)}</span>
                    </span>
                    <span>{r.item_count} items</span>
                  </div>
                </div>
              )
            })}
          </div>

          {!searchQuery && total > LIMIT && (
            <div className="flex items-center justify-center gap-4 mt-8 text-sm">
              <button
                onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
                disabled={offset === 0}
                className="px-4 py-2 border border-wi-border rounded-lg text-wi-secondary hover:text-wi-text hover:bg-wi-surface disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <span className="text-wi-secondary">{Math.floor(offset / LIMIT) + 1} / {Math.ceil(total / LIMIT)}</span>
              <button
                onClick={() => setOffset(o => o + LIMIT)}
                disabled={offset + LIMIT >= total}
                className="px-4 py-2 border border-wi-border rounded-lg text-wi-secondary hover:text-wi-text hover:bg-wi-surface disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </main>
  )
}
