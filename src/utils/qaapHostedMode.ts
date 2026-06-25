/**
 * QAAP cloud IDE integration: when the CLI is spawned as a background agent from
 * Theia/QAAP, honor provider API keys injected by the server and never fall back to
 * Anthropic OAuth or saved local provider profiles.
 */

import { applyProviderFlag, parseModelFlag, parseProviderFlag } from './providerFlag.js'
import {
  readQaapActiveModel,
  readQaapActiveProvider,
  readQaapActiveVendor,
} from './qaapDynamicModel.js'

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

function mapHuggingfaceToOpenAiCompat(): void {
  const hfKey =
    process.env.HUGGINGFACE_API_KEY?.trim() || process.env.HF_TOKEN?.trim()
  if (!hfKey || process.env.OPENAI_API_KEY?.trim()) {
    return
  }
  process.env.HUGGINGFACE_API_KEY = hfKey
  process.env.HF_TOKEN = hfKey
  process.env.OPENAI_API_KEY = hfKey
  process.env.OPENAI_BASE_URL = 'https://router.huggingface.co/v1'
  delete process.env.NVIDIA_NIM
}

function mapNvidiaToOpenAiCompat(): void {
  const nvidiaKey = process.env.NVIDIA_API_KEY?.trim()
  if (!nvidiaKey || process.env.OPENAI_API_KEY?.trim()) {
    return
  }
  process.env.OPENAI_API_KEY = nvidiaKey
  if (!process.env.OPENAI_BASE_URL?.trim()) {
    process.env.OPENAI_BASE_URL = 'https://integrate.api.nvidia.com/v1'
  }
  process.env.NVIDIA_NIM = '1'
}

function inferProviderFromQaapEnv(args: string[]): string | undefined {
  if (parseProviderFlag(args)) {
    return undefined
  }

  const qaapProvider = readQaapActiveProvider()
  const qaapVendor = readQaapActiveVendor()
  if (qaapVendor === 'huggingface') {
    mapHuggingfaceToOpenAiCompat()
    return 'openai'
  }
  if (qaapVendor === 'nvidia') {
    return 'nvidia-nim'
  }
  if (
    qaapProvider === 'openai' ||
    qaapProvider === 'gemini' ||
    qaapProvider === 'ollama' ||
    qaapProvider === 'anthropic' ||
    qaapProvider === 'mistral'
  ) {
    if (qaapProvider === 'openai') {
      mapOpenRouterToOpenAiCompat()
    }
    return qaapProvider
  }

  if (process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()) {
    return 'gemini'
  }
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    mapOpenRouterToOpenAiCompat()
    return 'openai'
  }
  if (process.env.NVIDIA_API_KEY?.trim()) {
    return 'nvidia-nim'
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
  if (readQaapActiveVendor() === 'huggingface') {
    mapHuggingfaceToOpenAiCompat()
  } else {
    mapNvidiaToOpenAiCompat()
  }

  const inferred = inferProviderFromQaapEnv(args)
  if (inferred) {
    const result = applyProviderFlag(inferred, args)
    if (result?.error) {
      return result
    }
  }

  const model = parseModelFlag(args) ?? readQaapActiveModel()
  if (model && isThirdPartyProviderActive()) {
    if (hasTruthyEnv('CLAUDE_CODE_USE_GEMINI')) {
      process.env.GEMINI_MODEL = model
    } else if (hasTruthyEnv('CLAUDE_CODE_USE_MISTRAL')) {
      process.env.MISTRAL_MODEL = model
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
