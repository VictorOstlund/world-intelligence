'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Report {
  id: string
  created_at: number
  summary: string
  body: string
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
    month: 'long',
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

export default function ReportPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetch(`/api/reports/${id}`)
      .then(res => {
        if (res.status === 404) {
          setNotFound(true)
          return null
        }
        return res.json()
      })
      .then(data => {
        if (data) setReport(data)
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-wi-secondary text-sm">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          Loading...
        </div>
      </div>
    )
  }

  if (notFound || !report) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-wi-secondary text-sm mb-4">Report not found.</p>
        <Link href="/reports" className="text-sm text-wi-accent hover:underline">Back to Reports</Link>
      </div>
    )
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this report? This cannot be undone.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' })
      if (res.ok || res.status === 204) {
        router.push('/reports')
      }
    } finally {
      setDeleting(false)
    }
  }

  const cats = parseCategories(report.categories)

  return (
    <>
      {/* Sticky action bar */}
      <div className="no-print sticky top-14 z-40 border-b border-wi-border bg-wi-surface/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
          <Link
            href="/reports"
            className="flex items-center gap-1.5 text-sm text-wi-secondary hover:text-wi-text transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Reports
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 text-xs font-medium border border-wi-border rounded-lg text-wi-secondary hover:text-wi-text hover:bg-wi-border/30 transition-colors"
            >
              Download PDF
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-1.5 text-xs font-medium border border-wi-danger/30 text-wi-danger rounded-lg hover:bg-wi-danger/10 transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Metadata bar */}
        <div className="mb-6 pb-6 border-b border-wi-border">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-wi-secondary mb-3">
            <span>{formatDate(report.created_at)}</span>
            <span className="hidden sm:inline">|</span>
            <span className="text-wi-success font-medium">${report.cost_usd.toFixed(4)}</span>
            <span className="hidden sm:inline">|</span>
            <span>{report.item_count} items from {report.source_count} categories</span>
            <span className="hidden sm:inline">|</span>
            <span>Triage: {report.triage_model}</span>
            <span className="hidden sm:inline">|</span>
            <span>Synthesis: {report.synthesis_model}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cats.map(cat => (
              <span key={cat} className="text-[11px] px-2 py-0.5 bg-wi-accent/10 text-wi-accent rounded-full">
                {cat}
              </span>
            ))}
          </div>
        </div>

        {/* Report body */}
        <article className="prose prose-sm max-w-none
          prose-headings:text-wi-text prose-headings:font-semibold
          prose-p:text-wi-text prose-p:leading-relaxed
          prose-a:text-wi-accent prose-a:no-underline hover:prose-a:underline
          prose-strong:text-wi-text
          prose-li:text-wi-text
          prose-code:text-wi-accent prose-code:bg-wi-surface prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
          prose-pre:bg-wi-surface prose-pre:border prose-pre:border-wi-border prose-pre:rounded-lg
          prose-blockquote:border-wi-accent prose-blockquote:text-wi-secondary
          prose-table:text-wi-text
          prose-th:text-wi-text prose-th:border-wi-border
          prose-td:border-wi-border
          prose-hr:border-wi-border
        ">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {report.body}
          </ReactMarkdown>
        </article>
      </main>
    </>
  )
}
