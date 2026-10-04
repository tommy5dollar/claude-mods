import type { EngineInterface, On, PluginOptions } from 'claude-code'

import {
  type ComposedRules,
  type Level,
  type Proposal,
  type RouterState,
  LEVEL_COLOR,
  STARTER_RULES,
  afterBudget,
  appliedLevel,
  classifierPrompt,
  classifierSystem,
  composeRules,
  critiquePrompt,
  footerLabel,
  bandActions,
  bandHeadline,
  offerKey,
  isLevel,
  lockedAt,
  parseDecision,
  parseRoute,
  proposalText,
  reasonText,
  restored,
  routeReport,
  ruleLayers,
  settingsRulesOf,
  trimTranscript,
  turnedOff,
  turnedOn,
  wantsRead,
  withReading,
  withSaved,
} from './policy'

/**
 * effort-router: reads the conversation after each human prompt until the
 * task is clear, suggests a level, and locks it once accepted (or at once
 * under consent `none`). `/route` runs it on demand, with an optional hint.
 *
 * Fail open everywhere: any error leaves the request at the picker's effort.
 */

type Consent = 'band' | 'ask' | 'none'

type Settings = {
  consent: Consent
  /** Human prompts the router reads automatically before it stops. */
  decideWithin: number
  classifierModel: string
  syncPicker: boolean
  /** `button`: the footer state is a button that opens the band. `label`: plain text, /route is the control. */
  footerControl: 'button' | 'label'
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

const FALLBACK_RULES =
  'low: quick in-the-loop work, questions, chores. medium: regular feature work (default). ' +
  'high: verification, tests, review, bug fixes in existing code. xhigh: edge-case-heavy security, ' +
  'hardware, ML/data, performance or concurrency work. max: fully autonomous hard problems, vulnerability hunting.'

const HUMAN_ORIGINS = new Set(['composer', 'bridge', 'sdk'])

function settingsOf(options: PluginOptions): Settings {
  const consent = options.consent === 'ask' || options.consent === 'none' ? options.consent : 'band'
  const num = (value: unknown, fallback: number): number => {
    const n = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback
  }
  return {
    consent,
    decideWithin: num(options.decideWithin, 6),
    classifierModel: typeof options.classifierModel === 'string' && options.classifierModel !== '' ? options.classifierModel : 'haiku',
    syncPicker: options.syncPicker !== false && options.syncPicker !== 'false',
    footerControl: options.footerControl === 'label' ? 'label' : 'button',
  }
}

// --- session state ---------------------------------------------------------------

async function sessionOf($: EngineInterface): Promise<{ id: string; session: Session }> {
  const id = await $.session.id()
  let session = SESSIONS.get(id)
  if (!session) {
    const all = (await $.store.get(STORE_KEY).catch(() => undefined)) as Record<string, unknown> | undefined
    const state = restored(all?.[id])
    session = { state, reading: false, bandOpen: false }
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

async function rulePaths($: EngineInterface): Promise<{ defaults: string; user?: string; project?: string }> {
  const sep = $.plugin.root.includes('\\') ? '\\' : '/'
  const [profile, home, root] = await Promise.all([
    $.env.get('USERPROFILE').catch(() => undefined),
    $.env.get('HOME').catch(() => undefined),
    $.session.root().catch(() => undefined),
  ])
  const homeDir = sep === '\\' ? (profile ?? home) : (home ?? profile)
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

type LoadedRules = { composed: ComposedRules; defaults: string; enforced: boolean; allowOff: boolean }

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
  return { composed, defaults: defaults ?? FALLBACK_RULES, enforced, allowOff }
}

// --- deciding ----------------------------------------------------------------------

/** One classifier read of the whole conversation. Undefined = undecided (or failed). */
async function classifyNow($: EngineInterface, settings: Settings, current: string | undefined, hint: string | undefined): Promise<Proposal | undefined> {
  const [messages, rules] = await Promise.all([
    $.session.messages().catch(() => []),
    loadRules($),
  ])
  const transcript = trimTranscript(messages, current)
  if (transcript.trim() === '' && !hint) return undefined
  const reply = await $.model.complete({
    model: settings.classifierModel,
    system: classifierSystem(rules.composed.text),
    prompt: classifierPrompt(transcript, hint),
    maxTokens: 200,
    effort: 'low',
    timeoutMs: 20000,
  })
  if (!reply.isAnswered) {
    $.ui.log(`effort-router: classifier gave no answer (${reply.reason})`, { to: 'debug' })
    return undefined
  }
  const decision = parseDecision(reply.text)
  $.ui.log(`effort-router: classifier said ${reply.text.trim().slice(0, 200)}`, { to: 'debug' })
  return decision.decision === 'lock' ? { level: decision.level, reason: decision.reason } : undefined
}

/**
 * Applies a read's answer, then consent: `none` locks a new suggestion at
 * once; `ask` asks when the suggested level is new; `band` shows the band.
 */
async function settle($: EngineInterface, id: string, session: Session, settings: Settings, consent: Consent, proposal: Proposal | undefined): Promise<void> {
  const before = session.state.proposal?.level
  const next = withReading(session.state, proposal)
  await commit($, id, session, next)
  const offer = next.proposal
  if (!offer) return
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

/** An automatic read after a human prompt, within the budget. */
async function readAfterPrompt($: EngineInterface, id: string, session: Session, settings: Settings, consent: Consent, current: string): Promise<void> {
  if (session.reading) return
  session.reading = true
  try {
    const proposal = await classifyNow($, settings, current, session.state.hint)
    if (session.state.mode === 'auto' && session.state.phase !== 'locked') {
      await settle($, id, session, settings, consent, proposal)
    }
  } catch (error) {
    $.ui.log(`effort-router: classification failed: ${String(error)}`, { to: 'debug' })
  } finally {
    session.reading = false
  }
  const spent = afterBudget(session.state, settings.decideWithin, allowOff)
  if (spent !== session.state) {
    await commit($, id, session, spent)
    if (spent.mode === 'picker') restorePicker($, session, settings)
    $.ui.log(`effort-router: ${spent.offReason ?? 'budget spent'}`, { to: 'debug' })
  }
}

/**
 * A manual run (`/route [hint]`, the footer's Suggest now): reads the whole
 * conversation now, in any state, ignoring the budget. Undecided leaves the
 * state as it is.
 */
async function suggestNow($: EngineInterface, id: string, session: Session, settings: Settings, hint: string | undefined): Promise<string> {
  if (session.reading) return 'the router is already reading; try again in a moment.'
  session.reading = true
  let proposal: Proposal | undefined
  try {
    proposal = await classifyNow($, settings, undefined, hint)
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
  if (state.mode === 'auto' && state.phase === 'locked' && state.level === proposal.level) {
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
  if (after.phase === 'locked' && after.level === proposal.level && !after.proposal) return `${proposal.level} 🔒 (${proposal.reason}).`
  return after.phase === 'locked'
    ? `${after.level} 🔒 now; a switch to ${proposal.level} is on offer (${proposal.reason}). Accept it in the band (press the footer to open it).`
    : `suggesting ${proposal.level} (${proposal.reason}). Accept it in the band (press the footer to open it).`
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
    if (value === 'accept' && offer) await accept($, id, session, settings, offer)
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

/** Consent as configured; `EFFORT_ROUTER_CONSENT` overrides it (handy headless). */
async function consentFor($: EngineInterface, settings: Settings): Promise<Consent> {
  const override = await $.env.get('EFFORT_ROUTER_CONSENT').catch(() => undefined)
  if (override === 'none' || override === 'ask' || override === 'band') return override
  return settings.consent
}

// --- /route ------------------------------------------------------------------------

async function route($: EngineInterface, args: string, settings: Settings): Promise<string> {
  const { id, session } = await sessionOf($)
  const command = parseRoute(args)
  switch (command.kind) {
    case 'suggest':
      return suggestNow($, id, session, settings, command.hint)
    case 'status':
      return routeReport(session.state, settings.decideWithin, session.lastSent)
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

  // After each human prompt while deciding or suggesting (and within the
  // budget), read the whole conversation again: a suggestion may change level
  // or be withdrawn. Not awaited under band/none consent, so the prompt is
  // never held up.
  on('prompt.submit', async ($, e, next) => {
    try {
      if (HUMAN_ORIGINS.has(e.origin.kind) && !e.text.trimStart().startsWith('/')) {
        const { id, session } = await sessionOf($)
        if (session.state.mode === 'auto' && session.state.phase !== 'locked' && !session.state.gaveUp) {
          session.state = { ...session.state, prompts: session.state.prompts + 1 }
        }
        if (wantsRead(session.state, settings.decideWithin)) {
          const consent = await consentFor($, settings)
          const reading = readAfterPrompt($, id, session, settings, consent, e.text)
          if (consent === 'ask') await reading
        }
      }
    } catch (error) {
      $.ui.log(`effort-router: prompt.submit failed: ${String(error)}`, { to: 'debug' })
    }
    return next(e)
  })

  // Every model request, main loop and subagents alike: the locked level, or
  // the request untouched.
  on('turn.step', async function* ($, e, next) {
    let effort = e.effort
    try {
      const { session } = await sessionOf($)
      const level = appliedLevel(session.state)
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
    const label = footerLabel(state).text
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
    const buttons = bandActions(state, allowOff).map((action, i) =>
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

