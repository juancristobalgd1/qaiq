/**
 * Jina Search API adapter.
 * GET https://s.jina.ai/?q=...
 * Auth: Authorization: Bearer <key> (optional — works without key at a lower rate limit)
 */

import type { SearchInput, SearchProvider } from './types.js'
import { applyDomainFilters, safeHostname, type ProviderOutput } from './types.js'

export const jinaProvider: SearchProvider = {
  name: 'jina',

  isConfigured() {
    // Jina s.jina.ai works without an API key (free tier with lower rate limits)
    return true
  },

  async search(input: SearchInput, signal?: AbortSignal): Promise<ProviderOutput> {
    const start = performance.now()

    const url = new URL('https://s.jina.ai/')
    url.searchParams.set('q', input.query)
    url.searchParams.set('count', '10')

    const headers: Record<string, string> = {
      Accept: 'application/json',
    }
    if (process.env.JINA_API_KEY) {
      headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`
    }

    const res = await fetch(url.toString(), {
      headers,
      signal,
    })

    if (!res.ok) {
      throw new Error(`Jina search error ${res.status}: ${await res.text().catch(() => '')}`)
    }

    const data = await res.json()
    const hits = (data.data ?? data.results ?? []).map((r: any) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      description: r.description ?? r.snippet ?? r.content,
      source: r.url ? safeHostname(r.url) : undefined,
    }))

    return {
      hits: applyDomainFilters(hits, input),
      providerName: 'jina',
      durationSeconds: (performance.now() - start) / 1000,
    }
  },
}
