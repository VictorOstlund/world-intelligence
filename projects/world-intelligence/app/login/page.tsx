'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form = e.currentTarget
    const username = (form.elements.namedItem('username') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (res.ok) {
        router.push('/')
      } else {
        const data = await res.json()
        setError(data.error || 'Login failed')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-wi-surface border border-wi-border rounded-xl p-8">
          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold text-wi-text">World Intelligence</h1>
            <p className="text-xs text-wi-secondary mt-1">Sign in to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-xs font-medium text-wi-secondary mb-1.5">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className="w-full px-3 py-2.5 text-sm border border-wi-border rounded-lg bg-wi-input text-wi-text placeholder:text-wi-secondary focus:outline-none focus:ring-2 focus:ring-wi-accent/40 focus:border-wi-accent transition-colors"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-wi-secondary mb-1.5">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="w-full px-3 py-2.5 text-sm border border-wi-border rounded-lg bg-wi-input text-wi-text placeholder:text-wi-secondary focus:outline-none focus:ring-2 focus:ring-wi-accent/40 focus:border-wi-accent transition-colors"
              />
            </div>
            {error && (
              <div className="p-2.5 text-xs text-wi-danger bg-wi-danger/10 border border-wi-danger/20 rounded-lg">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-medium bg-wi-accent text-white rounded-lg hover:bg-wi-accent/90 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
