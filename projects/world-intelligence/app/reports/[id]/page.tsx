'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

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
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

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
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    )
  }

  if (notFound || !report) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-500 text-sm mb-4">Report not found.</p>
          <Link href="/reports" className="text-sm underline text-zinc-600 dark:text-zinc-400">Back to Reports</Link>
        </div>
      </div>
    )
  }

  const cats = parseCategories(report.categories)

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
        <Link href="/reports" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          ← Back to Reports
        </Link>
        <nav className="flex gap-4 text-sm">
          <Link href="/reports" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">Reports</Link>
          <Link href="/settings" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">Settings</Link>
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <p className="text-sm text-zinc-500 mb-1">{formatDate(report.created_at)}</p>
          <div className="flex flex-wrap gap-2 text-xs text-zinc-400 mb-3">
            <span>Triage: {report.triage_model}</span>
            <span>·</span>
            <span>Synthesis: {report.synthesis_model}</span>
            <span>·</span>
            <span>Cost: ${report.cost_usd.toFixed(4)}</span>
            <span>·</span>
            <span>{report.item_count} items from {report.source_count} categories</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {cats.map(cat => (
              <span key={cat} className="text-xs px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded">
                {cat}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
            {report.body}
          </pre>
        </div>
      </main>
    </div>
  )
}
