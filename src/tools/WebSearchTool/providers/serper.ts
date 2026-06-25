/**
 * Serper.dev Search API adapter.
 * POST https://google.serper.dev/search
 * Auth: X-API-KEY: <key>
 *
 * Free tier: 2,500 searches, no credit card required.
 * Uses Google's index under the hood.
 */

import type { SearchInput, SearchProvider } from './types.js'
import { applyDomainFilters, safeHostname, type ProviderOutput } from './types.js'

export const serperProvider: SearchProvider = {
  name: 'serper',

  isConfigured() {
    return Boolean(process.env.SERPER_API_KEY)
  },

  async search(input: SearchInput, signal?: AbortSignal): Promise<ProviderOutput> {
    const start = performance.now()

    const body: Record<string, any> = {
      q: input.query,
      num: 15,
    }

    if (input.allowed_domains?.length) body.includeDomains = input.allowed_domains
    if (input.blocked_domains?.length) body.excludeDomains = input.blocked_domains

    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.SERPER_API_KEY!,
      },
      body: JSON.stringify(body),
      signal,
    })

    if (!res.ok) {
      throw new Error(`Serper search error ${res.status}: ${await res.text().catch(() => '')}`)
    }

    const data = await res.json()
    const hits = (data.organic ?? []).map((r: any) => ({
      title: r.title ?? '',
      url: r.link ?? '',
      description: r.snippet ?? r.description,
      source: r.link ? safeHostname(r.link) : undefined,
    }))

    return {
      hits: applyDomainFilters(hits, input),
      providerName: 'serper',
      durationSeconds: (performance.now() - start) / 1000,
    }
  },
}
