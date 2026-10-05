import type { AgentSpawnInput, EngineInterface, On, PluginOptions } from 'claude-code'

import {
  type AgentDefinition,
  type BandAction,
  type CheckKind,
  type ComposedRules,
  type LastAssessment,
  type Level,
  type ModelNotes,
  type Proposal,
  type ReadDiagnostics,
  type RoutedAgent,
  type RouterState,
  type SpendLedger,
  type SpendPeriod,
  type SpendUsage,
  type SubagentStatus,
  type TranscriptMessage,
  type View,
  DEFAULT_HIGHEST,
  DEFAULT_TRIM,
  QUESTION_TOOL,
  ROUTE_USAGE,
  SUPPORTED_NAMES,
  agentFileDefinition,
  appliedLevel,
  bandActions,
  bandHeadline,
  clampLevel,
  classifierPrompt,
  classifierSystem,
  composeRules,
  confidenceOf,
  dayOf,
  definitionFor,
  emptyLedger,
  firstSighting,
  footerLabel,
  forkPrompt,
  freshState,
  humanPromptCount,
  isLevel,
  judgeSpread,
  lastAssessmentLine,
  lockedByYou,
  message,
  modelName,
  offeredLevels,
  onModel,
  parentLevel,
  parseDecision,
  parseLedger,
  parseRoute,
  parseSubagentReply,
  renderTranscript,
  restored,
  routeReport,
  routesSubagents,
  ruleLayers,
  runningLevel,
  savedOf,
  settingsAgentDefinitions,
  settingsRulesOf,
  settle,
  spendReport,
  subagentForkPrompt,
  subagentLine,
  subagentPrompt,
  subagentSystem,
  supportedModel,
  turnedOff,
  turnedOnLocked,
  turnedOnUnlocked,
  unlocked,
  wantsAssessment,
  withQuestionAnswer,
  withRead,
  withSpend,
  withVerdictOutcome,
  withVerdictRow,
} from './policy'

/**
 * effort-router 0.17. On each of a session's first prompts (`promptsToAssess`,
 * 5 by default) the router assesses the conversation before the turn runs:
 * a fork of the conversation on the session's own model (`$.model.fork`,
 * served from its prompt cache), or, when there is nothing to fork yet, one
 * separate call carrying the session's instructions (CLAUDE.md, rules,
 * memory). It moves the level when it is at least `confidence` (70%) sure the
 * level running is wrong in one direction, to the middle of its spread, and
 * otherwise stays. After the last prompt of the window it locks whatever is
 * running. A move never locks.
 *
 * Statuses: unlocked (it may still move the level), locked, off. The footer
 * shows the status glyph, the level running and the share of the window
 * used; clicking it opens the band, which says the same in words and holds
 * four fixed slots: Hide, the lock, on/off, Assess. `/effort-router` (alias
 * `/er`) is the band without a mouse.
 *
 * Changing the effort picker yourself turns routing off. Only an assessment,
 * or a button whose label names a level, changes the level.
 *
 * Subagents are routed apart: each spawn waits for one read, a fork of its
 * parent plus the subagent's brief, and its requests carry that level (forks,
 * and failed reads, take the parent's level). An agent whose definition sets
 * an effort is left to it, and so is one on a model the router doesn't
 * support (Haiku).
 *
 * The session's state lives in its ledger (`~/.claude/effort-router/spend/
 * <session>.json`) beside its requests and assessments. Fail open everywhere:
 * any error leaves the request at the effort it arrived with.
 */

type Settings = {
  /** Prompts assessed before the router locks. */
  promptsToAssess: number
  /** How sure (0 to 1) an assessment must be that the level running is wrong before it moves. */
  confidence: number
  /** The highest level the router picks, unless your own setting is higher. */
  highestLevel: Level
  /** Route each subagent from its own brief at spawn. */
  routeSubagents: boolean
}

/** A session's ledger, where it is saved, and whether it changed since. */
type Spend = { path?: string; ledger: SpendLedger; dirty: boolean; writing: Promise<void> }

/** Per-session runtime facts. Only the state is saved (in the ledger). */
type Session = {
  state: RouterState
  spend: Spend
  /** An assessment is in flight. */
  reading: boolean
  /**
   * Your effort setting: `e.effort` as the last main-thread request arrived,
   * before the router's rewrite. Until a request shows it, a guess from the
   * settings file's `effortLevel`, shown but never judged against.
   */
  picker?: string | number
  pickerSeen?: boolean
  /** The band was opened from the footer or `/er`. */
  bandOpen: boolean
  /** A line the band shows under its own (why a slot is greyed out, what an action did). */
  note?: string
  /** An assessment is running: the footer reads `assessing…`. */
  assessing: boolean
  /** Assessments this session, for `/er status`. */
  calls: number
  verdict?: ReadDiagnostics['verdict']
  error?: ReadDiagnostics['error']
  lastReadMs?: number
  sent?: ReadDiagnostics['sent']
  /** Routed subagents by agentId, oldest first (memory only: a resume starts empty). */
  agents: Map<string, RoutedAgent>
  /** The user's and project's agent definitions, scanned once per session. */
  definitions?: Promise<AgentDefinition[]>
  /** The main loop's model, as its last request named it (or `$.session.model()`). */
  model?: string
  /** The session's instructions block (CLAUDE.md files, rules, memory), as `prompt.context` carried it. */
  instructions?: string
  /** A main-thread turn is running. */
  busy: boolean
}

/** What one assessment sees beyond the stored transcript. */
type ReadInput = {
  /** The prompt being submitted (not yet in the transcript at prompt.submit). */
  current?: string
  /** An AskUserQuestion call just answered (not yet in the transcript at tool.call). */
  answer?: { toolUseId?: string; input: unknown; text: string }
  hint?: string
  /** What prompted it, for `/er status`. */
  trigger: string
}

/** What one assessment found: its level (undefined = no clear task, or failed), how it was made, when it answered. */
type Check = { proposal?: Proposal; kind: CheckKind; model: string; withInstructions?: boolean; checkedAt?: number; failed?: string }

const SESSIONS = new Map<string, Session>()
const LOADING = new Map<string, Promise<Session>>()
/** Whether this session draws a band: an interactive terminal or Desktop. VS Code and `-p` don't. */
let hasBand = true
/** An assessment that takes longer is abandoned and the prompt runs at the level it has (fail open). */
// 30 s: on Fable 5.1 at xhigh a fork took 7 s and 15 s (2026-10-05). A shorter limit made the prompt wait and then
// threw away an answer already paid for.
const TIMEOUT_MS = 30_000
/** The most of the conversation a separate call reads, before the prompt being assessed (about 6k tokens). */
const MAX_CHARS = DEFAULT_TRIM.totalChars
/** The most instruction text a first assessment sends (about 20k tokens). */
const MAX_INSTRUCTIONS_CHARS = 80_000
/** An assessment may think at the model's default effort: room for that and the reply. */
const SESSION_CHECK_MAX_TOKENS = 4000
/** Routed subagents kept per session, for turn.step and `/er status`. */
const MAX_ROUTED_AGENTS = 200

const FALLBACK_RULES =
  'Effort buys verification, edge-case testing and independent judgement, not a better approach. Weigh how much is ' +
  'hidden (edge cases, existing code, money, integrations, concurrency, security), whether the user is in the loop, ' +
  'and how well specified and how big the task is. Pick the level that does the work well on this model without ' +
  "paying for thinking it won't use."

const HUMAN_ORIGINS = new Set(['composer', 'bridge', 'sdk'])
const COMMANDS = ['effort-router', 'er']

function settingsOf(options: PluginOptions): Settings {
  const n = Number(options.promptsToAssess)
  return {
    promptsToAssess: Number.isFinite(n) && n >= 1 ? Math.floor(n) : 5,
    confidence: confidenceOf(options.confidence) ?? 0.7,
    highestLevel: isLevel(options.highestLevel) && options.highestLevel !== 'low' ? options.highestLevel : DEFAULT_HIGHEST,
    routeSubagents: options.routeSubagents !== false && options.routeSubagents !== 'false',
  }
}

// --- session state ---------------------------------------------------------------

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

/** This session's ledger, from its file so a resume or a reload carries on from it. */
async function loadSpend($: EngineInterface, id: string): Promise<Spend> {
  const { dir, sep } = await spendDir($)
  const path = dir ? `${dir}${sep}${id}.json` : undefined
  const text = path ? await readText($, path) : undefined
  const saved = text === undefined ? undefined : parseLedger(text)
  return { path, ledger: saved?.session === id ? saved : emptyLedger(id, await repoName($)), dirty: false, writing: Promise.resolve() }
}

async function loadSession($: EngineInterface, id: string): Promise<Session> {
  const spend = await loadSpend($, id)
  let state = restored(spend.ledger.state)
  const session: Session = { state: state ?? freshState(), spend, reading: false, bandOpen: false, assessing: false, calls: 0, agents: new Map(), busy: false }
  // Your setting as the last request before a reload, restart or resume showed it, so a change made since is seen.
  if (spend.ledger.setting) {
    session.picker = spend.ledger.setting
    session.pickerSeen = true
  }
  if (!state) {
    // First sighting: prompts already in the session count toward the window. A session with the window already
    // used up started before the router, and is left off.
    const messages = (await $.session.messages().catch(() => [])) as TranscriptMessage[]
    const prior = humanPromptCount(messages)
    state = firstSighting(prior, currentSettings.promptsToAssess)
    session.state = state
    if (prior > 0) {
      $.ui.log(`effort-router: first sighting with ${prior} prompts already in the session${state.status === 'off' ? ', left off' : ''}`, { to: 'debug' })
      spend.ledger = { ...spend.ledger, state: savedOf(state) }
      spend.dirty = true
    }
  }
  return session
}

async function sessionOf($: EngineInterface): Promise<{ id: string; session: Session }> {
  const id = await $.session.id()
  let session = SESSIONS.get(id)
  if (!session) {
    let loading = LOADING.get(id)
    if (!loading) {
      loading = loadSession($, id)
      LOADING.set(id, loading)
    }
    try {
      session = await loading
    } finally {
      LOADING.delete(id)
    }
    if (!SESSIONS.has(id)) SESSIONS.set(id, session)
    session = SESSIONS.get(id) as Session
  }
  return { id, session }
}

/** The main loop's model now (it can change with /model), remembered for drawing. */
async function modelOf($: EngineInterface, session: Session): Promise<string | undefined> {
  const model = await $.session.model().catch(() => undefined)
  if (model) session.model = model
  return session.model
}

/** The session's state as it applies on its model: on an unsupported one the router stands aside. */
const stateOf = (session: Session): RouterState => onModel(session.state, session.model)

/** Your effort setting as shown: the picker's level, or the settings file's guess before a request shows it. */
const shownSetting = (session: Session): Level | undefined => (isLevel(session.picker) ? session.picker : undefined)

/** Your effort setting as judged against: only once a main-thread request has shown it. */
const seenSetting = (session: Session): Level | undefined => (session.pickerSeen ? shownSetting(session) : undefined)

/** The level an assessment is judged against: the router's own, else your setting once seen. */
const levelInForce = (session: Session): Level | undefined => appliedLevel(session.state) ?? seenSetting(session)

/** The levels an assessment is offered. */
const levelsFor = (settings: Settings, session: Session): readonly Level[] => offeredLevels(settings.highestLevel, shownSetting(session))

/** The last assessment, from the ledger, so the band survives a resume. */
function lastOf(session: Session): LastAssessment | undefined {
  const row = session.spend.ledger.verdicts?.at(-1)
  if (!row) return undefined
  return {
    at: row.at,
    ...(row.spread ? { spread: row.spread } : {}),
    ...(row.level ? { level: row.level } : {}),
    ...(row.against ? { against: row.against } : {}),
    ...(row.reason ? { reason: row.reason } : {}),
    ...(row.why ? { why: row.why } : {}),
    outcome: row.outcome,
  }
}

function viewOf(session: Session, settings: Settings): View {
  const routed = [...session.agents.values()].filter(agent => !agent.byDefinition).length
  return {
    setting: shownSetting(session),
    last: lastOf(session),
    limit: settings.promptsToAssess,
    threshold: settings.confidence,
    offered: levelsFor(settings, session),
    assessing: session.assessing,
    subagents: routed,
  }
}

// --- showing, saving and saying ---------------------------------------------------------

function show($: EngineInterface): void {
  try {
    $.ui.invalidate('ui.render')
  } catch {
    // no UI (-p): nothing to draw
  }
}

/** One dim line in the conversation (never sent to the model). */
function say($: EngineInterface, text: string): void {
  try {
    $.ui.log(text)
  } catch {
    // headless
  }
}

/** Writes the ledger when it changed, one write at a time, each with the newest rows and state. */
async function saveSpend($: EngineInterface, session: Session): Promise<void> {
  const spend = session.spend
  if (!spend.path || !spend.dirty) return
  const path = spend.path
  spend.dirty = false
  spend.writing = spend.writing
    .then(() => $.fs.write(path, JSON.stringify(spend.ledger)))
    .catch((error: unknown) => {
      spend.dirty = true
      $.ui.log(`effort-router: ledger not saved: ${String(error)}`, { to: 'debug' })
    })
  await spend.writing
}

/** Sets a new state, redraws, and saves it in the session's ledger. */
async function commit($: EngineInterface, session: Session, state: RouterState): Promise<void> {
  session.state = state
  session.spend.ledger = { ...session.spend.ledger, state: savedOf(state) }
  session.spend.dirty = true
  show($)
  await saveSpend($, session)
}

/** Adds a change to the ledger (in memory; it is written at the next commit or when a turn ends). */
function record(session: Session, change: (ledger: SpendLedger) => SpendLedger): void {
  session.spend.ledger = change(session.spend.ledger)
  session.spend.dirty = true
}

async function today($: EngineInterface): Promise<string> {
  return dayOf(await $.clock.now().catch(() => Date.now()))
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

/**
 * Shipped defaults, then the organisation's (managed settings), yours, the
 * project's: re-read on every call so edits apply without a reload. Each
 * source fails open to absent.
 */
async function loadRules($: EngineInterface): Promise<{ composed: ComposedRules; defaults: string }> {
  const paths = await rulePaths($)
  const [defaults, userText, projectText, policy, user, project] = await Promise.all([
    readText($, paths.defaults),
    paths.user ? readText($, paths.user) : Promise.resolve(undefined),
    paths.project ? readText($, paths.project) : Promise.resolve(undefined),
    settingsSource($, 'policy'),
    settingsSource($, 'user'),
    settingsSource($, 'project'),
  ])
  const layers = ruleLayers({
    defaults: defaults ?? FALLBACK_RULES,
    org: settingsRulesOf(policy, $.plugin.name),
    orgSource: 'managed settings',
    userFile: paths.user ? { path: paths.user, text: userText } : undefined,
    userSettings: settingsRulesOf(user, $.plugin.name),
    projectFile: paths.project ? { path: paths.project, text: projectText } : undefined,
    projectSettings: settingsRulesOf(project, $.plugin.name),
  })
  const composed = composeRules(layers)
  $.ui.log(`effort-router: rules from ${composed.contributors.map(c => `${c.source} (${c.how})`).join(' → ')}`, { to: 'debug' })
  return { composed, defaults: defaults ?? FALLBACK_RULES }
}

/** The notes on what effort means on a model (`rules/models/<model>.md`); undefined on an unsupported model or with no file. */
async function modelNotes($: EngineInterface, model: string | undefined): Promise<(ModelNotes & { path: string }) | undefined> {
  const known = supportedModel(model)
  if (!known) return undefined
  const { sep } = await homeOf($)
  const path = `${$.plugin.root}${sep}rules${sep}models${sep}${known.notesFile}`
  const notes = (await readText($, path))?.replace(/<!--[\s\S]*?-->/g, '').trim()
  return notes ? { name: known.name, notes, path } : undefined
}

// --- assessing ----------------------------------------------------------------------

/** The last assistant reply's text, capped: a fork replays the request before it, so it is sent along. */
function lastReplyOf(messages: readonly TranscriptMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.role === 'assistant' && m.text.trim() !== '') return m.text.trim().slice(-DEFAULT_TRIM.lastAssistantChars)
    if (m?.role === 'user' && m.text.trim() !== '') return undefined
  }
  return undefined
}

/**
 * Waits for `work` at most `ms`: `{ ok: false }` on a timeout. The work goes on
 * in the background; its late answer is ignored.
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
 * One assessment of the whole conversation on the session's model: a fork
 * when the conversation has a request to fork, else (a new session's first
 * prompt, or after /clear or some resumes) a separate call with the session's
 * instructions and the trimmed transcript. A spread is judged against the
 * level in force; with none known yet it is judged at the next request.
 */
async function classifyNow($: EngineInterface, settings: Settings, session: Session, input: ReadInput): Promise<Check | undefined> {
  const now = async () => $.clock.now().catch(() => Date.now())
  try {
    const [stored, rules, model] = await Promise.all([
      $.session.messages().catch(() => [] as TranscriptMessage[]),
      loadRules($),
      modelOf($, session),
    ])
    const known = supportedModel(model)
    if (!known) return undefined
    const messages = input.answer ? withQuestionAnswer(stored as TranscriptMessage[], input.answer) : (stored as TranscriptMessage[])
    const rendered = renderTranscript(messages, input.current, DEFAULT_TRIM)
    if (rendered.text.trim() === '' && !input.hint) return undefined
    const notes = await modelNotes($, model)
    const levels = levelsFor(settings, session)
    const inForce = levelInForce(session)
    session.calls += 1
    let check: Check = { kind: 'fork', model: known.id }
    let reply = await $.model.fork({
      prompt: forkPrompt({ rules: rules.composed.text, model: notes, current: input.current, lastReply: lastReplyOf(messages), hint: input.hint, answered: input.answer?.text, levels, inForce }),
    })
    if (!reply.isAnswered && reply.reason === 'nothing-to-fork') {
      const instructions = session.instructions ? session.instructions.slice(0, MAX_INSTRUCTIONS_CHARS) : undefined
      session.sent = { sentChars: rendered.sentChars, fullChars: rendered.fullChars, maxChars: MAX_CHARS, omitted: rendered.omitted }
      reply = await $.model.complete({
        model: known.id,
        system: classifierSystem(rules.composed.text, notes, levels),
        prompt: classifierPrompt(rendered.text, input.hint, instructions, inForce),
        maxTokens: SESSION_CHECK_MAX_TOKENS,
        timeoutMs: TIMEOUT_MS,
      })
      check = { kind: 'first', model: known.id, withInstructions: instructions !== undefined }
    } else {
      session.sent = undefined
    }
    if ('usage' in reply && reply.usage) {
      const day = await today($)
      const usage = reply.usage as SpendUsage
      record(session, ledger => withRead(ledger, day, usage, check.kind))
    }
    const checkedAt = await now()
    if (!reply.isAnswered) {
      session.error = { at: checkedAt, text: `the assessment got no answer (${reply.reason})` }
      return { ...check, checkedAt, failed: 'no answer' }
    }
    session.verdict = { at: checkedAt, trigger: input.trigger, raw: reply.text, kind: check.kind }
    $.ui.log(`effort-router: ${check.kind} assessment said (${input.trigger}) ${reply.text.trim().slice(0, 200)}`, { to: 'debug' })
    const decision = parseDecision(reply.text)
    if (decision.decision !== 'lock') return { ...check, checkedAt }
    const { decision: _, ...found } = decision
    const judged = found.spread && inForce ? { ...found, ...judgeSpread(found.spread, inForce, levels) } : found
    return { ...check, checkedAt, proposal: { ...judged, level: clampLevel(judged.level, levels), checkedAt } }
  } catch (error) {
    session.error = { at: await now(), text: String(error) }
    throw error
  }
}

/** An assessment's row in the ledger. `prompt` is the prompt of the window it assessed (a manual one: the last counted). */
function recordVerdict(session: Session, check: Check, outcome: string, manual: boolean, prompt: number): void {
  const { proposal } = check
  const at = check.checkedAt ?? Date.now()
  record(session, ledger =>
    withVerdictRow(ledger, {
      at,
      kind: check.kind,
      model: check.model,
      prompt,
      ...(proposal ? { level: proposal.level, reason: proposal.reason } : {}),
      ...(proposal?.confidence !== undefined ? { confidence: proposal.confidence } : {}),
      ...(proposal?.why ? { why: proposal.why } : {}),
      ...(proposal?.spread ? { spread: proposal.spread } : {}),
      ...(proposal?.against ? { against: proposal.against } : {}),
      outcome,
      ...(check.withInstructions !== undefined ? { withInstructions: check.withInstructions } : {}),
      ...(manual ? { manual: true as const } : {}),
    }),
  )
}

/** Says what an assessment did: a move, then a lock. */
function sayChanges($: EngineInterface, settled: ReturnType<typeof settle>, reason: string | undefined): string[] {
  const said: string[] = []
  if (settled.moved) said.push(message.moved(settled.moved.from, settled.moved.to, reason ?? 'router'))
  if (settled.locked) said.push(message.locked(settled.locked))
  for (const line of said) say($, line)
  return said
}

/**
 * One assessment, applied. `counted` uses up one prompt of the window (the
 * automatic ones, and Turn on and assess); a manual one while locked moves the
 * locked level and stays locked. A spread with no level in force known yet is
 * judged at the next main-thread request (judgeWaiting).
 */
async function assess($: EngineInterface, id: string, session: Session, settings: Settings, input: ReadInput, counted: boolean): Promise<string> {
  if (session.reading) return 'Already assessing. Try again in a moment.'
  session.reading = true
  session.assessing = true
  show($)
  const started = await $.clock.now().catch(() => Date.now())
  let summary = 'The assessment failed, so nothing changed.'
  try {
    // A failed assessment (an error, a timeout, no answer) still uses up its prompt: the window stays the length
    // the band promises.
    const result = await timed($, TIMEOUT_MS, classifyNow($, settings, session, input).catch((): undefined => undefined))
    const prompt = counted ? Math.min(settings.promptsToAssess, session.state.assessed + 1) : session.state.assessed
    const check = result.ok ? result.value : undefined
    if (!result.ok) session.error = { at: await $.clock.now().catch(() => Date.now()), text: `the assessment timed out after ${TIMEOUT_MS / 1000} s, so the prompt ran at the level it had` }
    const proposal = check?.proposal
    if (check && proposal?.spread && proposal.confidence === undefined) {
      // No level in force known yet: judged at the next request.
      const state = { ...session.state, pending: proposal, hint: undefined, assessed: prompt }
      recordVerdict(session, check, 'judged at the first request', !counted, prompt)
      await commit($, session, state)
      summary = 'Assessed. It is judged against your level when the next request shows it.'
      return summary
    }
    const failed = !check || check.failed !== undefined
    const settled = settle(session.state, proposal, { threshold: settings.confidence, limit: settings.promptsToAssess, running: levelInForce(session), counted })
    if (check) recordVerdict(session, check, failed ? 'failed' : settled.outcome, !counted, prompt)
    await commit($, session, settled.state)
    const said = sayChanges($, settled, proposal?.reason)
    summary = said.length > 0 ? said.join(' ') : failed ? summary : (lastAssessmentLine(lastOf(session), settings.confidence, levelsFor(settings, session), session.state.status === 'locked') ?? 'Nothing changed.')
    return summary
  } catch (error) {
    $.ui.log(`effort-router: assessment failed: ${String(error)}`, { to: 'debug' })
    return summary
  } finally {
    session.reading = false
    session.assessing = false
    show($)
    session.lastReadMs = (await $.clock.now().catch(() => Date.now())) - started
    $.ui.log(`effort-router: assessment settled in ${session.lastReadMs} ms (${input.trigger})`, { to: 'debug' })
  }
}

/** A first assessment made before the level in force was known: judged now, against the level this request shows. */
async function judgeWaiting($: EngineInterface, session: Session, settings: Settings, setting: Level): Promise<void> {
  const waiting = session.state.pending
  if (!waiting?.spread) return
  const levels = levelsFor(settings, session)
  const judged: Proposal = { ...waiting, ...judgeSpread(waiting.spread, setting, levels) }
  const settled = settle(session.state, judged, { threshold: settings.confidence, limit: settings.promptsToAssess, running: setting, counted: false })
  record(session, ledger => withVerdictOutcome(ledger, settled.outcome, waiting.checkedAt, judged))
  await commit($, session, settled.state)
  sayChanges($, settled, judged.reason)
}

/**
 * A human turn of the conversation (a prompt, or answers to the model's
 * questions): assessed while unlocked and within the window, before the turn
 * goes on, so its first request carries the level.
 */
async function humanTurn($: EngineInterface, settings: Settings, input: ReadInput): Promise<void> {
  const { id, session } = await sessionOf($)
  if (!supportedModel(await modelOf($, session))) return
  // A prompt sent while a turn runs isn't assessed (not tested live); answers mid-turn are, by a fork carrying them.
  if (session.busy && !input.answer) return
  if (!wantsAssessment(session.state, settings.promptsToAssess)) return
  await assess($, id, session, settings, { ...input, hint: session.state.hint }, true)
}

// --- actions (the band's slots, and /er) ---------------------------------------------------

/** What an action did: a message for the conversation, or a reply that changes nothing. */
type Done = { said?: string; reply?: string }

async function doLock($: EngineInterface, session: Session): Promise<Done> {
  const state = stateOf(session)
  if (state.unsupported) return { reply: unsupportedText(session.model) }
  if (state.status === 'locked') return { reply: `Already locked at ${state.level}.` }
  if (state.status === 'off') return doTurnOnLocked($, session)
  // The band's label names the level it locks at (your setting as shown, a guess from the settings file before a
  // request shows it), so lock exactly that.
  const running = runningLevel(state, shownSetting(session))
  if (!running) return { reply: 'Nothing to lock yet: the level shows with the first request.' }
  await commit($, session, lockedByYou(session.state, running))
  return { said: message.lockedByYou(running) }
}

async function doUnlock($: EngineInterface, session: Session): Promise<Done> {
  const state = stateOf(session)
  if (state.unsupported) return { reply: unsupportedText(session.model) }
  if (state.status === 'off') return doTurnOn($, session)
  if (state.status === 'unlocked') return { reply: `Already unlocked. Assessed ${state.assessed} of ${currentSettings.promptsToAssess} prompts.` }
  await commit($, session, unlocked(session.state))
  return { said: message.unlocked() }
}

async function doTurnOn($: EngineInterface, session: Session): Promise<Done> {
  const state = stateOf(session)
  if (state.unsupported) return { reply: unsupportedText(session.model) }
  if (state.status !== 'off') return { reply: state.status === 'locked' ? `Already on, locked at ${state.level}.` : 'Already on, unlocked.' }
  await commit($, session, turnedOnUnlocked(session.state))
  return { said: message.onUnlocked() }
}

async function doTurnOnLocked($: EngineInterface, session: Session): Promise<Done> {
  if (session.state.status !== 'off') return doLock($, session)
  if (!session.state.lastLevel) return { reply: 'The router has no level of its own to lock at yet. /er on turns it on, unlocked.' }
  await commit($, session, turnedOnLocked(session.state))
  return { said: message.onLocked(session.state.lastLevel as Level) }
}

async function doTurnOff($: EngineInterface, session: Session): Promise<Done> {
  if (session.state.status === 'off') return { reply: 'Already off.' }
  await commit($, session, turnedOff(session.state, 'you'))
  return { said: message.off(seenSetting(session)) }
}

async function doAssess($: EngineInterface, id: string, session: Session, settings: Settings, hint: string | undefined): Promise<Done> {
  if (!supportedModel(await modelOf($, session))) return { reply: unsupportedText(session.model) }
  if (session.state.status === 'unlocked') {
    if (hint) {
      await commit($, session, { ...session.state, hint })
      return { reply: 'Your hint is used when your next prompt is assessed.' }
    }
    return { reply: 'It assesses before your next prompt anyway.' }
  }
  if (session.state.status === 'off') {
    await commit($, session, turnedOnUnlocked(session.state))
    say($, message.onUnlocked())
    return { reply: await assess($, id, session, settings, { hint, trigger: 'Turn on and assess' }, true) }
  }
  return { reply: await assess($, id, session, settings, { hint, trigger: hint ? 'Assess, with a hint' : 'Assess' }, false) }
}

const unsupportedText = (model: string | undefined): string =>
  `The router doesn't support ${modelName(model)}, so your effort setting applies. It works with ${SUPPORTED_NAMES}.`

// --- the band ------------------------------------------------------------------------

function closeBand($: EngineInterface, session: Session): void {
  session.bandOpen = false
  session.note = undefined
  show($)
}

/** The footer button: opens the band, or closes it when it is showing. */
function toggleBand($: EngineInterface, session: Session): void {
  if (session.bandOpen) closeBand($, session)
  else {
    session.bandOpen = true
    session.note = undefined
    show($)
  }
}

/** A band slot: runs its action and keeps the band open on the new state (Hide closes it). */
async function bandAction($: EngineInterface, id: string, session: Session, settings: Settings, action: BandAction): Promise<void> {
  if (action.value === 'hide') return closeBand($, session)
  if (action.disabled) {
    session.note = action.disabled
    show($)
    return
  }
  session.note = undefined
  try {
    const done =
      action.value === 'lock' ? await doLock($, session)
      : action.value === 'unlock' ? await doUnlock($, session)
      : action.value === 'off' ? await doTurnOff($, session)
      : action.value === 'on-unlocked' ? await doTurnOn($, session)
      : action.value === 'on-locked' ? await doTurnOnLocked($, session)
      : await doAssess($, id, session, settings, undefined)
    if (done.said) say($, done.said)
    else if (done.reply && action.value !== 'assess' && action.value !== 'on-assess') session.note = done.reply
  } catch (error) {
    $.ui.log(`effort-router: band action ${action.value} failed: ${String(error)}`, { to: 'debug' })
    session.note = 'That failed. Nothing changed.'
  }
  show($)
}

// --- /er -------------------------------------------------------------------------------

async function route($: EngineInterface, args: string, settings: Settings): Promise<{ text?: string }> {
  const { id, session } = await sessionOf($)
  await modelOf($, session)
  const command = parseRoute(args)
  const reply = (done: Done): { text: string } => ({ text: done.said ?? done.reply ?? '' })
  switch (command.kind) {
    case 'band': {
      if (hasBand) {
        session.bandOpen = true
        session.note = undefined
        show($)
        return {}
      }
      const view = viewOf(session, settings)
      const state = stateOf(session)
      const last = lastAssessmentLine(view.last, view.threshold, view.offered, state.status === 'locked')
      return { text: [bandHeadline(state, view), last, ROUTE_USAGE].filter(Boolean).join('\n') }
    }
    case 'lock':
      return reply(await doLock($, session))
    case 'unlock':
      return reply(await doUnlock($, session))
    case 'on':
      return reply(await doTurnOn($, session))
    case 'off':
      return reply(await doTurnOff($, session))
    case 'assess':
      return reply(await doAssess($, id, session, settings, command.hint))
    case 'report':
      return { text: await spendReportFor($, id, session, command.period) }
    case 'status':
      return {
        text: routeReport(stateOf(session), viewOf(session, settings), {
          now: await $.clock.now().catch(() => Date.now()),
          calls: Math.max(session.calls, session.spend.ledger.reads.reduce((n, r) => n + r.calls, 0)),
          verdict: session.verdict,
          error: session.error,
          lastReadMs: session.lastReadMs,
          sent: session.sent,
          subagents: { routing: subagentRouting(settings, session), agents: [...session.agents.values()] },
        }),
      }
    case 'rules': {
      const { composed } = await loadRules($)
      const notes = await modelNotes($, session.model)
      const from = composed.contributors
        .map(c => (c.how === 'base' ? `  ${c.source}` : c.how === 'spliced' ? `  + ${c.source}` : `  ${c.source} (replaces the rules above)`))
        .join('\n')
      const onModel = notes ? `\n  + notes on ${notes.name} (${notes.path})` : ''
      const notesText = notes ? `\n\nOn ${notes.name}:\n${notes.notes}` : ''
      return { text: `Routing rules in use:\n${from}${onModel}\n\n${composed.text}${notesText}` }
    }
    case 'unknown':
      return { text: `Unknown: ${command.text}. ${ROUTE_USAGE}` }
  }
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

function definitionsOf($: EngineInterface, session: Session): Promise<AgentDefinition[]> {
  session.definitions ??= loadDefinitions($).catch(() => [])
  return session.definitions
}

/** Whether subagents are routed now, and if not, why. */
function subagentRouting(settings: Settings, session: Session): SubagentStatus['routing'] {
  if (!settings.routeSubagents) return 'setting'
  return routesSubagents(session.state) ? 'on' : 'user-off'
}

/**
 * The level for a spawn, decided before it starts. A fork takes the parent's
 * level. An agent whose definition sets an effort keeps it: no read, and
 * `byDefinition` so its requests are left to the engine. Anything else waits
 * (at most 30 s) for one read: a fork of the parent plus the brief, else, with
 * nothing to fork, a separate call on the brief alone. A failed, late or
 * unusable read takes the parent's level. Undefined leaves the subagent's
 * requests as they would have been.
 */
async function routeSpawn($: EngineInterface, settings: Settings, session: Session, e: AgentSpawnInput): Promise<Pick<RoutedAgent, 'level' | 'reason' | 'byDefinition'> | undefined> {
  const inherited = parentLevel(session.state, session.agents, e.parentAgentId)
  const fallback = (why: string): Proposal | undefined => (inherited ? { level: inherited, reason: `same as its parent: ${why}` } : undefined)
  if (e.fork) return fallback("it's a fork")
  const definition = definitionFor(e.subagentType, await definitionsOf($, session))
  if (definition?.effort !== undefined) return { level: definition.effort, reason: `from ${definition.source}`, byDefinition: true }
  // The model it runs on: the Agent call's, else its definition's, else the parent's. Haiku, or any model the
  // router doesn't support, is left alone.
  const runsOn = e.model ?? definition?.model ?? e.parentModel
  const known = supportedModel(runsOn)
  if (!known) {
    $.ui.log(`effort-router: subagent (${e.subagentType}: ${e.description}) runs on ${modelName(runsOn)}, left alone`, { to: 'debug' })
    return undefined
  }
  const rules = await loadRules($)
  const brief = { subagentType: e.subagentType, description: e.description, prompt: e.prompt }
  const notes = await modelNotes($, known.id)
  const levels = levelsFor(settings, session)
  const read = async () => {
    // The parent knows the task and why it delegates this part: ask a fork of it (cached, a few seconds).
    const forked = await $.model.fork({ prompt: subagentForkPrompt({ rules: rules.composed.text, brief, runsOn: known.name, model: notes, maxChars: MAX_CHARS, levels }) })
    if (forked.isAnswered || forked.reason !== 'nothing-to-fork') return forked
    return $.model.complete({
      model: known.id,
      system: subagentSystem(rules.composed.text, notes, levels),
      prompt: subagentPrompt(brief, MAX_CHARS),
      maxTokens: SESSION_CHECK_MAX_TOKENS,
      timeoutMs: TIMEOUT_MS,
    })
  }
  const result = await timed($, TIMEOUT_MS, read()).catch((error: unknown) => {
    $.ui.log(`effort-router: subagent read failed: ${String(error)}`, { to: 'debug' })
    return undefined
  })
  if (!result) return fallback('the assessment failed')
  if (!result.ok) return fallback('the assessment timed out')
  if ('usage' in result.value && result.value.usage) {
    const day = await today($)
    const usage = result.value.usage as SpendUsage
    record(session, ledger => withRead(ledger, day, usage, 'subagent'))
  }
  if (!result.value.isAnswered) return fallback('the assessment got no answer')
  $.ui.log(`effort-router: subagent assessment said ${result.value.text.trim().slice(0, 200)}`, { to: 'debug' })
  const found = parseSubagentReply(result.value.text)
  return found ? { ...found, level: clampLevel(found.level, levels) } : fallback('the assessment gave no level')
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

// --- the report ----------------------------------------------------------------------

/** `/er report`: this session's ledger (in memory, the newest) and, beyond it, every saved ledger touched in the period. */
async function spendReportFor($: EngineInterface, id: string, session: Session, period: SpendPeriod): Promise<string> {
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
  return spendReport([session.spend.ledger, ...others], period, { today: dayOf(now), session: id })
}

// --- hooks ---------------------------------------------------------------------------

/** The settings in force, for code that runs outside a hook's own closure (a first sighting). */
let currentSettings: Settings = settingsOf({})

export function register(on: On, options: PluginOptions): void {
  const settings = settingsOf(options)
  currentSettings = settings

  on('session.start', async ($, e, next) => {
    hasBand = e.isInteractive && (e.surface === 'terminal' || e.surface === 'desktop')
    try {
      for (const name of COMMANDS) {
        await $.command.register({
          name,
          description: 'Effort router: open the band, or lock, unlock, on, off, assess [hint], report, status, rules',
          argumentHint: '[lock|unlock|on|off|assess|report|status|rules]',
          immediate: true,
        }).catch((error: unknown) => $.ui.log(`effort-router: /${name} not registered: ${String(error)}`, { to: 'debug' }))
      }
      const { session } = await sessionOf($)
      await modelOf($, session)
      // A guess at your setting until a request shows it, for drawing only. The settings file's effortLevel
      // doesn't apply to Opus 5.5 (Claude Code's model-config docs), so it isn't used there.
      if (session.picker === undefined && supportedModel(session.model)?.id !== 'claude-opus-5-5') {
        const configured = (await $.settings.read().catch(() => ({}))) as { effortLevel?: unknown }
        if (isLevel(configured.effortLevel)) session.picker = configured.effortLevel
      }
      await saveSpend($, session) // a first sighting's state
      show($)
    } catch (error) {
      $.ui.log(`effort-router: start failed: ${String(error)}`, { to: 'debug' })
    }
    return next(e)
  })

  for (const name of COMMANDS) {
    on('command.run', { command: name }, async ($, e) => {
      try {
        return await route($, e.args ?? '', settings)
      } catch (error) {
        return { text: `/${name} failed: ${String(error)}` }
      }
    })
  }

  // The context the conversation's first message carries: keep the instructions block (CLAUDE.md files, rules,
  // memory) for the first assessment, which cannot fork a conversation that has sent nothing yet. Unchanged.
  on('prompt.context', async ($, e, next) => {
    try {
      const text = e.blocks.find(block => block.name === 'claudeMd')?.text
      if (text) (await sessionOf($)).session.instructions = text
    } catch {
      // the first assessment goes without them
    }
    return next(e)
  })

  // After each human prompt while unlocked and within the window: assess the whole conversation BEFORE the turn
  // runs, so its first request carries the level. At most 30 s; on a timeout or error the turn goes ahead.
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

  // The model asked the user multiple-choice questions on the main thread and got answers: that is a human turn
  // too (platforms, scope, "keep it simple"), assessed before the answers go back to the model.
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

  // A subagent is about to start: read its brief (a fork takes its parent's level) BEFORE it starts, and key the
  // level to its agentId. next(e) resolves with the id before the agent's first turn.step (verified live), so its
  // first request already carries it.
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
        show($)
      }
    } catch {
      // best effort: an unrouted subagent runs as it would have
    }
    return result
  })

  // Every model request. On the main thread `e.effort` as it arrives is your effort setting (the router has not
  // rewritten it): a change of it turns routing off, a first assessment waiting for it is judged against it, and
  // the window's end locks. Then the level: a routed subagent's own; a subagent whose definition sets its effort,
  // untouched; otherwise the router's level, or untouched.
  on('turn.step', async function* ($, e, next) {
    let effort = e.effort
    let byDefinition = false
    try {
      const { session } = await sessionOf($)
      if (e.agentId === undefined) {
        session.busy = true
        if (session.model !== e.model) {
          session.model = e.model
          show($)
        }
        if (isLevel(e.effort)) {
          const was = session.pickerSeen ? session.picker : undefined
          session.picker = e.effort
          if (session.spend.ledger.setting !== e.effort) record(session, ledger => ({ ...ledger, setting: e.effort as Level }))
          if (!session.pickerSeen) {
            session.pickerSeen = true
            show($)
          }
          const supported = supportedModel(e.model) !== undefined
          if (supported && session.state.status !== 'off' && isLevel(was) && was !== e.effort) {
            // You changed the effort picker: you take over.
            await commit($, session, turnedOff(session.state, 'picker'))
            say($, message.picker(e.effort))
          } else if (supported && session.state.pending) {
            await judgeWaiting($, session, settings, e.effort)
          } else if (supported && session.state.status === 'unlocked' && session.state.assessed >= settings.promptsToAssess) {
            const running = session.state.level ?? e.effort
            const settled = settle(session.state, undefined, { threshold: settings.confidence, limit: settings.promptsToAssess, running, counted: false })
            if (settled.locked) {
              await commit($, session, settled.state)
              say($, message.locked(settled.locked))
            }
          }
        }
      }
      const own = e.agentId !== undefined && subagentRouting(settings, session) === 'on' ? session.agents.get(e.agentId) : undefined
      byDefinition = own?.byDefinition === true
      const level = own ? (own.byDefinition ? undefined : own.level) : appliedLevel(stateOf(session))
      if (level !== undefined && e.effort !== undefined) effort = level
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
      try {
        const { session } = await sessionOf($)
        const day = await today($)
        const entry = { day, caller: e.agentId === undefined ? ('main' as const) : ('subagent' as const), from: e.effort, to: effort, byDefinition, usage }
        record(session, ledger => withSpend(ledger, entry))
      } catch {
        // best effort
      }
    }
    return result
  })

  // A loop's turn ended (a subagent's too): save the ledger if it changed.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    try {
      const { session } = await sessionOf($)
      if (e.agentId === undefined) session.busy = false
      await saveSpend($, session)
    } catch {
      // best effort
    }
    return result
  })

  // The footer, beside the native effort picker: the status glyph, the level running and the window's progress,
  // as a plain button that opens the band. (Desktop silently drops a Select here, so no Select.)
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const { session } = await sessionOf($)
    const label = footerLabel(stateOf(session), viewOf(session, settings))
    const theirs = await next(e)
    const { Box, Button } = $.ui.resolve(e)
    const mine = Button({ key: 'route-state', label: label.text, plain: true, dimColor: label.dim, onPress: () => toggleBand($, session) })
    return Box({ flexDirection: 'row', columnGap: 1, children: [theirs, mine] })
  })

  // The band above the prompt, opened only from the footer or /er: the footer in words, the last assessment,
  // routed subagents, then four fixed slots (Hide, the lock, on/off, Assess). A greyed slot says why when pressed.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { id, session } = await sessionOf($)
    if (!session.bandOpen || e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const theirs = await next(e)
    const state = stateOf(session)
    const view = viewOf(session, settings)
    const lines = [
      bandHeadline(state, view),
      session.assessing ? 'Assessing now…' : lastAssessmentLine(view.last, view.threshold, view.offered, state.status === 'locked'),
      subagentLine(view.subagents),
      session.note,
    ].filter((line): line is string => line !== undefined && line !== '')
    const buttons = bandActions(state, view).map((action, i) =>
      Button({
        key: action.value,
        label: action.label,
        hotkey: String(i + 1),
        plain: true,
        ...(action.disabled ? { dimColor: true } : {}),
        ...(action.value === 'hide' ? { role: 'dismiss' as const } : {}),
        onPress: () => void bandAction($, id, session, settings, action),
      }),
    )
    return Box({
      flexDirection: 'column',
      children: [...lines.map((line, i) => Text({ ...(i === 0 ? {} : { dimColor: true }), children: [line] })), Box({ flexDirection: 'row', columnGap: 2, children: buttons }), theirs],
    })
  })
}
