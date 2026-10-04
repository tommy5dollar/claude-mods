/**
 * The pure half of effort-router: the levels, the classifier prompt, the
 * transcript trimming, parsing the classifier's reply, the /route grammar and
 * the text the mod shows. No `$`, no engine: `bun test` runs it directly.
 *
 * Policy source: Anthropic, "Using Claude Code: Spending your effort",
 * Thariq Shihipar, 2026-09-25 (https://claude.dev/blog/spending-your-effort/).
 */

export type Level = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export const LEVELS: readonly Level[] = ['low', 'medium', 'high', 'xhigh', 'max']

export const isLevel = (value: unknown): value is Level =>
  typeof value === 'string' && (LEVELS as readonly string[]).includes(value)

export const rank = (level: Level): number => LEVELS.indexOf(level)

// --- the classifier prompt -----------------------------------------------------

/**
 * The fixed frame around the routing rules. The rules themselves (the
 * article's policy) live in `rules/default.md` and the user's markdown files;
 * this frame holds what the parser depends on, so no rules file can break it:
 * the job, the "wait until the task is clear" bias, and the JSON contract.
 */
export const CLASSIFIER_FRAME = `You pick the reasoning-effort level for a whole Claude Code session, once, from the start of its transcript. Levels, lowest to highest: low, medium, high, xhigh, max.

Decide only when the session's actual task is clear. Opening filler (greetings, "pull the latest code", "what's in this repo?", setup chatter, a warm-up command) is NOT the task: answer undecided. When unsure, answer undecided; you will be asked again after the next user message.

Apply these routing rules. Later rules override earlier ones where they conflict:`

export const CLASSIFIER_CONTRACT = `Reply with exactly one JSON object and nothing else:
{"decision":"undecided"}
or
{"decision":"lock","level":"<low|medium|high|xhigh|max>","reason":"<what the task is, 3-8 words, e.g. bug fix in existing code>"}`

/** The classifier's whole system prompt around the composed rules. */
export const classifierSystem = (rules: string): string =>
  `${CLASSIFIER_FRAME}\n\n<rules>\n${rules.trim()}\n</rules>\n\n${CLASSIFIER_CONTRACT}`

// --- rule files and their composition ---------------------------------------------

/** The line that splices in the layer beneath (shipped defaults, then the user's). */
export const DEFAULTS_MARKER = '$defaults'

export type RuleLayer = {
  /** Where it came from, for `/route rules` (a path or `defaults`). */
  source: string
  /** The file's text; undefined when the file is absent or unreadable. */
  text: string | undefined
}

export type ComposedRules = {
  text: string
  /** Each layer that contributed, bottom first, and how. */
  contributors: { source: string; how: 'base' | 'spliced' | 'replaced' }[]
}

const stripComments = (text: string): string => text.replace(/<!--[\s\S]*?-->/g, '')

/**
 * Composes rule layers bottom-up. The first layer is the base (the shipped
 * defaults). Each later layer that exists and has content either splices the
 * result so far wherever it has a line that is exactly `$defaults`, or, with
 * no such line, replaces it. An absent, unreadable or empty layer changes
 * nothing. HTML comments are dropped (the starter file's example lives in one).
 */
export function composeRules(layers: readonly RuleLayer[]): ComposedRules {
  let text = ''
  const contributors: ComposedRules['contributors'] = []

  layers.forEach((layer, index) => {
    if (layer.text === undefined) return
    const body = stripComments(layer.text)
    if (index === 0) {
      text = body.trim()
      contributors.push({ source: layer.source, how: 'base' })
      return
    }
    const lines = body.split(/\r?\n/)
    const hasMarker = lines.some(line => line.trim() === DEFAULTS_MARKER)
    const meaningful = lines.some(line => line.trim() !== '' && line.trim() !== DEFAULTS_MARKER)
    if (!meaningful && !hasMarker) return // empty file: nothing to say
    if (!meaningful && hasMarker) return // only `$defaults`: identity
    text = hasMarker
      ? lines.map(line => (line.trim() === DEFAULTS_MARKER ? text : line)).join('\n').trim()
      : body.trim()
    contributors.push({ source: layer.source, how: hasMarker ? 'spliced' : 'replaced' })
  })

  return { text, contributors }
}

/** What `/route rules init` writes: the defaults kept, an example commented out. */
export const STARTER_RULES = (scope: 'user' | 'project'): string => `${DEFAULTS_MARKER}

<!--
effort-router rules (${scope}). The line "${DEFAULTS_MARKER}" above pulls in the rules beneath this
file (the shipped defaults${scope === 'project' ? ', then your personal file' : ''}). Text after it is added on top;
later rules win. Delete the "${DEFAULTS_MARKER}" line to replace the rules beneath entirely.
Edits apply at the next classification, no reload needed. Run /route rules to see the result.

Example (move it out of this comment to use it):

${scope === 'project'
  ? '- This is a payments codebase. Never pick below high: money movement needs verification.'
  : '- I usually give a detailed spec up front, so ordinary feature work is low, not medium.'}
-->
`

/** The prompt for `/route rules critique`. */
export const critiquePrompt = (defaults: string, composed: ComposedRules): string =>
  `Below are the shipped default rules for a classifier that picks a Claude Code session's reasoning effort (low, medium, high, xhigh, max), and the effective rules after the user's customisation (${composed.contributors.map(c => `${c.source}: ${c.how}`).join('; ')}).

Critique the user's customisation in at most 8 short bullet points: rules that are ambiguous, contradict each other or the defaults, would push most sessions to one level, or that a small classifier model would likely misapply. Suggest concrete rewordings. If nothing was customised, say so in one line.

<defaults>
${defaults.trim()}
</defaults>

<effective>
${composed.text}
</effective>`

// --- transcript trimming ---------------------------------------------------------

/** The shape `$.session.messages()` returns, as far as trimming needs it. */
export type TranscriptMessage = {
  role: 'user' | 'assistant'
  text: string
  toolUses?: readonly { tool: string }[]
  toolResults?: readonly unknown[]
}

export type TrimLimits = {
  /** Cap per human prompt; human prompts are kept whole up to this. */
  userChars: number
  /** Cap per assistant message's text. */
  assistantChars: number
  /** Cap on the whole rendered transcript; the middle is dropped first. */
  totalChars: number
}

export const DEFAULT_TRIM: TrimLimits = { userChars: 4000, assistantChars: 300, totalChars: 16000 }

const COMMAND_MESSAGE = /^\s*<(command-name|command-message|local-command-stdout|local-command-stderr)>/

const cut = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)}… [${text.length - max} more chars]`

/** Tool names with repeat counts, in first-use order: `Read×3, Edit, Bash`. */
export function toolNames(uses: readonly { tool: string }[] | undefined): string {
  if (!uses || uses.length === 0) return ''
  const counts = new Map<string, number>()
  for (const use of uses) counts.set(use.tool, (counts.get(use.tool) ?? 0) + 1)
  return [...counts].map(([tool, n]) => (n > 1 ? `${tool}×${n}` : tool)).join(', ')
}

/**
 * Renders the transcript for the classifier: human prompts in full (capped),
 * assistant text truncated, tool uses as names only, tool results and slash
 * command echoes dropped. `current` is the prompt being submitted, which
 * `$.session.messages()` does not hold yet at `prompt.submit`.
 *
 * When over `totalChars`, the first human prompt and the most recent lines
 * are kept and the middle is replaced by a marker.
 */
export function trimTranscript(
  messages: readonly TranscriptMessage[],
  current?: string,
  limits: TrimLimits = DEFAULT_TRIM,
): string {
  const lines: string[] = []

  for (const message of messages) {
    const text = (message.text ?? '').trim()
    if (message.role === 'user') {
      if (text === '' || COMMAND_MESSAGE.test(text)) continue // tool results, /commands
      lines.push(`USER: ${cut(text, limits.userChars)}`)
    } else {
      const tools = toolNames(message.toolUses)
      const said = text === '' ? '' : cut(text.replace(/\s+/g, ' '), limits.assistantChars)
      if (said === '' && tools === '') continue
      lines.push(`ASSISTANT: ${said}${said && tools ? ' ' : ''}${tools ? `[tools: ${tools}]` : ''}`)
    }
  }

  const now = (current ?? '').trim()
  if (now !== '' && !COMMAND_MESSAGE.test(now)) lines.push(`USER: ${cut(now, limits.userChars)}`)

  const total = (xs: string[]) => xs.reduce((n, x) => n + x.length + 1, 0)
  if (total(lines) <= limits.totalChars) return lines.join('\n')

  const firstUser = lines.findIndex(line => line.startsWith('USER: '))
  const head = firstUser >= 0 ? [lines[firstUser] as string] : []
  const tail: string[] = []
  for (let i = lines.length - 1; i > Math.max(firstUser, -1); i--) {
    const line = lines[i] as string
    if (total([...head, ...tail, line]) + 40 > limits.totalChars) break
    tail.unshift(line)
  }
  return [...head, '[… earlier messages omitted …]', ...tail].join('\n')
}

/** The user message sent to the classifier. */
export const classifierPrompt = (transcript: string): string =>
  `Transcript so far (oldest first):\n<transcript>\n${transcript}\n</transcript>\n\nPick the session's effort level now, or answer undecided. JSON only.`

// --- parsing the classifier's reply ---------------------------------------------

export type Decision =
  | { decision: 'undecided' }
  | { decision: 'lock'; level: Level; reason: string }

/**
 * Reads the classifier's reply. Anything unparseable, an unknown level or a
 * missing reason is `undecided`: the router never locks on a reply it cannot
 * read (fail open).
 */
export function parseDecision(reply: string | undefined | null): Decision {
  if (typeof reply !== 'string') return { decision: 'undecided' }
  const match = reply.match(/\{[\s\S]*\}/)
  if (!match) return { decision: 'undecided' }
  let data: unknown
  try {
    data = JSON.parse(match[0])
  } catch {
    return { decision: 'undecided' }
  }
  if (typeof data !== 'object' || data === null) return { decision: 'undecided' }
  const record = data as Record<string, unknown>
  const level = typeof record.level === 'string' ? record.level.trim().toLowerCase() : undefined
  if (record.decision !== 'lock' || !isLevel(level)) return { decision: 'undecided' }
  const reason = typeof record.reason === 'string' ? record.reason.replace(/\s+/g, ' ').trim() : ''
  return { decision: 'lock', level, reason: reason === '' ? 'classifier' : cut(reason, 60).replace(/… \[\d+ more chars\]$/, '…') }
}

// --- /route grammar -------------------------------------------------------------

export type RouteCommand =
  | { kind: 'show' }
  | { kind: 'decide' }
  | { kind: 'off' }
  | { kind: 'rules' }
  | { kind: 'rules-init'; scope: 'user' | 'project' }
  | { kind: 'rules-critique' }
  | { kind: 'error'; message: string }

export const ROUTE_USAGE =
  'usage: /route [decide | off | rules [init [user|project] | critique]]'

/**
 * `/route` arguments. `decide` and `off` are the names shown; the 0.1 names
 * `auto` and `pin picker` stay as hidden aliases. There is no way to set a
 * level here: for a specific level, turn the router off and use the picker.
 */
export function parseRoute(args: string): RouteCommand {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return { kind: 'show' }
  const [verb, arg, extra, more] = words
  if ((verb === 'decide' || verb === 'auto') && arg === undefined) return { kind: 'decide' }
  if (verb === 'off' && arg === undefined) return { kind: 'off' }
  if (verb === 'pin' && arg === 'picker' && extra === undefined) return { kind: 'off' }
  if (verb === 'rules') {
    if (arg === undefined) return { kind: 'rules' }
    if (arg === 'critique' && extra === undefined) return { kind: 'rules-critique' }
    if (arg === 'init' && more === undefined && (extra === undefined || extra === 'user' || extra === 'project')) {
      return { kind: 'rules-init', scope: extra ?? 'user' }
    }
  }
  return { kind: 'error', message: ROUTE_USAGE }
}

// --- state and what the mod shows -------------------------------------------------

export type Mode = 'auto' | 'pinned' | 'picker'

export type Phase = 'undecided' | 'proposed' | 'locked'

export type Proposal = { level: Level; reason: string }

/**
 * Everything the router remembers about one session.
 *
 * Internally `mode` keeps where a level came from: `auto` + `locked` was fixed
 * by the router, `pinned` was fixed by you, `picker` is the router turned off.
 * The person sees three states only (see `viewOf`): deciding, fixed, off.
 */
export type RouterState = {
  mode: Mode
  /** Under `auto`: still reading, waiting for a click, or locked. */
  phase: Phase
  /** The locked or pinned level. */
  level?: Level
  reason?: string
  /** Under `auto` + `proposed`: what the band offers. */
  proposal?: Proposal
  /** Human prompts seen this session. */
  prompts: number
  /** Under `auto` + `undecided`: no classifier call before this prompt count. */
  snoozedUntil?: number
}

export const freshState = (): RouterState => ({ mode: 'auto', phase: 'undecided', prompts: 0 })

/** The level `turn.step` applies, or undefined to leave the request alone. */
export function appliedLevel(state: RouterState): Level | undefined {
  if (state.mode === 'pinned') return state.level
  if (state.mode === 'auto' && state.phase === 'locked') return state.level
  return undefined
}

/** The three states a person sees. */
export type View =
  | { kind: 'deciding'; proposal?: Proposal }
  | { kind: 'fixed'; level: Level; byRouter: boolean; reason?: string }
  | { kind: 'off' }

export function viewOf(state: RouterState): View {
  if (state.mode === 'picker') return { kind: 'off' }
  if (state.mode === 'pinned' && state.level) return { kind: 'fixed', level: state.level, byRouter: false }
  if (state.mode === 'auto' && state.phase === 'locked' && state.level) {
    return { kind: 'fixed', level: state.level, byRouter: true, reason: state.reason }
  }
  if (state.phase === 'proposed' && state.proposal) return { kind: 'deciding', proposal: state.proposal }
  return { kind: 'deciding' }
}

/** Why the level is what it is: `router: bug fix in existing code` or `you chose high`. */
export function reasonText(state: RouterState): string {
  const view = viewOf(state)
  if (view.kind === 'off') return "router off: the effort picker decides"
  if (view.kind === 'fixed') return view.byRouter ? `router: ${view.reason ?? 'classifier'}` : (state.reason ?? `you chose ${view.level}`)
  if (view.proposal) return `router suggests ${view.proposal.level}: ${view.proposal.reason}`
  return "deciding: the picker's effort applies until the task is clear"
}

/** What `/route` with no arguments prints. */
export function routeReport(state: RouterState, inForce?: string | number): string {
  const view = viewOf(state)
  const lines: string[] = []
  if (view.kind === 'fixed') {
    lines.push(`${view.level} 🔒 (${reasonText(state)}). Every request and subagent runs at ${view.level}.`)
  } else if (view.kind === 'off') {
    lines.push(`router off. Effort is whatever /effort or the picker sets${inForce === undefined ? '' : ` (now ${inForce})`}.`)
  } else {
    const now = inForce === undefined ? 'the picker\'s level' : String(inForce)
    lines.push(view.proposal
      ? `${now} → ${view.proposal.level}? The router suggests ${view.proposal.level} (${view.proposal.reason}); choose in the band above the prompt.`
      : `${now} · deciding. The router fixes a level once the task is clear.`)
    if (state.snoozedUntil !== undefined && state.snoozedUntil > state.prompts) {
      lines.push(`Snoozed: next read after ${state.snoozedUntil - state.prompts} more prompt(s).`)
    }
  }
  lines.push(ROUTE_USAGE)
  return lines.join('\n')
}

/** The band's headline for a proposal. */
export const proposalText = (proposal: Proposal): string =>
  `Route this session at ${proposal.level.toUpperCase()} — ${proposal.reason}`

/** The band's buttons: the proposal first, then the other common levels. */
export function proposalChoices(proposal: Proposal): Level[] {
  const others: Level[] = ['medium', 'low', 'high', 'max', 'xhigh']
  return [proposal.level, ...others.filter(level => level !== proposal.level)].slice(0, 4)
}

/** A colour per level for the band (Ink theme keys / named colours). */
export const LEVEL_COLOR: Record<Level, string> = {
  low: 'green',
  medium: 'cyan',
  high: 'yellow',
  xhigh: 'magenta',
  max: 'red',
}

// --- persistence ------------------------------------------------------------------

/** What `$.store` keeps per session id so a resume finds its lock. */
export type SavedState = Pick<RouterState, 'mode' | 'phase' | 'level' | 'reason'> & { savedAt: number }

export const MAX_SAVED_SESSIONS = 100

/** Adds/replaces one session's saved state, keeping the newest `MAX_SAVED_SESSIONS`. */
export function withSaved(
  all: Record<string, SavedState> | undefined,
  sessionId: string,
  state: RouterState,
  now: number,
): Record<string, SavedState> {
  const next: Record<string, SavedState> = { ...(all ?? {}) }
  delete next[sessionId]
  const saved: SavedState = { mode: state.mode, phase: state.phase === 'proposed' ? 'undecided' : state.phase, savedAt: now }
  if (state.level !== undefined) saved.level = state.level
  if (state.reason !== undefined) saved.reason = state.reason
  next[sessionId] = saved
  const ids = Object.keys(next).sort((a, b) => (next[a]?.savedAt ?? 0) - (next[b]?.savedAt ?? 0))
  while (ids.length > MAX_SAVED_SESSIONS) delete next[ids.shift() as string]
  return next
}

/** Rebuilds state from a saved entry; anything malformed starts fresh. */
export function restored(saved: unknown): RouterState {
  const state = freshState()
  if (typeof saved !== 'object' || saved === null) return state
  const record = saved as Record<string, unknown>
  const mode = record.mode
  if (mode === 'picker') return { ...state, mode }
  if (mode === 'pinned' && isLevel(record.level)) return { ...state, mode, level: record.level }
  if (mode === 'auto' && record.phase === 'locked' && isLevel(record.level)) {
    return { ...state, phase: 'locked', level: record.level, reason: typeof record.reason === 'string' ? record.reason : 'restored' }
  }
  return state
}


/**
 * The compact state the footer shows beside the native effort picker:
 * `medium · deciding`, `medium → high?`, `high 🔒` or `router off`.
 * `dim` for the states where nothing is fixed.
 */
export function footerLabel(state: RouterState, inForce?: string | number): { text: string; color?: string; dim: boolean } {
  const view = viewOf(state)
  const now = inForce === undefined ? 'default' : String(inForce)
  if (view.kind === 'off') return { text: 'router off', dim: true }
  if (view.kind === 'fixed') return { text: `${view.level} 🔒`, color: LEVEL_COLOR[view.level], dim: false }
  if (view.proposal) return { text: `${now} → ${view.proposal.level}?`, color: LEVEL_COLOR[view.proposal.level], dim: false }
  return { text: `${now} · deciding`, dim: true }
}

export type FooterMenu = {
  options: { value: string; label: string }[]
  /** The option for the current state; its label is the compact state text. */
  value: string
}

/**
 * The footer dropdown. It never sets a level (the effort picker does that,
 * with the router off). The closed dropdown shows the selected option's
 * label, so the current state's option is labelled with the state text.
 * Values: `accept`, `notnow`, `fixed` (the current fixed state, a no-op),
 * and the `/route` arguments `decide` and `off`. `allowOff: false` (an
 * organisation's setting) leaves out `Router off`.
 */
export function footerMenu(state: RouterState, inForce?: string | number, allowOff = true): FooterMenu {
  const view = viewOf(state)
  const label = footerLabel(state, inForce).text
  const options: { value: string; label: string }[] = []
  if (view.kind === 'deciding' && view.proposal) {
    options.push({ value: 'accept', label: `Accept ${view.proposal.level}` })
    options.push({ value: 'notnow', label: 'Not now' })
  }
  if (view.kind === 'fixed') options.push({ value: 'fixed', label })
  options.push({
    value: 'decide',
    label: view.kind === 'deciding' ? label : view.kind === 'fixed' ? 'Decide again' : 'Let the router decide',
  })
  if (view.kind === 'off') options.push({ value: 'off', label })
  else if (allowOff) options.push({ value: 'off', label: 'Router off — use the effort picker' })
  const value = view.kind === 'fixed' ? 'fixed' : view.kind === 'off' ? 'off' : 'decide'
  return { options, value }
}

// --- settings-borne rules (org / user / project) --------------------------------------

export type SettingsRules = {
  /** The layer's rules text, when that settings source sets one. */
  rules?: string
  /** Org only: `enforce` makes the org layer final. */
  rulesMode?: 'extend' | 'enforce'
  /** Org only: false stops users turning the router off, so the org's routing always applies. */
  allowOff?: boolean
}

/**
 * Reads effort-router's settings out of one settings source (a parsed
 * settings.json). Looks in `pluginConfigs[<name> | <name>@<marketplace>].options`
 * first, then a top-level `effortRouter` object. Anything malformed is ignored.
 */
export function settingsRulesOf(source: unknown, pluginName = 'effort-router'): SettingsRules {
  const out: SettingsRules = {}
  if (typeof source !== 'object' || source === null) return out
  const record = source as Record<string, unknown>
  const candidates: unknown[] = []
  const configs = record.pluginConfigs
  if (typeof configs === 'object' && configs !== null) {
    for (const [key, value] of Object.entries(configs as Record<string, unknown>)) {
      if (key === pluginName || key.startsWith(`${pluginName}@`)) {
        candidates.push((value as Record<string, unknown> | null)?.options)
      }
    }
  }
  candidates.push(record.effortRouter)
  for (const candidate of candidates) {
    if (typeof candidate !== 'object' || candidate === null) continue
    const c = candidate as Record<string, unknown>
    if (out.rules === undefined && typeof c.rules === 'string' && c.rules.trim() !== '') out.rules = c.rules
    if (out.rulesMode === undefined && (c.rulesMode === 'extend' || c.rulesMode === 'enforce')) out.rulesMode = c.rulesMode
    if (out.allowOff === undefined && typeof c.allowOff === 'boolean') out.allowOff = c.allowOff
  }
  return out
}

export type RuleSources = {
  defaults: string
  org?: SettingsRules
  /** The org layer's label, e.g. `policy settings`. */
  orgSource?: string
  userFile?: { path: string; text: string | undefined }
  userSettings?: string
  projectFile?: { path: string; text: string | undefined }
  projectSettings?: string
}

/**
 * Builds the layer stack: shipped defaults → org (policy settings) → user
 * (file, else user settings option) → project (file, else project settings
 * option). Under org `enforce`, the stack stops at the org layer.
 */
export function ruleLayers(sources: RuleSources): { layers: RuleLayer[]; enforced: boolean } {
  const layers: RuleLayer[] = [{ source: 'shipped defaults', text: sources.defaults }]
  if (sources.org?.rules !== undefined) layers.push({ source: sources.orgSource ?? 'policy settings', text: sources.org.rules })
  const enforced = sources.org?.rulesMode === 'enforce'
  if (enforced) return { layers, enforced }
  const pick = (file: RuleSources['userFile'], setting: string | undefined, settingLabel: string): RuleLayer | undefined => {
    if (file?.text !== undefined) return { source: file.path, text: file.text }
    if (setting !== undefined) return { source: settingLabel, text: setting }
    return undefined
  }
  const user = pick(sources.userFile, sources.userSettings, 'user settings (pluginConfigs option)')
  const project = pick(sources.projectFile, sources.projectSettings, 'project settings (pluginConfigs option)')
  if (user) layers.push(user)
  if (project) layers.push(project)
  return { layers, enforced }
}
