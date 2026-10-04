import type { EngineInterface, On, PluginOptions } from 'claude-code'

import {
  type ComposedRules,
  type Level,
  type Proposal,
  type RouterState,
  LEVEL_COLOR,
  STARTER_RULES,
  appliedLevel,
  footerLabel,
  footerMenu,
  reasonText,
  classifierPrompt,
  classifierSystem,
  composeRules,
  ruleLayers,
  settingsRulesOf,
  critiquePrompt,
  freshState,
  isLevel,
  parseDecision,
  parseRoute,
  proposalChoices,
  proposalText,
  restored,
  routeReport,
  trimTranscript,
  withSaved,
} from './policy'

/**
 * effort-router: decides the session's reasoning effort once the task is
 * clear, asks (or not) for consent, then locks it for every request.
 *
 * Fail open everywhere: any error leaves the request at the picker's effort.
 */

type Consent = 'band' | 'ask' | 'none'

type Settings = {
  consent: Consent
  snoozePrompts: number
  maxReads: number
  classifierModel: string
  syncPicker: boolean
  /** `select`: the footer label is a dropdown. `label`: plain text, /route is the control. */
  footerControl: 'select' | 'label'
}

/** Per-session runtime facts that are not persisted. */
type Session = {
  state: RouterState
  /** Classifier calls made this session. */
  reads: number
  /** A classification is in flight. */
  reading: boolean
  /** The effort the session had before the router first ran /effort. */
  baseline?: Level
  /** The last effort a main-loop request went out with. */
  lastSent?: string | number
  /** An /effort sync to run when the session is next idle. */
  pendingSync?: Level
  /** Whether the lock was announced in the transcript. */
  announced: boolean
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
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
  }
  return {
    consent,
    snoozePrompts: num(options.snoozePrompts, 5),
    maxReads: num(options.maxReads, 8),
    classifierModel: typeof options.classifierModel === 'string' && options.classifierModel !== '' ? options.classifierModel : 'haiku',
    syncPicker: options.syncPicker !== false && options.syncPicker !== 'false',
    footerControl: options.footerControl === 'label' ? 'label' : 'select',
  }
}

// --- session state ---------------------------------------------------------------

async function sessionOf($: EngineInterface): Promise<{ id: string; session: Session }> {
  const id = await $.session.id()
  let session = SESSIONS.get(id)
  if (!session) {
    const all = (await $.store.get(STORE_KEY).catch(() => undefined)) as Record<string, unknown> | undefined
    const state = restored(all?.[id])
    session = { state, reads: 0, reading: false, announced: state.phase === 'locked' || state.mode !== 'auto' }
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

// --- showing ---------------------------------------------------------------------

function show($: EngineInterface, session: Session): void {
  try {
    $.ui.invalidate('ui.render')
  } catch {
    // no UI (-p): nothing to draw
  }
}

/** Fixes a level for the session (by the router, or by you), syncs the picker, announces once. */
async function apply($: EngineInterface, id: string, session: Session, settings: Settings, how: 'lock' | 'pin', level: Level, reason: string): Promise<void> {
  session.state = how === 'pin'
    ? { ...session.state, mode: 'pinned', phase: 'locked', level, reason, proposal: undefined }
    : { ...session.state, mode: 'auto', phase: 'locked', level, reason, proposal: undefined }
  if (settings.syncPicker) session.pendingSync = level
  if (!session.announced || how === 'pin') {
    session.announced = true
    const line = `effort fixed: ${level} 🔒 (${reasonText(session.state)}) · /route to change`
    try {
      $.ui.log(line)
    } catch {
      // headless
    }
  }
  $.ui.log(`effort-router: ${how} ${level} (${reason})`, { to: 'debug' })
  show($, session)
  await persist($, id, session.state)
}

/**
 * Takes a choice made at consent time: the suggested level is the router's,
 * a different one is yours (`you chose medium over the suggested high`).
 */
async function choose($: EngineInterface, id: string, session: Session, settings: Settings, proposal: Proposal, level: Level): Promise<void> {
  if (level === proposal.level) await apply($, id, session, settings, 'lock', level, proposal.reason)
  else await apply($, id, session, settings, 'pin', level, `you chose ${level} over the suggested ${proposal.level}`)
}

/** Snoozes the router: no new suggestion for `snoozePrompts` prompts. */
function snooze($: EngineInterface, session: Session, settings: Settings): void {
  session.state = { ...session.state, phase: 'undecided', proposal: undefined, snoozedUntil: session.state.prompts + settings.snoozePrompts }
  show($, session)
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

/** One classifier read of the transcript. Undefined = undecided (or failed). */
async function classifyNow($: EngineInterface, settings: Settings, current: string | undefined): Promise<Proposal | undefined> {
  const [messages, rules] = await Promise.all([
    $.session.messages().catch(() => []),
    loadRules($),
  ])
  const transcript = trimTranscript(messages, current)
  if (transcript.trim() === '') return undefined
  const reply = await $.model.complete({
    model: settings.classifierModel,
    system: classifierSystem(rules.composed.text),
    prompt: classifierPrompt(transcript),
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

/** Turns a proposal into a lock, a band offer or a blocking question, per consent. */
async function propose($: EngineInterface, id: string, session: Session, settings: Settings, proposal: Proposal, consent: Consent): Promise<void> {
  if (consent === 'none') {
    await apply($, id, session, settings, 'lock', proposal.level, proposal.reason)
    return
  }
  if (consent === 'ask') {
    const choices = proposalChoices(proposal).slice(0, 3)
    const labels = [...choices.map(level => `Lock ${level}`), 'Not now']
    let answer: string | undefined
    try {
      answer = await $.ui.ask(`${proposalText(proposal)}. Lock it?`, { options: labels, header: 'Effort' })
    } catch {
      answer = undefined // dismissed, or no one to ask: stay undecided
    }
    const picked = answer?.match(/^Lock (\w+)$/)?.[1]
    if (isLevel(picked)) {
      await choose($, id, session, settings, proposal, picked)
    } else {
      snooze($, session, settings)
    }
    return
  }
  session.state = { ...session.state, phase: 'proposed', proposal }
  show($, session)
}

async function decide($: EngineInterface, id: string, session: Session, settings: Settings, consent: Consent, current: string | undefined): Promise<void> {
  if (session.reading) return
  session.reading = true
  session.reads += 1
  try {
    const proposal = await classifyNow($, settings, current)
    const stillOpen = session.state.mode === 'auto' && session.state.phase === 'undecided'
    if (proposal && stillOpen) await propose($, id, session, settings, proposal, consent)
  } catch (error) {
    $.ui.log(`effort-router: classification failed: ${String(error)}`, { to: 'debug' })
  } finally {
    session.reading = false
  }
}

/** Consent as configured, `none` under the test override, `ask`/`band` need a UI. */
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
    case 'show':
      return routeReport(session.state, session.lastSent)
    case 'error':
      return command.message
    case 'off': {
      if (!(await loadRules($)).allowOff) return "your organisation's settings keep the router on (allowOff: false). /route decide still works."
      session.state = { ...session.state, mode: 'picker', phase: 'undecided', level: undefined, reason: undefined, proposal: undefined }
      if (settings.syncPicker && session.baseline) {
        session.pendingSync = session.baseline
        flushSync($, session)
      }
      show($, session)
      await persist($, id, session.state)
      return `router off: effort is the picker's${session.baseline ? ` (restored to ${session.baseline})` : ''}. /route decide turns it back on.`
    }
    case 'decide': {
      session.state = { ...session.state, mode: 'auto', phase: 'undecided', level: undefined, reason: undefined, proposal: undefined, snoozedUntil: undefined }
      session.announced = false
      session.reads = 0
      if (settings.syncPicker && session.baseline) {
        session.pendingSync = session.baseline
        flushSync($, session)
      }
      show($, session)
      await persist($, id, session.state)
      const consent = await consentFor($, settings)
      await decide($, id, session, settings, consent, undefined)
      return session.state.phase === 'undecided'
        ? 'deciding: the router reads the transcript again after your next prompt.'
        : footerLabel(session.state, session.lastSent).text
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
        description: 'Effort router: show the state, let the router decide again, turn it off, or edit the rules',
        argumentHint: '[decide | off | rules [init|critique]]',
      })
      const { session } = await sessionOf($)
      if (session.lastSent === undefined) {
        const configured = (await $.settings.read().catch(() => ({}))) as { effortLevel?: unknown }
        if (isLevel(configured.effortLevel)) session.lastSent = configured.effortLevel
      }
      await loadRules($).catch(() => undefined) // learns allowOff for the footer
      if (!allowOff && session.state.mode === 'picker') session.state = { ...session.state, mode: 'auto', phase: 'undecided' }
      show($, session)
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

  // Read the transcript after each human prompt while undecided. Not awaited
  // under band/none consent, so the prompt is never held up: the decision lands
  // whenever the classifier answers and applies from the next request.
  on('prompt.submit', async ($, e, next) => {
    try {
      if (HUMAN_ORIGINS.has(e.origin.kind) && !e.text.trimStart().startsWith('/')) {
        const { id, session } = await sessionOf($)
        session.state = { ...session.state, prompts: session.state.prompts + 1 }
        const { state } = session
        const snoozed = state.snoozedUntil !== undefined && state.prompts < state.snoozedUntil
        const wanted = state.mode === 'auto' && state.phase === 'undecided' && !snoozed && session.reads < settings.maxReads
        if (wanted) {
          const consent = await consentFor($, settings)
          const reading = decide($, id, session, settings, consent, e.text)
          if (consent === 'ask') await reading
        }
      }
    } catch (error) {
      $.ui.log(`effort-router: prompt.submit failed: ${String(error)}`, { to: 'debug' })
    }
    return next(e)
  })

  // Every model request, main loop and subagents alike: the locked or pinned
  // level, or the request untouched.
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
        show($, session)
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

  // The footer, beside the native effort picker: the compact state, and on
  // the terminal and Desktop a dropdown of the same choices as /route. The
  // closed dropdown shows the current option, labelled with the state text.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const { id, session } = await sessionOf($)
    const label = footerLabel(session.state, session.lastSent)
    const theirs = await next(e)
    const canSelect = settings.footerControl === 'select' && (e.surface === 'terminal' || e.surface === 'desktop')
    if (!canSelect) {
      const { Box, Text } = $.ui.resolve(e)
      const mine = Text({ ...(label.color ? { color: label.color } : { dimColor: true }), children: [label.text] })
      return Box({ flexDirection: 'row', columnGap: 1, children: [theirs, mine] })
    }
    const { Box, Select } = $.ui.resolve(e)
    const menu = footerMenu(session.state, session.lastSent, allowOff)
    const mine = Select({
      key: 'route-state',
      options: menu.options,
      value: menu.value,
      onSelect: async (value: string) => {
        if (value === menu.value) return
        const proposal = session.state.phase === 'proposed' ? session.state.proposal : undefined
        if (value === 'accept') {
          if (proposal) await choose($, id, session, settings, proposal, proposal.level)
          return
        }
        if (value === 'notnow') {
          if (proposal) snooze($, session, settings)
          return
        }
        if (value === 'fixed') return
        const text = await route($, value, settings).catch((error: unknown) => `effort-router: ${String(error)}`)
        $.ui.log(text, { to: 'debug' })
      },
    })
    return Box({ flexDirection: 'row', columnGap: 1, children: [theirs, mine] })
  })

  // The consent band above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { id, session } = await sessionOf($)
    const proposal = session.state.phase === 'proposed' ? session.state.proposal : undefined
    if (!proposal || session.state.mode !== 'auto' || e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const choices = proposalChoices(proposal)
    const theirs = await next(e)
    return Box({
      flexDirection: 'column',
      children: [
        Text({
          children: [
            'Route this session at ',
            Text({ color: LEVEL_COLOR[proposal.level], bold: true, children: [proposal.level.toUpperCase()] }),
            ` — ${proposal.reason}`,
          ],
        }),
        Box({
          flexDirection: 'row',
          columnGap: 2,
          children: [
            ...choices.map((level, index) =>
              Button({
                key: `lock-${level}`,
                label: index === 0 ? `Lock ${level}` : level,
                hotkey: String(index + 1),
                plain: true,
                onPress: async () => {
                  await choose($, id, session, settings, proposal, level)
                },
              }),
            ),
            Button({
              key: 'not-now',
              label: 'Not now',
              hotkey: 'x',
              plain: true,
              dimColor: true,
              onPress: () => snooze($, session, settings),
            }),
          ],
        }),
        theirs,
      ],
    })
  })
}
