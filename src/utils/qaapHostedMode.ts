/**
 * QAAP cloud IDE integration: when the CLI is spawned as a background agent from
 * Theia/QAAP, honor provider API keys injected by the server and never fall back to
 * Anthropic OAuth or saved local provider profiles.
 */

import { applyProviderFlag, parseModelFlag, parseProviderFlag } from './providerFlag.js'

export function isQaapHostedMode(): boolean {
  return (
    process.env.QAAP_HOSTED_AGENT === '1' ||
    process.env.QAIQ_QAAP_MODE === '1'
  )
}

function hasTruthyEnv(name: string): boolean {
  const value = process.env[name]?.trim()
  return value === '1' || value === 'true'
}

function isThirdPartyProviderActive(): boolean {
  return (
    hasTruthyEnv('CLAUDE_CODE_USE_OPENAI') ||
    hasTruthyEnv('CLAUDE_CODE_USE_GEMINI') ||
    hasTruthyEnv('CLAUDE_CODE_USE_MISTRAL') ||
    hasTruthyEnv('CLAUDE_CODE_USE_GITHUB') ||
    hasTruthyEnv('CLAUDE_CODE_USE_BEDROCK') ||
    hasTruthyEnv('CLAUDE_CODE_USE_VERTEX') ||
    hasTruthyEnv('CLAUDE_CODE_USE_FOUNDRY')
  )
}

function mapOpenRouterToOpenAiCompat(): void {
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!openRouterKey || process.env.OPENAI_API_KEY?.trim()) {
    return
  }
  process.env.OPENAI_API_KEY = openRouterKey
  if (!process.env.OPENAI_BASE_URL?.trim()) {
    process.env.OPENAI_BASE_URL =
      process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1'
  }
}

function inferProviderFromQaapEnv(args: string[]): string | undefined {
  if (parseProviderFlag(args)) {
    return undefined
  }
  if (process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()) {
    return 'gemini'
  }
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    mapOpenRouterToOpenAiCompat()
    return 'openai'
  }
  if (process.env.OLLAMA_HOST?.trim()) {
    return 'ollama'
  }
  if (process.env.OPENAI_API_KEY?.trim()) {
    return 'openai'
  }
  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    return 'anthropic'
  }
  return undefined
}

function stripAnthropicOAuthFallback(): void {
  if (isThirdPartyProviderActive()) {
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN
  }
}

/**
 * Run before config/profile hydration in cli.tsx. Applies --provider from QAAP env
 * when the parent did not pass one, and blocks Anthropic OAuth when BYOK keys exist.
 */
export function applyQaapHostedModeStartup(args: string[]): { error?: string } | undefined {
  if (!isQaapHostedMode()) {
    return undefined
  }

  mapOpenRouterToOpenAiCompat()

  const inferred = inferProviderFromQaapEnv(args)
  if (inferred) {
    const result = applyProviderFlag(inferred, args)
    if (result?.error) {
      return result
    }
  }

  const model = parseModelFlag(args)
  if (model && isThirdPartyProviderActive()) {
    if (hasTruthyEnv('CLAUDE_CODE_USE_GEMINI')) {
      process.env.GEMINI_MODEL = model
    } else if (hasTruthyEnv('CLAUDE_CODE_USE_OPENAI')) {
      process.env.OPENAI_MODEL = model
    }
  }

  stripAnthropicOAuthFallback()
  return undefined
}

/** Saved ~/.openclaude profiles must not override QAAP-injected provider env. */
export function shouldSkipSavedProviderProfileForQaap(): boolean {
  return isQaapHostedMode()
}
