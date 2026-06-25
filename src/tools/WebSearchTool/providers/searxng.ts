/**
 * SearXNG Search API adapter.
 * GET http://<host>/search?q=...&format=json
 *
 * Self-hosted metasearch engine — aggregates Google, Bing, DuckDuckGo, etc.
 * No API key needed. Unlimited searches. Free.
 *
 * Auto-starts a SearXNG Docker container on localhost:8888 if Docker is
 * available and no SearXNG instance is already running. This makes it
 * work out-of-the-box on both local machines and VPS without any user
 * configuration.
 *
 * Override the URL with SEARXNG_URL env var (e.g. for a remote VPS instance).
 */

import { execSync } from 'child_process'
import type { SearchInput, SearchProvider } from './types.js'
import { applyDomainFilters, safeHostname, type ProviderOutput } from './types.js'

const DEFAULT_SEARXNG_URL = 'http://localhost:8888'
const SEARXNG_CONTAINER_NAME = 'searxng-qaiq'
const SEARXNG_PORT = '8888'

let startupAttempted = false
let startupSucceeded = false

/**
 * Check if a SearXNG instance is already responding at the given URL.
 */
async function isSearXNGRunning(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/healthz`, {
      signal: AbortSignal.timeout(2000),
    })
    return res.ok || res.status === 404
  } catch {
    try {
      const res = await fetch(`${baseUrl}/search?q=test&format=json`, {
        signal: AbortSignal.timeout(2000),
      })
      return res.ok
    } catch {
      return false
    }
  }
}

/**
 * Try to start a SearXNG Docker container if Docker is available.
 * Configures JSON format and restarts the container.
 */
function tryStartSearXNGDocker(): boolean {
  try {
    execSync('docker info >/dev/null 2>&1', { timeout: 5000 })
  } catch {
    return false
  }

  try {
    execSync(
      `docker run -d --name ${SEARXNG_CONTAINER_NAME} -p ${SEARXNG_PORT}:8080 ` +
      `-e SEARXNG_BASE_URL=http://localhost:${SEARXNG_PORT} ` +
      `searxng/searxng >/dev/null 2>&1`,
      { timeout: 60000 },
    )
  } catch {
    try {
      execSync(`docker start ${SEARXNG_CONTAINER_NAME} >/dev/null 2>&1`, { timeout: 5000 })
    } catch {
      return false
    }
  }

  try {
    execSync(
      `docker exec ${SEARXNG_CONTAINER_NAME} sh -c '` +
      'grep -q "json" /etc/searxng/settings.yml 2>/dev/null || ' +
      'printf "\\nsearch:\\n  formats:\\n    - html\\n    - json\\n" >> /etc/searxng/settings.yml' +
      "' >/dev/null 2>&1",
      { timeout: 5000 },
    )
    execSync(`docker restart ${SEARXNG_CONTAINER_NAME} >/dev/null 2>&1`, { timeout: 10000 })
  } catch {
  }

  return true
}

/**
 * Ensure SearXNG is running. Tries auto-start via Docker once per session.
 * If Docker is not available or startup fails, returns false (caller falls
 * through to the next provider in the auto chain).
 */
async function ensureSearXNGRunning(baseUrl: string): Promise<boolean> {
  if (await isSearXNGRunning(baseUrl)) return true
  if (startupAttempted) return startupSucceeded

  startupAttempted = true
  const dockerStarted = tryStartSearXNGDocker()
  if (!dockerStarted) {
    startupSucceeded = false
    return false
  }

  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000))
    if (await isSearXNGRunning(baseUrl)) {
      startupSucceeded = true
      return true
    }
  }

  startupSucceeded = false
  return false
}

export const searxngProvider: SearchProvider = {
  name: 'searxng',

  isConfigured() {
    return true
  },

  async search(input: SearchInput, signal?: AbortSignal): Promise<ProviderOutput> {
    const start = performance.now()
    const baseUrl = process.env.SEARXNG_URL || DEFAULT_SEARXNG_URL

    const running = await ensureSearXNGRunning(baseUrl)
    if (!running) {
      throw new Error(
        'SearXNG is not running and could not be auto-started. ' +
        'Install Docker or set SEARXNG_URL to a running instance.',
      )
    }

    const url = new URL(`${baseUrl}/search`)
    url.searchParams.set('q', input.query)
    url.searchParams.set('format', 'json')
    url.searchParams.set('safesearch', '1')
    url.searchParams.set('categories', 'general')

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
      },
      signal,
    })

    if (!res.ok) {
      throw new Error(`SearXNG search error ${res.status}: ${await res.text().catch(() => '')}`)
    }

    const data = await res.json()
    const hits = (data.results ?? []).map((r: any) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      description: r.content ?? r.snippet,
      source: r.url ? safeHostname(r.url) : undefined,
    }))

    return {
      hits: applyDomainFilters(hits, input),
      providerName: 'searxng',
      durationSeconds: (performance.now() - start) / 1000,
    }
  },
}
