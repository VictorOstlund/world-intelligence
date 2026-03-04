#!/usr/bin/env tsx
/**
 * Provision Neon — Sets DATABASE_URL on Vercel and triggers a production redeploy.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." tsx scripts/provision-neon.ts
 *
 * Requires:
 *   - VERCEL_TOKEN env var (API token)
 *   - DATABASE_URL env var or --url argument (Neon connection string)
 *
 * Reads .vercel/project.json for projectId and orgId.
 */

import fs from 'fs'
import path from 'path'

const VERCEL_API = 'https://api.vercel.com'

interface VercelProject {
  projectId: string
  orgId: string
}

function loadVercelProject(): VercelProject {
  const projectPath = path.resolve(__dirname, '..', '.vercel', 'project.json')
  const raw = fs.readFileSync(projectPath, 'utf8')
  const parsed = JSON.parse(raw)
  if (!parsed.projectId || !parsed.orgId) {
    throw new Error('.vercel/project.json missing projectId or orgId')
  }
  return { projectId: parsed.projectId, orgId: parsed.orgId }
}

async function vercelFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = process.env.VERCEL_TOKEN
  if (!token) throw new Error('VERCEL_TOKEN env var is required')

  const url = `${VERCEL_API}${endpoint}`
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  return res
}

async function setEnvVar(
  projectId: string,
  teamId: string,
  key: string,
  value: string
): Promise<void> {
  // First try to check if the env var already exists
  const listRes = await vercelFetch(
    `/v9/projects/${projectId}/env?teamId=${teamId}`
  )
  if (!listRes.ok) {
    throw new Error(`Failed to list env vars: ${listRes.status} ${await listRes.text()}`)
  }
  const listData = await listRes.json() as { envs: Array<{ id: string; key: string }> }
  const existing = listData.envs.find((e: { key: string }) => e.key === key)

  if (existing) {
    // Update existing env var
    const res = await vercelFetch(
      `/v9/projects/${projectId}/env/${existing.id}?teamId=${teamId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ value }),
      }
    )
    if (!res.ok) {
      throw new Error(`Failed to update env var ${key}: ${res.status} ${await res.text()}`)
    }
    console.log(`[provision-neon] Updated ${key} on Vercel (env id: ${existing.id})`)
  } else {
    // Create new env var for production
    const res = await vercelFetch(
      `/v9/projects/${projectId}/env?teamId=${teamId}`,
      {
        method: 'POST',
        body: JSON.stringify({
          key,
          value,
          type: 'encrypted',
          target: ['production', 'preview'],
        }),
      }
    )
    if (!res.ok) {
      throw new Error(`Failed to create env var ${key}: ${res.status} ${await res.text()}`)
    }
    console.log(`[provision-neon] Created ${key} on Vercel for production+preview`)
  }
}

async function triggerRedeploy(projectId: string, teamId: string): Promise<string> {
  const res = await vercelFetch(`/v13/deployments?teamId=${teamId}`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'world-intelligence',
      project: projectId,
      target: 'production',
      gitSource: {
        type: 'github',
        repoId: projectId, // fallback — Vercel uses last deployment source
      },
    }),
  })

  // If gitSource fails, try without it (redeploy from last deployment)
  if (!res.ok) {
    // Try listing last deployment and redeploying it
    const listRes = await vercelFetch(
      `/v6/deployments?projectId=${projectId}&teamId=${teamId}&limit=1&target=production`
    )
    if (!listRes.ok) {
      throw new Error(`Failed to list deployments: ${listRes.status} ${await listRes.text()}`)
    }
    const listData = await listRes.json() as { deployments: Array<{ uid: string }> }
    if (!listData.deployments?.length) {
      throw new Error('No previous deployments found to redeploy')
    }

    const lastDeployId = listData.deployments[0].uid
    const redeployRes = await vercelFetch(
      `/v13/deployments?teamId=${teamId}&forceNew=1`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'world-intelligence',
          deploymentId: lastDeployId,
          target: 'production',
        }),
      }
    )
    if (!redeployRes.ok) {
      throw new Error(`Failed to redeploy: ${redeployRes.status} ${await redeployRes.text()}`)
    }
    const redeployData = await redeployRes.json() as { id: string; url: string }
    return redeployData.url || redeployData.id
  }

  const data = await res.json() as { id: string; url: string }
  return data.url || data.id
}

export async function provision(databaseUrl?: string): Promise<{ envSet: boolean; redeployUrl: string }> {
  const url = databaseUrl || process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is required (pass as argument or set env var)')
  }

  const { projectId, orgId } = loadVercelProject()
  console.log(`[provision-neon] Project: ${projectId}, Team: ${orgId}`)

  // Set DATABASE_URL env var
  await setEnvVar(projectId, orgId, 'DATABASE_URL', url)

  // Trigger production redeploy
  console.log('[provision-neon] Triggering production redeploy...')
  const redeployUrl = await triggerRedeploy(projectId, orgId)
  console.log(`[provision-neon] Redeploy triggered: ${redeployUrl}`)

  return { envSet: true, redeployUrl }
}

// CLI entry point
if (require.main === module || process.argv[1]?.endsWith('provision-neon.ts')) {
  const urlArg = process.argv.find(a => a.startsWith('--url='))?.split('=').slice(1).join('=')
  provision(urlArg)
    .then(result => {
      console.log(`[provision-neon] Done — env set: ${result.envSet}, deploy: ${result.redeployUrl}`)
      process.exit(0)
    })
    .catch(err => {
      console.error('[provision-neon] Failed:', err instanceof Error ? err.message : err)
      process.exit(1)
    })
}
