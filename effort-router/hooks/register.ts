import type { AgentSpawnInput, EngineInterface, On, PluginOptions } from 'claude-code'

import {
  type AgentDefinition,
  type Asking,
  type ComposedRules,
  type Consent,
  type ReadDiagnostics,
  type TranscriptMessage,
  QUESTION_TOOL,
  type Level,
  type Proposal,
  type RoutedAgent,
  type RouterState,
  type SpendLedger,
  type SpendPeriod,
  type SpendUsage,
  type SubagentStatus,
  LEVEL_COLOR,
  STARTER_RULES,
  afterBudget,
  agentFileDefinition,
  appliedLevel,
  classifierPrompt,
  classifierSystem,
  composeRules,
  consentOf,
  critiquePrompt,
  dayOf,
  emptyLedger,
  definitionFor,
  footerLabel,
  bandActions,
  bandHeadline,
  noticeActions,
  noticeHeadline,
  effortQuestion,
  isLevel,
  lockReason,
  lockedAt,
  parseDecision,
  parseLedger,
  parseRoute,
  parentLevel,
  parseSubagentReply,
  routesSubagents,
  subagentPrompt,
  subagentSystem,
  restored,
  routeReport,
  ruleLayers,
  settingsAgentDefinitions,
  settingsRulesOf,
  spendReport,
  stepDecision,
  renderTranscript,
  firstSighting,
  humanPromptCount,
  DEFAULT_TRIM,
  turnedOff,
  turnedOn,
  wantsRead,
  withVerdict,
  withQuestionAnswer,
  withRead,
  withSaved,
  withSpend,
} from './policy'

/**
 * effort-router: reads the conversation after each human prompt until the
 * task is clear. With consent `ask` (the default) the verdict waits for the
 * next main-thread request, where the picker's level is known: undecided or
 * the same level, the request goes ahead (the same level locks); a different
 * level holds the request on a question (Use <level> / Keep <picker>), and
 * either answer locks. With `auto` the router's level is locked at once.
 * `/route` reads on demand, with an optional hint, and asks the same way.
 *
 * The question is `$.ui.ask` (the engine's own AskUserQuestion card) because
 * a `turn.step` hook waiting on anything else is abandoned after about 10 s;
 * a `$` call in flight does not count against the hook's time.
 *
 * Subagents are routed apart: each spawn waits for one read of its own brief
 * and its requests carry that level (forks, and failed reads, take the
 * parent's level). An agent whose own definition sets an effort is left to it.
 *
 * Fail open everywhere: any error leaves the request at the picker's effort.
 */

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
  /**
   * The picker's level: `e.effort` as the last main-thread request arrived in
   * this hook, before the router's own rewrite (the engine's level for it).
   */
  picker?: string | number
  /** The band was opened from the footer. */
  bandOpen: boolean
  /** Consent `auto` locked a level other than the picker's: the band shows it once, with Revert. */
  notice?: Proposal
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
  /** This session's spend ledger, loaded from its file on first use. */
  spend?: Promise<Spend>
}

/** A session's spend ledger, where it is saved, and whether it changed since. */
type Spend = { path?: string; ledger: SpendLedger; dirty: boolean; writing: Promise<void> }

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
  const consent = consentOf(options.consent) ?? 'ask'
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

/**
 * Locks a level (decided: reading stops) and says so in the transcript. When
 * the level differs from the picker's, the terminal picker is synced at the
 * next idle moment.
 */
async function lock($: EngineInterface, id: string, session: Session, settings: Settings, level: Level, reason: string): Promise<void> {
  await commit($, id, session, lockedAt(session.state, level, reason))
  if (settings.syncPicker && session.picker !== level) session.pendingSync = level
  try {
    $.ui.log(`Effort router: ${level} for the rest of this session (${reason}).`)
  } catch {
    // headless
  }
  $.ui.log(`effort-router: lock ${level} (${reason})`, { to: 'debug' })
}

/**
 * Consent `auto`: locks the router's level without a question. When it is not
 * the picker's level, the band opens by itself once (`Effort router: using high
 * for this session (<reason>)`, with Undo).
 */
async function lockAuto($: EngineInterface, id: string, session: Session, settings: Settings, proposal: Proposal): Promise<void> {
  await lock($, id, session, settings, proposal.level, lockReason.router(proposal))
  if (proposal.level !== session.picker) {
    session.notice = proposal
    show($)
  }
}

/**
 * Asks whether to use the router's level instead of the picker's, in the
 * engine's own question card (`$.ui.ask`), and locks the answer: `Use` the
 * router's level or `Keep` the picker's (locked at the picker's level). With
 * no picker level known, the second option is `Not now`. Dismissed, or no one
 * to ask (`-p`): nothing is locked. The footer reads `<level>?` while it is
 * open. Returns what was chosen.
 */
async function askAndLock(
  $: EngineInterface,
  id: string,
  session: Session,
  settings: Settings,
  proposal: Proposal,
  picker: Level | undefined,
): Promise<'use' | 'keep' | 'none'> {
  const question = effortQuestion(proposal, picker)
  const asking: Asking = picker ? { ...proposal, picker } : { ...proposal }
  session.state = { ...session.state, pending: undefined, asking }
  show($)
  let answer: string | undefined
  try {
    answer = await $.ui.ask(question.text, { options: question.options, header: question.header })
  } catch (error) {
    $.ui.log(`effort-router: question not answered (${String(error)}); the picker's level applies`, { to: 'debug' })
  }
  session.state = { ...session.state, asking: undefined }
  if (answer === question.options[0]) {
    await lock($, id, session, settings, proposal.level, lockReason.chosen(proposal))
    return 'use'
  }
  if (picker && answer === question.options[1]) {
    await lock($, id, session, settings, picker, lockReason.kept({ ...proposal, picker }))
    return 'keep'
  }
  await commit($, id, session, session.state)
  return 'none'
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
    recordRead($, reply.usage)
    if (!reply.isAnswered) {
      session.error = { at: await now(), text: `the check got no answer (${reply.reason})` }
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
 * A read's verdict, by consent. `auto`: the router's level is locked at once.
 * `ask`: it waits in `pending` for the next main-thread request, the only
 * place the picker's level is known (decideAtStep); undecided clears it.
 */
async function afterRead($: EngineInterface, id: string, session: Session, settings: Settings, consent: Consent, proposal: Proposal | undefined): Promise<void> {
  if (session.state.mode !== 'auto' || session.state.phase === 'locked') return
  if (consent === 'auto' && proposal) {
    await lockAuto($, id, session, settings, proposal)
    return
  }
  const next = withVerdict(session.state, proposal)
  if (next !== session.state) await commit($, id, session, next)
}

/** Once the budget is spent with nothing locked: stop reading, and turn off (or idle when the organisation keeps the router on). */
async function spendBudget($: EngineInterface, id: string, session: Session, settings: Settings): Promise<void> {
  const was = session.state
  const spent = afterBudget(was, settings.decideWithin, allowOff)
  if (spent === was) return
  await commit($, id, session, spent)
  if (spent.mode === 'picker') restorePicker($, session, settings)
  $.ui.log(`effort-router: ${spent.offReason ?? 'budget spent; the waiting verdict is still asked'}`, { to: 'debug' })
}

/**
 * An automatic read after a human turn, within the budget, awaited before the
 * turn goes on: at most `classifyTimeoutMs`, then fail open (nothing waits).
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
      session.error = { at: await $.clock.now().catch(() => Date.now()), text: `the check timed out after ${settings.classifyTimeoutMs} ms, so the prompt ran at your setting` }
    } else {
      outcome = result.value ? `${result.value.level} (${result.value.reason})` : 'undecided'
      await afterRead($, id, session, settings, consent, result.value)
    }
  } catch (error) {
    $.ui.log(`effort-router: classification failed: ${String(error)}`, { to: 'debug' })
  } finally {
    session.reading = false
    const took = (await $.clock.now().catch(() => Date.now())) - started
    session.lastReadMs = took
    $.ui.log(`effort-router: read settled in ${took} ms (${input.trigger}): ${outcome}`, { to: 'debug' })
  }
  await spendBudget($, id, session, settings)
}

/**
 * A main-thread request with a verdict waiting: compares it with the picker's
 * level (`e.effort` as the request arrived). The same level locks, no
 * question. A different one holds the request on the question; either answer
 * locks, and a dismissed one leaves the router deciding (the next read can
 * ask again). One question per verdict.
 */
async function decideAtStep($: EngineInterface, id: string, session: Session, settings: Settings, picker: unknown): Promise<void> {
  const decision = stepDecision(session.state, picker)
  if (decision.kind === 'none') return
  if (decision.kind === 'agree') {
    await lock($, id, session, settings, decision.proposal.level, lockReason.agreed(decision.proposal))
  } else {
    const { picker: current, ...proposal } = decision.asking
    const chosen = await askAndLock($, id, session, settings, proposal, current)
    $.ui.log(`effort-router: asked ${proposal.level} over the picker's ${current}: ${chosen === 'none' ? 'no answer, deciding' : chosen}`, { to: 'debug' })
  }
  await spendBudget($, id, session, settings)
}

/**
 * A manual run (`/route [hint]`, the band's Check now): reads the whole
 * conversation now, in any state, ignoring the budget, within the timeout.
 * The same as the level in use: nothing changes. The same as the picker's
 * (while locked elsewhere): locked there, no question. Otherwise it asks at
 * once (consent `ask`) or locks the router's level (`auto`). Undecided
 * changes nothing.
 */
async function suggestNow($: EngineInterface, id: string, session: Session, settings: Settings, hint: string | undefined): Promise<string> {
  if (session.reading) return 'Already checking. Try again in a moment.'
  session.reading = true
  let proposal: Proposal | undefined
  try {
    const result = await timed($, settings.classifyTimeoutMs, classifyNow($, settings, session, { hint, trigger: hint ? 'manual /route with a hint' : 'manual /route' }))
    if (!result.ok) {
      session.error = { at: await $.clock.now().catch(() => Date.now()), text: `the check timed out after ${settings.classifyTimeoutMs} ms` }
      return 'The check timed out. Nothing changed.'
    }
    proposal = result.value
  } finally {
    session.reading = false
  }
  const say = (text: string): string => {
    try {
      $.ui.toast(`effort-router: ${text}`)
    } catch {
      // headless
    }
    return text
  }
  if (!proposal) return say(`No clear task yet${hint ? ', even with your hint' : ''}. Nothing changed.`)
  const picker = isLevel(session.picker) ? session.picker : undefined
  const locked = appliedLevel(session.state)
  if (proposal.level === (locked ?? picker)) {
    if (session.state.pending) await commit($, id, session, { ...session.state, pending: undefined })
    return say(`${proposal.level} still fits (${proposal.reason}). Nothing changed.`)
  }
  if (hint && session.state.phase !== 'locked') session.state = { ...session.state, hint }
  if ((await consentFor($, settings)) === 'auto') {
    await lockAuto($, id, session, settings, proposal)
    return `${proposal.level} for this session (${proposal.reason}).`
  }
  if (proposal.level === picker) {
    await lock($, id, session, settings, proposal.level, lockReason.agreed(proposal))
    return `${proposal.level} for this session (${proposal.reason}), the same as your setting.`
  }
  const chosen = await askAndLock($, id, session, settings, proposal, picker)
  if (chosen === 'use') return `${proposal.level} for this session.`
  if (chosen === 'keep') return `${picker} for this session.`
  return 'No answer. Nothing changed.'
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
  const fallback = (why: string): Proposal | undefined => (inherited ? { level: inherited, reason: `same as its parent: ${why}` } : undefined)
  if (e.fork) return fallback("it's a fork")
  const definition = definitionFor(e.subagentType, await definitionsOf($, session))
  if (definition?.effort !== undefined) return { level: definition.effort, reason: `from ${definition.source}`, byDefinition: true }
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
  if (!result) return fallback('the check failed')
  if (!result.ok) return fallback('the check timed out')
  recordRead($, result.value.usage)
  if (!result.value.isAnswered) return fallback('the check got no answer')
  $.ui.log(`effort-router: subagent classifier said ${result.value.text.trim().slice(0, 200)}`, { to: 'debug' })
  return parseSubagentReply(result.value.text) ?? fallback('the check gave no level')
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

// --- the spend ledger ----------------------------------------------------------------

/** Where ledgers are kept: ~/.claude/effort-router/spend (undefined with no home directory). */
async function spendDir($: EngineInterface): Promise<{ dir?: string; sep: string }> {
  const { sep, homeDir } = await homeOf($)
  return { dir: homeDir ? `${homeDir}${sep}.claude${sep}effort-router${sep}spend` : undefined, sep }
}

/** The session's repository, as a short name: its owner/name when known, else its root folder's name. */
async function repoName($: EngineInterface): Promise<string> {
  const repo = await $.session.repo().catch(() => null)
  if (repo?.name) return repo.name
  const root = repo?.root ?? (await $.session.root().catch(() => undefined))
  return root?.split(/[\\/]/).filter(Boolean).pop() ?? 'unknown'
}

/** This session's ledger, loaded once from its file so a resume or a reload carries on from it. */
function spendOf($: EngineInterface, id: string, session: Session): Promise<Spend> {
  session.spend ??= (async () => {
    const { dir, sep } = await spendDir($)
    const path = dir ? `${dir}${sep}${id}.json` : undefined
    const text = path ? await readText($, path) : undefined
    const saved = text === undefined ? undefined : parseLedger(text)
    return { path, ledger: saved?.session === id ? saved : emptyLedger(id, await repoName($)), dirty: false, writing: Promise.resolve() }
  })()
  return session.spend
}

/** Adds a change to the ledger (in memory; `saveSpend` writes it). Best effort. */
async function recordSpend($: EngineInterface, change: (ledger: SpendLedger, day: string) => SpendLedger): Promise<void> {
  try {
    const { id, session } = await sessionOf($)
    const spend = await spendOf($, id, session)
    const day = dayOf(await $.clock.now().catch(() => Date.now()))
    spend.ledger = change(spend.ledger, day)
    spend.dirty = true
  } catch (error) {
    $.ui.log(`effort-router: spend not recorded: ${String(error)}`, { to: 'debug' })
  }
}

/** One of the router's own reads, when the reply carried usage. */
function recordRead($: EngineInterface, usage: SpendUsage | undefined): void {
  if (usage) void recordSpend($, (ledger, day) => withRead(ledger, day, usage))
}

/** Writes the ledger when it changed, one write at a time, each with the newest rows. */
async function saveSpend($: EngineInterface, session: Session): Promise<void> {
  const spend = await session.spend
  if (!spend?.path || !spend.dirty) return
  const path = spend.path
  spend.dirty = false
  spend.writing = spend.writing
    .then(() => $.fs.write(path, JSON.stringify(spend.ledger)))
    .catch((error: unknown) => {
      spend.dirty = true
      $.ui.log(`effort-router: spend not saved: ${String(error)}`, { to: 'debug' })
    })
  await spend.writing
}

/** `/route report`: this session's ledger (in memory, the newest) and, beyond it, every saved ledger touched in the period. */
async function spendReportFor($: EngineInterface, id: string, session: Session, period: SpendPeriod): Promise<string> {
  const spend = await spendOf($, id, session)
  const now = await $.clock.now().catch(() => Date.now())
  const others: SpendLedger[] = []
  const { dir, sep } = await spendDir($)
  if (period !== 'session' && dir) {
    const oldest = period === 'all' ? 0 : now - (period === 'week' ? 8 : 31) * 86_400_000
    const entries = await $.fs.list(dir).catch(() => [])
    const files = entries.filter(f => f.kind === 'file' && /\.json$/i.test(f.name) && f.name !== `${id}.json` && (f.mtimeMs === 0 || f.mtimeMs >= oldest))
    const texts = await Promise.all(files.map(f => readText($, `${dir}${sep}${f.name}`)))
    for (const text of texts) {
      const ledger = text === undefined ? undefined : parseLedger(text)
      if (ledger) others.push(ledger)
    }
  }
  return spendReport([spend.ledger, ...others], period, { today: dayOf(now), session: id })
}

// --- the band ------------------------------------------------------------------------

/**
 * The band shows when opened from the footer, or by itself once after consent
 * `auto` locked a level other than the picker's (`notice`).
 */
function bandShown(session: Session): boolean {
  return session.bandOpen || session.notice !== undefined
}

function closeBand($: EngineInterface, session: Session): void {
  session.bandOpen = false
  session.notice = undefined
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
  closeBand($, session)
  try {
    if (value === 'off' || value === 'revert') await turnOff($, id, session, settings)
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
    case 'report':
      return spendReportFor($, id, session, command.period)
    case 'status':
      return routeReport(session.state, settings.decideWithin, session.lastSent, {
        now: await $.clock.now().catch(() => Date.now()),
        calls: Math.max(session.calls, (await spendOf($, id, session)).ledger.reads.reduce((n, r) => n + r.calls, 0)), // the ledger survives a resume
        verdict: session.verdict,
        error: session.error,
        consent: await consentFor($, settings),
        lastReadMs: session.lastReadMs,
        sent: session.sent,
        subagents: { routing: subagentRouting(settings, session), agents: [...session.agents.values()] },
      })
    case 'off': {
      if (!(await loadRules($)).allowOff) return 'Your organisation keeps the router on.'
      await turnOff($, id, session, settings)
      return `Router off. Your effort setting${session.baseline ? ` (${session.baseline})` : ''} applies again. /route on turns it back on.`
    }
    case 'on': {
      if (session.state.mode !== 'picker' && !session.state.gaveUp) return 'The router is already on.'
      await commit($, id, session, turnedOn(session.state))
      return `Router on. It checks your next ${settings.decideWithin} prompts until the task is clear.`
    }
    case 'rules': {
      const { composed, enforced } = await loadRules($)
      const from = composed.contributors
        .map(c => (c.how === 'base' ? `  ${c.source}` : c.how === 'spliced' ? `  + ${c.source}` : `  ${c.source} (replaces the rules above)`))
        .join('\n')
      const note = enforced ? "\n(Your organisation's rules are final, so personal and project rules are ignored.)" : ''
      return `Routing rules in use:\n${from}${note}\n\n${composed.text}`
    }
    case 'rules-init': {
      if ((await loadRules($)).enforced) return "Your organisation's routing rules are final, so a personal or project file would be ignored. /route rules shows them."
      const paths = await rulePaths($)
      const path = command.scope === 'project' ? paths.project : paths.user
      if (!path) return `Can't place the ${command.scope} rules file: no ${command.scope === 'project' ? 'project root' : 'home directory'} found.`
      if (await $.fs.exists(path)) return `${path} already exists. Edit it there.`
      await $.fs.write(path, STARTER_RULES(command.scope))
      return `Created ${path}. Add your rules after the $defaults line.`
    }
    case 'rules-critique': {
      const { composed, defaults } = await loadRules($)
      if (composed.contributors.length <= 1) return 'You have no custom rules yet. /route rules init creates a file.'
      const reply = await $.model.complete({ model: 'sonnet', prompt: critiquePrompt(defaults, composed), maxTokens: 800, timeoutMs: 60000 })
      return reply.isAnswered ? reply.text.trim() : `The critique failed (${reply.reason}).`
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
        description: 'Effort router: check the effort for this task now (add a hint if you like), or status, report, off, on, rules',
        argumentHint: '[hint] | status | report [session|week|month|all] | off | on | rules [init|critique]',
      })
      const { session } = await sessionOf($)
      if (session.lastSent === undefined) {
        const configured = (await $.settings.read().catch(() => ({}))) as { effortLevel?: unknown }
        if (isLevel(configured.effortLevel)) session.lastSent = configured.effortLevel
      }
      session.picker ??= session.lastSent // until a request shows the picker's level
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
      return { text: `/route failed: ${String(error)}` }
    }
  })

  // After each human prompt while deciding (and within the budget), read the
  // whole conversation BEFORE the turn runs, so its first request can act on
  // the verdict. Bounded by classifyTimeoutMs; on a timeout or error the turn
  // goes ahead as it was.
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
  // The verdict is acted on at the turn's next request. (The router's own
  // $.ui.ask passes every hook but this plugin's, so it never lands here.)
  on('tool.call', { tool: QUESTION_TOOL }, async ($, e, next) => {
    const result = await next(e)
    try {
      const answered = !('deny' in result && result.deny) && !result.isError && typeof result.text === 'string' && result.text.trim() !== ''
      const ours = e.questions?.some(q => q.header === 'Effort' && q.question.startsWith('Effort router:')) // belt and braces: the engine already skips the caller
      if (e.agentId === undefined && answered && !ours) {
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

  // Every model request. On the main thread, `e.effort` as it arrives here is
  // the picker's level (the router has not rewritten it yet): it is kept, and
  // a waiting verdict is compared with it, holding this request on the
  // question when they differ (any index: answered AskUserQuestion questions
  // land mid-turn). Then the level: a routed subagent's own; a subagent whose
  // definition sets its effort, untouched; otherwise (the main loop, and
  // subagents the router did not route) the locked level, or untouched.
  on('turn.step', async function* ($, e, next) {
    let effort = e.effort
    let byDefinition = false
    try {
      const { id, session } = await sessionOf($)
      if (e.agentId === undefined) {
        if (e.effort !== undefined) session.picker = e.effort
        if (session.state.pending) await decideAtStep($, id, session, settings, e.effort)
      }
      const own = e.agentId !== undefined && subagentRouting(settings, session) === 'on' ? session.agents.get(e.agentId) : undefined
      byDefinition = own?.byDefinition === true
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
    const result = yield* next(effort === e.effort ? e : { ...e, effort })
    const usage = result?.usage
    if (usage) {
      const entry = { caller: e.agentId === undefined ? ('main' as const) : ('subagent' as const), from: e.effort, to: effort, byDefinition, usage }
      await recordSpend($, (ledger, day) => withSpend(ledger, { ...entry, day })) // awaited: turn.complete saves it
    }
    return result
  })

  // A loop's turn ended. The main thread is between turns: run a pending
  // /effort so the picker matches. Any loop (a subagent's too): save the spend
  // ledger if it changed.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    try {
      const { session } = await sessionOf($)
      if (e.agentId === undefined && settings.syncPicker) flushSync($, session)
      await saveSpend($, session)
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

  // The band above the prompt: opened from the footer (the state, then Suggest
  // now / Turn off or Turn on), or by itself once after consent auto locked a
  // level other than the picker's (using <level>, then Undo). Close.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { id, session } = await sessionOf($)
    if (!bandShown(session) || e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const theirs = await next(e)
    const { state, notice } = session
    const headline = notice && !session.bandOpen ? noticeHeadline(notice) : bandHeadline(state)
    const actions = notice && !session.bandOpen ? noticeActions(allowOff) : bandActions(state, allowOff)
    const level = notice && !session.bandOpen ? notice.level : state.asking?.level ?? (state.mode === 'auto' && state.phase === 'locked' ? state.level : undefined)
    const label = notice && !session.bandOpen ? notice.level : footerLabel(state).text
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
    const buttons = actions.map((action, i) =>
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

