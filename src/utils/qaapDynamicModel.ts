/**
 * QAAP cloud IDE injects the active model binding via env when spawning QAIQ as a
 * background agent. Read those values instead of hardcoding provider defaults.
 */

export function readQaapActiveModel(): string | undefined {
  const value = process.env.QAAP_ACTIVE_MODEL?.trim()
  return value || undefined
}

export function readQaapActiveProvider(): string | undefined {
  const value = process.env.QAAP_ACTIVE_PROVIDER?.trim()
  return value || undefined
}

export function readQaapActiveVendor(): string | undefined {
  const value = process.env.QAAP_ACTIVE_VENDOR?.trim()
  return value || undefined
}

export function readQaapDynamicModelContextWindow(): number | undefined {
  const raw = process.env.QAAP_MODEL_CONTEXT_WINDOW?.trim()
  if (!raw) {
    return undefined
  }
  const parsed = parseInt(raw, 10)
  return !Number.isNaN(parsed) && parsed > 0 ? parsed : undefined
}
