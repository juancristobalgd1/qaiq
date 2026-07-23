/**
 * QAIQ startup screen — block-text logo revealed by an animated light sweep,
 * followed by a cascading provider-info panel.
 * Called once at CLI startup before the Ink UI renders.
 *
 * Set QAIQ_NO_SPLASH_ANIMATION=1 (or TERM=dumb) to print the splash statically.
 */

import { isLocalProviderUrl, resolveProviderRequest } from '../services/api/providerConfig.js'
import {
  getRouteLabel,
  isMiniMaxBaseUrl,
  resolveRouteIdFromBaseUrl,
} from '../integrations/routeMetadata.js'
import { getLocalOpenAICompatibleProviderLabel } from '../utils/providerDiscovery.js'
import { getSettings_DEPRECATED } from '../utils/settings/settings.js'
import { parseUserSpecifiedModel } from '../utils/model/model.js'
import { DEFAULT_GEMINI_MODEL } from '../utils/providerProfile.js'
import { getGlobalConfig } from '../utils/config.js'
import { ANSI_DIM, ANSI_RESET, ansiRgb } from '../utils/terminalAnsi.js'
import {
  resolveLogoPalette,
  type RGB,
} from './StartupScreen.palettes.js'

declare const MACRO: { VERSION: string; DISPLAY_VERSION?: string }

const RESET = ANSI_RESET
const DIM = ANSI_DIM

function lerp(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

function gradAt(stops: readonly RGB[], t: number): RGB {
  const c = Math.max(0, Math.min(1, t))
  const s = c * (stops.length - 1)
  const i = Math.floor(s)
  if (i >= stops.length - 1) return stops[stops.length - 1]
  return lerp(stops[i], stops[i + 1], s - i)
}

export function paintLine(text: string, stops: readonly RGB[], lineT: number): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const t = text.length > 1 ? lineT * 0.5 + (i / (text.length - 1)) * 0.5 : lineT
    const [r, g, b] = gradAt(stops, t)
    out += `${ansiRgb(r, g, b)}${text[i]}`
  }
  return out + RESET
}

// ─── Filled Block Text Logo ───────────────────────────────────────────────────

const LOGO_QAIQ: readonly string[] = (() => {
  const Q = [
    ' \u2588\u2588\u2588\u2588\u2588\u2588\u2557 ',
    '\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557',
    '\u2588\u2588\u2551   \u2588\u2588\u2551',
    '\u2588\u2588\u2551\u2584\u2584 \u2588\u2588\u2551',
    '\u255a\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d',
    ' \u255a\u2550\u2550\u2580\u2580\u2550\u255d ',
  ]
  const A = [
    ' \u2588\u2588\u2588\u2588\u2588\u2557 ',
    '\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557',
    '\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551',
    '\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551',
    '\u2588\u2588\u2551  \u2588\u2588\u2551',
    '\u255a\u2550\u255d  \u255a\u2550\u255d',
  ]
  const I = [
    '\u2588\u2588\u2557',
    '\u2588\u2588\u2551',
    '\u2588\u2588\u2551',
    '\u2588\u2588\u2551',
    '\u2588\u2588\u2551',
    '\u255a\u2550\u255d',
  ]
  return Q.map((_, row) => `  ${Q[row]}  ${A[row]}  ${I[row]}  ${Q[row]}`)
})()

// ─── Provider detection ───────────────────────────────────────────────────────

export function detectProvider(modelOverride?: string): { name: string; model: string; baseUrl: string; isLocal: boolean } {
  const useGemini = process.env.CLAUDE_CODE_USE_GEMINI === '1' || process.env.CLAUDE_CODE_USE_GEMINI === 'true'
  const useGithub = process.env.CLAUDE_CODE_USE_GITHUB === '1' || process.env.CLAUDE_CODE_USE_GITHUB === 'true'
  const useOpenAI = process.env.CLAUDE_CODE_USE_OPENAI === '1' || process.env.CLAUDE_CODE_USE_OPENAI === 'true'
  const useMistral = process.env.CLAUDE_CODE_USE_MISTRAL === '1' || process.env.CLAUDE_CODE_USE_MISTRAL === 'true'

  if (useGemini) {
    const model = modelOverride || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
    const baseUrl = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai'
    return { name: 'Google Gemini', model, baseUrl, isLocal: false }
  }

  if (useMistral) {
    const model = modelOverride || process.env.MISTRAL_MODEL || 'devstral-latest'
    const baseUrl = process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1'
    return { name: 'Mistral', model, baseUrl, isLocal: false }
  }

  if (useGithub) {
    const model = modelOverride || process.env.OPENAI_MODEL || 'github:copilot'
    const baseUrl =
      process.env.OPENAI_BASE_URL || 'https://api.githubcopilot.com'
    return { name: 'GitHub Copilot', model, baseUrl, isLocal: false }
  }

  if (useOpenAI) {
    const rawModel = modelOverride || process.env.OPENAI_MODEL || 'gpt-4o'
    const resolvedRequest = resolveProviderRequest({
      model: rawModel,
      baseUrl: process.env.OPENAI_BASE_URL,
    })
    const baseUrl = resolvedRequest.baseUrl
    const isLocal = isLocalProviderUrl(baseUrl)
    const routeId = resolveRouteIdFromBaseUrl(baseUrl)
    let name = 'OpenAI'
    // Explicit dedicated-provider env flags win.
    if (process.env.NVIDIA_NIM) name = 'NVIDIA NIM'
    else if (process.env.MINIMAX_API_KEY) name = 'MiniMax'
    else if (
      resolvedRequest.transport === 'codex_responses' ||
      baseUrl.includes('chatgpt.com/backend-api/codex')
    )
      name = 'Codex'
    // Base URL is authoritative — must precede rawModel checks so aggregators
    // (OpenRouter/Together/Groq) aren't mislabelled as DeepSeek/Kimi/etc.
    // when routed to models whose IDs contain a vendor prefix. See issue #855.
    else if (/openrouter/i.test(baseUrl)) name = 'OpenRouter'
    else if (/together/i.test(baseUrl)) name = 'Together AI'
    else if (/groq/i.test(baseUrl)) name = 'Groq'
    else if (/azure/i.test(baseUrl)) name = 'Azure OpenAI'
    else if (/nvidia/i.test(baseUrl)) name = 'NVIDIA NIM'
    else if (/minimax/i.test(baseUrl)) name = 'MiniMax'
    else if (/api\.kimi\.com/i.test(baseUrl)) name = 'Moonshot AI - Kimi Code'
    else if (routeId && routeId !== 'openai' && routeId !== 'custom')
      name = getRouteLabel(routeId) ?? name
    else if (/moonshot/i.test(baseUrl)) name = 'Moonshot AI - API'
    else if (/deepseek/i.test(baseUrl)) name = 'DeepSeek'
    else if (/mistral/i.test(baseUrl)) name = 'Mistral'
    // rawModel fallback — fires only when base URL is generic/custom.
    else if (/nvidia/i.test(rawModel)) name = 'NVIDIA NIM'
    else if (/minimax/i.test(rawModel)) name = 'MiniMax'
    else if (/\bkimi-for-coding\b/i.test(rawModel))
      name = 'Moonshot AI - Kimi Code'
    else if (/\bkimi-k/i.test(rawModel) || /moonshot/i.test(rawModel))
      name = 'Moonshot AI - API'
    else if (/deepseek/i.test(rawModel)) name = 'DeepSeek'
    else if (/mistral/i.test(rawModel)) name = 'Mistral'
    else if (/llama/i.test(rawModel)) name = 'Meta Llama'
    else if (/bankr/i.test(baseUrl)) name = 'Bankr'
    else if (/bankr/i.test(rawModel)) name = 'Bankr'
    else if (isLocal) name = getLocalOpenAICompatibleProviderLabel(baseUrl)
    
    // Resolve model alias to actual model name + reasoning effort
    let displayModel = resolvedRequest.resolvedModel
    if (resolvedRequest.reasoning?.effort) {
      displayModel = `${displayModel} (${resolvedRequest.reasoning.effort})`
    }
    
    return { name, model: displayModel, baseUrl, isLocal }
  }

  // Default: Anthropic - check settings.model first, then env vars
  const settings = getSettings_DEPRECATED() || {}
  const modelSetting = modelOverride || process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || settings.model || 'claude-sonnet-4-6'
  const resolvedModel = parseUserSpecifiedModel(modelSetting)
  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'
  const isLocal = isLocalProviderUrl(baseUrl)
  const name = isMiniMaxBaseUrl(baseUrl) ? 'MiniMax' : 'Anthropic'
  return { name, model: resolvedModel, baseUrl, isLocal }
}

// ─── Box drawing ──────────────────────────────────────────────────────────────

function boxRow(content: string, width: number, rawLen: number, border: RGB): string {
  const pad = Math.max(0, width - 2 - rawLen)
  return `${ansiRgb(...border)}\u2502${RESET}${content}${' '.repeat(pad)}${ansiRgb(...border)}\u2502${RESET}`
}

// ─── Light-sweep animation ────────────────────────────────────────────────────

const SWEEP_FRAME_COUNT = 18
const SWEEP_FRAME_MS = 32
const SWEEP_EDGE = 7
/** Columns of extra delay per logo row — tilts the sweep into a diagonal. */
const SWEEP_ROW_SKEW = 2
const CASCADE_LINE_MS = 22

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

/**
 * Paint one logo line mid-sweep: settled gradient behind the reveal edge,
 * a white-hot glow at the leading edge, and blanks ahead of it.
 */
export function paintSweepLine(
  text: string,
  stops: readonly RGB[],
  lineT: number,
  revealEnd: number,
): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    if (i > revealEnd || text[i] === ' ') {
      out += ' '
      continue
    }
    const t = text.length > 1 ? lineT * 0.5 + (i / (text.length - 1)) * 0.5 : lineT
    let [r, g, b] = gradAt(stops, t)
    const dist = revealEnd - i
    if (dist < SWEEP_EDGE) {
      const glow = (1 - dist / SWEEP_EDGE) * 0.85
      ;[r, g, b] = lerp([r, g, b], [255, 255, 255], glow)
    }
    out += `${ansiRgb(r, g, b)}${text[i]}`
  }
  return out + RESET
}

function shouldAnimateSplash(): boolean {
  if (process.env.QAIQ_NO_SPLASH_ANIMATION) return false
  if (process.env.TERM === 'dumb') return false
  return true
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function paintLogoLines(stops: readonly RGB[]): string[] {
  const total = LOGO_QAIQ.length
  return LOGO_QAIQ.map((line, i) =>
    paintLine(line, stops, total > 1 ? i / (total - 1) : 0),
  )
}

/** Everything below the logo: tagline, provider panel, version footer. */
function buildTailLines(
  palette: ReturnType<typeof resolveLogoPalette>,
  p: ReturnType<typeof detectProvider>,
): string[] {
  const ACCENT = palette.accent
  const CREAM = palette.cream
  const DIMCOL = palette.dim
  const BORDER = palette.border
  const W = 62
  const out: string[] = []

  out.push('')

  // Tagline
  out.push(`  ${ansiRgb(...ACCENT)}\u2726${RESET} ${ansiRgb(...CREAM)}Any model. Every tool. Zero limits.${RESET} ${ansiRgb(...ACCENT)}\u2726${RESET}`)
  out.push('')

  // Provider info box
  out.push(`${ansiRgb(...BORDER)}\u2554${'\u2550'.repeat(W - 2)}\u2557${RESET}`)

  const lbl = (k: string, v: string, c: RGB = CREAM): [string, number] => {
    const padK = k.padEnd(9)
    return [` ${DIM}${ansiRgb(...DIMCOL)}${padK}${RESET} ${ansiRgb(...c)}${v}${RESET}`, ` ${padK} ${v}`.length]
  }

  const provC: RGB = p.isLocal ? [130, 175, 130] : ACCENT
  let [r, l] = lbl('Provider', p.name, provC)
  out.push(boxRow(r, W, l, BORDER))
  ;[r, l] = lbl('Model', p.model)
  out.push(boxRow(r, W, l, BORDER))
  const ep = p.baseUrl.length > 38 ? p.baseUrl.slice(0, 35) + '...' : p.baseUrl
  ;[r, l] = lbl('Endpoint', ep)
  out.push(boxRow(r, W, l, BORDER))

  out.push(`${ansiRgb(...BORDER)}\u2560${'\u2550'.repeat(W - 2)}\u2563${RESET}`)

  const sC: RGB = p.isLocal ? [130, 175, 130] : ACCENT
  const sL = p.isLocal ? 'local' : 'cloud'
  const sRow = ` ${ansiRgb(...sC)}\u25cf${RESET} ${DIM}${ansiRgb(...DIMCOL)}${sL}${RESET}    ${DIM}${ansiRgb(...DIMCOL)}Ready \u2014 type ${RESET}${ansiRgb(...ACCENT)}/help${RESET}${DIM}${ansiRgb(...DIMCOL)} to begin${RESET}`
  const sLen = ` \u25cf ${sL}    Ready \u2014 type /help to begin`.length
  out.push(boxRow(sRow, W, sLen, BORDER))

  out.push(`${ansiRgb(...BORDER)}\u255a${'\u2550'.repeat(W - 2)}\u255d${RESET}`)
  out.push(`  ${DIM}${ansiRgb(...DIMCOL)}qaiq ${RESET}${ansiRgb(...ACCENT)}v${MACRO.DISPLAY_VERSION ?? MACRO.VERSION}${RESET}`)
  out.push('')

  return out
}

export async function printStartupScreen(modelOverride?: string): Promise<void> {
  // Skip in non-interactive / CI / print mode
  if (process.env.CI || !process.stdout.isTTY) return

  const palette = resolveLogoPalette(getGlobalConfig().logoColor)
  const p = detectProvider(modelOverride)
  const logoLines = paintLogoLines(palette.gradient)
  const tailLines = buildTailLines(palette, p)

  if (!shouldAnimateSplash()) {
    process.stdout.write(['', ...logoLines, ...tailLines].join('\n') + '\n')
    return
  }

  const write = (s: string) => process.stdout.write(s)
  const rows = LOGO_QAIQ.length
  const maxLen = Math.max(...LOGO_QAIQ.map(l => l.length))
  const sweepSpan = maxLen + SWEEP_EDGE + SWEEP_ROW_SKEW * (rows - 1)

  write('\x1b[?25l') // hide cursor during the animation
  try {
    write('\n')

    // Phase 1 — diagonal light sweep reveals the logo left to right.
    for (let f = 0; f < SWEEP_FRAME_COUNT; f++) {
      const head = easeOutCubic((f + 1) / SWEEP_FRAME_COUNT) * sweepSpan
      const frame = LOGO_QAIQ.map((line, row) => {
        const lineT = rows > 1 ? row / (rows - 1) : 0
        const revealEnd = Math.floor(head - SWEEP_ROW_SKEW * row)
        return paintSweepLine(line, palette.gradient, lineT, revealEnd)
      })
      write(frame.join('\n') + '\n')
      await sleep(SWEEP_FRAME_MS)
      write(`\x1b[${rows}A\r`) // rewind to repaint the logo block
    }

    // Settle on the resting gradient (identical to the static render).
    write(logoLines.join('\n') + '\n')

    // Phase 2 — cascade the tagline, provider panel, and footer.
    for (const line of tailLines) {
      write(line + '\n')
      await sleep(CASCADE_LINE_MS)
    }
  } finally {
    write('\x1b[?25h') // restore cursor
  }
}
