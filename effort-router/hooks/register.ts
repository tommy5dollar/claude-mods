import type { AgentSpawnInput, EngineInterface, On, PluginOptions } from 'claude-code'

import {
  type AgentDefinition,
  type ComposedRules,
  type ReadDiagnostics,
  type TranscriptMessage,
  QUESTION_TOOL,
  type Level,
  type Proposal,
  type RoutedAgent,
  type RouterState,
  type SubagentStatus,
  LEVEL_COLOR,
  STARTER_RULES,
  afterBudget,
  agentFileDefinition,
  appliedLevel,
  classifierPrompt,
  classifierSystem,
  composeRules,
  critiquePrompt,
  definitionFor,
  footerLabel,
  bandActions,
  bandHeadline,
  offerKey,
  isLevel,
  lockedAt,
  parseDecision,
  parseRoute,
  parentLevel,
  parseSubagentReply,
  routesSubagents,
  subagentPrompt,
  subagentSystem,
  proposalText,
  reasonText,
  restored,
  routeReport,
  ruleLayers,
  settingsAgentDefinitions,
  settingsRulesOf,
  renderTranscript,
  firstSighting,
  humanPromptCount,
  DEFAULT_TRIM,
  turnedOff,
  turnedOn,
  wantsRead,
  withReading,
  withQuestionAnswer,
  withSaved,
} from './policy'

/**
 * effort-router: reads the conversation after each human prompt until the
 * task is clear and, before the turn runs, puts a level in use (consent
 * `apply`: provisional until kept) or suggests one (`confirm`, `ask`) or locks
 * it (`none`). `/route` runs it on demand, with an optional hint.
 *
 * Subagents are routed apart: each spawn waits for one read of its own brief
 * and its requests carry that level (forks, and failed reads, take the
 * parent's level). An agent whose own definition sets an effort is left to it.
 *
 * Fail open everywhere: any error leaves the request at the picker's effort.
 */

type Consent = 'apply' | 'confirm' | 'ask' | 'none'

/** A consent value; `band`, the 0.5 name for confirm-first, maps to `confirm`. */
function consentOf(value: unknown): Consent | undefined {
  if (value === 'apply' || value === 'confirm' || value === 'ask' || value === 'none') return value
  return value === 'band' ? 'confirm' : undefined
}

type Settings = {
  consent: Consent
  /** Human prompts the router reads automatically before it stops. */
  decideWithin: number
  /** How long a prompt waits for a read before it runs anyway (fail open). */
  classifyTimeoutMs: number
  /** Cap on the transcript sent to the classifier. */
  classifierMaxChars: number
  classifierModel: string
  syncPicker: boolean
  /** `button`: the footer state is a button that opens the band. `label`: plain text, /route is the control. */
  footerControl: 'button' | 'label'
  /** Route each subagent from its own brief at spawn. */
  routeSubagents: boolean
}

/** Per-session runtime facts that are not persisted. */
type Session = {
  state: RouterState
  /** A classification is in flight. */
  reading: boolean
  /** The effort the session had before the router first ran /effort. */
  baseline?: Level
  /** The last effort a main-loop request went out with. */
  lastSent?: string | number
  /** An /effort sync to run when the session is next idle. */
  pendingSync?: Level
  /** The band was opened from the footer. */
  bandOpen: boolean
  /** The suggestion the band was last closed on: it stays closed until the suggestion changes. */
  closedOffer?: string
  /** Classifier calls this session, for `/route status`. */
  calls: number
  verdict?: ReadDiagnostics['verdict']
  error?: ReadDiagnostics['error']
  /** How long the last read took, start to settle. */
  lastReadMs?: number
  /** What the last read sent. */
  sent?: ReadDiagnostics['sent']
  /** Routed subagents by agentId, oldest first (memory only: a resume starts empty). */
  agents: Map<string, RoutedAgent>
  /** The user's and project's agent definitions, scanned once per session. */
  definitions?: Promise<AgentDefinition[]>
}

/** What one read sees beyond the stored transcript. */
type ReadInput = {
  /** The prompt being submitted (not yet in the transcript at prompt.submit). */
  current?: string
  /** An AskUserQuestion call just answered (not yet in the transcript at tool.call). */
  answer?: { toolUseId?: string; input: unknown; text: string }
  hint?: string
  /** What prompted the read, for `/route status`. */
  trigger: string
}

const STORE_KEY = 'sessions'
const SESSIONS = new Map<string, Session>()
/**
 * Whether a person is at a UI. In a -p run the /effort sync's output would
 * replace the run's printed result, so headless runs rely on turn.step alone.
 */
let isInteractive = true
/** The organisation's `allowOff`, as the last rules read found it. */
let allowOff = true
/** `decideWithin`, for a session's first sighting (set at register). */
let budgetAtSighting = 6
/** The organisation's `routeSubagents`, as the last rules read found it. */
let orgRoutesSubagents = true
/** Routed subagents kept per session, for turn.step and `/route status`. */
const MAX_ROUTED_AGENTS = 200

const FALLBACK_RULES =
  'low: quick in-the-loop work, questions, chores. medium: regular feature work (default). ' +
  'high: verification, tests, review, bug fixes in existing code. xhigh: edge-case-heavy security, ' +
  'hardware, ML/data, performance or concurrency work. max: fully autonomous hard problems, vulnerability hunting.'

const HUMAN_ORIGINS = new Set(['composer', 'bridge', 'sdk'])

function settingsOf(options: PluginOptions): Settings {
  const consent = consentOf(options.consent) ?? 'apply'
  const num = (value: unknown, fallback: number): number => {
    const n = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback
  }
  return {
    consent,
    decideWithin: num(options.decideWithin, 6),
    classifyTimeoutMs: num(options.classifyTimeoutMs, 8000),
    classifierMaxChars: num(options.classifierMaxChars, DEFAULT_TRIM.totalChars),
    classifierModel: typeof options.classifierModel === 'string' && options.classifierModel !== '' ? options.classifierModel : 'haiku',
    syncPicker: options.syncPicker !== false && options.syncPicker !== 'false',
    footerControl: options.footerControl === 'label' ? 'label' : 'button',
    routeSubagents: options.routeSubagents !== false && options.routeSubagents !== 'false',
  }
}

// --- session state ---------------------------------------------------------------

async function sessionOf($: EngineInterface): Promise<{ id: string; session: Session }> {
  const id = await $.session.id()
  let session = SESSIONS.get(id)
  if (!session) {
    const all = (await $.store.get(STORE_KEY).catch(() => undefined)) as Record<string, unknown> | undefined
    const saved = all?.[id]
    let state = restored(saved)
    if (saved === undefined) {
      // first sighting: prompts already in the session count toward the budget
      const prior = humanPromptCount((await $.session.messages().catch(() => [])) as TranscriptMessage[])
      if (prior >= budgetAtSighting) await loadRules($).catch(() => undefined) // learns the org's allowOff
      state = firstSighting(prior, budgetAtSighting, allowOff)
      if (prior > 0) $.ui.log(`effort-router: first sighting with ${prior} prompts already in the session${state.gaveUp ? ' — left off' : ''}`, { to: 'debug' })
    }
    session = { state, reading: false, bandOpen: false, calls: 0, agents: new Map() }
    if (appliedLevel(state)) session.pendingSync = appliedLevel(state)
    SESSIONS.set(id, session)
  }
  return { id, session }
}

async function persist($: EngineInterface, id: string, state: RouterState): Promise<void> {
  try {
    const all = (await $.store.get(STORE_KEY)) as Parameters<typeof withSaved>[0]
    await $.store.set(STORE_KEY, withSaved(all, id, state, await $.clock.now()))
  } catch {
    // persistence is best effort
  }
}

// --- showing and applying ----------------------------------------------------------

function show($: EngineInterface): void {
  try {
    $.ui.invalidate('ui.render')
  } catch {
    // no UI (-p): nothing to draw
  }
}

/** Sets a new state, redraws and saves it. */
async function commit($: EngineInterface, id: string, session: Session, state: RouterState): Promise<void> {
  session.state = state
  show($)
  await persist($, id, state)
}

/** Locks the suggested level, syncs the picker, says so in the transcript. */
async function accept($: EngineInterface, id: string, session: Session, settings: Settings, proposal: Proposal): Promise<void> {
  await commit($, id, session, lockedAt(session.state, proposal))
  if (settings.syncPicker) session.pendingSync = proposal.level
  try {
    $.ui.log(`effort locked: ${proposal.level} 🔒 (${reasonText(session.state)}) · /route status`)
  } catch {
    // headless
  }
  $.ui.log(`effort-router: lock ${proposal.level} (${proposal.reason})`, { to: 'debug' })
}

/** Turns the router off and puts the picker back where it was. */
async function turnOff($: EngineInterface, id: string, session: Session, settings: Settings): Promise<void> {
  await commit($, id, session, turnedOff(session.state))
  restorePicker($, session, settings)
}

/** Puts the picker back where it was before the router first synced it. */
function restorePicker($: EngineInterface, session: Session, settings: Settings): void {
  if (settings.syncPicker && session.baseline) {
    session.pendingSync = session.baseline
    flushSync($, session)
  }
}

/** Runs /effort now if the session is idle; otherwise it waits for turn.complete. */
function flushSync($: EngineInterface, session: Session): void {
  const level = session.pendingSync
  if (level === undefined || !isInteractive) return
  session.pendingSync = undefined
  $.command.run({ command: 'effort', args: level }).then(
    () => $.ui.log(`effort-router: /effort ${level} synced`, { to: 'debug' }),
    (error: unknown) => {
      session.pendingSync ??= level
      $.ui.log(`effort-router: /effort ${level} deferred: ${String(error)}`, { to: 'debug' })
    },
  )
}

// --- rules ---------------------------------------------------------------------------

async function readText($: EngineInterface, path: string): Promise<string | undefined> {
  try {
    return await $.fs.read(path)
  } catch {
    return undefined
  }
}

/** The path separator, and the home directory (undefined when neither variable is set). */
async function homeOf($: EngineInterface): Promise<{ sep: string; homeDir?: string }> {
  const sep = $.plugin.root.includes('\\') ? '\\' : '/'
  const [profile, home] = await Promise.all([$.env.get('USERPROFILE').catch(() => undefined), $.env.get('HOME').catch(() => undefined)])
  return { sep, homeDir: sep === '\\' ? (profile ?? home) : (home ?? profile) }
}

async function rulePaths($: EngineInterface): Promise<{ defaults: string; user?: string; project?: string }> {
  const [{ sep, homeDir }, root] = await Promise.all([homeOf($), $.session.root().catch(() => undefined)])
  return {
    defaults: `${$.plugin.root}${sep}rules${sep}default.md`,
    user: homeDir ? `${homeDir}${sep}.claude${sep}effort-router.md` : undefined,
    project: root ? `${root}${sep}.claude${sep}effort-router.md` : undefined,
  }
}

async function settingsSource($: EngineInterface, source: 'user' | 'project' | 'policy'): Promise<unknown> {
  try {
    return await $.settings.read({ source })
  } catch {
    return undefined
  }
}

type LoadedRules = { composed: ComposedRules; defaults: string; enforced: boolean; allowOff: boolean; routeSubagents: boolean }

/**
 * Shipped defaults → org (policy settings) → user → project, re-read on every
 * call so edits apply without a reload. Each source fails open to absent.
 */
async function loadRules($: EngineInterface): Promise<LoadedRules> {
  const paths = await rulePaths($)
  const [defaults, userText, projectText, policy, user, project] = await Promise.all([
    readText($, paths.defaults),
    paths.user ? readText($, paths.user) : Promise.resolve(undefined),
    paths.project ? readText($, paths.project) : Promise.resolve(undefined),
    settingsSource($, 'policy'),
    settingsSource($, 'user'),
    settingsSource($, 'project'),
  ])
  const org = settingsRulesOf(policy, $.plugin.name)
  const { layers, enforced } = ruleLayers({
    defaults: defaults ?? FALLBACK_RULES,
    org,
    orgSource: 'policy settings (managed)',
    userFile: paths.user ? { path: paths.user, text: userText } : undefined,
    userSettings: settingsRulesOf(user, $.plugin.name).rules,
    projectFile: paths.project ? { path: paths.project, text: projectText } : undefined,
    projectSettings: settingsRulesOf(project, $.plugin.name).rules,
  })
  const composed = composeRules(layers)
  $.ui.log(`effort-router: rules from ${composed.contributors.map(c => `${c.source} (${c.how})`).join(' → ')}${enforced ? ' [org enforce]' : ''}`, { to: 'debug' })
  allowOff = org.allowOff !== false
  orgRoutesSubagents = org.routeSubagents !== false
  return { composed, defaults: defaults ?? FALLBACK_RULES, enforced, allowOff, routeSubagents: orgRoutesSubagents }
}

// --- deciding ----------------------------------------------------------------------

/** One classifier read of the whole conversation. Undefined = undecided (or failed). Records the verdict or error for `/route status`. */
async function classifyNow($: EngineInterface, settings: Settings, session: Session, input: ReadInput): Promise<Proposal | undefined> {
  const now = async () => $.clock.now().catch(() => Date.now())
  try {
    const [stored, rules] = await Promise.all([
      $.session.messages().catch(() => [] as TranscriptMessage[]),
      loadRules($),
    ])
    const messages = input.answer ? withQuestionAnswer(stored as TranscriptMessage[], input.answer) : (stored as TranscriptMessage[])
    const rendered = renderTranscript(messages, input.current, { ...DEFAULT_TRIM, totalChars: settings.classifierMaxChars })
    const transcript = rendered.text
    if (transcript.trim() === '' && !input.hint) return undefined
    session.sent = { sentChars: rendered.sentChars, fullChars: rendered.fullChars, maxChars: settings.classifierMaxChars, omitted: rendered.omitted }
    session.calls += 1
    const reply = await $.model.complete({
      model: settings.classifierModel,
      system: classifierSystem(rules.composed.text),
      prompt: classifierPrompt(transcript, input.hint),
      maxTokens: 200,
      effort: 'low',
      timeoutMs: settings.classifyTimeoutMs,
    })
    if (!reply.isAnswered) {
      session.error = { at: await now(), text: `classifier gave no answer (${reply.reason})` }
      $.ui.log(`effort-router: ${session.error.text}`, { to: 'debug' })
      return undefined
    }
    const decision = parseDecision(reply.text)
    session.verdict = { at: await now(), trigger: input.trigger, raw: reply.text, decision }
    $.ui.log(`effort-router: classifier said (${input.trigger}) ${reply.text.trim().slice(0, 200)}`, { to: 'debug' })
    return decision.decision === 'lock' ? { level: decision.level, reason: decision.reason } : undefined
  } catch (error) {
    session.error = { at: await now(), text: String(error) }
    throw error
  }
}

/**
 * Waits for `work` at most `ms`: `{ ok: false }` on a timeout. The work goes on
 * in the background; its late answer is ignored by the caller.
 */
async function timed<T>($: EngineInterface, ms: number, work: Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  work.catch(() => undefined) // a late failure is not unhandled
  const abort = typeof AbortController === 'function' ? new AbortController() : undefined
  const timeout = $.clock.sleep(ms, abort ? { signal: abort.signal } : undefined).then(
    () => ({ ok: false as const }),
    () => ({ ok: false as const }),
  )
  try {
    return await Promise.race([work.then(value => ({ ok: true as const, value })), timeout])
  } finally {
    abort?.abort()
  }
}

/**
 * Applies a read's answer, then consent. `apply` puts a level in use at once
 * (provisional) and shows the band when the level changes; `none` locks a new
 * suggestion; `ask` asks when the suggested level is new; `confirm` shows the
 * band and waits for Accept.
 */
async function settle($: EngineInterface, id: string, session: Session, settings: Settings, consent: Consent, proposal: Proposal | undefined): Promise<void> {
  const before = session.state.phase === 'provisional' ? session.state.level : session.state.proposal?.level
  const next = withReading(session.state, proposal, consent === 'apply')
  await commit($, id, session, next)
  if (next.phase === 'provisional') {
    if (next.level !== before) $.ui.log(`effort-router: using ${next.level} (provisional; ${next.reason})`, { to: 'debug' })
    return
  }
  const offer = next.proposal
  if (!offer || next.phase === 'locked') return
  if (consent === 'none') {
    await accept($, id, session, settings, offer)
    return
  }
  if (consent === 'ask' && offer.level !== before) {
    const labels = allowOff ? [`Accept ${offer.level}`, 'Turn off'] : [`Accept ${offer.level}`, 'Later']
    let answer: string | undefined
    try {
      answer = await $.ui.ask(`${proposalText(offer)}?`, { options: labels, header: 'Effort' })
    } catch {
      answer = undefined // dismissed, or no one to ask: the suggestion stays pending
    }
    if (answer === labels[0]) await accept($, id, session, settings, offer)
    else if (answer === 'Turn off') await turnOff($, id, session, settings)
  }
}

/**
 * An automatic read after a human turn, within the budget, awaited before the
 * turn goes on: at most `classifyTimeoutMs`, then fail open at the current
 * level. Then the budget: a provisional level becomes locked when it runs out.
 */
async function readAfter($: EngineInterface, id: string, session: Session, settings: Settings, consent: Consent, input: ReadInput): Promise<void> {
  if (session.reading) return
  session.reading = true
  const started = await $.clock.now().catch(() => Date.now())
  let outcome = 'failed'
  try {
    const result = await timed($, settings.classifyTimeoutMs, classifyNow($, settings, session, { ...input, hint: session.state.hint }))
    if (!result.ok) {
      outcome = 'timed out'
      session.error = { at: await $.clock.now().catch(() => Date.now()), text: `classifier timed out after ${settings.classifyTimeoutMs} ms; the turn went ahead at the current level` }
    } else {
      outcome = result.value ? `${result.value.level} (${result.value.reason})` : 'undecided'
      if (session.state.mode === 'auto' && session.state.phase !== 'locked') {
        await settle($, id, session, settings, consent, result.value)
      }
    }
  } catch (error) {
    $.ui.log(`effort-router: classification failed: ${String(error)}`, { to: 'debug' })
  } finally {
    session.reading = false
    const took = (await $.clock.now().catch(() => Date.now())) - started
    session.lastReadMs = took
    $.ui.log(`effort-router: read settled in ${took} ms (${input.trigger}): ${outcome}`, { to: 'debug' })
  }
  const was = session.state
  const spent = afterBudget(was, settings.decideWithin, allowOff)
  if (spent !== was) {
    await commit($, id, session, spent)
    if (spent.mode === 'picker') restorePicker($, session, settings)
    if (was.phase === 'provisional' && spent.phase === 'locked' && spent.level) {
      if (settings.syncPicker) session.pendingSync = spent.level
      try {
        $.ui.log(`effort locked: ${spent.level} 🔒 (kept after ${settings.decideWithin} prompts; router: ${spent.reason}) · /route status`)
      } catch {
        // headless
      }
    }
    $.ui.log(`effort-router: ${spent.offReason ?? (spent.phase === 'locked' ? `budget spent: ${spent.level} locked` : 'budget spent')}`, { to: 'debug' })
  }
}

/**
 * A manual run (`/route [hint]`, the band's Suggest now): reads the whole
 * conversation now, in any state, ignoring the budget, within the timeout.
 * Undecided leaves the state as it is.
 */
async function suggestNow($: EngineInterface, id: string, session: Session, settings: Settings, hint: string | undefined): Promise<string> {
  if (session.reading) return 'the router is already reading; try again in a moment.'
  session.reading = true
  let proposal: Proposal | undefined
  try {
    const result = await timed($, settings.classifyTimeoutMs, classifyNow($, settings, session, { hint, trigger: hint ? 'manual /route with a hint' : 'manual /route' }))
    if (!result.ok) {
      session.error = { at: await $.clock.now().catch(() => Date.now()), text: `classifier timed out after ${settings.classifyTimeoutMs} ms` }
      return `the classifier timed out after ${settings.classifyTimeoutMs} ms; nothing changed (${footerLabel(session.state).text}).`
    }
    proposal = result.value
  } finally {
    session.reading = false
  }
  if (!proposal) {
    const text = `no clear task yet${hint ? ', even with your hint' : ''}; nothing changed (${footerLabel(session.state).text}).`
    try {
      $.ui.toast(`effort-router: ${text}`)
    } catch {
      // headless
    }
    return text
  }
  const { state } = session
  const inUse = state.mode === 'auto' && (state.phase === 'locked' || state.phase === 'provisional') ? state.level : undefined
  if (inUse === proposal.level && state.phase === 'locked') {
    await commit($, id, session, { ...state, proposal: undefined })
    const text = `confirmed: ${proposal.level} 🔒 still fits (${proposal.reason}).`
    try {
      $.ui.toast(`effort-router: ${text}`)
    } catch {
      // headless
    }
    return text
  }
  const consent = await consentFor($, settings)
  const withHint = hint ? { ...session.state, hint } : session.state
  session.state = withHint
  await settle($, id, session, settings, consent, proposal)
  const after = session.state
  if (after.phase === 'provisional') return `using ${after.level} now (${after.reason}); Keep it or Revert in the band.`
  if (after.phase === 'locked' && after.level === proposal.level && !after.proposal) return `${proposal.level} 🔒 (${proposal.reason}).`
  return after.phase === 'locked'
    ? `${after.level} 🔒 now; a switch to ${proposal.level} is on offer (${proposal.reason}). Accept it in the band (press the footer to open it).`
    : `suggesting ${proposal.level} (${proposal.reason}). Accept it in the band (press the footer to open it).`
}

// --- subagents -----------------------------------------------------------------------

/** The agent definition files in one `.claude/agents` folder; a missing folder or unreadable file is skipped. */
async function agentFiles($: EngineInterface, dir: string, sep: string): Promise<AgentDefinition[]> {
  const entries = await $.fs.list(dir).catch(() => [])
  const files = entries.filter(entry => entry.kind !== 'dir' && /\.md$/i.test(entry.name)).map(entry => entry.name).sort()
  const found = await Promise.all(
    files.map(async name => {
      const path = `${dir}${sep}${name}`
      const text = await readText($, path)
      return text === undefined ? undefined : agentFileDefinition(text, name, path)
    }),
  )
  return found.filter((definition): definition is AgentDefinition => definition !== undefined)
}

/**
 * Every agent definition the user and project hold, highest precedence first:
 * policy settings' `agents`, the project's `.claude/agents/*.md` (the session's
 * directory, then the project root), project settings' `agents`, the user's
 * `~/.claude/agents/*.md`, then user settings' `agents`. Plugins' agents are
 * not here (see definitionFor).
 */
async function loadDefinitions($: EngineInterface): Promise<AgentDefinition[]> {
  const [{ sep, homeDir }, cwd, root, policy, project, user] = await Promise.all([
    homeOf($),
    $.session.cwd().catch(() => undefined),
    $.session.root().catch(() => undefined),
    settingsSource($, 'policy'),
    settingsSource($, 'project'),
    settingsSource($, 'user'),
  ])
  const agentsDir = (base: string) => `${base}${sep}.claude${sep}agents`
  const projectDirs = [...new Set([cwd, root].filter((dir): dir is string => typeof dir === 'string' && dir !== ''))].map(agentsDir)
  const [projectFiles, userFiles] = await Promise.all([
    Promise.all(projectDirs.map(dir => agentFiles($, dir, sep))).then(lists => lists.flat()),
    homeDir ? agentFiles($, agentsDir(homeDir), sep) : Promise.resolve([]),
  ])
  const all = [
    ...settingsAgentDefinitions(policy, 'policy settings'),
    ...projectFiles,
    ...settingsAgentDefinitions(project, 'project settings'),
    ...userFiles,
    ...settingsAgentDefinitions(user, 'user settings'),
  ]
  $.ui.log(`effort-router: ${all.length} agent definitions found, ${all.filter(d => d.effort !== undefined).length} with their own effort`, { to: 'debug' })
  return all
}

/** The session's agent definitions, scanned on first use; a failed scan counts as none. */
function definitionsOf($: EngineInterface, session: Session): Promise<AgentDefinition[]> {
  session.definitions ??= loadDefinitions($).catch(() => [])
  return session.definitions
}

/** Whether subagents are routed now, and if not, why. */
function subagentRouting(settings: Settings, session: Session): SubagentStatus['routing'] {
  if (!settings.routeSubagents) return 'setting'
  if (!orgRoutesSubagents) return 'org'
  return routesSubagents(session.state) ? 'on' : 'user-off'
}

/**
 * The level for a spawn, decided before it starts. A fork takes the parent's
 * level. An agent whose definition sets an effort keeps it: no read, and
 * `byDefinition` so its requests are left to the engine. Anything else waits
 * (at most `classifyTimeoutMs`) for one read of its own brief; a failed, late
 * or unusable read takes the parent's level. Undefined leaves the subagent's
 * requests as they would have been.
 */
async function routeSpawn($: EngineInterface, settings: Settings, session: Session, e: AgentSpawnInput): Promise<Pick<RoutedAgent, 'level' | 'reason' | 'byDefinition'> | undefined> {
  const rules = await loadRules($) // also learns the org's routeSubagents
  if (!rules.routeSubagents) return undefined
  const inherited = parentLevel(session.state, session.agents, e.parentAgentId)
  const fallback = (why: string): Proposal | undefined => (inherited ? { level: inherited, reason: `${why}: the parent's level` } : undefined)
  if (e.fork) return fallback('fork')
  const definition = definitionFor(e.subagentType, await definitionsOf($, session))
  if (definition?.effort !== undefined) return { level: definition.effort, reason: `effort in ${definition.source}`, byDefinition: true }
  const read = async () =>
    $.model.complete({
      model: settings.classifierModel,
      system: subagentSystem(rules.composed.text),
      prompt: subagentPrompt({ subagentType: e.subagentType, description: e.description, prompt: e.prompt }, settings.classifierMaxChars),
      maxTokens: 200,
      effort: 'low',
      timeoutMs: settings.classifyTimeoutMs,
    })
  const result = await timed($, settings.classifyTimeoutMs, read()).catch((error: unknown) => {
    $.ui.log(`effort-router: subagent read failed: ${String(error)}`, { to: 'debug' })
    return undefined
  })
  if (!result) return fallback('read failed')
  if (!result.ok) return fallback('read timed out')
  if (!result.value.isAnswered) return fallback(`no answer (${result.value.reason})`)
  $.ui.log(`effort-router: subagent classifier said ${result.value.text.trim().slice(0, 200)}`, { to: 'debug' })
  return parseSubagentReply(result.value.text) ?? fallback('unusable reply')
}

/** Keeps a routed subagent, dropping the oldest past `MAX_ROUTED_AGENTS`. */
function remember(session: Session, agentId: string, agent: RoutedAgent): void {
  session.agents.delete(agentId)
  session.agents.set(agentId, agent)
  for (const oldest of session.agents.keys()) {
    if (session.agents.size <= MAX_ROUTED_AGENTS) break
    session.agents.delete(oldest)
  }
}

// --- the band ------------------------------------------------------------------------

/** The band shows when opened from the footer, or by itself for a suggestion it was not closed on. */
function bandShown(session: Session): boolean {
  const key = offerKey(session.state)
  return session.bandOpen || (key !== undefined && key !== session.closedOffer)
}

function closeBand($: EngineInterface, session: Session): void {
  session.bandOpen = false
  session.closedOffer = offerKey(session.state)
  show($)
}

/** The footer button: opens the band, or closes it when it is showing. */
function toggleBand($: EngineInterface, session: Session): void {
  if (bandShown(session)) closeBand($, session)
  else {
    session.bandOpen = true
    show($)
  }
}

/** A band button: closes the band, then applies the action. */
async function bandAction($: EngineInterface, id: string, session: Session, settings: Settings, value: string): Promise<void> {
  const offer = session.state.proposal
  closeBand($, session)
  try {
    const { state } = session
    if (value === 'accept' && offer) await accept($, id, session, settings, offer)
    else if (value === 'lock' && state.phase === 'provisional' && state.level) await accept($, id, session, settings, { level: state.level, reason: state.reason ?? 'classifier' })
    else if (value === 'revert') await turnOff($, id, session, settings)
    else if (value === 'keep') await commit($, id, session, { ...session.state, proposal: undefined, hint: undefined })
    else if (value === 'off') await turnOff($, id, session, settings)
    else if (value === 'on' || value === 'suggest') {
      const text = await route($, value === 'on' ? 'on' : '', settings)
      $.ui.log(`effort-router: ${text}`, { to: 'debug' })
    }
  } catch (error) {
    $.ui.log(`effort-router: band action ${value} failed: ${String(error)}`, { to: 'debug' })
  }
}

/**
 * A human turn of the conversation (a prompt, or answers to the model's
 * questions): counts it against the budget while deciding, then reads if the
 * budget allows, and waits for the read (within the timeout) so the turn's
 * first request already carries the answer.
 */
async function humanTurn($: EngineInterface, settings: Settings, input: ReadInput): Promise<void> {
  const { id, session } = await sessionOf($)
  if (session.state.mode === 'auto' && session.state.phase !== 'locked' && !session.state.gaveUp) {
    session.state = { ...session.state, prompts: session.state.prompts + 1 }
  }
  if (!wantsRead(session.state, settings.decideWithin)) return
  const consent = await consentFor($, settings)
  await readAfter($, id, session, settings, consent, input)
}

/** Consent as configured; `EFFORT_ROUTER_CONSENT` overrides it (handy headless). */
async function consentFor($: EngineInterface, settings: Settings): Promise<Consent> {
  const override = await $.env.get('EFFORT_ROUTER_CONSENT').catch(() => undefined)
  return consentOf(override) ?? settings.consent
}

// --- /route ------------------------------------------------------------------------

async function route($: EngineInterface, args: string, settings: Settings): Promise<string> {
  const { id, session } = await sessionOf($)
  const command = parseRoute(args)
  switch (command.kind) {
    case 'suggest':
      return suggestNow($, id, session, settings, command.hint)
    case 'status':
      return routeReport(session.state, settings.decideWithin, session.lastSent, {
        now: await $.clock.now().catch(() => Date.now()),
        calls: session.calls,
        verdict: session.verdict,
        error: session.error,
        consent: await consentFor($, settings),
        lastReadMs: session.lastReadMs,
        sent: session.sent,
        subagents: { routing: subagentRouting(settings, session), agents: [...session.agents.values()] },
      })
    case 'off': {
      if (!(await loadRules($)).allowOff) return "your organisation's settings keep the router on (allowOff: false)."
      await turnOff($, id, session, settings)
      return `router off: effort is the picker's${session.baseline ? ` (restored to ${session.baseline})` : ''}. /route on turns it back on.`
    }
    case 'on': {
      if (session.state.mode !== 'picker' && !session.state.gaveUp) return `the router is already on (${footerLabel(session.state).text}).`
      await commit($, id, session, turnedOn(session.state))
      return `router on: deciding, over the whole conversation, for up to ${settings.decideWithin} prompts.`
    }
    case 'rules': {
      const { composed, enforced } = await loadRules($)
      const from = composed.contributors.map(c => `  ${c.how}: ${c.source}`).join('\n')
      const note = enforced ? '\n(your organisation enforces its rules: personal and project layers are ignored)' : ''
      return `effective routing rules, from:\n${from}${note}\n\n${composed.text}`
    }
    case 'rules-init': {
      if ((await loadRules($)).enforced) return 'your organisation enforces its routing rules (rulesMode: enforce); a personal or project file would be ignored. /route rules shows them.'
      const paths = await rulePaths($)
      const path = command.scope === 'project' ? paths.project : paths.user
      if (!path) return `cannot place the ${command.scope} rules file here.`
      if (await $.fs.exists(path)) return `${path} already exists; edit it directly.`
      await $.fs.write(path, STARTER_RULES(command.scope))
      return `wrote ${path}. It keeps the defaults ($defaults) and holds a commented example.`
    }
    case 'rules-critique': {
      const { composed, defaults } = await loadRules($)
      if (composed.contributors.length <= 1) return 'no custom rules: only the shipped defaults apply. /route rules init to start some.'
      const reply = await $.model.complete({ model: 'sonnet', prompt: critiquePrompt(defaults, composed), maxTokens: 800, timeoutMs: 60000 })
      return reply.isAnswered ? reply.text.trim() : `critique failed (${reply.reason}).`
    }
  }
}

// --- hooks ---------------------------------------------------------------------------

export function register(on: On, options: PluginOptions): void {
  const settings = settingsOf(options)
  budgetAtSighting = settings.decideWithin

  on('session.start', async ($, e, next) => {
    isInteractive = e.isInteractive
    try {
      await $.command.register({
        name: 'route',
        description: 'Effort router: suggest a level now (optionally with a hint), status, off/on, or edit the rules',
        argumentHint: '[hint] | status | off | on | rules [init|critique]',
      })
      const { session } = await sessionOf($)
      if (session.lastSent === undefined) {
        const configured = (await $.settings.read().catch(() => ({}))) as { effortLevel?: unknown }
        if (isLevel(configured.effortLevel)) session.lastSent = configured.effortLevel
      }
      await loadRules($).catch(() => undefined) // learns allowOff for the footer
      if (!allowOff && session.state.mode === 'picker') session.state = turnedOn(session.state)
      show($)
    } catch (error) {
      $.ui.log(`effort-router: start failed: ${String(error)}`, { to: 'debug' })
    }
    return next(e)
  })

  on('command.run', { command: 'route' }, async ($, e) => {
    try {
      return { text: await route($, e.args ?? '', settings) }
    } catch (error) {
      return { text: `effort-router: ${String(error)}` }
    }
  })

  // After each human prompt while deciding or provisional/pending (and within
  // the budget), read the whole conversation again BEFORE the turn runs, so
  // its first request carries the router's level. Bounded by
  // classifyTimeoutMs; on a timeout or error the turn goes ahead as it was.
  on('prompt.submit', async ($, e, next) => {
    try {
      if (HUMAN_ORIGINS.has(e.origin.kind) && !e.text.trimStart().startsWith('/')) {
        await humanTurn($, settings, { current: e.text, trigger: 'after a prompt' })
      }
    } catch (error) {
      $.ui.log(`effort-router: prompt.submit failed: ${String(error)}`, { to: 'debug' })
    }
    return next(e)
  })

  // The model asked the user multiple-choice questions on the main thread and
  // got answers: that is a human turn too (platforms, scope, "keep it simple").
  on('tool.call', { tool: QUESTION_TOOL }, async ($, e, next) => {
    const result = await next(e)
    try {
      const answered = !('deny' in result && result.deny) && !result.isError && typeof result.text === 'string' && result.text.trim() !== ''
      if (e.agentId === undefined && answered) {
        await humanTurn($, settings, {
          answer: { toolUseId: e.tool_use_id, input: { questions: e.questions }, text: result.text as string },
          trigger: 'after answered questions',
        })
      }
    } catch (error) {
      $.ui.log(`effort-router: tool.call failed: ${String(error)}`, { to: 'debug' })
    }
    return result
  })

  // A subagent is about to start: read its brief (a fork takes its parent's
  // level) BEFORE it starts, and key the level to its agentId. next(e)
  // resolves with the id before the agent's first turn.step (verified live,
  // foreground and background), so its first request already carries it.
  on('agent.spawn', async ($, e, next) => {
    let routed: { session: Session; proposal: Pick<RoutedAgent, 'level' | 'reason' | 'byDefinition'>; took: number } | undefined
    try {
      const { session } = await sessionOf($)
      if (subagentRouting(settings, session) === 'on') {
        const started = await $.clock.now().catch(() => Date.now())
        const proposal = await routeSpawn($, settings, session, e)
        if (proposal) routed = { session, proposal, took: (await $.clock.now().catch(() => Date.now())) - started }
      }
    } catch (error) {
      $.ui.log(`effort-router: agent.spawn failed: ${String(error)}`, { to: 'debug' })
    }
    const result = await next(e)
    try {
      if (routed && result.agentId !== undefined) {
        const { session, proposal, took } = routed
        remember(session, result.agentId, { ...proposal, subagentType: e.subagentType, description: e.description })
        $.ui.log(
          `effort-router: subagent ${result.agentId} (${e.subagentType}${e.fork ? ', fork' : ''}: ${e.description}) -> ${proposal.level}${proposal.byDefinition ? ' set by its definition, left alone' : ''} (${proposal.reason}) in ${took} ms`,
          { to: 'debug' },
        )
      }
    } catch {
      // best effort: an unrouted subagent runs as it would have
    }
    return result
  })

  // Every model request: a routed subagent's own level; a subagent whose
  // definition sets its effort, untouched; otherwise (the main loop, and
  // subagents the router did not route) the main level in use, or untouched.
  on('turn.step', async function* ($, e, next) {
    let effort = e.effort
    try {
      const { session } = await sessionOf($)
      const own = e.agentId !== undefined && subagentRouting(settings, session) === 'on' ? session.agents.get(e.agentId) : undefined
      const level = own ? (own.byDefinition ? undefined : own.level) : appliedLevel(session.state)
      if (e.agentId === undefined && session.baseline === undefined && isLevel(e.effort) && session.pendingSync === undefined && level === undefined) {
        session.baseline = e.effort
      }
      if (level !== undefined && e.effort !== undefined) effort = level
      if (e.agentId === undefined && session.lastSent !== effort) {
        session.lastSent = effort
        show($)
      }
      $.ui.log(
        `effort-router: step ${e.agentId ? `agent=${e.agentId} ` : ''}index=${e.index} model=${e.model} effort ${String(e.effort)} -> ${String(effort)}`,
        { to: 'debug' },
      )
    } catch {
      effort = e.effort
    }
    return yield* next(effort === e.effort ? e : { ...e, effort })
  })

  // The session is between turns: run a pending /effort so the picker matches.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    try {
      if (e.agentId === undefined) {
        const { session } = await sessionOf($)
        if (settings.syncPicker) flushSync($, session)
      }
    } catch {
      // best effort
    }
    return result
  })

  // The footer, beside the native effort picker: the state as a plain button
  // that opens the band. (Desktop silently drops a Select here, so no Select.)
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const { session } = await sessionOf($)
    const label = footerLabel(session.state)
    const theirs = await next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const mine =
      settings.footerControl === 'label'
        ? Text({ ...(label.color ? { color: label.color } : { dimColor: true }), children: [label.text] })
        : Button({ key: 'route-state', label: label.text, plain: true, dimColor: label.dim, onPress: () => toggleBand($, session) })
    return Box({ flexDirection: 'row', columnGap: 1, children: [theirs, mine] })
  })

  // The band above the prompt: opened from the footer, or by itself for a new
  // suggestion. One line of state, then that state's actions and Close.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { id, session } = await sessionOf($)
    if (!bandShown(session) || e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const theirs = await next(e)
    const { state } = session
    const headline = bandHeadline(state)
    const level = state.proposal?.level ?? (state.mode === 'auto' && state.phase === 'locked' ? state.level : undefined)
    const label = state.phase === 'provisional' && state.level ? state.level : footerLabel(state).text
    const at = level ? headline.indexOf(label) : -1
    const line =
      at >= 0 && level
        ? Text({
            children: [
              headline.slice(0, at),
              Text({ color: LEVEL_COLOR[level], bold: true, children: [label] }),
              headline.slice(at + label.length),
            ],
          })
        : Text({ children: [headline] })
    const buttons = bandActions(state, allowOff, session.bandOpen).map((action, i) =>
      Button({
        key: action.value,
        label: action.label,
        hotkey: String(i + 1),
        plain: true,
        ...(i === 0 ? {} : { dimColor: true }),
        onPress: () => bandAction($, id, session, settings, action.value),
      }),
    )
    buttons.push(Button({ key: 'close', label: 'Close', hotkey: 'x', plain: true, dimColor: true, role: 'dismiss', onPress: () => closeBand($, session) }))
    return Box({
      flexDirection: 'column',
      children: [line, Box({ flexDirection: 'row', columnGap: 2, children: buttons }), theirs],
    })
  })
}

