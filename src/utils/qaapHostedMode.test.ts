import { afterEach, describe, expect, test } from 'bun:test'
import {
  applyQaapHostedModeStartup,
  isQaapHostedMode,
  shouldSkipSavedProviderProfileForQaap,
} from './qaapHostedMode.js'

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('qaapHostedMode', () => {
  test('isQaapHostedMode reads QAAP_HOSTED_AGENT', () => {
    delete process.env.QAIQ_QAAP_MODE
    process.env.QAAP_HOSTED_AGENT = '1'
    expect(isQaapHostedMode()).toBe(true)
  })

  test('applyQaapHostedModeStartup maps OpenRouter to OpenAI provider', () => {
    process.env.QAAP_HOSTED_AGENT = '1'
    process.env.OPENROUTER_API_KEY = 'sk-or-test'
    process.env.OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY

    const result = applyQaapHostedModeStartup([
      '--bare',
      '--print',
      '--model',
      'nvidia/nemotron-3-super-120b-a12b:free',
    ])

    expect(result).toBeUndefined()
    expect(process.env.CLAUDE_CODE_USE_OPENAI).toBe('1')
    expect(process.env.OPENAI_API_KEY).toBe('sk-or-test')
    expect(process.env.OPENAI_MODEL).toBe('nvidia/nemotron-3-super-120b-a12b:free')
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined()
  })

  test('shouldSkipSavedProviderProfileForQaap when hosted', () => {
    process.env.QAAP_HOSTED_AGENT = '1'
    expect(shouldSkipSavedProviderProfileForQaap()).toBe(true)
  })
})
