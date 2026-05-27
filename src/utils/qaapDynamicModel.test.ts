import { afterEach, describe, expect, test } from 'bun:test'
import {
  readQaapActiveModel,
  readQaapActiveProvider,
  readQaapActiveVendor,
  readQaapDynamicModelContextWindow,
} from './qaapDynamicModel.js'

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('qaapDynamicModel', () => {
  test('reads QAAP_ACTIVE_* env vars from the server', () => {
    process.env.QAAP_ACTIVE_MODEL = 'meta/llama-3.3-70b-instruct'
    process.env.QAAP_ACTIVE_PROVIDER = 'openai'
    process.env.QAAP_ACTIVE_VENDOR = 'nvidia'
    process.env.QAAP_MODEL_CONTEXT_WINDOW = '128000'

    expect(readQaapActiveModel()).toBe('meta/llama-3.3-70b-instruct')
    expect(readQaapActiveProvider()).toBe('openai')
    expect(readQaapActiveVendor()).toBe('nvidia')
    expect(readQaapDynamicModelContextWindow()).toBe(128_000)
  })

  test('returns undefined for missing or invalid context window', () => {
    delete process.env.QAAP_MODEL_CONTEXT_WINDOW
    expect(readQaapDynamicModelContextWindow()).toBeUndefined()

    process.env.QAAP_MODEL_CONTEXT_WINDOW = 'not-a-number'
    expect(readQaapDynamicModelContextWindow()).toBeUndefined()
  })
})
