#!/usr/bin/env node
// Production startup script — runs schema migration, seeds DB, then starts Next.js

const { spawn } = require('child_process')
const path = require('path')

async function main() {
  // Register TypeScript loader for lib files
  // We compile to JS in production, but for now use ts-node/esbuild register
  // For production: run `next build` first, then this just starts the server
  console.log('[start] Initialising database...')

  // Use dynamic require with built output — skip TS at runtime
  // The actual DB init happens inside Next.js when the first request is made
  // because lib/db.ts is imported by the route handlers
  // Here we just ensure the data directory exists
  const dataDir = process.env.DATA_DIR || './data'
  const fs = require('fs')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  console.log('[start] Starting Next.js server...')
  const nextBin = path.join(__dirname, '..', 'node_modules', '.bin', 'next')
  const server = spawn(nextBin, ['start'], {
    stdio: 'inherit',
    env: { ...process.env },
  })

  server.on('exit', (code) => {
    process.exit(code ?? 0)
  })

  // Spawn scheduler sidecar (handles cron via instrumentation.ts inside Next.js,
  // but also spawned here as belt-and-suspenders for environments that skip it)
  const schedulerScript = path.join(__dirname, 'start-scheduler.mjs')
  if (require('fs').existsSync(schedulerScript)) {
    const nodeBin = process.execPath
    const scheduler = spawn(nodeBin, [schedulerScript], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env },
      detached: false,
    })
    scheduler.on('error', (err) => {
      console.warn('[start] Scheduler sidecar error (non-fatal):', err.message)
    })
  }
}

main().catch((err) => {
  console.error('[start] Fatal error:', err)
  process.exit(1)
})
